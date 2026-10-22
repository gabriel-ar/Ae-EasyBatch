export type ExcelImportStats = {
  rows: number;
  mapped: number;
  total: number;
  sheet: string;
};

export type ExcelImportSuccessResult = {
  success: true;
  title: string;
  stats: ExcelImportStats;
  warnings: string[];
};

export type ExcelImportFailureResult = {
  success: false;
  error: string;
};

export type ExcelImportResult = ExcelImportSuccessResult | ExcelImportFailureResult;

export type ExcelSaveStats = {
  written_cells: number;
  formula_cells_skipped: number;
  missing_columns: string[];
};

export type ExcelSaveSuccessResult = {
  success: true;
  title: string;
  stats: ExcelSaveStats;
};

export type ExcelSaveFailureResult = {
  success: false;
  error: string;
};

export type ExcelSaveResult = ExcelSaveSuccessResult | ExcelSaveFailureResult;
