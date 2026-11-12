<script module lang="ts">
  export type ExportResult =
    | { success: true; title: string }
    | { success: false; error: string };
</script>

<script lang="ts">
  import * as XLSX from "xlsx";
  import Dropdown from "./Dropdown.svelte";
  import { csa, l } from "../lib/States.svelte.ts";
  import { CreateTemplateWorkbook, ValidateSheetName } from "../lib/ExcelWorkbookWriter.ts";
  import { TemplateHelper, type TemplateData } from "../lib/Settings.svelte.ts";

  type ExportFormat = "csv" | "xlsx";

  let show = $state(false);
  let format = $state<ExportFormat>("csv");
  let sheet_name = $state("");
  let current_tmpl: TemplateData | undefined;
  let on_result: ((result: ExportResult) => void) | undefined;
  let sheet_error = $derived(format === "xlsx" ? ValidateSheetName(sheet_name) : null);

  export function Open(tmpl: TemplateData, callback: (result: ExportResult) => void) {
    format = "csv";
    sheet_name = tmpl.name;
    current_tmpl = tmpl;
    on_result = callback;
    show = true;
  }

  export function Close() {
    show = false;
    current_tmpl = undefined;
    on_result = undefined;
  }

  function Confirm() {
    if (sheet_error) return;
    const tmpl = current_tmpl;
    const callback = on_result;
    const type = format;
    const sheet = sheet_name;
    if (!tmpl || !callback) throw new Error("Export was opened without a template or callback.");
    Close();
    void Export(tmpl, type, sheet, callback);
  }

  async function Export(tmpl: TemplateData, type: ExportFormat, sheet: string, callback: (result: ExportResult) => void) {
    let result: ExportResult;
    try {
      const chosen = await csa.SaveFileDialog(false, `Export ${type.toUpperCase()} Data`, "", [type], `data.${type}`);
      if (!chosen) return;
      const path_util = cep_node.require("path");
      const ext = path_util.extname(chosen).toLowerCase();
      if (ext && ext !== `.${type}`) throw new Error(`Choose a .${type} filename.`);
      const path = ext ? chosen : `${chosen}.${type}`;
      const fs = cep_node.require("fs");
      if (type === "csv") {
        fs.writeFileSync(path, TemplateHelper.MakeCSV(tmpl), "utf8");
      } else {
        const workbook = CreateTemplateWorkbook(tmpl.columns, TemplateHelper.AsRows(tmpl), sheet);
        fs.writeFileSync(path, XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
      }
      result = { success: true, title: `Exported ${type.toUpperCase()} Data` };
    } catch (error) {
      l.error("Failed to export data", error);
      result = { success: false, error: error instanceof Error ? error.message : String(error) };
    }
    callback(result);
  }
</script>

{#if show}
  <div class="modal">
    <div class="wrapper export_data_dialog">
      <h3>Export Data</h3>
      <div class="field">
        <span id="export-format-label">Export method</span>
        <Dropdown bind:value={format} options={["csv", "xlsx"]} labels={["CSV", "Excel"]} aria_labelledby="export-format-label" style="min-width: 180px;" />
      </div>
      {#if format === "xlsx"}
        <div class="field">
          <label for="export-sheet-name">Sheet name</label>
          <input id="export-sheet-name" type="text" bind:value={sheet_name} aria-invalid={sheet_error !== null} aria-describedby={sheet_error ? "export-sheet-error" : undefined} />
        </div>
        {#if sheet_error}
          <p id="export-sheet-error" class="warning">{sheet_error}</p>
        {/if}
      {/if}
      <div class="actions">
        <button data-variant="discrete" onclick={Close}>Cancel</button>
        <button onclick={Confirm} disabled={sheet_error !== null}>Export</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .export_data_dialog {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .field {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .field > label,
  .field > span {
    min-width: 95px;
  }

  .warning {
    margin: 0;
    color: var(--color-warning, #d9a441);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
</style>
