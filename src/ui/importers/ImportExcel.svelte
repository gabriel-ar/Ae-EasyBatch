<script lang="ts">
  import * as XLSX from "xlsx";
  import { l, csa } from "../States.svelte.ts";
  import { TemplateHelper, type TemplateData, type ExcelImportState } from "../../lib/Settings.svelte.ts";
  import Dropdown from "../Dropdown.svelte";
  import type { ExcelImportResult } from "./ImportExcel.types.ts";

  type MatchState = "auto" | "manual" | "unmapped";

  type MappingRow = {
    template_prop: string;
    mapped_col: string;
    auto_col: string;
    state: MatchState;
  };

  let show = $state(false);

  let workbook = $state<XLSX.WorkBook | undefined>(undefined);
  let selected_sheet = $state("");
  let excel_name = $state("");
  let excel_relative_path = $state("");

  let current_tmpl = $state<TemplateData | undefined>(undefined);
  let sheet_options = $state<string[]>([]);
  let sheet_headers = $state<string[]>([]);
  let sheet_rows = $state<any[][]>([]);
  let rows = $state<MappingRow[]>([]);

  let mapping_options = $state<string[]>([]);
  let mapping_labels = $state<string[]>([]);

  let on_result = $state<((result: ExcelImportResult) => void) | undefined>(undefined);

  function Normalize(value: string): string {
    return (value ?? "")
      .toLowerCase()
      .trim()
      .replace(/[_\-\.]/g, " ")
      .replace(/\s+/g, " ")
      .replace(/[^a-z0-9 ]/g, "");
  }

  function AutoMatchHeader(template_prop: string, headers: string[]): string {
    if (headers.includes(template_prop)) return template_prop;

    const template_lower = template_prop.toLowerCase();
    const case_insensitive = headers.find((h) => h.toLowerCase() === template_lower);
    if (case_insensitive !== undefined) return case_insensitive;

    const normalized_target = Normalize(template_prop);
    const normalized = headers.find((h) => Normalize(h) === normalized_target);
    return normalized ?? "";
  }

  function BuildRows(tmpl: TemplateData, headers: string[]) {
    mapping_options = ["", ...headers];
    mapping_labels = ["Do not import", ...headers];

    rows = tmpl.columns.map((col) => {
      const matched = AutoMatchHeader(col.cont_name, headers);
      return {
        template_prop: col.cont_name,
        mapped_col: matched,
        auto_col: matched,
        state: matched === "" ? "unmapped" : "auto",
      };
    });
  }

  function GetProjectFolder(): Promise<string | null> {
    return csa.EvalDirectAsync("app.project.file !== null ? app.project.file.parent.fsName : null") as Promise<string | null>;
  }

  async function ResolveRelativePath(absolute_path: string): Promise<string> {
    const project_folder = await GetProjectFolder();
    if (!project_folder) {
      throw new Error("Save the project before importing Excel files so the source path can be stored relative to it.");
    }

    const rel_path = await csa.Eval("GetRelativeFilePath", absolute_path);
    if (!rel_path || rel_path === "null") {
      throw new Error("Could not resolve a relative path for the selected Excel file.");
    }

    return decodeURIComponent(rel_path);
  }

  async function ResolveAbsolutePath(relative_path: string): Promise<string> {
    const project_folder = await GetProjectFolder();
    if (!project_folder) {
      throw new Error("Save the project before re-importing Excel files.");
    }

    const path_util = cep_node.require("path");
    return path_util.join(project_folder, relative_path);
  }

  function LoadWorkbookFromPath(path: string): XLSX.WorkBook {
    const fs = cep_node.require("fs");
    if (!fs.existsSync(path)) {
      throw new Error(`The Excel file could not be found: ${path}`);
    }

    const file_buffer = fs.readFileSync(path);
    const bytes = new Uint8Array(file_buffer);
    return XLSX.read(bytes, { type: "array" });
  }

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

    BuildRows(current_tmpl, sheet_headers);
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
    workbook = undefined;
    selected_sheet = "";
    excel_name = "";
    excel_relative_path = "";
    current_tmpl = undefined;
    sheet_options = [];
    sheet_headers = [];
    sheet_rows = [];
    rows = [];
    mapping_options = [];
    mapping_labels = [];
    on_result = undefined;
  }

  function PickExcelPath(): string | null {
    const res = cep.fs.showOpenDialogEx(
      false,
      false,
      "Select Excel file",
      "",
      ["xlsx", "xls", "xlsm"],
    );

    if (!res || !res.data || res.data.length === 0) return null;
    return res.data[0] ?? null;
  }

  function PersistExcelImportState(tmpl: TemplateData, excel_state: ExcelImportState) {
    tmpl.import_file_lasts.excel = excel_state;
  }

  function CollectMissingColumnWarnings(headers: string[], mapping: Record<string, string | null>): string[] {
    const warnings: string[] = [];

    for (const [template_prop, source_col] of Object.entries(mapping)) {
      if (!source_col) continue;
      if (!headers.includes(source_col)) {
        warnings.push(`Template property "${template_prop}" is mapped to missing Excel column "${source_col}".`);
      }
    }

    return warnings;
  }

  async function LoadSheetData(workbook: XLSX.WorkBook, sheet_name: string, current_tmpl: TemplateData) {
    const ws = workbook.Sheets[sheet_name];
    if (!ws) {
      throw new Error(`The selected sheet could not be found: ${sheet_name}`);
    }

    const raw_rows = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      raw: true,
      defval: "",
      blankrows: false,
    }) as any[][];

    if (raw_rows.length === 0) {
      throw new Error(`The selected sheet "${sheet_name}" does not contain any tabular data.`);
    }

    const headers = (raw_rows.shift() ?? []).map((h) => String(h ?? "").trim());
    const data_rows = raw_rows;

    return { headers, data_rows };
  }

  function FinalizeImport(result: ExcelImportResult) {
    on_result?.(result);
    Close();
  }

  export function Close() {
    show = false;
    ResetState();
  }

  export async function Open(
    tmpl: TemplateData,
    imported_callback: ((result: ExcelImportResult) => void) | undefined = undefined,
  ) {
    show = false;
    ResetState();

    current_tmpl = tmpl;
    on_result = imported_callback;

    try {
      const picked_path = PickExcelPath();
      if (!picked_path) return;

      const rel_path = await ResolveRelativePath(picked_path);
      excel_relative_path = rel_path;
      excel_name = cep_node.require("path").basename(rel_path);

      workbook = LoadWorkbookFromPath(picked_path);
      sheet_options = workbook.SheetNames ?? [];
      if (sheet_options.length === 0) return;

      selected_sheet = sheet_options[0];
      BuildSheetData(selected_sheet);

      show = true;
    } catch (e) {
      l.error("[ImportExcel] Failed to load workbook", e);
      FinalizeImport({
        success: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  export async function ReImportLast(
    tmpl: TemplateData,
    imported_callback: ((result: ExcelImportResult) => void) | undefined = undefined,
  ) {
    show = false;
    ResetState();

    current_tmpl = tmpl;
    on_result = imported_callback;

    try {
      const saved = tmpl.import_file_lasts?.excel;
      if (!saved || !saved.path || !saved.sheet) {
        throw new Error("No Excel import has been saved for this template yet.");
      }

      const absolute_path = await ResolveAbsolutePath(saved.path);
      excel_name = cep_node.require("path").basename(saved.path);

      workbook = LoadWorkbookFromPath(absolute_path);
      sheet_options = workbook.SheetNames ?? [];

      if (!sheet_options.includes(saved.sheet)) {
        throw new Error(`The saved sheet could not be found: ${saved.sheet}`);
      }

      selected_sheet = saved.sheet;

      const { headers, data_rows } = await LoadSheetData(workbook, selected_sheet, tmpl);
      sheet_headers = headers;
      sheet_rows = data_rows;

      const warnings = CollectMissingColumnWarnings(headers, saved.mapping ?? {});
      TemplateHelper.ApplyImportedRows(tmpl, headers, data_rows, saved.mapping ?? {});

      FinalizeImport({
        success: true,
        title: "Re-imported Excel Data",
        stats: {
          rows: data_rows.length,
          mapped: Object.values(saved.mapping ?? {}).filter((value) => value !== null && value !== "").length,
          total: Object.keys(saved.mapping ?? {}).length,
          sheet: selected_sheet,
        },
        warnings,
      });
    } catch (e) {
      l.error("[ImportExcel] Re-import failed", e);
      FinalizeImport({
        success: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  function OnSheetSelect(sheet_name: string) {
    selected_sheet = sheet_name;
    BuildSheetData(sheet_name);
  }

  function ConfirmImport() {
    if (!current_tmpl || selected_sheet === "" || sheet_headers.length === 0) return;

    const mapping = MappingObject();
    TemplateHelper.ApplyImportedRows(current_tmpl, sheet_headers, sheet_rows, mapping);

    PersistExcelImportState(current_tmpl, {
      path: excel_relative_path,
      sheet: selected_sheet,
      mapping,
    });

    FinalizeImport({
      success: true,
      title: "Imported Excel Data",
      stats: {
        rows: sheet_rows.length,
        mapped: MappedCount(),
        total: rows.length,
        sheet: selected_sheet,
      },
      warnings: [],
    });
  }
</script>

{#if show}
  <div class="modal">
    <div class="wrapper import_excel_dialog">
      <h3>Import Excel Data</h3>

      <div class="summary">
        <span><b>File:</b> {excel_name}</span>
      </div>

      <div class="sheet_picker">
        <span>Sheet</span>
        <Dropdown
          bind:value={selected_sheet}
          options={sheet_options}
          labels={sheet_options}
          search_enabled={sheet_options.length > 8}
          style="min-width: 220px;"
          style_list="max-height: 220px; overflow-y: auto;"
          onselect={(sheet_name: string) => OnSheetSelect(sheet_name)} />
      </div>

      <div class="summary">
        <span><b>Rows:</b> {sheet_rows.length}</span>
        <span><b>Columns:</b> {sheet_headers.length}</span>
        <span><b>Mapped:</b> {MappedCount()} / {rows.length}</span>
      </div>

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
        <button onclick={ConfirmImport}>Confirm Import</button>
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
