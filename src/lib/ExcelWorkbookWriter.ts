import * as XLSX from "xlsx";

export type ExcelWritableColumn = {
  cont_name: string;
  values: unknown[];
};

export type ExcelWorkbookSaveStats = {
  written_cells: number;
  formula_cells_skipped: number;
  missing_columns: string[];
};

export function ValidateSheetName(name: string): string | null {
  if (!name.trim()) return "Enter a sheet name.";
  if (name.length > 31) return "Sheet names cannot exceed 31 characters.";
  if (/[\\/?*[\]:\x00-\x1f]/.test(name)) {
    return "Sheet names cannot contain \\ / ? * [ ] : or control characters.";
  }
  if (name.startsWith("'") || name.endsWith("'")) {
    return "Sheet names cannot begin or end with an apostrophe.";
  }
  return null;
}

export function CreateTemplateWorkbook(columns: ExcelWritableColumn[], rows: unknown[][], sheet_name: string): XLSX.WorkBook {
  const error = ValidateSheetName(sheet_name);
  if (error) throw new Error(error);
  const headers = columns.map((column) => column.cont_name);
  const values = rows.map((row) =>
    row.map((value) => value !== null && typeof value === "object" ? JSON.stringify(value) : value));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headers, ...values]), sheet_name);
  return workbook;
}

function CellValue(value: unknown): { t: XLSX.ExcelDataType; v?: XLSX.CellValue } {
  if (value === null || value === undefined || value === "") {
    return { t: "z" };
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return { t: "n", v: value };
  }

  if (typeof value === "boolean") {
    return { t: "b", v: value };
  }

  if (typeof value === "string") {
    return { t: "s", v: value };
  }

  return { t: "s", v: JSON.stringify(value) };
}

export function SaveMappedTemplateValuesToSheet(
  workbook: XLSX.WorkBook,
  sheet_name: string,
  mapping: Record<string, string | null>,
  columns: ExcelWritableColumn[],
): ExcelWorkbookSaveStats {
  const sheet = workbook.Sheets[sheet_name];
  if (!sheet) {
    throw new Error(`The saved sheet could not be found: ${sheet_name}`);
  }

  if (!sheet["!ref"]) throw new Error("The saved sheet is empty.");
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const populated_rows: number[] = [];
  for (let row = range.s.r; row <= range.e.r; row++) {
    const values = XLSX.utils.sheet_to_json(sheet, {
      header: 1, raw: true, defval: "", blankrows: false,
      range: { s: { r: row, c: range.s.c }, e: { r: row, c: range.e.c } },
    });
    if (values.length > 0) populated_rows.push(row);
  }
  const header_row = populated_rows.shift();
  if (header_row === undefined) throw new Error("The saved sheet does not contain a header row.");
  const header_indices = new Map<string, number[]>();
  for (let col_index = range.s.c; col_index <= range.e.c; col_index++) {
    const cell = sheet[XLSX.utils.encode_cell({ r: header_row, c: col_index })];
    if (cell?.v !== undefined && cell.v !== null) {
      const header = String(cell.v).trim();
      header_indices.set(header, [...(header_indices.get(header) ?? []), col_index]);
    }
  }

  const columns_by_name = new Map<string, ExcelWritableColumn>();
  for (const column of columns) {
    columns_by_name.set(column.cont_name, column);
  }

  let written_cells = 0;
  let formula_cells_skipped = 0;
  const missing_columns: string[] = [];
  let last_written_row = range.e.r;
  const written_headers = new Set<string>();

  for (const [template_prop, source_col] of Object.entries(mapping)) {
    if (!source_col) continue;

    const template_col = columns_by_name.get(template_prop);
    const matches = header_indices.get(source_col);
    if (!template_col || !matches) {
      missing_columns.push(source_col);
      continue;
    }
    if (matches.length !== 1 || written_headers.has(source_col)) {
      throw new Error(`Cannot save updates: the Excel column "${source_col}" is ambiguous.`);
    }
    written_headers.add(source_col);
    const sheet_col_index = matches[0];

    for (let row_index = 0; row_index < template_col.values.length; row_index++) {
      if (populated_rows[row_index] === undefined) {
        populated_rows[row_index] = ++last_written_row;
      }
      const physical_row = populated_rows[row_index];
      const cell_address = XLSX.utils.encode_cell({ r: physical_row, c: sheet_col_index });
      const existing_cell = sheet[cell_address];

      if (existing_cell?.f !== undefined) {
        formula_cells_skipped++;
        continue;
      }

      const next_cell = { ...existing_cell, ...CellValue(template_col.values[row_index]) };
      delete next_cell.w;
      sheet[cell_address] = next_cell;
      written_cells++;
      last_written_row = Math.max(last_written_row, physical_row);
    }
  }

  if (written_cells > 0) {
    range.e.r = last_written_row;
    sheet["!ref"] = XLSX.utils.encode_range(range);
  }

  return { written_cells, formula_cells_skipped, missing_columns };
}
