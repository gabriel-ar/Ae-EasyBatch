import { after, test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import * as XLSX from "xlsx";
import { createServer } from "vite";

const server = await createServer({
  configFile: false, server: { middlewareMode: true }, logLevel: "error",
  optimizeDeps: { noDiscovery: true, include: [] },
});
after(() => server.close());
const { ParseCSVSource, SaveMappedCSVValues } = await server.ssrLoadModule("/src/lib/CSVSource.ts");
const { CreateTemplateWorkbook, SaveMappedTemplateValuesToSheet, ValidateSheetName } = await server.ssrLoadModule("/src/lib/ExcelWorkbookWriter.ts");
const { LocalSettings } = await server.ssrLoadModule("/src/lib/LocalSettings.ts");

test("CSV updates preserve unmapped columns, blank lines, formula cells, BOM and delimiters", () => {
  const content = "\uFEFFName;Other\r\nOld;keep\r\n\r\n=1+1;untouched\r\n";
  const result = SaveMappedCSVValues(content, { Name: "Name" }, [
    { cont_name: "Name", values: ["new", "not a formula", "third"] },
  ]);
  assert.equal(result.content, "\uFEFFName;Other\r\nnew;keep\r\n\r\n=1+1;untouched\r\nthird\r\n");
  assert.deepEqual(result.stats, {
    written_cells: 2, formula_cells_skipped: 1, missing_columns: [],
  });
  const parsed = ParseCSVSource(result.content);
  assert.deepEqual(parsed.data_indices.map((i) => parsed.rows[i]), [
    ["new", "keep"], ["=1+1", "untouched"], ["third"],
  ]);
});

test("CSV handles single-column files and refuses malformed or ambiguous updates", () => {
  assert.deepEqual(ParseCSVSource("Name\nfirst\n").data_indices, [1]);
  assert.throws(() => ParseCSVSource('Name\n"unterminated'), /parse CSV/);
  assert.throws(() => SaveMappedCSVValues("Name,Name\none,two", { prop: "Name" }, [
    { cont_name: "prop", values: ["new"] },
  ]), /ambiguous/);
  assert.throws(() => SaveMappedCSVValues("Name\none", { a: "Name", b: "Name" }, [
    { cont_name: "a", values: ["a"] }, { cont_name: "b", values: ["b"] },
  ]), /ambiguous/);
});

test("Excel updates track non-empty rows and preserve formulas and other columns", () => {
  const sheet = XLSX.utils.aoa_to_sheet([
    [], ["Name", "Other"], ["first", "keep"], [], ["second", "keep2"],
  ]);
  sheet.A5 = { t: "s", v: "second", f: '"second"' };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Data");
  const stats = SaveMappedTemplateValuesToSheet(workbook, "Data", { prop: "Name" }, [
    { cont_name: "prop", values: ["updated", "skip", "appended"] },
  ]);
  assert.equal(sheet.A3.v, "updated");
  assert.equal(sheet.A5.f, '"second"');
  assert.equal(sheet.A6.v, "appended");
  assert.equal(sheet.B3.v, "keep");
  assert.equal(sheet.B5.v, "keep2");
  assert.equal(sheet.A4, undefined);
  assert.deepEqual(stats, { written_cells: 2, formula_cells_skipped: 1, missing_columns: [] });
});

test("Excel save refuses ambiguous columns before writing a file", () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Name", "Name"], ["a", "b"]]), "Data");
  assert.throws(() => SaveMappedTemplateValuesToSheet(workbook, "Data", { prop: "Name" }, [
    { cont_name: "prop", values: ["new"] },
  ]), /ambiguous/);
});

test("Excel export creates one worksheet with headers and round-trippable values", () => {
  const columns = [
    { cont_name: "Name", values: ["first", "second"] },
    { cont_name: "Position", values: [[1, 2, 3], [4, 5, 6]] },
    { cont_name: "Amount", values: [12, 24] },
  ];
  const workbook = CreateTemplateWorkbook(columns, [
    ["first", [1, 2, 3], 12], ["second", [4, 5, 6], 24],
  ], "Custom Sheet");
  const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const imported = XLSX.read(bytes, { type: "buffer" });
  assert.deepEqual(imported.SheetNames, ["Custom Sheet"]);
  assert.deepEqual(XLSX.utils.sheet_to_json(imported.Sheets["Custom Sheet"], { header: 1 }), [
    ["Name", "Position", "Amount"],
    ["first", "[1,2,3]", 12],
    ["second", "[4,5,6]", 24],
  ]);
});

test("Excel sheet names enforce naming rules without silently changing the name", () => {
  for (const name of ["", "  ", "x".repeat(32), "a/b", "a\\b", "a?b", "a*b", "a[b", "a]b", "a:b", "'name", "name'", "a\u0000b"]) {
    assert.ok(ValidateSheetName(name), `rejects ${JSON.stringify(name)}`);
    assert.throws(() => CreateTemplateWorkbook([], [], name));
  }
  assert.equal(ValidateSheetName("x".repeat(31)), null);
  assert.equal(ValidateSheetName("Client's Work"), null);
});

test("recent sources are persisted, ordered, deduplicated and limited to ten", () => {
  const store = new Map([
    ["easybatch.recentSources", JSON.stringify([{ type: "csv", path: "legacy.csv" }])],
    ["easybatch.otherSetting", JSON.stringify({ enabled: true })],
  ]);
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
  };
  globalThis.cep_node = { require: createRequire(import.meta.url) };
  assert.deepEqual(LocalSettings.LoadRecentSources(), [{ type: "csv", path: "legacy.csv" }]);
  for (let i = 0; i < 12; i++) {
    LocalSettings.RememberRecentSource({ type: i % 2 ? "csv" : "excel", path: `file${i}` });
  }
  assert.equal(LocalSettings.LoadRecentSources().length, 10);
  const list = LocalSettings.RememberRecentSource({ type: "excel", path: "file2" });
  assert.equal(list.length, 10);
  assert.deepEqual(list[0], { type: "excel", path: "file2" });
  assert.equal(list.filter((item) => item.path === "file2").length, 1);
  assert.deepEqual(JSON.parse(store.get("easybatch.recentSources")), list);
  assert.equal(store.get("easybatch.otherSetting"), JSON.stringify({ enabled: true }));
  const sheet = { type: "google", path: "https://docs.google.com/spreadsheets/d/AbC_123/edit", name: "Team Sheet" };
  LocalSettings.RememberRecentSource(sheet);
  assert.deepEqual(LocalSettings.LoadRecentSources()[0], sheet);
  LocalSettings.RememberRecentSource({ ...sheet, name: "Renamed" });
  assert.equal(LocalSettings.LoadRecentSources().filter((item) => item.path === sheet.path).length, 1);
  assert.equal(LocalSettings.LoadRecentSources()[0].name, "Renamed");
});

test("local recent sources retain validation, platform deduplication and storage errors", () => {
  const store = new Map();
  const require = createRequire(import.meta.url);
  const path = require("node:path");
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
  };
  globalThis.cep_node = {
    require: (name) => name === "os" ? { platform: () => "win32" } : path.win32,
  };
  assert.deepEqual(LocalSettings.LoadRecentSources(), []);
  store.set("easybatch.recentSources", JSON.stringify([
    { type: "csv", path: "C:\\Folder\\File.csv" },
    { type: "excel", path: "C:\\Folder\\File.csv" },
    null, { type: "csv", path: "" }, { type: "unknown", path: "invalid" },
  ]));
  assert.deepEqual(LocalSettings.RememberRecentSource({ type: "csv", path: "c:\\folder\\file.csv" }), [
    { type: "csv", path: "c:\\folder\\file.csv" },
    { type: "excel", path: "C:\\Folder\\File.csv" },
  ]);
  store.set("easybatch.recentSources", "{}");
  assert.throws(() => LocalSettings.LoadRecentSources(), /recent sources list is invalid/);
  assert.throws(() => LocalSettings.RememberRecentSource({ type: "csv", path: "test.csv" }), /recent sources list is invalid/);
  store.set("easybatch.recentSources", "not json");
  assert.throws(() => LocalSettings.LoadRecentSources(), SyntaxError);
  store.delete("easybatch.recentSources");
  globalThis.localStorage.setItem = () => { throw new Error("storage unavailable"); };
  assert.throws(() => LocalSettings.RememberRecentSource({ type: "csv", path: "test.csv" }), /storage unavailable/);
});
