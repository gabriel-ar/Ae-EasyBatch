import { ColumnHelper, TemplateHelper, type TemplateData } from "./Settings.svelte.ts";
import type { CheckReplacementFilesResult, RenderSettsResults } from "./Messaging";

type PreflightOutput = { row: number; comp_name: string; comp_id: number };
type PreflightMedia = { row: number; column: string; column_index: number };

export type PreflightFinding =
  | { code: "no_rows" | "no_outputs" | "batch_in_progress" | "queue_active" }
  | { code: "invalid_presets"; comp_name: string }
  | { code: "missing_media"; media: PreflightMedia; path?: string }
  | { code: "duplicate_output"; path: string; outputs: PreflightOutput[] }
  | { code: "media_check_failed" | "preflight_failed"; message: string };

export type BatchPreflightResult = {
  /** Original, zero-based data row indices. */
  rows: number[];
  findings: PreflightFinding[];
  template: TemplateData;
};

/**Checks a plain template snapshot without changing it or preparing the render queue.*/
export async function RunBatchPreflight(
  template: TemplateData,
  presets: RenderSettsResults,
  check_media: (paths: string[]) => Promise<CheckReplacementFilesResult>,
  row_index = -1,
): Promise<BatchPreflightResult> {
  const tmpl = structuredClone(template);
  const mode = tmpl.out_mode;
  if (mode !== "render" && mode !== "dependant") {
    throw new Error("Batch Preflight is only available in One Per Row and Multi-Output.");
  }

  // The One Per Row shortcut has historically resolved its row tokens from zero.
  const single_render = mode === "render" && row_index !== -1;
  const dep_rows = mode === "dependant" ? TemplateHelper.EnabledRows(tmpl) : null;
  const has_single_row = row_index >= 0 && row_index < TemplateHelper.RowCount(tmpl);
  if (single_render && has_single_row) TemplateHelper.KeepRows(tmpl, [row_index]);
  TemplateHelper.ResolveCompsNames(tmpl);
  TemplateHelper.ResolveBatchPaths(tmpl, mode);
  const rows = row_index === -1
    ? dep_rows ?? TemplateHelper.EnabledRows(tmpl)
    : has_single_row ? [row_index] : [];
  const findings: PreflightFinding[] = [];
  const result = { rows, findings, template: tmpl };
  if (!rows.length) findings.push({ code: "no_rows" });

  const configs = mode === "render"
    ? [{ id: tmpl.comp_id, name: tmpl.comp, save_paths: tmpl.save_paths,
        render_setts_templ: tmpl.render_setts_templ, render_out_module_templ: tmpl.render_out_module_templ }]
    : tmpl.dep_config.filter((config) => config.enabled);
  if (!configs.length) {
    findings.push({ code: "no_outputs" });
    return result;
  }

  const outputs_by_path = new Map<string, PreflightOutput[]>();
  for (const config of configs) {
    if (!presets.render_templs?.includes(config.render_setts_templ) ||
        !presets.output_modules_templs?.includes(config.render_out_module_templ)) {
      findings.push({ code: "invalid_presets", comp_name: config.name });
    }

    for (const row of rows) {
      const path = config.save_paths[single_render ? 0 : row];
      if (path === undefined) continue;
      const output = { row, comp_name: config.name, comp_id: config.id };
      const group = outputs_by_path.get(path);
      if (group) group.push(output);
      else outputs_by_path.set(path, [output]);
    }
  }
  // Compare resolved patterns, not the extensions or frame numbers AE may add when queuing.
  for (const [path, outputs] of outputs_by_path) {
    if (outputs.length > 1) findings.push({ code: "duplicate_output", path, outputs });
  }

  const media_by_path = new Map<string, PreflightMedia[]>();
  for (const row of rows) {
    tmpl.columns.forEach((col, column_index) => {
      if (col.type !== ColumnHelper.PropertyValueType.SRC_ALTERNATE) return;
      const path = col.values[single_render ? 0 : row];
      if (!col.alt_src_pattern && !(typeof path === "string" && path.startsWith("<b>"))) return;

      const media = { row, column: col.cont_name, column_index };
      if (typeof path !== "string" || !path.trim()) {
        findings.push({ code: "missing_media", media });
        return;
      }
      const group = media_by_path.get(path);
      if (group) group.push(media);
      else media_by_path.set(path, [media]);
    });
  }

  const paths = [...media_by_path.keys()];
  if (paths.length) {
    try {
      const response = await check_media(paths);
      if (!response.success || !Array.isArray(response.missing)) {
        throw new Error(response.error_obj?.message ?? "After Effects did not return the media check results.");
      }
      for (const { index, path } of response.missing) {
        const group = media_by_path.get(paths[index]);
        if (!group || typeof path !== "string") throw new Error("Invalid media check result.");
        for (const media of group) findings.push({ code: "missing_media", media, path });
      }
    } catch (error) {
      findings.push({ code: "media_check_failed", message: String(error) });
    }
  }
  if (mode === "render" && !single_render && rows.length !== TemplateHelper.RowCount(tmpl)) {
    TemplateHelper.KeepRows(tmpl, rows);
  }
  return result;
}
