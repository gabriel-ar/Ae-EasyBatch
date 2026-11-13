import { mount } from "svelte";
import * as XLSX from "xlsx";

const files = { "/project/input.csv": "Name,Other\r\nOld,keep\r\n" };
const saveDialog = { path: null, calls: [], writeError: null, writes: [] };
const workbook = XLSX.utils.book_new();
const sheet = XLSX.utils.aoa_to_sheet([["Name", "Other"], ["Excel", "keep"]]);
sheet.A2 = { t: "s", v: "Excel", f: '"Excel"' };
XLSX.utils.book_append_sheet(workbook, sheet, "Data");
files["/project/input.xlsx"] = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
const path = {
  basename: (value) => value.split("/").pop(),
  dirname: (value) => value.substring(0, value.lastIndexOf("/")) || "/",
  extname: (value) => {
    const name = value.split("/").pop();
    const dot = name.lastIndexOf(".");
    return dot < 0 ? "" : name.substring(dot);
  },
  join: (...parts) => parts.join("/").replace(/\/+/g, "/"),
  normalize: (value) => value,
  isAbsolute: (value) => value.startsWith("/"),
};
const fs = {
  existsSync: (name) => Object.hasOwn(files, name),
  readFileSync: (name) => {
    if (!Object.hasOwn(files, name)) throw new Error(`Missing file: ${name}`);
    return files[name];
  },
  writeFileSync: (name, value, encoding) => {
    if (saveDialog.writeError) throw new Error(saveDialog.writeError);
    saveDialog.writes.push({ name, encoding });
    files[name] = value;
  },
  renameSync: (from, to) => { files[to] = files[from]; delete files[from]; },
  unlinkSync: (name) => { delete files[name]; },
  readdir: (_name, callback) => callback(null, []),
};
window.cep_node = {
  require: (name) => {
    if (name === "fs") return fs;
    if (name === "path") return path;
    if (name === "os") return { platform: () => "win32" };
    throw new Error(`Unexpected module: ${name}`);
  },
};
window.__adobe_cep__ = {
  getSystemPath: () => "/user",
  evalScript: (script, callback) => {
    if (script.startsWith("OpenFileDialog(")) return callback("/project/input.csv");
    if (script.startsWith("SaveFileDialog(")) {
      saveDialog.calls.push(script);
      return callback(saveDialog.path ?? "null");
    }
    if (script.startsWith("GetRelativeFilePath(")) {
      const encoded = script.match(/GetRelativeFilePath\("([^"]*)"/)[1];
      return callback(path.basename(decodeURIComponent(encoded)));
    }
    if (script.includes("app.project.file")) return callback("/project");
    throw new Error(`Unexpected host call: ${script}`);
  },
};

const { default: Importer } = await import("../../src/ui/DataImport.svelte");
const { default: Menu } = await import("../../src/ui/MenuCtx.svelte");
const { default: Exporter } = await import("../../src/ui/DataExport.svelte");
const { default: ActionCoordinator } = await import("../../src/lib/ActionCoordinator.ts");
const { template, menuProps } = await import("./import-harness.svelte.ts");
const { SettingsHelper, TemplateHelper } = await import("../../src/lib/Settings.svelte.ts");
const { l } = await import("../../src/lib/States.svelte.ts");
const { google_sheets, GoogleSheetsClient, ReadSheet, PrepareSheetUpdates, SpreadsheetUrl, SpreadsheetId } = await import("../../src/lib/GoogleSheets.ts");
const importer = mount(Importer, { target: document.getElementById("app") });
const menu = mount(Menu, { target: document.getElementById("menu"), props: menuProps });
const exporter = mount(Exporter, { target: document.getElementById("export") });
window.harness = { files, saveDialog, importer, template, menu, menuProps, exporter, ActionCoordinator, exportResult: null, result: null, action: null, XLSX, SettingsHelper, TemplateHelper, l, google_sheets, GoogleSheetsClient, ReadSheet, PrepareSheetUpdates, SpreadsheetUrl, SpreadsheetId };
