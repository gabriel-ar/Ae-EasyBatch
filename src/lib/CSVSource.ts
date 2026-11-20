import papa from "papaparse";

type CSVRow = string[];

//papaparse ships without type declarations, so the parts of its result that we use are described here
type CSVParseResult = {
  data: CSVRow[];
  errors: { code: string; message: string }[];
  meta: { delimiter: string; linebreak: string };
};

function ParseRows(text: string, config: Record<string, unknown>): CSVParseResult {
  return papa.parse(text, config) as unknown as CSVParseResult;
}

/**A CSV file split into rows, plus what is needed to write it back in the same format.*/
export type ParsedCSV = {
  rows: CSVRow[];
  header_index: number;
  /**Indices in `rows` of the non-empty rows after the header*/
  data_indices: number[];
  delimiter: string;
  newline: string;
  bom: boolean;
};

function IsEmptyRow(row: CSVRow): boolean {
  return row.length === 1 && row[0] === "";
}

/**Parses a CSV keeping empty rows, so row positions still match the file when it is saved back.*/
export function ParseCSVSource(content: string): ParsedCSV {
  const bom = content.startsWith("\uFEFF");
  const raw = bom ? content.slice(1) : content;

  const detected = ParseRows(raw, { skipEmptyLines: true });
  let delimiter = detected.meta.delimiter;

  //Single column files have no delimiter to detect, so we pick the one that splits the first row the most
  if (detected.errors.some((item) => item.code === "UndetectableDelimiter")) {
    let max_columns = 1;

    for (const candidate of [",", "\t", ";", "|"]) {
      const sample = ParseRows(raw, {
        delimiter: candidate, skipEmptyLines: true, preview: 1,
      });
      const count = sample.data[0]?.length ?? 0;

      if (count > max_columns) {
        max_columns = count;
        delimiter = candidate;
      }
    }
  }

  const parsed = ParseRows(raw, {
    delimiter,
    skipEmptyLines: false,
  });
  const error = parsed.errors.find((item) => item.code !== "UndetectableDelimiter");
  if (error) throw new Error(`Could not parse CSV: ${error.message}`);

  const header_index = parsed.data.findIndex((row) => !IsEmptyRow(row));
  if (header_index < 0) throw new Error("The CSV file does not contain a header row.");

  const data_indices: number[] = [];
  for (let i = header_index + 1; i < parsed.data.length; i++) {
    if (!IsEmptyRow(parsed.data[i])) data_indices.push(i);
  }

  return {
    rows: parsed.data,
    header_index,
    data_indices,
    delimiter: parsed.meta.delimiter,
    newline: parsed.meta.linebreak,
    bom,
  };
}

/**
 * Writes the mapped template values into the CSV text, keeping its other columns, delimiter and line endings.
 * Cells that start with "=" are left alone, and rows beyond the file's last row are appended.
 */
export function SaveMappedCSVValues(
  content: string,
  mapping: Record<string, string | null>,
  columns: { cont_name: string; values: unknown[] }[],
) {
  const csv = ParseCSVSource(content);
  const headers = csv.rows[csv.header_index].map((header) => header.trim());
  const written_headers = new Set<string>();
  const missing_columns: string[] = [];
  let written_cells = 0;
  let formula_cells_skipped = 0;

  for (const [template_prop, source_col] of Object.entries(mapping)) {
    if (!source_col) continue;

    const column = columns.find((item) => item.cont_name === template_prop);
    const matches = headers.reduce<number[]>((indices, header, index) => {
      if (header === source_col) indices.push(index);
      return indices;
    }, []);

    if (!column || matches.length === 0) {
      missing_columns.push(source_col);
      continue;
    }

    //Writing into a repeated header would be a guess, so we refuse
    if (matches.length > 1 || written_headers.has(source_col)) {
      throw new Error(`Cannot save updates: the CSV column "${source_col}" is ambiguous.`);
    }

    written_headers.add(source_col);
    const col_index = matches[0];

    column.values.forEach((value, row_index) => {
      let file_index = csv.data_indices[row_index];

      //New rows go after the last data row, before any trailing empty row
      if (file_index === undefined) {
        file_index = csv.rows.length;
        if (file_index > 0 && IsEmptyRow(csv.rows[file_index - 1])) file_index--;

        csv.rows.splice(file_index, 0, []);
        csv.data_indices.push(file_index);
      }

      const row = csv.rows[file_index];
      if (row[col_index]?.startsWith("=")) {
        formula_cells_skipped++;
        return;
      }

      while (row.length <= col_index) row.push("");
      row[col_index] = value === null || value === undefined ? "" :
        typeof value === "object" ? JSON.stringify(value) : String(value);
      written_cells++;
    });
  }

  return {
    content: (csv.bom ? "\uFEFF" : "") + papa.unparse(csv.rows, {
      delimiter: csv.delimiter,
      newline: csv.newline,
    }),
    stats: { written_cells, formula_cells_skipped, missing_columns },
  };
}
