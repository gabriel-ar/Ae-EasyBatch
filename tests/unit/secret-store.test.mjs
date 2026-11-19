import { after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import { posix, win32 } from "node:path";
import vm from "node:vm";
import { createServer } from "vite";

const server = await createServer({
  configFile: false, envDir: false, server: { middlewareMode: true, hmr: false, ws: false }, logLevel: "error",
  optimizeDeps: { noDiscovery: true, include: [] },
});
after(() => server.close());
const { CreateSecretStore, MacSecretStore, WindowsSecretStore, SecretStoreError } = await server.ssrLoadModule("/src/lib/SecretStore.ts");
const { default: CSAdapter } = await server.ssrLoadModule("/src/lib/CSAdapter.ts");

function Harness(response = { status: 0 }, platform = "darwin", Store = MacSecretStore) {
  const calls = [];
  globalThis.cep_node = {
    require(name) {
      if (name === "os") return { platform: () => platform };
      throw new Error(`Unexpected module: ${name}`);
    },
  };
  const adapter = {
    GetSystemPath: () => "/extension",
    Eval: async (...args) => { calls.push(args); return JSON.stringify(response); },
  };
  return { calls, adapter, store: new Store("com.easybatch.test", adapter) };
}

function WindowsHarness(response, platform = "win32") {
  return Harness(response, platform, WindowsSecretStore);
}

//`missing` is the status each native library reports for an absent entry
const platforms = [
  { platform: "darwin", Store: MacSecretStore, missing: -25300, other: "win32" },
  { platform: "win32", Store: WindowsSecretStore, missing: 1168, other: "darwin" },
];

test("native storage sends JSON through the CEP bridge and preserves secret characters", async () => {
  for (const [platform, Store] of [["darwin", MacSecretStore], ["win32", WindowsSecretStore]]) {
    const h = Harness({ status: 0 }, platform, Store);
    const secret = 'quotes " slash \\ newline\nUnicode: \u00e9\n';
    await h.store.Set("feature:key", secret);
    assert.deepEqual(h.calls, [["SecretStoreRequest", "/extension", JSON.stringify({
      action: "set", service: "com.easybatch.test", key: "feature:key", value: secret,
    })]]);
  }
});

test("the shared factory selects the platform store without touching it and reports unimplemented platforms", () => {
  const mac = Harness();
  assert.ok(CreateSecretStore() instanceof MacSecretStore);
  assert.equal(mac.calls.length, 0);
  const windows = WindowsHarness();
  assert.ok(CreateSecretStore() instanceof WindowsSecretStore);
  assert.equal(windows.calls.length, 0);
  Harness(undefined, "linux");
  assert.equal(CreateSecretStore(), null);
});

test("native reads preserve Unicode and whitespace without decoding the old CLI envelope", async () => {
  const value = "eb1:1234\n \u00e9\n";
  const h = Harness({ status: 0, value });
  assert.equal(await h.store.Get("feature:key"), value);
});

test("missing secrets return null and deletion is idempotent, but failed writes stay errors", async () => {
  for (const { platform, Store, missing } of platforms) {
    const { store } = Harness({ status: missing }, platform, Store);
    assert.equal(await store.Get("feature:key"), null);
    await store.Delete("feature:key");
    await assert.rejects(store.Set("feature:key", "value"), (error) => error.code === "unavailable");
  }
});

test("native failures are typed and never expose bridge responses", async () => {
  for (const [status, expected] of [
    [-25293, "denied"], [-25308, "denied"], [-128, "denied"],
    [-50, "invalid-input"], [-26275, "invalid-data"], [-1, "unavailable"],
    //Windows codes mean nothing to the macOS store
    [5, "unavailable"], [1168, "unavailable"],
  ]) {
    const { store } = Harness({ status, error: "sensitive response" });
    await assert.rejects(store.Get("feature:key"), (error) => {
      assert.ok(error instanceof SecretStoreError);
      assert.equal(error.code, expected);
      assert.match(error.message, expected === "unavailable" ? /macOS Keychain/ : /./);
      assert.doesNotMatch(error.message, /sensitive/);
      return true;
    });
  }
});

test("Windows failures map Win32 codes to typed errors without exposing bridge responses", async () => {
  for (const [status, expected] of [
    [5, "denied"], [1223, "denied"], [87, "invalid-input"], [13, "invalid-data"],
    [-1, "unavailable"], [1312, "unavailable"], [8, "unavailable"],
    //macOS statuses mean nothing to the Windows store
    [-25293, "unavailable"], [-25300, "unavailable"],
  ]) {
    for (const action of ["Get", "Set", "Delete"]) {
      const { store } = WindowsHarness({ status, error: "sensitive response" });
      await assert.rejects(store[action]("feature:key", "secret"), (error) => {
        assert.ok(error instanceof SecretStoreError);
        assert.equal(error.code, expected);
        assert.match(error.message, expected === "denied" || expected === "unavailable" ? /Windows Credential Manager/ : /./);
        assert.doesNotMatch(error.message, /sensitive|Keychain/);
        return true;
      });
    }
  }
});

test("malformed and incomplete host responses are explicit errors", async () => {
  for (const { platform, Store } of platforms) {
    for (const response of [null, [], {}, { status: "0" }, { status: 0.1 }]) {
      const { store } = Harness(response, platform, Store);
      await assert.rejects(store.Get("key"), (error) => error.code === "unavailable");
    }
    for (const response of [{ status: 0 }, { status: 0, value: "" }, { status: 0, value: 42 }, { status: 0, value: "\0" }]) {
      const { store } = Harness(response, platform, Store);
      await assert.rejects(store.Get("key"), (error) => error.code === "invalid-data");
    }
    for (const reject of [false, true]) {
      const h = Harness(undefined, platform, Store);
      h.adapter.Eval = async () => {
        if (reject) throw new Error("sensitive bridge arguments");
        return "EvalScript error. sensitive bridge arguments";
      };
      await assert.rejects(h.store.Get("key"), (error) => {
        assert.equal(error.code, "unavailable");
        assert.doesNotMatch(error.message, /sensitive/);
        return true;
      });
    }
  }
});

test("invalid inputs and unsupported platforms fail without invoking the host", async () => {
  for (const { platform, Store, other } of platforms) {
    const { calls, store } = Harness(undefined, platform, Store);
    for (const key of ["", "key\nquit", "has spaces", '"quoted"', "a".repeat(257)]) {
      await assert.rejects(store.Get(key), (error) => error.code === "invalid-input");
      await assert.rejects(store.Set(key, "secret"), (error) => error.code === "invalid-input");
      await assert.rejects(store.Delete(key), (error) => error.code === "invalid-input");
    }
    for (const value of ["", "nul\0byte"]) {
      await assert.rejects(store.Set("key", value), (error) => error.code === "invalid-input");
    }
    assert.equal(calls.length, 0);
    for (const unsupported_platform of [other, "linux"]) {
      const unsupported = Harness(undefined, unsupported_platform, Store);
      await assert.rejects(unsupported.store.Get("key"), (error) => error.code === "unsupported");
      assert.equal(unsupported.calls.length, 0);
    }
  }
});

test("real CSAdapter and host wrapper round-trip encoding and unload the native library on failure", async () => {
  Harness();
  const requests = [];
  let unloads = 0;
  let fail = false;
  const context = vm.createContext({
    Folder: { fs: "Macintosh" },
    ExternalObject: function(path) {
      assert.equal(path, "lib:/extension with spaces/native/EasyBatchSecretStore.bundle");
      return {
        Execute(json) {
          requests.push(JSON.parse(json));
          if (fail) throw new Error("secret-bearing native error");
          return JSON.stringify({ status: 0, value: JSON.parse(json).value ?? "stored" });
        },
        unload() { unloads++; },
      };
    },
  });

  vm.runInContext(readFileSync(new URL("../../src/host/SecretStore.jsx", import.meta.url), "utf8"), context);
  globalThis.window = { __adobe_cep__: {
    getSystemPath: () => "file:///extension%20with%20spaces",
    evalScript(script, callback) { callback(vm.runInContext(script, context)); },
  } };
  try {
    const store = new MacSecretStore("com.easybatch.test", new CSAdapter());
    const value = "quote ' \" percent % newline\n\u00e9";
    await store.Set("key", value);
    assert.equal(requests[0].value, value);
    assert.equal(await store.Get("key"), "stored");
    fail = true;
    await assert.rejects(store.Set("key", value), (error) => error.code === "unavailable");
    assert.equal(unloads, 3);
  } finally {
    delete globalThis.window;
  }
});

test("the Windows host wrapper loads the library for its architecture and exchanges plain strings", async () => {
  WindowsHarness();
  const loads = [];
  const calls = [];
  let unloads = 0;
  let answer = "0";
  let architecture = "AMD64";
  let loadable = ["x64"];
  const context = vm.createContext({
    Folder: { fs: "Windows" },
    $: { getenv: (name) => name === "PROCESSOR_ARCHITECTURE" ? architecture : "" },
    ExternalObject: function(path) {
      loads.push(path);
      if (!loadable.some((arch) => path.endsWith(`.${arch}.dll`))) throw new Error("not a valid Win32 application");
      return {
        Execute(...args) {
          calls.push(args);
          if (answer instanceof Error) throw answer;
          return answer;
        },
        unload() { unloads++; },
      };
    },
  });
  vm.runInContext(readFileSync(new URL("../../src/host/SecretStore.jsx", import.meta.url), "utf8"), context);
  globalThis.window = { __adobe_cep__: {
    getSystemPath: () => "file:///C:/Users/Jos%C3%A9%20M%C3%BCller/EasyBatch",
    evalScript(script, callback) { callback(vm.runInContext(script, context)); },
  } };
  const library = (arch) => `lib:C:/Users/Jos\u00e9 M\u00fcller/EasyBatch/native/EasyBatchSecretStore.${arch}.dll`;
  const reset = () => { loads.length = 0; calls.length = 0; unloads = 0; };

  try {
    const store = new WindowsSecretStore("com.easybatch.test", new CSAdapter());
    const value = "quote ' \" percent % colon : newline\n\u00e9";

    //Secrets pass as separate strings and come back after the first colon, so they can contain any character
    await store.Set("key", value);
    assert.deepEqual(calls, [["set", "com.easybatch.test", "key", value]]);
    assert.deepEqual(loads, [library("x64")]);
    answer = `0:${value}`;
    reset();
    assert.equal(await store.Get("key"), value);
    assert.deepEqual(calls, [["get", "com.easybatch.test", "key", ""]]);
    answer = "1168";
    assert.equal(await store.Get("key"), null);
    await store.Delete("key");
    assert.equal(unloads, 3);

    //Native ARM64 After Effects loads only the ARM64 library, and an unexpected architecture still finds the right one
    for (const [reported, available, expected] of [
      ["ARM64", ["arm64"], [library("arm64")]],
      ["AMD64", ["arm64"], [library("x64"), library("arm64")]],
      ["ARM64", ["x64"], [library("arm64"), library("x64")]],
    ]) {
      architecture = reported;
      loadable = available;
      answer = "0";
      reset();
      await store.Delete("key");
      assert.deepEqual(loads, expected);
      assert.equal(calls.length, 1);
      assert.equal(unloads, 1);
    }

    //No loadable library, native failures and unrecognized answers surface as sanitized errors
    loadable = [];
    reset();
    await assert.rejects(store.Set("key", value), (error) => error.code === "unavailable");
    assert.equal(calls.length, 0);
    assert.equal(unloads, 0);
    loadable = ["x64", "arm64"];
    architecture = "AMD64";
    for (const bad of [new Error("secret-bearing native error"), "", "denied", "x:1", "-1", "5 sensitive", "0\n"]) {
      answer = bad;
      reset();
      await assert.rejects(store.Set("key", value), (error) => {
        assert.equal(error.code, "unavailable");
        assert.doesNotMatch(error.message, /secret|sensitive/);
        return true;
      });
      assert.equal(unloads, 1);
    }
    answer = "5";
    await assert.rejects(store.Get("key"), (error) => error.code === "denied");
  } finally {
    delete globalThis.window;
  }
});

test("CEP file paths retain the macOS root while preserving Windows drive paths", () => {
  for (const [raw, expected] of [
    ["file:///Users/test/Library/Application%20Support/EasyBatch", "/Users/test/Library/Application Support/EasyBatch"],
    ["file:///C:/Users/test/EasyBatch", "C:/Users/test/EasyBatch"],
    ["/Users/test/EasyBatch", "/Users/test/EasyBatch"],
  ]) {
    globalThis.window = { __adobe_cep__: { getSystemPath: () => raw } };
    try {
      assert.equal(new CSAdapter().GetSystemPath("extension"), expected);
    } finally {
      delete globalThis.window;
    }
  }
});

test("the output folder opens in the OS without calling After Effects", async () => {
  for (const [platform, path, output, project, program, folder] of [
    ["darwin", posix, "renders/long name.mov", "/projects/graphics.aep", "/usr/bin/open", "/projects/renders"],
    ["win32", win32, "C:/Output/Broadcast/clip.mov", null, "explorer.exe", "C:\\Output\\Broadcast"],
  ]) {
    const calls = [];
    globalThis.window = { __adobe_cep__: { evalScript: () => assert.fail("Should not call After Effects") } };
    globalThis.cep_node = {
      require(name) {
        return {
          path,
          os: { platform: () => platform },
          fs: { statSync: (target) => {
            assert.equal(target, folder);
            return { isDirectory: () => true };
          } },
          child_process: { spawn: (...args) => {
            calls.push(args);
            const opener = new EventEmitter();
            queueMicrotask(() => {
              opener.emit("spawn");
              opener.emit("close", platform === "win32" ? 1 : 0);
            });
            return opener;
          } },
        }[name];
      },
    };
    try {
      const adapter = new CSAdapter();
      await adapter.OpenOutputFolder(output, project);
      assert.deepEqual(calls, [[program, [folder], { stdio: "ignore" }]]);
      await assert.rejects(adapter.OpenOutputFolder("renders/clip.mov", null), /Save the After Effects project/);
      assert.equal(calls.length, 1);
    } finally {
      delete globalThis.window;
      delete globalThis.cep_node;
    }
  }
});
