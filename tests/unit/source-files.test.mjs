import { after, test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as XLSX from "xlsx";
import { createServer } from "vite";

const server = await createServer({
  configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, logLevel: "error",
  optimizeDeps: { noDiscovery: true, include: [] },
});
after(() => server.close());
const { ParseCSVSource, SaveMappedCSVValues } = await server.ssrLoadModule("/src/lib/CSVSource.ts");
const { CreateTemplateWorkbook, SaveMappedTemplateValuesToSheet, ValidateSheetName } = await server.ssrLoadModule("/src/lib/ExcelWorkbookWriter.ts");
const { LocalSettings } = await server.ssrLoadModule("/src/lib/LocalSettings.ts");

test("render progress persists row position, selection and results without changing other settings", () => {
  const store = new Map([["other", "keep"]]);
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key),
  };
  assert.equal(LocalSettings.LoadRenderProgress(), null);
  const progress = {
    project_path: "/project.aep", comp_id: 2, row_count: 7, rows: [1, 4], current: 1,
    state: "stopped", results: [{ row: 1, comp_id: 3, status: "rendered" }],
  };
  LocalSettings.SaveRenderProgress(progress);
  assert.deepEqual(LocalSettings.LoadRenderProgress(), progress);
  assert.equal(store.get("other"), "keep");
  store.set("easybatch.renderProgress", JSON.stringify({ ...progress, current: 3 }));
  assert.throws(() => LocalSettings.LoadRenderProgress(), /invalid/);
  store.set("easybatch.renderProgress", JSON.stringify({ ...progress, rows: [1, 7] }));
  assert.throws(() => LocalSettings.LoadRenderProgress(), /invalid/);
  store.set("easybatch.renderProgress", JSON.stringify({ ...progress, results: [null] }));
  assert.throws(() => LocalSettings.LoadRenderProgress(), /invalid/);
  globalThis.localStorage.setItem = () => { throw new Error("storage unavailable"); };
  assert.throws(() => LocalSettings.SaveRenderProgress(progress), /storage unavailable/);
  LocalSettings.ClearRenderProgress();
  assert.equal(LocalSettings.LoadRenderProgress(), null);
  assert.equal(store.get("other"), "keep");
});

function RenderHarness({ png = false, property_error = false, output_error = false, paused_stop_bug = false } = {}) {
  const queue = [];
  const applied = [];
  const saved = [];
  const controls = [];
  let paused = false;
  const status = { QUEUED: 1, RENDERING: 2, WILL_CONTINUE: 3, DONE: 4, ERR_STOPPED: 5, USER_STOPPED: 6, NEEDS_OUTPUT: 7 };
  const project = {
    file: null,
    itemByID: (id) => ({ id, saveFrameToPng: (_, file) => saved.push(file.fsName) }),
    renderQueue: {
      rendering: false,
      get numItems() { return queue.length; },
      item: (i) => queue[i - 1],
      renderAsync() {
        if (paused_stop_bug && paused) throw new Error("render() may not be called while rendering is paused.");
        controls.push("start");
      },
      pauseRendering(pause) {
        paused = pause;
        controls.push(pause ? "pause" : "continue");
      },
      stopRendering() {
        this.rendering = false;
        controls.push("stop");
      },
    },
  };
  const context = vm.createContext({
    app: { project }, RQItemStatus: status,
    File: function (path) { this.fsName = path; this.exists = false; },
  });
  vm.runInContext(readFileSync(new URL("../../src/host/host.jsx", import.meta.url), "utf8"), context);
  context._EscapeArgs = () => {};
  context._SetupTemplatePreviewComp = () => ({ layers: { add: () => ({}) } });
  context._ApplyTemplProps = (_, tmpl, row, originals) => {
    applied.push([tmpl.columns[0].values[row], originals]);
    return property_error ? [{ message: "Invalid property" }] : [];
  };
  context._CreateSubfolders = () => {};
  context._QueueComp = (comp, path) => {
    const item = {
      comp, status: status.QUEUED,
      outputModule: () => ({ file: { fsName: path + ".mov", exists: false } }),
      remove() { queue.splice(queue.indexOf(item), 1); },
    };
    queue.push(item);
    if (output_error) throw new Error("Invalid output preset");
    return item;
  };
  const tmpl = {
    comp_id: 1, columns: [{ values: ["first", "second"] }],
    dep_comps: [{ id: 2, name: "Wide" }, { id: 3, name: "Tall" }],
    dep_config: [2, 3].map((id) => ({
      enabled: true, save_paths: [`/out/${id}-first`, `/out/${id}-second`],
      render_setts_templ: "Best Settings",
      render_out_module_templ: png ? "EB_Single_Frame_PNG" : "Video",
    })),
  };
  return {
    context, queue, applied, saved, controls, status, project,
    render: (row) => JSON.parse(context.BatchRenderDepComps(JSON.stringify({
      ...tmpl,
      columns: tmpl.columns.map((col) => ({ ...col, values: [col.values[row]] })),
      dep_config: tmpl.dep_config.map((config) => ({ ...config, save_paths: [config.save_paths[row]] })),
    }), false)),
    inspect: () => JSON.parse(context.GetRenderQueueStatus()),
  };
}

test("host renders only the requested row and queue inspection never advances it", () => {
  const h = RenderHarness();
  const result = h.render(1);
  assert.equal(result.success, true);
  assert.deepEqual(h.applied, [["second", true]]);
  assert.deepEqual(h.controls, ["start"]);
  assert.deepEqual(result.row_results.map((item) => [item.row, item.queue_index, item.status]), [
    [0, 1, "queued"], [0, 2, "queued"],
  ]);
  assert.equal(result.row_results[0].rendered_path, "/out/2-second.mov");
  h.queue[0].status = h.status.DONE;
  h.queue[1].status = h.status.USER_STOPPED;
  assert.deepEqual(h.inspect().items.map((item) => item.status), ["rendered", "stopped"]);
  assert.deepEqual(h.controls, ["start"]);
  h.project.renderQueue.rendering = true;
  assert.equal(h.render(0).success, false);
  assert.equal(h.applied.length, 1);
});

test("PNG outputs finish synchronously without queue items; property/output failures remain explicit", () => {
  const png = RenderHarness({ png: true });
  assert.deepEqual(png.render(1).row_results.map((item) => item.status), ["rendered", "rendered"]);
  assert.deepEqual(png.saved, ["/out/2-second.png", "/out/3-second.png"]);
  assert.deepEqual(png.controls, []);
  const properties = RenderHarness({ property_error: true });
  assert.match(properties.render(0).error_obj.message, /Invalid property/);
  assert.equal(properties.queue.length, 0);
  const output = RenderHarness({ output_error: true });
  assert.deepEqual(output.render(0).row_results.map((item) => item.status), ["error", "error"]);
  assert.equal(output.queue.length, 0, "partially configured queue items are removed");
});

test("queue controls directly pause, resume and stop AE without owning batch state", () => {
  const h = RenderHarness();
  for (const action of ["pause", "continue", "stop"]) {
    assert.equal(JSON.parse(h.context.ControlRenderQueue(action)).success, true);
  }
  assert.deepEqual(h.controls, ["pause", "continue", "stop"]);
  assert.equal(JSON.parse(h.context.ControlRenderQueue("invalid")).success, false);
});

test("stop reset only clears an idle queue and releases a hidden pause so the next batch can start", () => {
  const h = RenderHarness({ paused_stop_bug: true });
  assert.equal(h.render(1).success, true);
  h.project.renderQueue.rendering = true;
  assert.equal(JSON.parse(h.context.ControlRenderQueue("pause")).success, true);
  h.queue[0].status = h.status.DONE;
  assert.equal(JSON.parse(h.context.ControlRenderQueue("reset_after_stop")).success, false);
  assert.equal(h.inspect().items.length, 2);
  assert.equal(JSON.parse(h.context.ControlRenderQueue("stop")).success, true);
  assert.equal(JSON.parse(h.context.ControlRenderQueue("reset_after_stop")).success, true);
  assert.equal(h.inspect().items.length, 0);
  assert.equal(h.render(0).success, true);
  assert.deepEqual(h.controls, ["start", "pause", "stop", "continue", "start"]);
});

test("starting a row on an idle but paused renderer retries without preparing the row twice", () => {
  const h = RenderHarness({ paused_stop_bug: true });
  assert.equal(JSON.parse(h.context.ControlRenderQueue("pause")).success, true);
  assert.equal(h.render(0).success, true);
  assert.deepEqual(h.controls, ["pause", "continue", "start"]);
  assert.deepEqual(h.applied, [["first", true]]);
});

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
