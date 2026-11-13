import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { chromium } from "@playwright/test";

test("import menu and CSV/Excel dialog workflows work together", async () => {
  const server = await createServer({
    configFile: false,
    envDir: false,
    define: {
      _VERSION_: JSON.stringify("test"),
      "import.meta.env.VITE_GOOGLE_CLIENT_ID": JSON.stringify("test-client-id"),
      "import.meta.env.VITE_GOOGLE_CLIENT_SECRET": JSON.stringify("test-client-secret"),
    },
    plugins: [svelte()],
    optimizeDeps: { entries: ["tests/unit/import-harness.html"] },
    server: { host: "127.0.0.1", port: 0 },
    logLevel: "error",
  });
  let browser;
  try {
    await server.listen();
    const address = server.httpServer.address();
    const windowsChrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
    const executablePath = process.env.CHROME_PATH ||
      (process.platform === "win32" && existsSync(windowsChrome) ? windowsChrome : undefined);
    browser = await chromium.launch({ executablePath, headless: true });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${address.port}/tests/unit/import-harness.html`);
    await page.waitForFunction(() => window.harness !== undefined);
    const loadedSources = await page.evaluate(() => {
      const { SettingsHelper, TemplateHelper } = window.harness;
      const old = {
        name: "Old template",
        base_path: "renders",
        import_file_lasts: {
          csv_folder: "csv",
          config_folder: "config",
          excel: { path: "legacy.xlsx", sheet: "Data", mapping: { Name: "Title" } },
        },
        save_file_lasts: { csv_folder: "saved csv", config_folder: "saved config" },
      };
      const active_source = { type: "excel", path: "new.xlsx", sheet: "Data", mapping: { Name: "Title" } };
      const oldTemplate = SettingsHelper.LoadProjectData({ tmpls: [old] }).tmpls[0];
      const currentTemplate = TemplateHelper.FromJson({
        ...old,
        import_file_lasts: { ...old.import_file_lasts, active_source },
      });
      return {
        old: JSON.parse(JSON.stringify(oldTemplate)),
        current: JSON.parse(JSON.stringify(currentTemplate)),
        fresh: TemplateHelper.DefaultTemplate(),
      };
    });
    assert.deepEqual(loadedSources.old.import_file_lasts, { active_source: null });
    assert.equal(loadedSources.old.name, "Old template");
    assert.equal(loadedSources.old.base_path, "renders");
    assert.equal("save_file_lasts" in loadedSources.old, false);
    assert.deepEqual(loadedSources.current.import_file_lasts, {
      active_source: { type: "excel", path: "new.xlsx", sheet: "Data", mapping: { Name: "Title" } },
    });
    assert.equal("save_file_lasts" in loadedSources.current, false);
    assert.deepEqual(loadedSources.fresh.import_file_lasts, { active_source: null });
    assert.equal("save_file_lasts" in loadedSources.fresh, false);
    await page.evaluate(() => {
      const h = window.harness;
      h.menu.Open(0, 0, (action) => { h.action = action; }, "file");
    });
    await page.locator("button").filter({ hasText: "Import File" }).waitFor();
    assert.equal(await page.locator("button").filter({ hasText: "Import Google Sheets" }).count(), 1);
    assert.equal(await page.locator("button").filter({ hasText: "Export File" }).count(), 1);
    assert.equal(await page.locator("button").filter({ hasText: "Import Data" }).count(), 0);
    assert.equal(await page.locator("button").filter({ hasText: "Export Data" }).count(), 0);
    assert.equal(await page.getByText("Re-import", { exact: true }).count(), 0);
    await page.getByText("input.csv", { exact: false }).click();
    assert.equal(await page.evaluate(() => window.harness.action), "recent_source:0");

    await page.evaluate(() => {
      const h = window.harness;
      return h.importer.OpenFile(h.template, (result) => { h.result = result; });
    });
    assert.equal(await page.locator(".import_source_dialog").count(), 0);
    await page.getByText("Import CSV Data").waitFor();
    await page.getByText("Confirm Import").click();
    assert.deepEqual(await page.evaluate(() => window.harness.template.columns[0].values), ["Old"]);
    assert.equal(await page.evaluate(() => window.harness.template.import_file_lasts.active_source.type), "csv");

    await page.evaluate(async () => {
      const h = window.harness;
      h.template.columns[0].values[0] = "Updated";
      await h.importer.SaveToOpenedFile(h.template, (result) => { h.result = result; });
    });
    assert.equal(await page.evaluate(() => window.harness.result.success), true);
    assert.equal(await page.evaluate(() => window.harness.files["/project/input.csv"]), "Name,Other\r\nUpdated,keep\r\n");

    await page.evaluate(() => {
      const h = window.harness;
      h.files["/project/input.csv"] = "Name,Other\r\nReloaded,keep\r\n";
      return h.importer.ReImportLast(h.template, (result) => { h.result = result; });
    });
    await page.getByText("Re-import CSV Data").waitFor();
    await page.getByText("Confirm Import").click();
    assert.deepEqual(await page.evaluate(() => window.harness.template.columns[0].values), ["Reloaded"]);

    await page.evaluate(() => {
      const h = window.harness;
      h.menuProps.active_source_path = "/project/input.csv";
      h.menu.Open(0, 0, (action) => { h.action = action; }, "file");
    });
    await page.locator(".c_menu button").filter({ hasText: "Save Updates" }).waitFor();
    assert.equal(await page.locator(".c_menu button").filter({ hasText: "Re-import" }).count(), 1);
    assert.deepEqual(await page.locator(".c_menu > *").evaluateAll((elements) =>
      elements.map((element) => element.textContent.trim().replace(/\s+/g, " ")).slice(0, 8)), [
      "Opened File", "input.csv", "Re-importAlt + R", "Save UpdatesAlt + S", "", "Import File", "Import Google Sheets", "Export File",
    ]);
    assert.equal(await page.locator(".c_filename").getAttribute("title"), "/project/input.csv");
    assert.equal(await page.locator(".c_filename").evaluate((element) => getComputedStyle(element).fontSize), "13px");
    assert.equal(await page.locator(".c_filename").evaluate((element) => getComputedStyle(element).cursor), "help");
    assert.equal(await page.locator(".c_menu > .c_divider").nth(1).evaluate((element) =>
      getComputedStyle(element).borderBottomStyle), "solid");
    assert.deepEqual(await page.locator(".c_menu > button").evaluateAll((buttons) =>
      buttons.slice(0, 4).map((button) => getComputedStyle(button).paddingLeft)), ["8px", "8px", "8px", "8px"]);
    await page.evaluate(() => window.harness.menu.Close());

    const shortcutResults = await page.evaluate(() => {
      const coordinator = new window.harness.ActionCoordinator();
      const calls = [];
      coordinator.AddListener("reimport_data", () => calls.push("reimport"), "r", false, false, true);
      coordinator.AddListener("save_data", () => calls.push("save"), "s", false, false, true);
      const key = (key, code, options = {}) => new KeyboardEvent("keydown", {
        key, code, bubbles: true, cancelable: true, ...options,
      });
      for (const event of [
        key("r", "KeyR", { altKey: true }), key("s", "KeyS", { altKey: true }),
        key("®", "KeyR", { altKey: true }), key("ß", "KeyS", { altKey: true }),
        key("r", "KeyR"), key("s", "KeyS"),
        key("r", "KeyR", { altKey: true, ctrlKey: true }),
      ]) coordinator.KeyPressed(event);
      return calls;
    });
    assert.deepEqual(shortcutResults, ["reimport", "save", "reimport", "save"]);

    await page.evaluate(() => {
      const h = window.harness;
      h.saveDialog.path = "/project/exported.xlsx";
      h.exporter.Open(h.template, (result) => { h.exportResult = result; });
    });
    const exportDialog = page.locator(".export_data_dialog");
    await exportDialog.getByText("Export Data").waitFor();
    assert.equal(await exportDialog.getByLabel("Sheet name").count(), 0);
    await exportDialog.locator(".dropbtn").click();
    await exportDialog.locator(".dropdown-content button").getByText("Excel").click();
    assert.equal(await exportDialog.getByLabel("Sheet name").inputValue(), "Example");
    await exportDialog.getByLabel("Sheet name").fill("invalid/name");
    assert.equal(await exportDialog.getByRole("button", { name: "Export", exact: true }).isDisabled(), true);
    assert.match(await exportDialog.locator("#export-sheet-error").textContent(), /cannot contain/);
    await exportDialog.getByLabel("Sheet name").fill("Custom Sheet");
    await exportDialog.getByRole("button", { name: "Export", exact: true }).click();
    await page.waitForFunction(() => window.harness.exportResult !== null);
    assert.deepEqual(await page.evaluate(() => window.harness.exportResult), { success: true, title: "Exported XLSX Data" });
    assert.deepEqual(await page.evaluate(() => {
      const h = window.harness;
      const workbook = h.XLSX.read(h.files["/project/exported.xlsx"], { type: "array" });
      return { sheets: workbook.SheetNames, rows: h.XLSX.utils.sheet_to_json(workbook.Sheets["Custom Sheet"], { header: 1 }) };
    }), { sheets: ["Custom Sheet"], rows: [["Name"], ["Reloaded"]] });
    await page.evaluate(() => {
      const h = window.harness;
      h.saveDialog.path = "/project/exported";
      h.exportResult = null;
      h.exporter.Open(h.template, (result) => { h.exportResult = result; });
    });
    assert.equal(await exportDialog.getByLabel("Sheet name").count(), 0);
    await exportDialog.getByRole("button", { name: "Export", exact: true }).click();
    await page.waitForFunction(() => window.harness.exportResult !== null);
    assert.deepEqual(await page.evaluate(() => window.harness.exportResult), { success: true, title: "Exported CSV Data" });
    assert.equal(await page.evaluate(() => window.harness.files["/project/exported.csv"]), "\uFEFFName\r\nReloaded");
    assert.deepEqual(await page.evaluate(() => window.harness.saveDialog.writes.slice(-2)), [
      { name: "/project/exported.xlsx", encoding: undefined },
      { name: "/project/exported.csv", encoding: "utf8" },
    ]);
    assert.deepEqual(await page.evaluate(() => window.harness.saveDialog.calls), [
      'SaveFileDialog("Export%20XLSX%20Data", "", "xlsx", "data.xlsx")',
      'SaveFileDialog("Export%20CSV%20Data", "", "csv", "data.csv")',
    ]);
    const activeSource = await page.evaluate(() => JSON.parse(JSON.stringify(window.harness.template.import_file_lasts.active_source)));

    await page.evaluate(() => {
      const h = window.harness;
      h.exportResult = null;
      h.saveDialog.path = "/project/invalid.xlsx";
      h.exporter.Open(h.template, (result) => { h.exportResult = result; });
    });
    await exportDialog.getByRole("button", { name: "Export", exact: true }).click();
    await page.waitForFunction(() => window.harness.exportResult !== null);
    assert.deepEqual(await page.evaluate(() => window.harness.exportResult), { success: false, error: "Choose a .csv filename." });
    assert.equal(await page.evaluate(() => "/project/invalid.xlsx" in window.harness.files), false);

    await page.evaluate(() => {
      const h = window.harness;
      h.exportResult = null;
      h.saveDialog.path = "/project/unwritable.csv";
      h.saveDialog.writeError = "Disk full";
      h.exporter.Open(h.template, (result) => { h.exportResult = result; });
    });
    await exportDialog.getByRole("button", { name: "Export", exact: true }).click();
    await page.waitForFunction(() => window.harness.exportResult !== null);
    assert.deepEqual(await page.evaluate(() => window.harness.exportResult), { success: false, error: "Disk full" });
    assert.equal(await page.evaluate(() => "/project/unwritable.csv" in window.harness.files), false);

    await page.evaluate(() => {
      const h = window.harness;
      h.exportResult = null;
      h.saveDialog.writeError = null;
      h.saveDialog.path = null;
      h.exporter.Open(h.template, (result) => { h.exportResult = result; });
    });
    await exportDialog.getByRole("button", { name: "Export", exact: true }).click();
    await page.waitForFunction(() => window.harness.saveDialog.calls.length === 5);
    assert.equal(await page.evaluate(() => window.harness.exportResult), null);
    assert.deepEqual(await page.evaluate(() => JSON.parse(JSON.stringify(window.harness.template.import_file_lasts.active_source))), activeSource);

    await page.evaluate(() => {
      const h = window.harness;
      h.exporter.Open(h.template, (result) => { h.exportResult = result; });
    });
    await exportDialog.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(await page.evaluate(() => window.harness.saveDialog.calls.length), 5);
    assert.equal(await page.evaluate(() => window.harness.exportResult), null);

    await page.evaluate(() => {
      const h = window.harness;
      return h.importer.OpenPath(h.template, "/project/input.xlsx", (result) => { h.result = result; });
    });
    await page.getByText("Import Excel Data").waitFor();
    await page.getByText("Confirm Import").click();
    assert.deepEqual(await page.evaluate(() => window.harness.template.columns[0].values), ["Excel"]);
    assert.equal(await page.evaluate(() => window.harness.template.import_file_lasts.active_source.type), "excel");
    assert.equal(await page.evaluate(() => "excel" in window.harness.template.import_file_lasts), false);
    await page.evaluate(async () => {
      const h = window.harness;
      h.template.columns[0].values[0] = "Should not overwrite";
      await h.importer.SaveToOpenedFile(h.template, (result) => { h.result = result; });
    });
    assert.equal(await page.evaluate(() => window.harness.result.stats.formula_cells_skipped), 1);
    assert.equal(await page.evaluate(() =>
      window.harness.XLSX.read(window.harness.files["/project/input.xlsx"], { type: "array" }).Sheets.Data.A2.f),
    '"Excel"');

    await page.evaluate(() => {
      const h = window.harness;
      h.files["/project/bad.csv"] = 'Name\n"unterminated';
      return h.importer.OpenPath(h.template, "/project/bad.csv", (result) => { h.result = result; });
    });
    assert.equal(await page.evaluate(() => window.harness.result.success), false);
    assert.equal(await page.evaluate(() => window.harness.template.import_file_lasts.active_source.type), "excel");

    await page.evaluate(() => {
      const h = window.harness;
      h.googleFixture = {
        rows: [[], ["Name", "Other"], ["First", "keep"], [], ["Formula result", "keep2"]],
        formulas: [[], ["Name", "Other"], ["First", "keep"], [], ["=CONCAT(\"Formula\", \" result\")", "keep2"]],
        updates: null,
      };
      h.google_sheets.Pick = async () => "sheet_123";
      h.google_sheets.Metadata = async () => ({ name: "Team Sheet", sheets: ["Data", "<img src=x onerror=alert(1)>"] });
      h.google_sheets.Values = async (_id, _sheet, formulas) => formulas ? h.googleFixture.formulas : h.googleFixture.rows;
      h.google_sheets.Update = async (id, data) => { h.googleFixture.updates = { id, data }; };
      h.result = null;
      h.importer.OpenGoogleSheets(h.template, (result) => { h.result = result; });
    });
    assert.equal(await page.locator(".import_source_dialog").count(), 0);
    const googleDialog = page.locator(".import_excel_dialog");
    await googleDialog.getByText("Import Google Sheets Data").waitFor();
    assert.match(await googleDialog.locator(".summary").first().textContent(), /Team Sheet/);
    await googleDialog.locator(".sheet_picker .dropbtn").click();
    assert.equal(await googleDialog.locator(".sheet_picker img").count(), 0);
    await googleDialog.locator(".sheet_picker .dropdown-content button").getByText("Data", { exact: true }).click();
    await googleDialog.getByRole("button", { name: "Confirm Import" }).click();
    assert.deepEqual(await page.evaluate(() => window.harness.template.columns[0].values), ["First", "Formula result"]);
    assert.deepEqual(await page.evaluate(() => JSON.parse(JSON.stringify(window.harness.template.import_file_lasts.active_source))), {
      type: "google", path: "https://docs.google.com/spreadsheets/d/sheet_123/edit", name: "Team Sheet",
      sheet: "Data", mapping: { Name: "Name" },
    });
    assert.deepEqual(await page.evaluate(() => window.harness.result.source), {
      type: "google", path: "https://docs.google.com/spreadsheets/d/sheet_123/edit", name: "Team Sheet",
    });
    await page.evaluate(async () => {
      const h = window.harness;
      h.template.columns[0].values = ["Updated", "Must not overwrite", "Appended"];
      await h.importer.SaveToOpenedFile(h.template, (result) => { h.result = result; });
    });
    assert.deepEqual(await page.evaluate(() => window.harness.result.stats), {
      written_cells: 2, formula_cells_skipped: 1, missing_columns: [],
    });
    assert.deepEqual(await page.evaluate(() => window.harness.googleFixture.updates), {
      id: "sheet_123",
      data: [
        { range: "'Data'!A3", values: [["Updated"]] },
        { range: "'Data'!A6", values: [["Appended"]] },
      ],
    });
    await page.evaluate(() => {
      const h = window.harness;
      h.googleFixture.rows[2][0] = "Reloaded Google";
      return h.importer.ReImportLast(h.template, (result) => { h.result = result; });
    });
    await page.getByText("Re-import Google Sheets Data").waitFor();
    await page.getByRole("button", { name: "Confirm Import" }).click();
    assert.deepEqual(await page.evaluate(() => window.harness.template.columns[0].values), ["Reloaded Google", "Formula result"]);
    await page.evaluate(() => {
      const h = window.harness;
      h.menuProps.active_source_path = "https://docs.google.com/spreadsheets/d/sheet_123/edit";
      h.menuProps.active_source_name = "Team Sheet";
      h.menuProps.recent_sources = [{ type: "google", path: h.menuProps.active_source_path, name: "Team Sheet" }];
      h.menu.Open(0, 0, (action) => { h.action = action; }, "file");
    });
    await page.locator(".c_filename").waitFor();
    assert.equal(await page.locator(".c_filename").textContent(), "Team Sheet");
    assert.equal(await page.locator(".c_filename").getAttribute("title"), "https://docs.google.com/spreadsheets/d/sheet_123/edit");
    assert.match(await page.locator(".c_recent").textContent(), /Team Sheet.*Google Sheets/);
    await page.evaluate(() => window.harness.menu.Close());
    const googleHelperResults = await page.evaluate(() => {
      const h = window.harness;
      return {
        escaped: h.PrepareSheetUpdates("Bob's Sheet", [["Name"], ["Old"]], [["Name"], ["Old"]], { Name: "Name" }, [{ cont_name: "Name", values: ["=text"] }]),
        invalid: (() => { try { h.SpreadsheetId("https://example.com/spreadsheet"); return false; } catch { return true; } })(),
        url: h.SpreadsheetUrl("sheet_123"),
      };
    });
    assert.deepEqual(googleHelperResults.escaped.data, [{ range: "'Bob''s Sheet'!A2", values: [["=text"]] }]);
    assert.equal(googleHelperResults.invalid, true);
    assert.equal(googleHelperResults.url, "https://docs.google.com/spreadsheets/d/sheet_123/edit");
    const invalidMapping = await page.evaluate(() => {
      try {
        window.harness.PrepareSheetUpdates("Data", [["Name", "Name"], ["x", "y"]], [], { Name: "Name" }, [{ cont_name: "Name", values: ["new"] }]);
        return null;
      } catch (error) { return error.message; }
    });
    assert.match(invalidMapping, /ambiguous/);
    await page.evaluate(async () => {
      const h = window.harness;
      h.googleFixture.updates = null;
      h.google_sheets.Update = async () => { throw new Error("Permission denied"); };
      await h.importer.SaveToOpenedFile(h.template, (result) => { h.result = result; });
    });
    assert.equal(await page.evaluate(() => window.harness.result.success), false);
    assert.equal(await page.evaluate(() => window.harness.result.error), "Permission denied");
    assert.equal(await page.evaluate(() => window.harness.googleFixture.updates), null);
    await page.evaluate(() => {
      const h = window.harness;
      h.result = null;
      h.google_sheets.Values = () => new Promise((resolve) => { h.resolveValues = resolve; });
      h.google_sheets.Update = async () => { h.googleFixture.updates = "unexpected"; };
      h.importer.SaveToOpenedFile(h.template, (result) => { h.result = result; });
    });
    await page.getByText("Saving to Google Sheets").waitFor();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.evaluate(() => window.harness.resolveValues(window.harness.googleFixture.rows));
    await page.waitForTimeout(50);
    assert.equal(await page.evaluate(() => window.harness.googleFixture.updates), null);
    assert.equal(await page.evaluate(() => window.harness.result), null);
    await page.evaluate(() => {
      const h = window.harness;
      h.result = null;
      h.google_sheets.Metadata = () => new Promise((resolve) => { h.resolveMetadata = resolve; });
      h.importer.OpenGoogle(h.template, "https://docs.google.com/spreadsheets/d/sheet_123/edit", (result) => { h.result = result; });
    });
    await page.getByText("Opening Google Sheets").waitFor();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.evaluate(() => window.harness.resolveMetadata({ name: "Team Sheet", sheets: ["Data"] }));
    await page.waitForTimeout(50);
    assert.equal(await page.locator(".import_excel_dialog").count(), 0);
    assert.equal(await page.evaluate(() => window.harness.result), null);
    const auth = await page.evaluate(async () => {
      const originalRequire = window.cep_node.require;
      const originalCep = window.cep;
      const originalFetch = window.fetch;
      const originalSetTimeout = window.setTimeout;
      const logger = window.harness.l;
      const originalDebug = logger.debug;
      const originalWarn = logger.warn;
      const calls = [];
      const logs = [];
      logger.debug = (...messages) => logs.push({ level: "debug", messages });
      logger.warn = (...messages) => logs.push({ level: "warn", messages });
      let callback;
      let tokenError;
      let sheetsError;
      let invalidJson = false;
      let invalidShape = false;
      let networkError = false;
      let streamError = false;
      let timeout = false;
      let callbackMode = "normal";
      const random = { toString: () => "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG=" };
      const crypto = {
        randomBytes: () => random,
        createHash: () => ({ update: () => ({ digest: () => random }) }),
      };
      const http = {
        createServer: (handler) => {
          callback = handler;
          return {
            on: () => {},
            address: () => ({ port: 43210 }),
            listen: (port, host, ready) => {
              calls.push({ listenPort: port, listenHost: host });
              queueMicrotask(ready);
            },
            close: () => { calls.push({ closed: true }); },
          };
        },
      };
      window.fetch = async (url, options) => {
        calls.push({ url, options, body: options.body ?? "" });
        if (timeout) {
          return new Promise((_resolve, reject) => {
            options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
          });
        }
        if (networkError) {
          const error = new Error("transport included secret cell");
          error.code = "ECONNRESET";
          throw error;
        }
        const isToken = url.includes("oauth2.googleapis.com");
        const failure = isToken ? tokenError : sheetsError;
        const value = failure ?? (isToken
          ? { access_token: "mock-access-token", refresh_token: "mock-refresh-token", expires_in: 3600, token_type: "Bearer", scope: "https://www.googleapis.com/auth/drive.file secret-scope" }
          : url.includes("values:batchUpdate") ? { totalUpdatedCells: 1 }
          : url.includes("/values/") ? { values: [["secret cell"]] }
          : { properties: { title: "Test" }, sheets: [{ properties: { title: "Data" } }] });
        if (streamError) return {
          text: async () => { throw new Error("stream included secret cell"); },
        };
        return new Response(invalidJson ? "not JSON secret cell" : JSON.stringify(invalidShape ? [] : value), {
          status: failure ? 400 : 200,
          headers: { "content-type": "application/json; charset=utf-8" },
        });
      };
      window.setTimeout = (handler, delay, ...args) =>
        originalSetTimeout(handler, timeout && delay === 30000 ? 0 : delay, ...args);
      window.cep_node.require = (name) => ({ crypto, http })[name] ?? originalRequire(name);
      let authUrl;
      window.cep = { util: { openURLInDefaultBrowser: (url) => {
        authUrl = url;
        const params = new URL(url).searchParams;
        const respond = (query) => {
          const response = { writeHead: (status) => calls.push({ status }), end: () => {} };
          callback({ method: "GET", url: `/oauth/callback?${query}` }, response);
        };
        respond("state=wrong&code=attacker&picked_file_ids=sheet_123");
        const callbackParams = new URLSearchParams({
          state: params.get("state"), code: "mock-code", picked_file_ids: "sheet_123",
          scope: "https://www.googleapis.com/auth/drive.file secret-scope",
          authuser: "private-account", prompt: "consent", "secret-parameter": "secret-value",
        });
        if (callbackMode === "denied") {
          callbackParams.delete("code");
          callbackParams.set("error", "access_denied");
          callbackParams.set("error_description", "private-error-detail");
        } else if (callbackMode === "missing-code") callbackParams.delete("code");
        else if (callbackMode === "invalid-file") callbackParams.set("picked_file_ids", "sheet_123,bad id");
        respond(callbackParams.toString());
      } } };
      try {
        const client = new window.harness.GoogleSheetsClient();
        const id = await client.Pick();
        const metadata = await client.Metadata(id);
        const values = await client.Values(id, "Secret Sheet");
        await client.Update(id, [{ range: "'Secret Sheet'!A1", values: [["secret cell"]] }]);
        sheetsError = { error: { message: "Invalid token mock-access-token" } };
        let sheetsFailure;
        try { await client.Metadata(id); } catch (error) { sheetsFailure = error.message; }
        tokenError = { error: "invalid_request", error_description: "client_secret is missing. mock-code abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG test-client-secret" };
        let tokenFailure;
        try { await new window.harness.GoogleSheetsClient().Pick(); } catch (error) { tokenFailure = error.message; }
        tokenError = { error: "invalid_request", error_description: "client_secret is missing." };
        try { await new window.harness.GoogleSheetsClient().Pick(); } catch {}
        tokenError = undefined;
        const callbackFailures = {};
        for (const mode of ["denied", "missing-code", "invalid-file", "wrong-file"]) {
          callbackMode = mode;
          try {
            const attempt = new window.harness.GoogleSheetsClient();
            if (mode === "wrong-file") await attempt.Authorize(true, "another_sheet");
            else await attempt.Pick();
          } catch (error) { callbackFailures[mode] = error.message; }
        }
        callbackMode = "normal";
        sheetsError = undefined;
        invalidJson = true;
        let invalidFailure;
        try { await client.Metadata(id); } catch (error) { invalidFailure = error.message; }
        invalidJson = false;
        networkError = true;
        let networkFailure;
        try { await client.Metadata(id); } catch (error) { networkFailure = error.message; }
        networkError = false;
        streamError = true;
        let streamFailure;
        try { await client.Metadata(id); } catch (error) { streamFailure = error.message; }
        streamError = false;
        invalidShape = true;
        let shapeFailure;
        try { await client.Metadata(id); } catch (error) { shapeFailure = error.message; }
        invalidShape = false;
        timeout = true;
        let timeoutFailure;
        try { await client.Metadata(id); } catch (error) { timeoutFailure = error.message; }
        return { id, metadata, values, authUrl, calls, logs, tokenFailure, sheetsFailure, invalidFailure, networkFailure, streamFailure, shapeFailure, timeoutFailure, callbackFailures };
      } finally {
        window.cep_node.require = originalRequire;
        window.cep = originalCep;
        window.fetch = originalFetch;
        window.setTimeout = originalSetTimeout;
        logger.debug = originalDebug;
        logger.warn = originalWarn;
      }
    });
    const authorization = new URL(auth.authUrl);
    assert.equal(authorization.searchParams.get("scope"), "https://www.googleapis.com/auth/drive.file");
    assert.equal(authorization.searchParams.get("trigger_onepick"), "true");
    assert.equal(authorization.searchParams.get("prompt"), "consent");
    assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
    assert.equal(authorization.searchParams.get("redirect_uri"), "http://localhost:43210/oauth/callback");
    assert.deepEqual(auth.calls.filter((call) => call.listenHost),
      Array.from({ length: 7 }, () => ({ listenPort: 0, listenHost: "127.0.0.1" })));
    assert.equal(auth.id, "sheet_123");
    assert.deepEqual(auth.metadata, { name: "Test", sheets: ["Data"] });
    assert.deepEqual(auth.values, [["secret cell"]]);
    assert.deepEqual(auth.calls.filter((call) => call.status).map((call) => call.status),
      Array.from({ length: 7 }, () => [400, 200]).flat());
    const tokenRequest = auth.calls.find((call) => call.url?.includes("oauth2.googleapis.com"));
    const tokenBody = new URLSearchParams(tokenRequest.body);
    assert.equal(tokenBody.get("code"), "mock-code");
    assert.equal(tokenBody.get("grant_type"), "authorization_code");
    assert.equal(tokenBody.get("redirect_uri"), authorization.searchParams.get("redirect_uri"));
    assert.ok(tokenBody.get("code_verifier"));
    assert.equal(tokenBody.get("client_secret"), "test-client-secret");
    assert.equal(auth.tokenFailure, "Google authorization token exchange failed: invalid_request: client_secret is missing. [redacted] [redacted] [redacted]");
    assert.equal(auth.sheetsFailure, "Google Sheets request failed: Invalid token [redacted]");
    assert.equal(auth.invalidFailure, "Google returned an invalid response.");
    assert.equal(auth.networkFailure, "Google request failed before a readable response (network, CORS, or redirect error).");
    assert.equal(auth.streamFailure, "Google request failed before a readable response (network, CORS, or redirect error).");
    assert.equal(auth.shapeFailure, "Google returned an invalid response.");
    assert.equal(auth.timeoutFailure, "Google request timed out.");
    assert.deepEqual(auth.callbackFailures, {
      denied: "Google authorization was cancelled.",
      "missing-code": "Google authorization failed: missing authorization code",
      "invalid-file": "No Google spreadsheet was selected.",
      "wrong-file": "The selected spreadsheet does not match the requested source.",
    });
    const logData = (label) => auth.logs.filter((entry) => entry.messages[0] === `[GoogleSheets] ${label}`).map((entry) => entry.messages[1]);
    assert.equal(tokenRequest.options.credentials, "omit");
    assert.equal(tokenRequest.options.redirect, "error");
    assert.equal(tokenRequest.options.cache, "no-store");
    assert.equal(tokenBody.get("client_id"), "test-client-id");
    assert.equal(authorization.searchParams.get("client_id"), "test-client-id");
    for (const operation of ["token", "metadata", "values", "batchUpdate"]) {
      assert.ok(logData("Request completed").some((entry) => entry.operation === operation && entry.status === 200), `missing completion log for ${operation}`);
    }
    assert.deepEqual(Object.keys(logData("Request completed")[0]).sort(), ["elapsed_ms", "operation", "status"]);
    assert.ok(logData("Request failed").some((entry) => entry.operation === "token" && entry.status === 400 && entry.error.code === "invalid_request" && entry.error.detail === "client_secret is missing."));
    assert.ok(logData("Invalid response").some((entry) => entry.operation === "metadata" && entry.status === 200));
    assert.ok(logData("Request did not complete").some((entry) => entry.operation === "metadata" && entry.timed_out === false));
    assert.ok(logData("Request did not complete").some((entry) => entry.operation === "metadata" && entry.timed_out === true));
    assert.ok(logData("Rejected authorization callback").some((entry) => entry.state_matches === false));
    assert.ok(logData("Authorization callback had no code").some((entry) => entry.error === "access_denied"));
    const failedStages = logData("Authorization failed").map((entry) => entry.stage);
    for (const stage of ["waiting-for-browser", "validating-selection", "exchanging-code"]) {
      assert.ok(failedStages.includes(stage), `missing failure log for ${stage}`);
    }
    assert.equal(logData("Authorization failed").some((entry) => entry.cancelled !== false), false);
    const logged = JSON.stringify(auth.logs);
    for (const secret of ["test-client-secret", "mock-code", "attacker", "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG", "mock-access-token", "mock-refresh-token", "sheet_123", "Secret Sheet", "secret cell", "secret-scope", "private-account", "secret-parameter", "secret-value", "private-error-detail"]) {
      assert.equal(logged.includes(secret), false, `log leaked ${secret}`);
    }
    const sheetsRequest = auth.calls.find((call) => call.url?.includes("sheets.googleapis.com"));
    assert.equal(sheetsRequest.options.headers.Authorization, "Bearer mock-access-token");
  } finally {
    if (browser) await browser.close();
    await server.close();
  }
});
