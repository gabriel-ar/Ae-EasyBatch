import { Settings } from "./AutomatorTypes.svelte";

/**
 * @typedef {{reasons:{id_mismatch?:boolean, not_found?:boolean, no_templates?:boolean }}} ResponseErrorBase
 * @typedef {ResponseErrorBase & Error} ResponseError
 */

class Request {}

class SaveSettsRequest extends Request {
  project_name;

  /** @type {Settings} */
  setts;

  /**Defined if we should save the settings on a project that doesn't have any */
  is_new = false;
}

class Result {
  success = true;

  /**If the process stops on a single error, this will be the error object
   * @type {ResponseError}*/
  error_obj;

  /** If the process can continue with multiple errors, this will be the error array
   * @type {{message: string, type:string, row?: number}[] } */
  errors = [];
}

class GetSettsResult extends Result {
  /** Stringified JSON of the `Settings` object
   * @type {string} */
  setts;
  not_found = false;
  project_name;
}

class GetTmplsResult extends Result {
  /**Stringified JSON of a `Template` array
   * @type {Object[]} */
  tmpls = [];
}

class RenderSettsResults extends Result {
  /** Render templates
   * @type {string[]} */
  render_templs;

  /** Output modules templates
   * @type {string[]} */
  output_modules_templs;
}

class SaveSettingsResults extends Result {
}

class BatchRenderResult extends Result {}

class BatchGenerateResult extends Result {}

class PreviewRowResult extends Result {
    }

class GetCurrentValuesResults {
  /**@type {{name:string, value:string}[]} */
  values = [];
}

class IsSameProjectResult extends Result {
  same_project = true;
}

export {
  Result,
  BatchRenderResult,
  RenderSettsResults,
  SaveSettingsResults,
  GetSettsResult,
  BatchGenerateResult,
  GetCurrentValuesResults,
  GetTmplsResult,
  PreviewRowResult,
  SaveSettsRequest,
  IsSameProjectResult,
};
