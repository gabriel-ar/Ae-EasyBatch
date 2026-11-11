import papa from "papaparse";

type CSVRow = string[];

export type ParsedCSV = {
  rows: CSVRow[];
  headerIndex: number;
  dataIndices: number[];
  delimiter: string;
  newline: string;
  bom: boolean;
};

function IsEmptyRow(row: CSVRow): boolean {
  return row.length === 1 && row[0] === "";
}

export function ParseCSVSource(content: string): ParsedCSV {
  const bom = content.startsWith("\uFEFF");
  const raw = bom ? content.slice(1) : content;
  const detected = papa.parse<CSVRow>(raw, { skipEmptyLines: true });
  let delimiter = detected.meta.delimiter;
  if (detected.errors.some((item) => item.code === "UndetectableDelimiter")) {
    let maxColumns = 1;
    for (const candidate of [",", "\t", ";", "|"]) {
      const sample = papa.parse<CSVRow>(raw, {
        delimiter: candidate, skipEmptyLines: true, preview: 1,
      });
      const count = sample.data[0]?.length ?? 0;
      if (count > maxColumns) {
        maxColumns = count;
        delimiter = candidate;
      }
    }
  }
  const parsed = papa.parse<CSVRow>(raw, {
    delimiter,
    skipEmptyLines: false,
  });
  const error = parsed.errors.find((item) => item.code !== "UndetectableDelimiter");
  if (error) throw new Error(`Could not parse CSV: ${error.message}`);
  const headerIndex = parsed.data.findIndex((row) => !IsEmptyRow(row));
  if (headerIndex < 0) throw new Error("The CSV file does not contain a header row.");
  const dataIndices: number[] = [];
  for (let i = headerIndex + 1; i < parsed.data.length; i++) {
    if (!IsEmptyRow(parsed.data[i])) dataIndices.push(i);
  }
  return {
    rows: parsed.data,
    headerIndex,
    dataIndices,
    delimiter: parsed.meta.delimiter,
    newline: parsed.meta.linebreak,
    bom,
  };
}

export function SaveMappedCSVValues(
  content: string,
  mapping: Record<string, string | null>,
  columns: { cont_name: string; values: unknown[] }[],
) {
  const csv = ParseCSVSource(content);
  const headers = csv.rows[csv.headerIndex].map((header) => header.trim());
  const writtenHeaders = new Set<string>();
  const missing_columns: string[] = [];
  let written_cells = 0;
  let formula_cells_skipped = 0;

  for (const [property, source] of Object.entries(mapping)) {
    if (!source) continue;
    const column = columns.find((item) => item.cont_name === property);
    const matches = headers.reduce<number[]>((indices, header, index) => {
      if (header === source) indices.push(index);
      return indices;
    }, []);
    if (!column || matches.length === 0) {
      missing_columns.push(source);
      continue;
    }
    if (matches.length > 1 || writtenHeaders.has(source)) {
      throw new Error(`Cannot save updates: the CSV column "${source}" is ambiguous.`);
    }
    writtenHeaders.add(source);
    const index = matches[0];
    column.values.forEach((value, rowIndex) => {
      let fileIndex = csv.dataIndices[rowIndex];
      if (fileIndex === undefined) {
        fileIndex = csv.rows.length;
        if (fileIndex > 0 && IsEmptyRow(csv.rows[fileIndex - 1])) fileIndex--;
        csv.rows.splice(fileIndex, 0, []);
        csv.dataIndices.push(fileIndex);
      }
      const row = csv.rows[fileIndex];
      if (row[index]?.startsWith("=")) {
        formula_cells_skipped++;
        return;
      }
      while (row.length <= index) row.push("");
      row[index] = value === null || value === undefined ? "" :
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
