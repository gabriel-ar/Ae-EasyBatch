<script module lang="ts">
  type ImportStats = {
    rows: number;
    mapped: number;
    total: number;
    sheet: string;
  };

  type ImportSuccessResult = {
    success: true;
    title: string;
    stats: ImportStats;
    warnings: string[];
    source: { type: "csv" | "excel" | "google"; path: string; name?: string };
  };

  type ImportFailureResult = {
    success: false;
    error: string;
  };

  export type ImportResult = ImportSuccessResult | ImportFailureResult;

  type ImportSaveStats = {
    written_cells: number;
    formula_cells_skipped: number;
    missing_columns: string[];
  };

  type ImportSaveSuccessResult = {
    success: true;
    title: string;
    stats: ImportSaveStats;
  };

  type ImportSaveFailureResult = {
    success: false;
    error: string;
  };

  export type ImportSaveResult = ImportSaveSuccessResult | ImportSaveFailureResult;
</script>

<script lang="ts">
  import * as XLSX from "xlsx";
  import { l, csa } from "../lib/States.svelte.ts";
  import { TemplateHelper, type TemplateData, type ImportSource } from "../lib/Settings.svelte.ts";
  import { SaveMappedTemplateValuesToSheet } from "../lib/ExcelWorkbookWriter.ts";
  import { ParseCSVSource, SaveMappedCSVValues } from "../lib/CSVSource.ts";
  import { google_sheets, SpreadsheetId, SpreadsheetUrl, ReadSheet, PrepareSheetUpdates } from "../lib/GoogleSheets.ts";
  import Dropdown from "./Dropdown.svelte";

  type MatchState = "auto" | "manual" | "unmapped";

  type MappingRow = {
    template_prop: string;
    mapped_col: string;
    auto_col: string;
    state: MatchState;
  };

  let show = $state(false);

  //Which Google step is waiting for the user's browser or for Google, if any
  let google_wait = $state<"import" | "prepare-save" | "save" | null>(null);
  let loading_sheet = $state(false);

  //Counters that let async work detect it was superseded or cancelled, and drop its result
  let sheet_request = 0;
  let operation = 0;

  let workbook = $state<XLSX.WorkBook | undefined>(undefined);
  let selected_sheet = $state("");
  let excel_name = $state("");
  let excel_relative_path = $state("");
  let source_path = $state("");
  let source_type = $state<"csv" | "excel" | "google">("excel");

  let current_tmpl = $state<TemplateData | undefined>(undefined);
  let sheet_options = $state<string[]>([]);
  let sheet_headers = $state<string[]>([]);
  let sheet_rows = $state<any[][]>([]);
  let rows = $state<MappingRow[]>([]);

  let mapping_options = $state<string[]>([]);
  let mapping_labels = $state<string[]>([]);

  let on_result = $state<((result: ImportResult) => void) | undefined>(undefined);

  let saved_import = $state<ImportSource | undefined>(undefined);
  let is_reimport = $state(false);

  /**Lowercases and strips punctuation so "First_Name" and "first name" compare equal.*/
  function Normalize(value: string): string {
    return (value ?? "")
      .toLowerCase()
      .trim()
      .replace(/[_\-\.]/g, " ")
      .replace(/\s+/g, " ")
      .replace(/[^a-z0-9 ]/g, "");
  }

  /**Finds the source column for a template property: exact name first, then ignoring case, then ignoring punctuation.*/
  function AutoMatchHeader(template_prop: string, headers: string[]): string {
    if (headers.includes(template_prop)) return template_prop;

    const template_lower = template_prop.toLowerCase();
    const case_insensitive = headers.find((h) => h.toLowerCase() === template_lower);
    if (case_insensitive !== undefined) return case_insensitive;

    const normalized_target = Normalize(template_prop);
    const normalized = headers.find((h) => Normalize(h) === normalized_target);
    return normalized ?? "";
  }

  /**Creates one mapping row per template property, prefilled from the saved import when there is one.*/
  function BuildRows(tmpl: TemplateData, headers: string[], sheet_name: string) {
    mapping_options = ["", ...headers];
    mapping_labels = ["Do not import", ...headers];

    rows = tmpl.columns.map((col) => {
      const auto = AutoMatchHeader(col.cont_name, headers);
      let mapped = auto;

      //Prefill from the last import: columns found by name, and explicit "do not import" on the same sheet.
      if (saved_import) {
        const saved_col = saved_import.mapping?.[col.cont_name];
        if (saved_col && headers.includes(saved_col)) {
          mapped = saved_col;
        } else if (saved_col === null && (sheet_name === saved_import.sheet || (source_type === "csv" && saved_import.sheet === null))) {
          mapped = "";
        }
      }

      return {
        template_prop: col.cont_name,
        mapped_col: mapped,
        auto_col: auto,
        state: mapped === "" ? "unmapped" : mapped === auto ? "auto" : "manual",
      };
    });
  }

  function GetProjectFolder(): Promise<string | null> {
    return csa.EvalDirectAsync("app.project.file !== null ? app.project.file.parent.fsName : null") as Promise<string | null>;
  }

  /**Returns the path as saved in the project: relative to the project folder, or absolute if the project is not saved yet.*/
  async function ResolveRelativePath(absolute_path: string): Promise<string> {
    const project_folder = await GetProjectFolder();
    if (!project_folder || project_folder === "null" || project_folder === "undefined") {
      return absolute_path;
    }
    const rel_path = await csa.Eval("GetRelativeFilePath", absolute_path);
    if (!rel_path || rel_path === "null") {
      throw new Error("Could not resolve a path for the selected file.");
    }

    return decodeURIComponent(rel_path);
  }

  async function ResolveAbsolutePath(relative_path: string): Promise<string> {
    const path_util = cep_node.require("path");
    if (path_util.isAbsolute(relative_path)) return relative_path;
    const project_folder = await GetProjectFolder();
    if (!project_folder || project_folder === "null" || project_folder === "undefined") {
      throw new Error("Save the project before reopening a project-relative source.");
    }

    return path_util.join(project_folder, relative_path);
  }

  function LoadWorkbookFromPath(path: string): XLSX.WorkBook {
    const fs = cep_node.require("fs");
    if (!fs.existsSync(path)) {
      throw new Error(`The Excel file could not be found: ${path}`);
    }

    const file_buffer = fs.readFileSync(path);
    const bytes = new Uint8Array(file_buffer);
    return XLSX.read(bytes, { type: "array", bookVBA: true });
  }

  function ExcelBookType(path: string): XLSX.BookType {
    const extension = cep_node.require("path").extname(path).toLowerCase();

    if (extension === ".xls" || extension === ".xlsm") return extension.slice(1) as XLSX.BookType;
    return "xlsx";
  }

  /**Writes through a temporary file, so a failure never leaves the user's file half written.*/
  function WriteFileToPath(output: unknown, path: string) {
    const fs = cep_node.require("fs");
    const path_util = cep_node.require("path");
    const temporary_path = path_util.join(
      path_util.dirname(path),
      `.${path_util.basename(path)}.easybatch-${Date.now()}.tmp`,
    );

    try {
      fs.writeFileSync(temporary_path, output);
      fs.renameSync(temporary_path, path);
    } finally {
      if (fs.existsSync(temporary_path)) fs.unlinkSync(temporary_path);
    }
  }

  /**Reads one Excel sheet: the first row becomes the headers and the remaining rows are the data.*/
  function BuildSheetData(sheet_name: string) {
    if (!workbook || !current_tmpl) return;

    const ws = workbook.Sheets[sheet_name];
    if (!ws) {
      sheet_headers = [];
      sheet_rows = [];
      rows = [];
      return;
    }

    const raw_rows = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      raw: true,
      defval: "",
      blankrows: false,
    }) as any[][];

    if (raw_rows.length === 0) {
      sheet_headers = [];
      sheet_rows = [];
      rows = [];
      return;
    }

    const headers = (raw_rows.shift() ?? []).map((h) => String(h ?? "").trim());
    sheet_headers = headers;
    sheet_rows = raw_rows;

    BuildRows(current_tmpl, sheet_headers, sheet_name);
  }

  function BuildCSVData(path: string) {
    const fs = cep_node.require("fs");
    const csv = ParseCSVSource(fs.readFileSync(path, "utf8"));
    sheet_headers = csv.rows[csv.header_index].map((header) => header.trim());
    sheet_rows = csv.data_indices.map((index) => csv.rows[index]);
    if (!current_tmpl) throw new Error("No template is selected.");
    BuildRows(current_tmpl, sheet_headers, "");
  }

  function MappedCount(): number {
    return rows.filter((r) => r.mapped_col !== "").length;
  }

  function UnmappedCount(): number {
    return rows.filter((r) => r.mapped_col === "").length;
  }

  function MappingObject(): Record<string, string | null> {
    const mapping: Record<string, string | null> = {};
    for (const row of rows) {
      mapping[row.template_prop] = row.mapped_col === "" ? null : row.mapped_col;
    }
    return mapping;
  }

  function OnMappingChange(row: MappingRow, selected: string) {
    row.mapped_col = selected;
    if (selected === "") {
      row.state = "unmapped";
    } else if (selected === row.auto_col) {
      row.state = "auto";
    } else {
      row.state = "manual";
    }
  }

  function ResetState() {
    //Invalidates any async work still running for the previous import
    operation++;
    sheet_request++;
    loading_sheet = false;
    google_wait = null;
    workbook = undefined;
    selected_sheet = "";
    excel_name = "";
    excel_relative_path = "";
    source_path = "";
    source_type = "excel";
    current_tmpl = undefined;
    sheet_options = [];
    sheet_headers = [];
    sheet_rows = [];
    rows = [];
    mapping_options = [];
    mapping_labels = [];
    on_result = undefined;
    saved_import = undefined;
    is_reimport = false;
  }

  function PickSourcePath(): Promise<string | null> {
    return csa.OpenFileDialog(
      false,
      "Select CSV or Excel file",
      "",
      ["csv", "xlsx", "xls", "xlsm"],
    );
  }

  /**Reports the result to the app and closes the dialog.*/
  function FinalizeImport(result: ImportResult) {
    on_result?.(result);
    Close();
  }

  export function Close() {
    show = false;
    google_sheets.CancelAuthorization();
    ResetState();
  }

  /**Opens the file dialog, then the mapping dialog for the chosen CSV or Excel file.*/
  export async function OpenFile(
    tmpl: TemplateData,
    imported_callback: ((result: ImportResult) => void) | undefined = undefined,
  ) {
    show = false;
    ResetState();

    current_tmpl = tmpl;
    on_result = imported_callback;
    try {
      const picked_path = await PickSourcePath();
      if (!picked_path) return;
      await LoadSource(picked_path);
    } catch (e) {
      l.error("[Import] Failed to load file", e);
      FinalizeImport({
        success: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  /**Lets the user pick a spreadsheet in their browser, then opens the mapping dialog for it.*/
  export async function OpenGoogleSheets(
    tmpl: TemplateData,
    imported_callback: ((result: ImportResult) => void) | undefined = undefined,
  ) {
    show = false;
    ResetState();

    current_tmpl = tmpl;
    on_result = imported_callback;
    const current_operation = operation;
    google_wait = "import";
    try {
      const id = await google_sheets.Pick();
      if (current_operation !== operation) return;
      await LoadGoogleSource(SpreadsheetUrl(id), undefined, current_operation);
    } catch (e) {
      if (current_operation !== operation) return;
      l.error("[Import] Failed to load Google sheet", e);
      FinalizeImport({
        success: false,
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      if (current_operation === operation) google_wait = null;
    }
  }

  /**Opens the mapping dialog for a known local file, such as a recent source.*/
  export async function OpenPath(
    tmpl: TemplateData,
    path: string,
    imported_callback: ((result: ImportResult) => void) | undefined = undefined,
  ) {
    show = false;
    ResetState();

    current_tmpl = tmpl;
    on_result = imported_callback;
    try {
      await LoadSource(path);
    } catch (e) {
      l.error("[Import] Failed to load recent source", e);
      FinalizeImport({ success: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  /**Opens the mapping dialog for a known spreadsheet, such as a recent source.*/
  export async function OpenGoogle(
    tmpl: TemplateData,
    path: string,
    imported_callback: ((result: ImportResult) => void) | undefined = undefined,
  ) {
    show = false;
    ResetState();

    current_tmpl = tmpl;
    on_result = imported_callback;
    const current_operation = operation;
    google_wait = "import";
    try {
      await LoadGoogleSource(path, undefined, current_operation);
    } catch (e) {
      if (current_operation !== operation) return;
      l.error("[Import] Failed to load Google sheet", e);
      FinalizeImport({ success: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      if (current_operation === operation) google_wait = null;
    }
  }

  /**Loads the rows of one Google sheet and builds the mapping rows. Ignored if a newer request started meanwhile.*/
  async function BuildGoogleSheet(sheet: string) {
    if (!current_tmpl) throw new Error("No template is selected.");

    const request = ++sheet_request;
    loading_sheet = true;

    let values: unknown[][];
    try {
      values = await google_sheets.Values(SpreadsheetId(source_path), sheet);
    } catch (error) {
      if (request !== sheet_request) return;
      throw error;
    }
    if (request !== sheet_request) return;

    const parsed = ReadSheet(values);
    sheet_headers = parsed.headers;
    sheet_rows = parsed.rows;

    BuildRows(current_tmpl, sheet_headers, sheet);
    loading_sheet = false;
  }

  async function LoadGoogleSource(path: string, saved?: ImportSource, current_operation = operation) {
    const id = SpreadsheetId(path);
    source_type = "google";
    source_path = path;
    excel_relative_path = path;

    //Reuse the saved mapping when this is the template's current spreadsheet
    const previous = current_tmpl?.import_file_lasts.active_source;
    saved_import = saved ?? (previous?.type === "google" && previous.path === path ? previous : undefined);

    const metadata = await google_sheets.Metadata(id);
    if (current_operation !== operation) return;

    excel_name = metadata.name;
    sheet_options = metadata.sheets;
    if (sheet_options.length === 0) throw new Error("The Google spreadsheet does not contain any sheets.");
    if (saved_import?.sheet && !sheet_options.includes(saved_import.sheet)) {
      throw new Error(`The previously selected Google sheet "${saved_import.sheet}" could not be found.`);
    }

    selected_sheet = saved_import?.sheet && sheet_options.includes(saved_import.sheet) ? saved_import.sheet : sheet_options[0];
    await BuildGoogleSheet(selected_sheet);
    if (current_operation !== operation) return;

    show = true;
  }

  async function LoadSource(path: string, saved?: ImportSource) {
    const path_util = cep_node.require("path");
    const extension = path_util.extname(path).toLowerCase();
    if (![".csv", ".xlsx", ".xls", ".xlsm"].includes(extension)) {
      throw new Error("Select a CSV, XLSX, XLS, or XLSM file.");
    }

    source_type = extension === ".csv" ? "csv" : "excel";
    source_path = path;
    excel_relative_path = await ResolveRelativePath(path);
    excel_name = path_util.basename(path);

    //Reuse the saved mapping when this is the template's current file
    const previous = current_tmpl?.import_file_lasts.active_source;
    if (!saved && previous && previous.type === source_type &&
        path_util.normalize(previous.path) === path_util.normalize(excel_relative_path)) {
      saved = previous;
    }
    saved_import = saved;

    if (source_type === "csv") {
      BuildCSVData(path);
    } else {
      workbook = LoadWorkbookFromPath(path);
      sheet_options = workbook.SheetNames ?? [];
      if (sheet_options.length === 0) throw new Error("The Excel file does not contain any sheets.");

      selected_sheet = saved?.sheet && sheet_options.includes(saved.sheet) ? saved.sheet : sheet_options[0];
      BuildSheetData(selected_sheet);
    }

    show = true;
  }

  /**Reopens the mapping dialog for the template's current source, with its saved mapping.*/
  export async function ReImportLast(
    tmpl: TemplateData,
    imported_callback: ((result: ImportResult) => void) | undefined = undefined,
  ) {
    show = false;
    ResetState();

    current_tmpl = tmpl;
    on_result = imported_callback;
    const current_operation = operation;

    try {
      const saved = tmpl.import_file_lasts?.active_source;
      if (!saved || !saved.path) {
        throw new Error("No source has been imported for this template yet.");
      }

      is_reimport = true;
      if (saved.type === "google") {
        google_wait = "import";
        await LoadGoogleSource(saved.path, saved, current_operation);
      } else {
        const absolute_path = await ResolveAbsolutePath(saved.path);
        await LoadSource(absolute_path, saved);
      }
    } catch (e) {
      if (current_operation !== operation) return;
      l.error("[Import] Re-import failed", e);
      FinalizeImport({
        success: false,
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      if (current_operation === operation) google_wait = null;
    }
  }

  /**Writes the template values back into the template's current source (CSV, Excel file or Google sheet).*/
  export async function SaveToOpenedFile(
    tmpl: TemplateData,
    saved_callback: ((result: ImportSaveResult) => void) | undefined = undefined,
  ) {
    const current_operation = operation;
    try {
      const saved = tmpl.import_file_lasts?.active_source;
      if (!saved || !saved.path) {
        throw new Error("No source has been imported for this template yet.");
      }

      let stats;
      if (saved.type === "google") {
        google_wait = "prepare-save";
        if (!saved.sheet) throw new Error("The saved Google Sheets source has no sheet.");
        const id = SpreadsheetId(saved.path);

        //Read the sheet again, with and without formulas, so formula cells are never overwritten
        const values = await google_sheets.Values(id, saved.sheet);
        if (current_operation !== operation) return;
        const formulas = await google_sheets.Values(id, saved.sheet, true);
        if (current_operation !== operation) return;

        const updates = PrepareSheetUpdates(saved.sheet, values, formulas, saved.mapping, tmpl.columns);

        //Once the update is sent it can no longer be cancelled
        google_wait = "save";
        await google_sheets.Update(id, updates.data);
        stats = updates.stats;
      } else if (saved.type === "csv") {
        const absolute_path = await ResolveAbsolutePath(saved.path);
        const content = cep_node.require("fs").readFileSync(absolute_path, "utf8");
        const result = SaveMappedCSVValues(content, saved.mapping, tmpl.columns);

        WriteFileToPath(result.content, absolute_path);
        stats = result.stats;
      } else {
        const absolute_path = await ResolveAbsolutePath(saved.path);
        if (!saved.sheet) throw new Error("The saved Excel source has no sheet.");

        const workbook_to_save = LoadWorkbookFromPath(absolute_path);
        stats = SaveMappedTemplateValuesToSheet(
          workbook_to_save, saved.sheet, saved.mapping ?? {}, tmpl.columns,
        );

        //Keep the file's own format, and its macros when it is an .xlsm
        const book_type = ExcelBookType(absolute_path);
        const output = XLSX.write(workbook_to_save, {
          type: "buffer", bookType: book_type, bookVBA: book_type === "xlsm",
        });
        WriteFileToPath(output, absolute_path);
      }

      saved_callback?.({
        success: true,
        title: "Saved to Opened File",
        stats,
      });
    } catch (e) {
      if (current_operation !== operation) return;
      l.error("[Import] Save to opened file failed", e);
      saved_callback?.({
        success: false,
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      if (current_operation === operation) google_wait = null;
    }
  }

  async function OnSheetSelect(sheet_name: string) {
    selected_sheet = sheet_name;

    if (source_type === "google") {
      try {
        await BuildGoogleSheet(sheet_name);
      } catch (e) {
        l.error("[Import] Failed to load Google sheet", e);
        FinalizeImport({ success: false, error: e instanceof Error ? e.message : String(e) });
      }
    } else {
      BuildSheetData(sheet_name);
    }
  }

  /**Applies the mapped values to the template and remembers the source and mapping for re-import and save.*/
  function ConfirmImport() {
    if (loading_sheet || !current_tmpl || (source_type !== "csv" && selected_sheet === "") || sheet_headers.length === 0) return;

    const mapping = MappingObject();
    TemplateHelper.ApplyImportedRows(current_tmpl, sheet_headers, sheet_rows, mapping);

    current_tmpl.import_file_lasts.active_source = {
      type: source_type,
      path: excel_relative_path,
      ...(source_type === "google" ? { name: excel_name } : {}),
      sheet: source_type !== "csv" ? selected_sheet : null,
      mapping,
    };

    FinalizeImport({
      success: true,
      title: `${is_reimport ? "Re-imported" : "Imported"} ${source_type === "excel" ? "Excel" : source_type === "google" ? "Google Sheets" : "CSV"} Data`,
      stats: {
        rows: sheet_rows.length,
        mapped: MappedCount(),
        total: rows.length,
        sheet: selected_sheet,
      },
      warnings: [],
      source: { type: source_type, path: source_path, ...(source_type === "google" ? { name: excel_name } : {}) },
    });
  }
</script>

{#if google_wait}
  <div class="modal">
    <div class="wrapper">
      <h3>{google_wait === "import" ? "Opening Google Sheets" : "Saving to Google Sheets"}</h3>
      <p>Waiting for Google. If prompted, complete authorization in your browser.</p>
      {#if google_wait !== "save"}<button onclick={Close}>Cancel</button>{/if}
    </div>
  </div>
{/if}

{#if show}
  <div class="modal">
    <div class="wrapper import_excel_dialog">
      <h3>{is_reimport ? "Re-import" : "Import"} {source_type === "excel" ? "Excel" : source_type === "google" ? "Google Sheets" : "CSV"} Data</h3>

      <div class="summary">
        <span><b>File:</b> {excel_name}</span>
      </div>

      {#if source_type !== "csv"}<div class="sheet_picker">
        <span>Sheet</span>
        <Dropdown
          bind:value={selected_sheet}
          options={sheet_options}
          labels={sheet_options}
          html_labels={false}
          search_enabled={sheet_options.length > 8}
          style="min-width: 220px;"
          style_list="max-height: 220px; overflow-y: auto;"
          onselect={(sheet_name: string) => OnSheetSelect(sheet_name)} />
      </div>{/if}

      <div class="summary">
        <span><b>Rows:</b> {sheet_rows.length}</span>
        <span><b>Columns:</b> {sheet_headers.length}</span>
        <span><b>Mapped:</b> {MappedCount()} / {rows.length}</span>
      </div>

      {#if sheet_headers.length === 0}
        <p class="warning">The selected sheet is empty. Choose a sheet with a header row.</p>
      {/if}
      {#if UnmappedCount() > 0}
        <p class="warning">
          {UnmappedCount()} template properties are not mapped. Those properties will keep existing values.
        </p>
      {/if}

      <div class="map_table_wrap">
        <table class="map_table">
          <thead>
            <tr>
              <th>Template Property</th>
              <th>Sheet Column</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {#each rows as row}
              <tr>
                <td>{row.template_prop}</td>
                <td>
                  <Dropdown
                    bind:value={row.mapped_col}
                    options={mapping_options}
                    labels={mapping_labels}
                    html_labels={false}
                    search_enabled={sheet_headers.length > 8}
                    style="width: 100%;"
                    style_list="max-height: 220px; overflow-y: auto;"
                    onselect={(option: string) => OnMappingChange(row, option)} />
                </td>
                <td>
                  {#if row.state === "auto"}
                    <span class="chip auto">Matched</span>
                  {:else if row.state === "manual"}
                    <span class="chip manual">Manual</span>
                  {:else}
                    <span class="chip off">Unmapped</span>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <div class="actions">
        <button data-variant="discrete" onclick={Close}>Cancel</button>
        <button onclick={ConfirmImport} disabled={loading_sheet || sheet_headers.length === 0}>Confirm Import</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .import_excel_dialog {
    max-width: min(960px, 92vw);
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .summary {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    color: var(--color-text-p0);
    font-size: 0.95rem;
  }

  .sheet_picker {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .warning {
    margin: 0;
    color: var(--color-warning, #d9a441);
  }

  .map_table_wrap {
    border: 1px solid var(--color-border-p1);
    border-radius: var(--radius-form);
    overflow: auto;
    max-height: 52vh;
  }

  .map_table {
    width: 100%;
    border-collapse: collapse;
  }

  .map_table th,
  .map_table td {
    padding: 8px;
    border-bottom: 1px solid var(--color-border-p1);
    text-align: left;
    vertical-align: middle;
  }

  .chip {
    border-radius: 999px;
    padding: 2px 8px;
    font-size: 0.8rem;
    border: 1px solid transparent;
  }

  .chip.auto {
    color: #76c183;
    border-color: #76c18355;
  }

  .chip.manual {
    color: #66b9ff;
    border-color: #66b9ff55;
  }

  .chip.off {
    color: var(--color-text-disabled);
    border-color: var(--color-border-p1);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
</style>
