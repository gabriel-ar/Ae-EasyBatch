import { type ProjSettings, type ProjData, type TemplateData, type ColumnData, type Comp } from "./Settings.svelte.js"

export type ResponseErrorBase = {
  /** If the project name is not found */
  not_found?: boolean;

  /** If the project id does not match */
  id_mismatch?: boolean;

  /** Raw unparseable response string, set when JSON.parse fails */
  raw_response?: string;

  /** If there are no templates */
  no_templates?: boolean;

  /** If there are no settings */
  no_settings?: boolean;

  /** If the project name is not found */
  no_project_name?: boolean;

  /** Identifies which host.jsx function produced this error */
  source?: string;

  reasons?: {
    not_found?: boolean;
    id_mismatch?: boolean;
    no_templates?: boolean;
    no_settings?: boolean;
    no_project_name?: boolean;
  };
}

export type ResponseError = ResponseErrorBase & Error;

/** Base request type */
export class Request { }

/** Request to save settings */
export class SaveSettsRequest extends Request {

  constructor() {
    super();
  }

  /** Project name */
  project_name: string;
  
    /** Project data to save */
  proj_data?: ProjData;

  /** Settings to save */
  proj_settings?: ProjSettings;

  /** Defined if we should save the settings on a project that doesn't have any */
  is_new?: boolean;

  project_id: string;
}

/** Base result type */
export interface Result {
  /** Whether the operation was successful */
  success: boolean;
  /** If the process stops on a single error, this will be the error object */
  error_obj?: ResponseError;
  /** If the process can continue with multiple errors, this will be the error array */
  errors?: { message: string; type: string; row?: number }[];
}

/** Result for getting settings */
export interface GetSettsResult extends Result {
  proj_data: ProjData;
  proj_settings: ProjSettings;

  /** True if not found */
  not_found?: boolean;
  /** Project name */
  project_name?: string;
}

/** Result for getting templates */

/**
 * The subset of ColumnData that host.jsx populates during a template scan.
 * The client fills in the remaining fields via ColumnHelper.FromJson().
 */
export type HostColumnData = Pick<ColumnData, 'cont_name' | 'type' | 'values' | 'display' | 'menu_params'>;

/**
 * The subset of TemplateData that host.jsx populates during a template scan.
 * The client merges these with stored settings via SettingsHelper.UpdateTemplates().
 */
export type HostTemplateData = Pick<TemplateData, 'comp' | 'comp_id' | 'name' | 'dep_comps'> & {
  columns: HostColumnData[];
};

export interface GetTmplsResult extends Result {
  /** Array of partial templates as scanned from AE — merged with stored settings on the client */
  tmpls?: HostTemplateData[];
}

/** Result for getting settings */
export interface GetAllCompsResult extends Result {
  /** Collection of after effects compositions*/
  comps?: {id: number; name: string}[];
}

export interface GetSelectedCompsResult extends Result {
  /** Collection of selected after effects compositions*/
  comps?: {id: number; name: string;}[];
}

/** Result for rendering settings */
export interface RenderSettsResults extends Result {
  /** Render templates */
  render_templs?: string[];

  default_render_templ?: number;

  /** Output modules templates */
  output_modules_templs?: string[];

  default_output_module_templ?: number;
}

export type RowRenderResult ={
  /** Row number */
  row: number;
  /**Status */
  status: 'success' | 'error' | 'warning'| 'stopped';
  /** If successful, the path to the rendered file */
  rendered_path?: string;
  /** If not successful, the error message (user facing) */
  error?: string;
}

/** Result for batch rendering */
export interface BatchRenderResult extends Result {
  /** Array of row render results */
  row_results?: RowRenderResult[];

  user_stopped?: boolean;
}

/** Result for saving settings */
export type SaveSettingsResults = Result;

/** Result for batch generate */
export type BatchGenerateResult = Result;

/** Result for previewing a row */
export type PreviewRowResult = Result;

/** Result for getting current values */
export interface GetCurrentValuesResults extends Result {
  /** Array of name/value pairs */
  values: { name: string; value: string }[];
}

/** Result for checking if same project */
export interface ProjectIdResult extends Result {
 id: string;
}

/**
 * Result for CheckRenderResult.
 * Returns the RGBA color sampled from the ResultText layer of the CompareResults
 * composition after swapping in the rendered file and its expected PNG reference.
 * A value of [0,0,0,1] (pure black, full alpha) means the render matches the expected output.
 */
export interface CheckRenderResultResult extends Result {
  /**
   * The RGBA color array [r, g, b, a] sampled from the ResultText expression layer.
   * Values are in the 0–1 range as returned by sampleImage().
   * Undefined if the operation failed before the sample could be read.
   */
  color?: [number, number, number, number];
}
