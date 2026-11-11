import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { chromium } from "@playwright/test";

test("import menu and CSV/Excel dialog workflows work together", async () => {
  const server = await createServer({
    configFile: false,
    define: { _VERSION_: JSON.stringify("test") },
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
    await page.locator("button").filter({ hasText: "Import Data" }).waitFor();
    assert.equal(await page.locator("button").filter({ hasText: "Export Data" }).count(), 1);
    assert.equal(await page.getByText("Re-import", { exact: true }).count(), 0);
    await page.getByText("input.csv", { exact: false }).click();
    assert.equal(await page.evaluate(() => window.harness.action), "recent_source:0");

    await page.evaluate(() => {
      const h = window.harness;
      return h.importer.Open(h.template, (result) => { h.result = result; });
    });
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
      elements.map((element) => element.textContent.trim().replace(/\s+/g, " ")).slice(0, 7)), [
      "Opened File", "input.csv", "Re-importAlt + R", "Save UpdatesAlt + S", "", "Import Data", "Export Data",
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
  } finally {
    if (browser) await browser.close();
    await server.close();
  }
});
