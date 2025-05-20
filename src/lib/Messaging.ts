import { Settings, Template } from "./Settings.ts"

export type ResponseErrorBase = {
  /** If the project name is not found */
  not_found?: boolean;

  /** If the project id does not match */
  id_mismatch?: boolean;

  /** If there are no templates */
  no_templates?: boolean;

  /** If there are no settings */
  no_settings?: boolean;

  /** If the project name is not found */
  no_project_name?: boolean;
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
  /** Settings object */
  setts: Settings;
  /** Defined if we should save the settings on a project that doesn't have any */
  is_new?: boolean;
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
  /** Stringified JSON of the `Settings` object */
  setts?: string;
  /** True if not found */
  not_found?: boolean;
  /** Project name */
  project_name?: string;
}

/** Result for getting templates */
export interface GetTmplsResult extends Result {
  /** Array of templates */
  tmpls?: Template[];
}

/** Result for rendering settings */
export interface RenderSettsResults extends Result {
  /** Render templates */
  render_templs?: string[];
  /** Output modules templates */
  output_modules_templs?: string[];
}

/** Result for saving settings */
export type SaveSettingsResults = Result;

/** Result for batch render */
export type BatchRenderResult = Result;

/** Result for batch generate */
export type BatchGenerateResult = Result;

/** Result for previewing a row */
export type PreviewRowResult = Result;

/** Result for getting current values */
export interface GetCurrentValuesResults {
  /** Array of name/value pairs */
  values: { name: string; value: string }[];
}

/** Result for checking if same project */
export interface IsSameProjectResult extends Result {
  /** True if same project */
  same_project: boolean;
}
