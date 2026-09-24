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

  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
  const header_indices: Record<string, number> = {};
  for (let col_index = range.s.c; col_index <= range.e.c; col_index++) {
    const cell = sheet[XLSX.utils.encode_cell({ r: 0, c: col_index })];
    if (cell?.v !== undefined && cell.v !== null) {
      header_indices[String(cell.v).trim()] = col_index;
    }
  }

  const columns_by_name: Record<string, ExcelWritableColumn> = {};
  for (const column of columns) {
    columns_by_name[column.cont_name] = column;
  }

  let written_cells = 0;
  let formula_cells_skipped = 0;
  const missing_columns: string[] = [];
  let last_written_row = range.e.r;

  for (const [template_prop, source_col] of Object.entries(mapping)) {
    if (!source_col) continue;

    const template_col = columns_by_name[template_prop];
    const sheet_col_index = header_indices[source_col];
    if (!template_col || sheet_col_index === undefined) {
      missing_columns.push(source_col);
      continue;
    }

    for (let row_index = 0; row_index < template_col.values.length; row_index++) {
      const cell_address = XLSX.utils.encode_cell({ r: row_index + 1, c: sheet_col_index });
      const existing_cell = sheet[cell_address];

      if (existing_cell?.f !== undefined) {
        formula_cells_skipped++;
        continue;
      }

      const next_cell = { ...existing_cell, ...CellValue(template_col.values[row_index]) };
      delete next_cell.w;
      sheet[cell_address] = next_cell;
      written_cells++;
      last_written_row = Math.max(last_written_row, row_index + 1);
    }
  }

  if (written_cells > 0) {
    range.e.r = last_written_row;
    sheet["!ref"] = XLSX.utils.encode_range(range);
  }

  return { written_cells, formula_cells_skipped, missing_columns };
}
