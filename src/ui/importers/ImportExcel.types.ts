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
