import { after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createServer } from "vite";

const server = await createServer({
  configFile: false, envDir: false, server: { middlewareMode: true, hmr: false }, logLevel: "error",
  optimizeDeps: { noDiscovery: true, include: [] },
});
after(() => server.close());
const { CreateSecretStore, MacSecretStore, SecretStoreError } = await server.ssrLoadModule("/src/lib/SecretStore.ts");
const { default: CSAdapter } = await server.ssrLoadModule("/src/lib/CSAdapter.ts");

function Harness(response = { status: 0 }, platform = "darwin") {
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
  return { calls, adapter, store: new MacSecretStore("com.easybatch.test", adapter) };
}

test("native storage sends JSON through the CEP bridge and preserves secret characters", async () => {
  const h = Harness();
  const secret = 'quotes " slash \\ newline\nUnicode: \u00e9\n';
  await h.store.Set("feature:key", secret);
  assert.deepEqual(h.calls, [["SecretStoreRequest", "/extension", JSON.stringify({
    action: "set", service: "com.easybatch.test", key: "feature:key", value: secret,
  })]]);
});

test("the shared factory selects macOS without accessing Keychain and reports unimplemented platforms", () => {
  const mac = Harness();
  assert.ok(CreateSecretStore() instanceof MacSecretStore);
  assert.equal(mac.calls.length, 0);
  Harness(undefined, "win32");
  assert.equal(CreateSecretStore(), null);
});

test("native reads preserve Unicode and whitespace without decoding the old CLI envelope", async () => {
  const value = "eb1:1234\n \u00e9\n";
  const h = Harness({ status: 0, value });
  assert.equal(await h.store.Get("feature:key"), value);
});

test("missing secrets return null and deletion is idempotent, but failed writes stay errors", async () => {
  const { store } = Harness({ status: -25300 });
  assert.equal(await store.Get("feature:key"), null);
  await store.Delete("feature:key");
  await assert.rejects(store.Set("feature:key", "value"), (error) => error.code === "unavailable");
});

test("native failures are typed and never expose bridge responses", async () => {
  for (const [status, expected] of [
    [-25293, "denied"], [-25308, "denied"], [-128, "denied"],
    [-50, "invalid-input"], [-26275, "invalid-data"], [-1, "unavailable"],
  ]) {
    const { store } = Harness({ status, error: "sensitive response" });
    await assert.rejects(store.Get("feature:key"), (error) => {
      assert.ok(error instanceof SecretStoreError);
      assert.equal(error.code, expected);
      assert.doesNotMatch(error.message, /sensitive/);
      return true;
    });
  }
});

test("malformed and incomplete host responses are explicit errors", async () => {
  for (const response of [null, [], {}, { status: "0" }, { status: 0.1 }]) {
    const { store } = Harness(response);
    await assert.rejects(store.Get("key"), (error) => error.code === "unavailable");
  }
  for (const response of [{ status: 0 }, { status: 0, value: "" }, { status: 0, value: 42 }, { status: 0, value: "\0" }]) {
    const { store } = Harness(response);
    await assert.rejects(store.Get("key"), (error) => error.code === "invalid-data");
  }
  for (const reject of [false, true]) {
    const h = Harness();
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
});

test("invalid inputs and unsupported platforms fail without invoking the host", async () => {
  const { calls, store } = Harness();
  for (const key of ["", "key\nquit", "has spaces", '"quoted"', "a".repeat(257)]) {
    await assert.rejects(store.Get(key), (error) => error.code === "invalid-input");
    await assert.rejects(store.Set(key, "secret"), (error) => error.code === "invalid-input");
    await assert.rejects(store.Delete(key), (error) => error.code === "invalid-input");
  }
  for (const value of ["", "nul\0byte"]) {
    await assert.rejects(store.Set("key", value), (error) => error.code === "invalid-input");
  }
  assert.equal(calls.length, 0);
  const unsupported = Harness(undefined, "win32");
  await assert.rejects(unsupported.store.Get("key"), (error) => error.code === "unsupported");
  assert.equal(unsupported.calls.length, 0);
});

test("real CSAdapter and host wrapper round-trip encoding and unload the native library on failure", async () => {
  Harness();
  const requests = [];
  let unloads = 0;
  let fail = false;
  const context = vm.createContext({
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
