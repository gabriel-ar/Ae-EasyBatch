import { after, test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "vite";

const real_fetch = globalThis.fetch;
const original_cep = globalThis.cep_node;
const logs = [];
const state = {
  l: {
    debug: (...args) => logs.push(args),
    warn: (...args) => logs.push(args),
  },
  csa: {},
};
globalThis.google_auth_test_state = state;
const server = await createServer({
  configFile: false, envDir: false, server: { middlewareMode: true, hmr: false, ws: false }, logLevel: "error",
  optimizeDeps: { noDiscovery: true, include: [] },
  define: {
    "import.meta.env.VITE_GOOGLE_CLIENT_ID": JSON.stringify("test-client"),
    "import.meta.env.VITE_GOOGLE_CLIENT_SECRET": JSON.stringify("test-client-secret"),
  },
  plugins: [{
    name: "google-auth-test-state",
    enforce: "pre",
    resolveId(source, importer) {
      if (source === "./States.svelte.ts" && importer?.endsWith("/GoogleSheets.ts")) return "\0google-auth-state";
    },
    load(id) {
      if (id === "\0google-auth-state") return "export const { l, csa } = globalThis.google_auth_test_state;";
    },
  }],
});
after(async () => {
  globalThis.fetch = real_fetch;
  globalThis.cep_node = original_cep;
  delete globalThis.google_auth_test_state;
  await server.close();
});
const { GoogleSheetsClient } = await server.ssrLoadModule("/src/lib/GoogleSheets.ts");
const key = (id) => `google-sheets:test-client:${id}`;

function Harness() {
  logs.length = 0;
  globalThis.cep_node = { require: createRequire(import.meta.url) };
  const saved = new Map();
  const calls = [];
  const browser = [];
  const store = {
    Get: async (key) => { calls.push(["get", key]); return saved.get(key) ?? null; },
    Set: async (key, value) => { calls.push(["set", key]); saved.set(key, value); },
    Delete: async (key) => { calls.push(["delete", key]); saved.delete(key); },
  };
  state.csa.OpenURLInDefaultBrowser = (url) => {
    const authorization = new URL(url);
    browser.push(authorization);
    const callback = new URL(authorization.searchParams.get("redirect_uri"));
    callback.searchParams.set("state", authorization.searchParams.get("state"));
    callback.searchParams.set("code", "test-code");
    callback.searchParams.set("picked_file_ids", authorization.searchParams.get("file_ids") ?? "sheet_A");
    void real_fetch(callback).catch((error) => { throw error; });
  };
  const requests = [];
  let token_error;
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    if (url.includes("oauth2.googleapis.com")) {
      if (token_error) return new Response(JSON.stringify({ error: token_error }), { status: 400 });
      return new Response(JSON.stringify({
        access_token: "private-access", expires_in: 3600, refresh_token: "private-refresh",
      }));
    }
    return new Response(JSON.stringify({ properties: { title: "Test" }, sheets: [] }));
  };
  return {
    store, saved, calls, browser, requests,
    client: new GoogleSheetsClient(store),
    TokenError: (value) => { token_error = value; },
  };
}

test("authorization requests offline access and stores refresh tokens outside project state", async () => {
  const h = Harness();
  assert.equal(await h.client.Pick(), "sheet_A");
  assert.equal(h.browser[0].searchParams.get("access_type"), "offline");
  assert.equal(h.saved.get(key("sheet_A")), "private-refresh");
  await h.client.Metadata("sheet_A");
  assert.equal(h.browser.length, 1);
  assert.deepEqual(h.calls, [["set", key("sheet_A")]]);
  assert.doesNotMatch(JSON.stringify(logs), /private-access|private-refresh|test-code|test-client-secret/);
});

test("a fresh client refreshes from Keychain and caches access without reopening the browser", async () => {
  const h = Harness();
  h.saved.set(key("sheet_A"), "stored-refresh");
  await Promise.all([h.client.Metadata("sheet_A"), h.client.Metadata("sheet_A")]);
  await h.client.Metadata("sheet_A");
  assert.equal(h.browser.length, 0);
  assert.equal(h.calls.filter(([operation]) => operation === "get").length, 1);
  assert.equal(h.requests.filter(({ url }) => url.includes("oauth2.googleapis.com")).length, 1);
  const body = new URLSearchParams(h.requests[0].options.body);
  assert.equal(body.get("grant_type"), "refresh_token");
  assert.equal(body.get("refresh_token"), "stored-refresh");
  assert.equal(h.saved.get(key("sheet_A")), "private-refresh");
});

test("access tokens and stored credentials are isolated by spreadsheet", async () => {
  const h = Harness();
  h.saved.set(key("sheet_A"), "refresh-A");
  h.saved.set(key("sheet_B"), "refresh-B");
  await h.client.Metadata("sheet_A");
  await h.client.Metadata("sheet_B");
  assert.deepEqual(h.calls.filter(([operation]) => operation === "get"), [
    ["get", key("sheet_A")], ["get", key("sheet_B")],
  ]);
});

test("expired access is refreshed again and a response without rotation preserves the refresh token", async () => {
  const h = Harness();
  h.saved.set(key("sheet_A"), "keep-refresh");
  const fetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (url.includes("oauth2.googleapis.com")) {
      h.requests.push({ url, options });
      return new Response(JSON.stringify({ access_token: "short-lived", expires_in: 60 }));
    }
    return fetch(url, options);
  };
  await h.client.Metadata("sheet_A");
  await h.client.Metadata("sheet_A");
  assert.equal(h.requests.filter(({ url }) => url.includes("oauth2.googleapis.com")).length, 2);
  assert.equal(h.saved.get(key("sheet_A")), "keep-refresh");
  assert.equal(h.calls.filter(([operation]) => operation === "set").length, 0);
});

test("malformed token responses cannot overwrite persisted credentials", async () => {
  const h = Harness();
  h.saved.set(key("sheet_A"), "keep-refresh");
  globalThis.fetch = async () => new Response(JSON.stringify({ refresh_token: "bad-response" }));
  await assert.rejects(h.client.Metadata("sheet_A"), /valid access token/);
  assert.equal(h.saved.get(key("sheet_A")), "keep-refresh");
  assert.equal(h.browser.length, 0);
});

test("invalid_grant deletes the rejected token and requests authorization once", async () => {
  const h = Harness();
  h.saved.set(key("sheet_A"), "revoked");
  h.TokenError("invalid_grant");
  const fetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (new URLSearchParams(options.body).get("grant_type") === "authorization_code") h.TokenError(undefined);
    return fetch(url, options);
  };
  await h.client.Metadata("sheet_A");
  assert.equal(h.browser.length, 1);
  assert.ok(h.calls.some(([operation]) => operation === "delete"));
  assert.equal(h.saved.get(key("sheet_A")), "private-refresh");
});

test("network and Keychain failures do not erase tokens or silently open authorization", async () => {
  const h = Harness();
  h.saved.set(key("sheet_A"), "keep-refresh");
  h.TokenError("invalid_client");
  await assert.rejects(h.client.Metadata("sheet_A"), /invalid_client/);
  assert.equal(h.saved.get(key("sheet_A")), "keep-refresh");
  h.store.Get = async () => { throw new Error("Keychain access denied"); };
  await assert.rejects(h.client.Metadata("sheet_B"), /Keychain access denied/);
  assert.equal(h.browser.length, 0);
  assert.equal(h.calls.filter(([operation]) => operation === "delete").length, 0);
});

test("cancelling while Keychain loads prevents refresh or browser authorization", async () => {
  const h = Harness();
  let finish;
  h.store.Get = () => new Promise((resolve) => { finish = resolve; });
  const request = h.client.Metadata("sheet_A");
  h.client.CancelAuthorization();
  finish("stored-refresh");
  await assert.rejects(request, /cancelled/);
  assert.equal(h.requests.length, 0);
  assert.equal(h.browser.length, 0);
});
