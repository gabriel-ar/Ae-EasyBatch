import type { PreflightFinding } from "../lib/BatchPreflight";

export function EscapeHTML(text: string): string {
  const escaped: Record<string, string> = {
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  };
  return text.replace(/[&<>"']/g, (character) => escaped[character]);
}

function FormatRows(rows: Set<number>): string {
  const sorted = [...rows].sort((a, b) => a - b);
  const ranges: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const first = sorted[i];
    while (sorted[i + 1] === sorted[i] + 1) i++;
    const last = sorted[i];
    ranges.push(first === last ? `${first}` : `${first}&ndash;${last}`);
  }
  return `${rows.size === 1 ? "Row" : "Rows"} ${ranges.join(", ")}`;
}

function FormatFinding(finding: PreflightFinding): string {
  switch (finding.code) {
    case "duplicate_output": {
      const by_comp = new Map<number, { name: string; rows: Set<number> }>();
      for (const { comp_id, comp_name, row } of finding.outputs) {
        if (!by_comp.has(comp_id)) by_comp.set(comp_id, { name: comp_name, rows: new Set() });
        by_comp.get(comp_id)!.rows.add(row + 1);
      }
      const groups = [...by_comp.values()].map(({ name, rows }) =>
        `<li>${FormatRows(rows)} &middot; ${EscapeHTML(name)}</li>`,
      ).join("");
      return `<strong>Multiple outputs use the same path</strong><br>` +
        `<code>${EscapeHTML(finding.path || "(empty path)")}</code>` +
        `<ul style="padding-left: 1.25em; margin: 0.4em 0;">${groups}</ul>` +
        `In Output, edit the file name pattern so each output gets its own path. ` +
        `For example, add Row Number for different rows or use different patterns for different compositions.`;
    }
    case "missing_media":
      return `<strong>Missing replacement file</strong><br>` +
        `Row ${finding.media.row + 1} &middot; ${EscapeHTML(finding.media.column)}<br>` +
        (finding.path ? `<code>${EscapeHTML(finding.path)}</code><br>` : "No file path was set.<br>") +
        "Pick a file in Data or update the replaceable's file pattern.";
    case "invalid_presets":
      return `Select valid Render Settings and Output Module templates for <strong>${EscapeHTML(finding.comp_name)}</strong>.`;
    case "no_rows":
      return "Check at least one row in Data.";
    case "no_outputs":
      return "Add or enable at least one composition under Compositions to Render.";
    case "batch_in_progress":
      return "Continue or stop the unfinished batch before starting another.";
    case "queue_active":
      return "Finish or stop the active render in the After Effects Render Queue before starting a new batch.";
    case "media_check_failed":
      return `Could not check replacement files. ${EscapeHTML(finding.message)}`;
    case "preflight_failed":
      return `Could not complete the render checks. ${EscapeHTML(finding.message)}`;
  }
}

type MissingMedia = Extract<PreflightFinding, { code: "missing_media" }>;

function FormatMissingColumn(column: string, rows: number[], missing: MissingMedia[]): string {
  const paths = [...missing].sort((a, b) => a.media.row - b.media.row).map(({ media, path }) =>
    `<li>Row ${media.row + 1} &middot; ${path ? `<code>${EscapeHTML(path)}</code>` : "No file path was set."}</li>`,
  ).join("");
  return `<strong>${EscapeHTML(column)}: Missing files in all ${rows.length} checked rows</strong><br>` +
    `In Data, check this column's File Path Pattern and Base Folder, or verify any files you picked manually.` +
    `<details><summary>Show Paths by Row</summary><ul>${paths}</ul></details>`;
}

export function FormatBatchPreflightMessage(findings: PreflightFinding[], rows: number[]): string {
  const missing_by_column = new Map<number, MissingMedia[]>();
  for (const finding of findings) {
    if (finding.code !== "missing_media") continue;
    const index = finding.media.column_index;
    const group = missing_by_column.get(index);
    if (group) group.push(finding);
    else missing_by_column.set(index, [finding]);
  }
  for (const [index, group] of missing_by_column) {
    const missing_rows = new Set(group.map(({ media }) => media.row));
    if (rows.length < 2 || !rows.every((row) => missing_rows.has(row))) missing_by_column.delete(index);
  }

  const details = findings.flatMap((finding) => {
    const group = finding.code === "missing_media" ? missing_by_column.get(finding.media.column_index) : undefined;
    if (!group) return [FormatFinding(finding)];
    return group[0] === finding ? [FormatMissingColumn(group[0].media.column, rows, group)] : [];
  });
  return `<p>No renders started. Fix the ${details.length === 1 ? "issue" : "issues"} below, then try again.</p>` +
    `<ul style="max-height: 45vh; overflow-y: auto; overflow-wrap: anywhere; padding-left: 1.5em;">` +
    details.map((detail) => `<li style="margin-bottom: 0.8em;">${detail}</li>`).join("") + "</ul>";
}
