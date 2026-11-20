import { after, test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as XLSX from "xlsx";
import { createServer } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

const server = await createServer({
  configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, logLevel: "error",
  cacheDir: "node_modules/.vite-source-files-test",
  plugins: [svelte()], define: { _VERSION_: JSON.stringify("test") },
  optimizeDeps: { noDiscovery: true, include: [] },
});
after(() => server.close());
const { ParseCSVSource, SaveMappedCSVValues } = await server.ssrLoadModule("/src/lib/CSVSource.ts");
const { CreateTemplateWorkbook, SaveMappedTemplateValuesToSheet, ValidateSheetName } = await server.ssrLoadModule("/src/lib/ExcelWorkbookWriter.ts");
const { LocalSettings } = await server.ssrLoadModule("/src/lib/LocalSettings.ts");
globalThis.cep_node = { require: createRequire(import.meta.url) };
const { RunBatchPreflight } = await server.ssrLoadModule("/src/lib/BatchPreflight.ts");
const { FormatBatchPreflightMessage } = await server.ssrLoadModule("/src/ui/BatchPreflightMessage.ts");
const { ColumnHelper, TemplateHelper } = await server.ssrLoadModule("/src/lib/Settings.svelte.ts");

const presets = { success: true, render_templs: ["Best"], output_modules_templs: ["Video"] };
const render_settings = { render_setts_templ: "Best", render_out_module_templ: "Video" };

test("duplicate path messages show one line per composition and keep gaps between checked rows", () => {
  const html = FormatBatchPreflightMessage([{
    code: "duplicate_output",
    path: "Render/A&B",
    outputs: [
      ...[8, 0, 1, 5, 6, 7, 2].map((row) => ({ row, comp_id: 1, comp_name: "GoalTakeover_16:9" })),
      { row: 0, comp_id: 2, comp_name: "Tall <Draft>" },
    ],
  }], [0, 1, 2, 5, 6, 7, 8]);
  assert.match(html, /<strong>Multiple outputs use the same path<\/strong><br><code>Render\/A&amp;B<\/code>/);
  assert.match(html, /<li>Rows 1&ndash;3, 6&ndash;9 &middot; GoalTakeover_16:9<\/li>/);
  assert.match(html, /<li>Row 1 &middot; Tall &lt;Draft&gt;<\/li>/);
  assert.equal(html.split("GoalTakeover_16:9").length - 1, 1);
});

test("preflight summarizes only replaceable columns missing files in every checked row", () => {
  const missing = (row, column_index, path) => ({
    code: "missing_media", media: { row, column_index, column: "Photo <Draft>" }, path,
  });
  const full_column = [missing(3, 0), missing(0, 0, "media/A&B.jpg")];
  const html = FormatBatchPreflightMessage([...full_column, missing(0, 1, "manual.jpg")], [0, 3]);
  assert.equal(html.split("Missing files in all 2 checked rows").length - 1, 1);
  assert.match(html, /Photo &lt;Draft&gt;: Missing files in all 2 checked rows/);
  assert.match(html, /File Path Pattern and Base Folder/);
  assert.match(html, /<details><summary>Show Paths by Row<\/summary><ul><li>Row 1 &middot; <code>media\/A&amp;B\.jpg<\/code><\/li><li>Row 4 &middot; No file path was set\./);
  assert.match(html, /<strong>Missing replacement file<\/strong><br>Row 1 .*<code>manual\.jpg<\/code>/);
  assert.match(FormatBatchPreflightMessage(full_column, [0, 3]), /Fix the issue below/);
  assert.doesNotMatch(FormatBatchPreflightMessage([full_column[0]], [3]), /Missing files in all/);
});

test("One Per Row preflight checks only checked rows, preserving original indices and replacement overrides", async () => {
  const tmpl = TemplateHelper.DefaultTemplate("Campaign", "Master", [
    ColumnHelper.DefaultColumn("Title", [" same ", "same", "other", "same"]),
    { ...ColumnHelper.DefaultColumn("Photo", ["", "<b>ignored.jpg</b>", "<b>manual.jpg</b>", "<b>manual.jpg</b>"]),
      type: ColumnHelper.PropertyValueType.SRC_ALTERNATE, alt_src_pattern: "{base_folder}/{increment:0012}.jpg", alt_src_base: "media" },
    { ...ColumnHelper.DefaultColumn("Unconfigured", ["", "", "", ""]),
      type: ColumnHelper.PropertyValueType.SRC_ALTERNATE },
  ]);
  Object.assign(tmpl, render_settings, {
    comp_id: 1, row_enabled: [true, false, true, true], save_pattern: "out/{Title}", save_paths: ["stale"],
  });
  const original = structuredClone(tmpl);
  const { template: render_template, ...result } = await RunBatchPreflight(tmpl, presets, async (paths) => {
    assert.deepEqual(paths, ["media/0012.jpg", "<b>manual.jpg</b>"]);
    return { success: true, missing: [{ index: 1, path: "manual.jpg" }] };
  });
  assert.deepEqual(render_template.save_paths, ["out/same", "out/other", "out/same"]);
  assert.deepEqual(result, {
    rows: [0, 2, 3],
    findings: [
      { code: "duplicate_output", path: "out/same", outputs: [
        { row: 0, comp_id: 1, comp_name: "Master" }, { row: 3, comp_id: 1, comp_name: "Master" },
      ] },
      { code: "missing_media", path: "manual.jpg", media: { row: 2, column: "Photo", column_index: 1 } },
      { code: "missing_media", path: "manual.jpg", media: { row: 3, column: "Photo", column_index: 1 } },
    ],
  });
  assert.deepEqual(tmpl, original);
});

test("Multi-Output preflight resolves media before output patterns and ignores disabled outputs", async () => {
  const tmpl = TemplateHelper.DefaultTemplate("Campaign", "Master", [
    { ...ColumnHelper.DefaultColumn("Photo", ["stale", "stale"]),
      type: ColumnHelper.PropertyValueType.SRC_ALTERNATE, alt_src_pattern: "{row_number}" },
  ]);
  tmpl.out_mode = "dependant";
  tmpl.row_enabled = [false, true];
  const configs = [{ id: 2, name: "Wide" }, { id: 3, name: "Tall" }, { id: 4, name: "Disabled" }];
  tmpl.dep_comps = configs;
  tmpl.dep_config = configs.map((comp) => ({
    ...comp, ...render_settings, enabled: comp.id !== 4, save_pattern: "out/{Photo}", save_paths: [],
    render_out_module_templ: comp.id === 4 ? "" : "Video",
  }));
  const original = structuredClone(tmpl);
  const { template: render_template, ...result } = await RunBatchPreflight(tmpl, presets, async (paths) => {
    assert.deepEqual(paths, ["1"]);
    return { success: true, missing: [] };
  });
  assert.deepEqual(render_template.dep_config[0].save_paths, ["out/0", "out/1"]);
  assert.deepEqual(result, {
    rows: [1], findings: [{ code: "duplicate_output", path: "out/1", outputs: [
      { row: 1, comp_id: 2, comp_name: "Wide" }, { row: 1, comp_id: 3, comp_name: "Tall" },
    ] }],
  });
  assert.deepEqual(tmpl, original);
});

test("preflight gives explicit feedback when no rows or outputs can be checked or media inspection fails", async () => {
  const tmpl = TemplateHelper.DefaultTemplate("Campaign", "Master", [
    { ...ColumnHelper.DefaultColumn("Photo", ["<b>photo.jpg</b>"]),
      type: ColumnHelper.PropertyValueType.SRC_ALTERNATE },
  ]);
  let probes = 0;
  const failed_probe = async () => {
    probes++;
    return { success: false, error_obj: { message: "Media check unavailable" } };
  };
  tmpl.row_enabled = [false];
  const no_rows = await RunBatchPreflight(tmpl, presets, failed_probe);
  assert.deepEqual(no_rows.rows, []);
  assert.ok(no_rows.findings.some(({ code }) => code === "no_rows"));
  tmpl.row_enabled = [true];
  tmpl.out_mode = "dependant";
  const no_outputs = await RunBatchPreflight(tmpl, presets, failed_probe);
  assert.deepEqual(no_outputs.rows, [0]);
  assert.deepEqual(no_outputs.findings, [{ code: "no_outputs" }]);
  assert.equal(probes, 0);
  tmpl.out_mode = "render";
  const result = await RunBatchPreflight(tmpl, presets, failed_probe);
  assert.deepEqual(result.findings, [
    { code: "invalid_presets", comp_name: "Master" },
    { code: "media_check_failed", message: "Error: Media check unavailable" },
  ]);
  assert.equal(probes, 1);
});

test("the render shortcut checks the explicit row while keeping each mode's existing row token semantics", async () => {
  const tmpl = TemplateHelper.DefaultTemplate("Campaign", "Master", [
    { ...ColumnHelper.DefaultColumn("Photo", ["", ""]), type: ColumnHelper.PropertyValueType.SRC_ALTERNATE,
      alt_src_pattern: "{row_number}.jpg" },
  ]);
  tmpl.row_enabled = [true, false];
  Object.assign(tmpl, render_settings, { save_pattern: "out/{row_number}" });
  const result = await RunBatchPreflight(tmpl, presets, async (paths) => {
    assert.deepEqual(paths, ["0.jpg"]);
    return { success: true, missing: [{ index: 0, path: "0.jpg" }] };
  }, 1);
  assert.deepEqual(result.rows, [1]);
  assert.deepEqual(result.template.save_paths, ["out/0"]);
  assert.equal(result.findings[0].media.row, 1);
  tmpl.out_mode = "dependant";
  tmpl.dep_config = [{ id: 2, name: "Wide", enabled: true, ...render_settings, save_pattern: "out/{row_number}" }];
  const multi = await RunBatchPreflight(tmpl, presets, async (paths) => {
    assert.deepEqual(paths, ["1.jpg"]);
    return { success: true, missing: [] };
  }, 1);
  assert.deepEqual(multi.rows, [1]);
  assert.deepEqual(multi.template.dep_config[0].save_paths, ["out/0", "out/1"]);
  assert.deepEqual(multi.findings, []);
});

test("render actions report all blocking issues together and only submit a batch if preflight passes", async () => {
  const { default: Logger } = await server.ssrLoadModule("/src/lib/Logger.ts");
  Logger.cleanup_scheduled = true;
  const previous_window = globalThis.window;
  globalThis.window = { __adobe_cep__: { getSystemPath: () => "/test" } };
  try {
    const { csa, s } = await server.ssrLoadModule("/src/lib/States.svelte.ts");
    const { BatchRender, BatchOneToMany, output_hooks, out } = await server.ssrLoadModule("/src/lib/Output.svelte.ts");
    const tmpl = TemplateHelper.DefaultTemplate("Campaign", "Master", [
      { ...ColumnHelper.DefaultColumn("Photo", ["", "", ""]), type: ColumnHelper.PropertyValueType.SRC_ALTERNATE,
        alt_src_pattern: "{row_number}.jpg" },
    ]);
    tmpl.row_enabled = [true, false, true];
    tmpl.save_pattern = "out/shared";
    s.proj.tmpls = [tmpl];
    s.proj.sel_tmpl = 0;
    s.render_setts_templs = presets;
    const calls = [];
    const reports = [];
    let missing = [{ index: 1, path: "2.jpg" }];
    csa.Exec = async (method, ...args) => {
      calls.push([method, ...args]);
      switch (method) {
        case "CheckReplacementFiles": return { success: true, missing };
        case "GetRenderQueueStatus": return { success: true, rendering: true, items: [] };
        case "BatchRender": return { success: true, row_results: [{ row: 1, status: "success" }] };
        default: assert.fail(`Unexpected host call: ${method}`);
      }
    };
    output_hooks.PreflightIssues = (findings) => reports.push(findings.map(({ code }) => code));

    await BatchRender();
    assert.deepEqual(reports, [["invalid_presets", "duplicate_output", "missing_media"]]);
    assert.deepEqual(calls.splice(0), [["CheckReplacementFiles", '["0.jpg","2.jpg"]']]);

    Object.assign(s.tmpl, render_settings, { save_pattern: "out/{row_number}" });
    missing = [];
    await BatchRender();
    assert.equal(reports.length, 1, "no modal on success");
    assert.deepEqual(calls.map(([method]) => method), ["CheckReplacementFiles", "BatchRender"]);
    assert.deepEqual(JSON.parse(calls[1][1]).save_paths, ["out/0", "out/2"]);
    assert.equal(calls[1][3], true, "starts the queue");
    assert.equal(out.render_results[0].row, 2);

    calls.length = 0;
    s.tmpl.out_mode = "dependant";
    s.tmpl.dep_config = [{ id: 2, name: "Wide", enabled: true, ...render_settings, save_pattern: "out/{row_number}" }];
    missing = [{ index: 1, path: "2.jpg" }];
    await BatchOneToMany();
    assert.deepEqual(reports.at(-1), ["missing_media", "queue_active"]);
    assert.deepEqual(calls.map(([method]) => method), ["CheckReplacementFiles", "GetRenderQueueStatus"]);
    assert.equal(out.dep_progress, null);
  } finally {
    if (previous_window === undefined) delete globalThis.window;
    else globalThis.window = previous_window;
  }
});

test("host media inspection checks disk and reusable footage without changing the project or queue", () => {
  const checked = [];
  function Folder(path) { this.path = path; }
  function FootageItem(path, missing) {
    this.file = { fullName: path };
    this.footageMissing = missing;
  }
  const footage = [new FootageItem("media/linked.jpg", false), new FootageItem("media/missing %.jpg", true)];
  const project = {
    file: { path: "project" },
    numItems: footage.length,
    item: (i) => footage[i - 1],
    get renderQueue() { assert.fail("must not access the render queue"); },
    get items() { assert.fail("must not access project items"); },
    importFile() { assert.fail("must not import footage"); },
  };
  const context = vm.createContext({
    app: { project }, Folder, FootageItem,
    File: function (path) {
      checked.push([Folder.current.path, path]);
      if (path === "unreadable") throw new Error("Cannot inspect path");
      this.exists = path === "media/found.jpg";
      this.fullName = path;
    },
  });
  vm.runInContext(readFileSync(new URL("../../src/host/host.jsx", import.meta.url), "utf8"), context);
  const previous = Folder.current = new Folder("previous");
  const inspect = (paths) => JSON.parse(context.CheckReplacementFiles(encodeURIComponent(JSON.stringify(paths))));
  assert.deepEqual(inspect(["<b>media\\\\found.jpg</b>", "media/missing %.jpg", "<b></b>", "media/linked.jpg"]), {
    success: true, missing: [{ index: 1, path: "media/missing %.jpg" }, { index: 2, path: "" }],
  });
  assert.deepEqual(checked, [["project", "media/found.jpg"], ["project", "media/missing %.jpg"], ["project", "media/linked.jpg"]]);
  assert.equal(Folder.current, previous);
  assert.equal(inspect(["unreadable"]).success, false);
  assert.equal(Folder.current, previous);
});

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
