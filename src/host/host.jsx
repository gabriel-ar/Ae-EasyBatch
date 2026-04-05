/** @ts-check */
/**
This is a CEP extension for After Effects that provides automation tools for mograph templates.
The user can either use a table or an external CSV file to populate the After Effects composition that makes the template.

This file is the CEP side of the app. The javascript app will make requests through window.__adobe_cep__.evalScript and those requests will be received in this file.

Internal use functions are prefixed with an underscore `_`.
*/

//@include "json2.js"
//script EasyBatch

/**Because random bugs happens that are difficult to track */
var local_logs = [];

function _HasTemplates() {
  for (var i_items = 1; i_items <= app.project.numItems; i_items++) {
    var item = app.project.item(i_items);
    if (
      item instanceof CompItem &&
      item.motionGraphicsTemplateControllerCount > 0
    ) {
      return true;
    }
  }

  return false;
}

/** Scans the After Effects project for comps that have Essential Graphics templates associated to them.
 * It Looks for CompItem.motionGraphicsTemplateControllerCount > 0
 * @returns {string} Stringified JSON of `GetTmplsResult` object
 * */
function GetTemplates() {
  /** @type {GetTmplsResult} */
  var result = {};

  /**
   * Host only returns partial TemplateData (comp, comp_id, name, columns, dep_comps).
   * The client merges these with stored settings via SettingsHelper.UpdateTemplates.
   * @type {HostTemplateData[]}
   */
  var out_tmpls = [];

  try {
    for (var i_items = 1; i_items <= app.project.numItems; i_items++) {
      var templ_comp = app.project.item(i_items);

      //Check if the item is a composition and if it has motion graphics templates
      if (
        templ_comp instanceof CompItem &&
        templ_comp.motionGraphicsTemplateControllerCount > 0
      ) {
        /**
         * Extract the controllers from the template / called columns in the app
         * Host only populates cont_name, type, values — the client merges with saved ColumnData.
         * @type {HostColumnData[]}
         */
        var cols = [];

        //Place the template composition inside the render comp to extract the controllers though the essential properties
        var render_comp = _SetupTemplatePreviewComp();
        if (render_comp == undefined) {
          alert("Could not create render composition");
          return;
        }

        var av_templ_comp = render_comp.layers.add(templ_comp);

        //Access the Essential Properties of the layer and chance the values to the template data
        var e_props = _FlattenPropertyGroup(av_templ_comp.essentialProperty, true);

        //Loop through the properties and extract the name and type
        for (var i_prop = 0; i_prop < e_props.length; i_prop++) {
          var templ_prop = e_props[i_prop];

          /** @type {number} */
          var t_type = templ_prop.propertyValueType;
          var val = "";

          if (templ_prop.propertyValueType === PropertyValueType.TEXT_DOCUMENT) {
            val = templ_prop.value.text;
          } else if (templ_prop.canSetAlternateSource && templ_prop.matchName === "ADBE Layer Source Alternate") {
            t_type = 9001; //Custom type for replaceable sources, the client will handle it accordingly
          } else if (templ_prop.propertyValueType !== PropertyValueType.NO_VALUE
            && templ_prop.matchName !== "ADBE Layer Overrides Comment") {
            val = templ_prop.value;
          }

          cols.push({
            cont_name: templ_prop.name,
            type: t_type,
            values: [val],
          });
        }

        out_tmpls.push({
          comp: templ_comp.name,
          comp_id: templ_comp.id,
          name: templ_comp.motionGraphicsTemplateName,
          columns: cols,
          dep_comps: [],
        });

        av_templ_comp.remove();
      }
    }

    result.tmpls = out_tmpls;
    result.success = true;
    return JSON.stringify(result);
  } catch (e) {
    result.success = false;
    result.error_obj = e;
    result.error_obj.source = "host.jsx @ GetTemplates";
    return JSON.stringify(result);
  }
}

/**
 * Checks if the given composition is included on other compositions
 * @param {CompItem} parent_comp
 * @returns {Comp[]}
 */
function _GetDependentComps(parent_comp) {
  /**@type {Comp[]} */
  var deps = [];

  //Iterate over all items in the project
  //and check if its a composition

  if (parent_comp.usedIn !== undefined)
    for (var i_comp = 0; i_comp <= parent_comp.usedIn.length; i_comp++) {
      var comp = parent_comp.usedIn[i_comp];

      //Avoid the own composition and the template preview comp
      if (
        comp instanceof CompItem &&
        comp.id !== parent_comp.id &&
        comp.name !== "TemplatePreview" &&
        comp.comment !== comment_render_comp
      ) {
        deps.push({ name: comp.name, id: comp.id });
      }
    }

  return deps;
}

/**
 * Returns all compositions in the project.
 * @returns {string} Stringified JSON of `GetAllCompsResult` object
 */
function GetAllComps() {
  /**@type {GetAllCompsResult} */
  var result = {
    success: false,
    comps: []
  };

  try {
    //Iterate over all items in the project
    for (var i = 1; i <= app.project.items.length; i++) {
      var item = app.project.items[i];
      //Check if the item is a composition
      if (item instanceof CompItem) {
        result.comps.push({ id: item.id, name: item.name });
      }
    }
    result.success = true;
  } catch (e) {
    result.success = false;
    result.error_obj = e;
    result.error_obj.source = "host.jsx @ GetAllComps";
  }

  return JSON.stringify(result);
}

/**
 * Returns the selected compositions in the project.
 * @returns {string} Stringified JSON of `GetSelectedCompsResult` object
 */
function GetSelectedComps() {
  /**@type {GetSelectedCompsResult} */
  var result = {
    comps: [],
    success: true
  };

  try {
    var sel_items = app.project.selection;

    for (var i = 0; i < sel_items.length; i++) {
      var item = sel_items[i];
      if (item instanceof CompItem) {
        result.comps.push({ id: item.id, name: item.name });
      }
    }
  } catch (e) {
    result.success = false;
    result.error_obj = e;
    result.error_obj.source = "host.jsx @ GetSelectedComps";
  }

  return JSON.stringify(result);
}

function ExtractPropTypesNames() {
  //Extract the names of the property types
  var ret = JSON.stringify(PropertyValueType);
  return ret;
}

function _SettingsExist() {
  try {
    // load the XMPlibrary as an ExtendScript ExternalObject
    if (ExternalObject.AdobeXMPScript === undefined) {
      ExternalObject.AdobeXMPScript = new ExternalObject("lib:AdobeXMPScript");
    }
    var mdata = new XMPMeta(app.project.xmpPacket); //get the project's XMPmetadata
    var uri = XMPMeta.getNamespaceURI("easybatch");

    var prop = mdata.getProperty(uri, "ProjectData", XMPConst.STRING);

    if (prop === undefined || prop.value === undefined) {
      return false;
    }
  } catch (e) {
    return false;
  }
}

function _SettingsId() {
  try {
    // load the XMPlibrary as an ExtendScript ExternalObject
    if (ExternalObject.AdobeXMPScript === undefined) {
      ExternalObject.AdobeXMPScript = new ExternalObject("lib:AdobeXMPScript");
    }
    var mdata = new XMPMeta(app.project.xmpPacket); //get the project's XMPmetadata
    var uri = XMPMeta.getNamespaceURI("easybatch");

    var prop = mdata.getProperty(uri, "ProjectData", XMPConst.STRING);

    if (prop === undefined || prop.value === undefined) {
      return null;
    }

    /**@type {ProjData} */
    var ProjData = JSON.parse(prop.value);
    return ProjData.id;
  } catch (e) {
    return null;
  }
}

/**
 * Loads the project settings and data from the project's XMP metadata.
 * @returns {string} Stringified JSON of `GetSettsResult` object
 */
function LoadSettings() {

  /**@type {GetSettsResult} */
  var result = {};

  try {
    // load the XMPlibrary as an ExtendScript ExternalObject
    if (ExternalObject.AdobeXMPScript === undefined) {
      ExternalObject.AdobeXMPScript = new ExternalObject("lib:AdobeXMPScript");
    }
    var mdata = new XMPMeta(app.project.xmpPacket); //get the project's XMPmetadata
    var xmp = XMPMeta.getNamespaceURI("easybatch");

    if (xmp === undefined || xmp === "") {
      throw new ResponseError("No settings found in the project", { not_found: true });
    }

    var p_proj_setts = mdata.getProperty(xmp, "ProjectSettings", XMPConst.STRING);
    var p_proj_data = mdata.getProperty(xmp, "ProjectData", XMPConst.STRING);

    if (p_proj_setts === undefined || p_proj_setts.value === undefined) {
      throw new ResponseError("No settings found in the project", { not_found: true });
    }

    result.proj_data = JSON.parse(p_proj_data.value);
    result.proj_settings = JSON.parse(p_proj_setts.value);

    if (app.project.file !== null) {
      result.project_name = app.project.file.name;
    } else {
      result.project_name = null;
    }

    result.success = true;
    _SetGlobalCurrentPath();
  } catch (e) {
    result.success = false;
    result.error_obj = e;
    result.error_obj.source = "host.jsx @ LoadSettings";
  }

  return JSON.stringify(result);
}

/**
 * Saves the project settings and data to the project's XMP metadata.
 * @param {string} s_request JSON of `SaveSettsRequest` object
 * @returns {string}
 */
function SaveSettings(s_request) {
  _EscapeArgs(arguments);

  /**@type {SaveSettingsResults} */
  var response = {};
  try {
    /** @type {SaveSettsRequest}*/
    var request = JSON.parse(s_request);

    //If this is the default project, we will not save the settings
    if (!_HasTemplates()) {
      throw new ResponseError("No templates found in the project", {
        no_templates: true,
      });
    }

    // load the XMPlibrary as an ExtendScript ExternalObject
    if (ExternalObject.AdobeXMPScript === undefined) {
      ExternalObject.AdobeXMPScript = new ExternalObject("lib:AdobeXMPScript");
    }

    var setts_id = _SettingsId();
    if (!request.is_new && setts_id !== null && setts_id !== request.project_id) {
      throw new ResponseError(
        "The settings in the project have a different ID",
        {
          id_mismatch: true,
        }
      );
    }

    var mdata = new XMPMeta(app.project.xmpPacket); //get the project's XMPmetadata
    var uri = XMPMeta.getNamespaceURI("easybatch");

    if (uri === undefined || uri === "") {
      //Register a namespace to store our data in the XMP metadata of the project
      XMPMeta.registerNamespace("http://easybatch.setreports.com/", "easybatch");
      uri = XMPMeta.getNamespaceURI("easybatch");
    }

    if (request.proj_data !== undefined && request.proj_data !== null) {
      mdata.setProperty(uri, "ProjectData", JSON.stringify(request.proj_data), 0, XMPConst.STRING);
    }

    if (request.proj_settings !== undefined && request.proj_settings !== null) {
      mdata.setProperty(uri, "ProjectSettings", JSON.stringify(request.proj_settings), 0, XMPConst.STRING);
    }

    var serialized = mdata.serialize();
    app.project.xmpPacket = serialized;

    response.success = true;
  } catch (e) {
    response.success = false;
    response.error_obj = e;
    response.error_obj.source = "host.jsx @ SaveSettings";
  }

  return JSON.stringify(response);
}

/**
 * Deletes the EasyBatch settings from the project's XMP metadata.
 * Intended for use in testing only.
 * @returns {string} Stringified JSON of a result object
 */
function DeleteSettings() {
  /** @type {{ success: boolean, error_obj?: any }} */
  var response = {
    success: false
  };
  try {
    if (ExternalObject.AdobeXMPScript === undefined) {
      ExternalObject.AdobeXMPScript = new ExternalObject("lib:AdobeXMPScript");
    }

    var mdata = new XMPMeta(app.project.xmpPacket);
    var uri = XMPMeta.getNamespaceURI("easybatch");

    if (uri !== undefined && uri !== "") {
      mdata.deleteProperty(uri, "ProjectData");
      mdata.deleteProperty(uri, "ProjectSettings");
      app.project.xmpPacket = mdata.serialize();
    }

    response.success = true;
  } catch (e) {
    response.success = false;
    response.error_obj = e;
    response.error_obj.source = "host.jsx @ DeleteSettings";
  }

  return JSON.stringify(response);
}

/**
 * Visual diff test helper. Intended for use in testing only.
 *
 * Imports the rendered video at `render_path` into the project, then finds a
 * PNG with the same base name inside the project folder named "expected".
 * It replaces:
 *   - The "Origin" layer in "CompareResults" with the render footage.
 *   - The "Expected" layer in "CompareResults" with the matching PNG footage.
 *
 * Finally it reads the RGBA value produced by the expression on the
 * "ResultText" layer (sourceText property) and returns it.
 * A result of [0, 0, 0, 1] means the render matches the expected output.
 *
 * @param {string} render_path - Absolute path to the rendered video file.
 * @returns {string} Stringified JSON of `CheckRenderResultResult` object.
 */
function CheckRenderResult(render_path) {
  _EscapeArgs(arguments);

  /** @type {CheckRenderResultResult} */
  var response = { success: false };

  try {
    // ── 1. Resolve / import the render footage ────────────────────────────
    var render_file = new File(render_path);
    if (!render_file.exists) {
      throw new Error("Render file not found: " + render_path);
    }

    // Derive the expected PNG name from the render file base name.
    // e.g. "output_row0.mp4" → "output_row0.png"
    var render_name = render_file.name; // includes extension
    var base_name = render_name.substring(0, render_name.lastIndexOf("."));
    var expected_name = base_name + ".png";

    // ── 2. Find the "expected" folder item ───────────────────────────────
    /** @type {FolderItem|undefined} */
    var expected_folder;
    for (var i = 1; i <= app.project.numItems; i++) {
      var item = app.project.item(i);
      if (item instanceof FolderItem && item.name === "Expected") {
        expected_folder = item;
        break;
      }
    }
    if (expected_folder === undefined) {
      throw new Error("Project folder 'expected' not found");
    }

    // ── 3. Find the matching PNG footage inside the expected folder ────────
    /** @type {FootageItem|undefined} */
    var expected_footage;
    for (var i = 1; i <= expected_folder.numItems; i++) {
      var f_item = expected_folder.item(i);
      if (
        f_item instanceof FootageItem &&
        f_item.name === expected_name
      ) {
        expected_footage = f_item;
        break;
      }
    }
    if (expected_footage === undefined) {
      throw new Error("Expected PNG not found in 'expected' folder: " + expected_name);
    }

    // ── 4. Import (or retrieve) the render footage ────────────────────────
    var render_footage = _ResolveFootageItem(render_path, "To Compare");

    // ── 5. Find the "CompareResults" composition ──────────────────────────
    /** @type {CompItem|undefined} */
    var compare_comp;
    for (var i = 1; i <= app.project.numItems; i++) {
      var c_item = app.project.item(i);
      if (c_item instanceof CompItem && c_item.name === "CompareResults") {
        compare_comp = c_item;
        break;
      }
    }
    if (compare_comp === undefined) {
      throw new Error("Composition 'CompareResults' not found in the project");
    }

    // ── 6. Replace sources for "Origin" and "Expected" layers ─────────────
    /** @type {AVLayer|undefined} */
    var origin_layer;
    /** @type {AVLayer|undefined} */
    var expected_layer;

    for (var i = 1; i <= compare_comp.numLayers; i++) {
      var layer = compare_comp.layer(i);
      if (layer.name === "Origin") {
        origin_layer = /** @type {AVLayer} */ (layer);
      } else if (layer.name === "Expected") {
        expected_layer = /** @type {AVLayer} */ (layer);
      }
    }

    if (origin_layer === undefined) {
      throw new Error("Layer 'Origin' not found in 'CompareResults'");
    }
    if (expected_layer === undefined) {
      throw new Error("Layer 'Expected' not found in 'CompareResults'");
    }

    origin_layer.replaceSource(render_footage, false);
    expected_layer.replaceSource(expected_footage, false);

    // ── 7. Read the color from "ResultText" expression sourceText ─────────
    /** @type {TextLayer|undefined} */
    var result_text_layer;
    for (var i = 1; i <= compare_comp.numLayers; i++) {
      if (compare_comp.layer(i).name === "ResultText") {
        result_text_layer = /** @type {TextLayer} */ (compare_comp.layer(i));
        break;
      }
    }
    if (result_text_layer === undefined) {
      throw new Error("Layer 'ResultText' not found in 'CompareResults'");
    }

    // The expression on sourceText evaluates sampleImage() which returns an
    // [r, g, b, a] array. AE evaluates expressions lazily; set the comp time
    // to 0 so we get a deterministic frame before reading.
    compare_comp.time = 0;

    var source_text_prop = /** @type {Property<any>} */ (
      result_text_layer.property("Source Text")
    );
    var raw_text = source_text_prop.value.text;

    // The expression output is "r,g,b,a" — wrap in brackets for JSON.parse
    var color = JSON.parse("[" + raw_text + "]");

    response.color = /** @type {[number, number, number, number]} */ (color);
    response.success = true;
  } catch (e) {
    response.success = false;
    response.error_obj = e;
    response.error_obj.source = "host.jsx @ CheckRenderResult";
  }

  return JSON.stringify(response);
}

/**
 * Checks if the project currently open in After Effects matches the given project ID.
 * @param {string} proj_id - The project ID to compare against.
 * @returns {string}
 */
function IsSameProject(proj_id) {
  _EscapeArgs(arguments);
  /**@type {IsSameProjectResult} */
  var response = { success: true, same_project: false };
  try {
    if (proj_id === undefined || proj_id === null) {
      throw new ResponseError("No project ID provided at IsSameProject", {});
    }

    var read_id = _SettingsId();

    if (read_id === null || read_id === undefined) {
      response.same_project = false;
    } else if (read_id === proj_id) {
      response.same_project = true;
    } else {
      response.same_project = false;
    }

    return JSON.stringify(response);
  } catch (e) {
    response.success = false;
    response.error_obj = e;
    response.error_obj.source = "host.jsx @ IsSameProject";
    return JSON.stringify(response);
  }
}

function _SetupTemplatePreviewComp(remove_layers) {
  if (remove_layers === undefined) {
    remove_layers = true;
  }

  //Check if the composition already exists
  for (var i_items = 1; i_items <= app.project.numItems; i_items++) {
    var comp = /** @type {CompItem} */ (app.project.item(i_items));
    if (comp instanceof CompItem && comp.name == "TemplatePreview") {
      //remove all layers from the comp
      if (remove_layers) {
        for (var i_layer = comp.numLayers; i_layer >= 1; i_layer--) {
          comp.layer(i_layer).remove();
        }
      }

      return comp;
    }
  }

  //create a new comp with the name "TemplateRender"
  var comp = /** @type {CompItem} */ (app.project.items.addComp(
    "TemplatePreview",
    1920,
    1080,
    1,
    10,
    30
  ));

  return comp;
}

var comment_render_comp = "Created by EasyBatch";

/**
 * Creates a composition to be used to render a row of template data.
 * Puts the composition inside the given folder
 */
function _CreateTemplateRenderComp(
  name,
  templ_comp,
  clean_folder,
  proj_folder
) {
  var folder;

  //Check if the folder already exists
  for (var i_items = 1; i_items <= app.project.numItems; i_items++) {
    var item = app.project.item(i_items);
    if (item instanceof FolderItem && item.name == proj_folder) {
      folder = item;
      break;
    }
  }

  if (folder === undefined) {
    //Create the folder to store the render compositions
    folder = app.project.items.addFolder(proj_folder);
  }

  if (clean_folder) {
    //Remove all items in the folder
    for (var i_items = folder.numItems; i_items >= 1; i_items--) {
      folder.item(i_items).remove();
    }
  }

  //Create a composition with the name
  var comp = app.project.items.addComp(
    name,
    templ_comp.width,
    templ_comp.height,
    templ_comp.pixelAspect,
    templ_comp.duration,
    templ_comp.frameRate
  );
  comp.comment = comment_render_comp;
  comp.parentFolder = folder;

  return comp;
}

/**
 * Adapts the properties of the render composition to match the template composition
 * @param {*} render_comp
 * @param {*} templ_comp
 */
function _AdaptCompToTempl(render_comp, templ_comp) {
  render_comp.duration = templ_comp.duration;
  render_comp.width = templ_comp.width;
  render_comp.height = templ_comp.height;
  render_comp.pixelAspect = templ_comp.pixelAspect;
  render_comp.frameRate = templ_comp.frameRate;
  render_comp.workAreaStart = 0;
  render_comp.workAreaDuration = render_comp.duration;
}

/**
 * Given a path to a file, it either imports it or retrieves the existing footage item in the project.
 * @param {string} path
 * @param {string} proj_folder
 * @returns {FootageItem}
 */
function _ResolveFootageItem(path, proj_folder) {
  _SetGlobalCurrentPath();

  //Check or create a folder in the project to organize the replaceable files
  var folder;
  for (var i_items = 1; i_items <= app.project.numItems; i_items++) {
    var proj_item = app.project.item(i_items);
    if (proj_item instanceof FolderItem && proj_item.name == proj_folder) {
      folder = proj_item;
      break;
    }
  }

  if (folder === undefined) {
    folder = app.project.items.addFolder(proj_folder);
  }

  //Check if the footage item exists in the project
  //Replace the <b> tag used to indicate the file was manually selected
  // Note: split/join used instead of replaceAll — ExtendScript targets ES3
  var clean_path = path.split("\\\\").join("/").split("<b>").join("").split("</b>").join("");
  var import_file = new File(clean_path);

  var repl_f_item;
  for (var i_items = 1; i_items <= app.project.numItems; i_items++) {
    var proj_item = app.project.item(i_items);
    if (proj_item instanceof FootageItem
      && proj_item.file !== null
      && proj_item.footageMissing === false
      && proj_item.file.fullName.toLowerCase() == import_file.fullName.toLowerCase()) {
      return proj_item;
    }
  }

  if (repl_f_item === undefined) {
    //Import the file

    var import_opt = new ImportOptions(import_file);
    repl_f_item = /** @type {FootageItem} */ (app.project.importFile(import_opt));
    repl_f_item.parentFolder = folder;
  }

  return /** @type {FootageItem} */ (repl_f_item);
}

/**
 * Replaces the values in the Essential Properties of a layer
 * with the values on the corresponding row of the template.
 * @param {AVLayer} layer
 * @param {TemplateData} template
 * @param {number} row_i
 * @param {boolean} [replace_orgs] Instead of replacing the values of the Ess. Props. in the layer, will replace the values of the original properties in the master composition.
 * @param {PropertyGroup} [e_props] Property group to iterate (used for recursion).
 * @returns {{ message: string, column: number }[]} List of errors found during the process
 */
function _ApplyTemplProps(layer, template, row_i, replace_orgs, e_props) {

  if (replace_orgs === undefined) {
    replace_orgs = false;
  }

  var errors = [];

  //This function is recursive, if no e_props will get them from the layer
  //Donde this way because properties become invalid when flattened
  if (e_props === undefined) {
    //Access the Essential Properties of the layer
    var e_props = layer.essentialProperty;
  }

  //Loop through the properties and set the values
  for (var i_prop = 1; i_prop <= e_props.numProperties; i_prop++) {

    /** @type {Property<any>} */
    var ess_prop = /** @type {Property<any>} */ (e_props.property(i_prop));

  //  local_logs.push("Processing property '" + ess_prop.name + "' of type " + ess_prop.propertyValueType + " in " + epname);

    if (ess_prop.propertyType === PropertyType.INDEXED_GROUP || ess_prop.propertyType === PropertyType.NAMED_GROUP) {
      //This is a group, go deeper
      var group_errors = _ApplyTemplProps(layer, template, row_i, replace_orgs, /** @type {PropertyGroup} */ (e_props.property(i_prop)));
      errors = errors.concat(group_errors);
      continue;
    }

    //find the column in the template that matches the property name
    var col;
    for (var i_col = 0; i_col < template.columns.length; i_col++) {
      if (template.columns[i_col].cont_name === ess_prop.name) {
        col = template.columns[i_col];
        break;
      }
    }

    //Check if the value exists in the column
    if (col.values[row_i] === undefined) {
      errors.push({ message: "No value provided for '" + col.cont_name + "' at row " + row_i, column: i_col });
      continue;
    }

    //>>>REPLACEABLE / ALT SOURCE
    if (
      ess_prop.canSetAlternateSource &&
      ess_prop.matchName === "ADBE Layer Source Alternate"
    ) {

      if (col.values[row_i] == "") {
        errors.push({ message: "No file path provided for '" + col.cont_name + "' at row " + row_i, column: i_col });
        continue;
      }

      //Depending if we're replacing the original or the Essential Property, we compare the correct source
      /** @type {AVItem|CompItem|FootageItem|null} */
      var alt_src;
      if (replace_orgs) {
        alt_src = /** @type {AVLayer} */ (/** @type {unknown} */ (/** @type {Property<any>} */ (ess_prop.essentialPropertySource))).source;
      } else {
        alt_src = ess_prop.alternateSource;
      }

      //The current alt source is a composition,
      //check if the first layer source points to the correct file
      if (alt_src instanceof CompItem && alt_src.numLayers !== 0) {
        var alt_src_layer = alt_src.layer(1);
        if (
          alt_src_layer.source instanceof FootageItem
          && _ComparePaths(alt_src_layer.source.file, col.values[row_i])
        ) {
          //The footage item is already linked to the correct file
          continue;
        }
      }

      //It is a footage item check if it's linked to the correct file
      else if (alt_src !== null && /** @type {FootageItem} */ (alt_src).file !== null
        && _ComparePaths(/** @type {FootageItem} */ (alt_src).file, col.values[row_i])
      ) {
        //The footage item is already linked to the correct file
        continue;
      }

      try {
        var new_footage = _ResolveFootageItem(
          col.values[row_i],
          template.imported_footage_folder
        );
      } catch (e) {
        errors.push({ message: "Could not import file: " + e.message, column: i_col });
        continue;
      }

      if (replace_orgs) {
        /** @type {AVLayer} */
        var ess_prop_src = /** @type {AVLayer} */ (/** @type {unknown} */ (ess_prop.essentialPropertySource));
        ess_prop_src.replaceSource(new_footage, false);
      } else {
        var prev_alt_src = ess_prop.alternateSource;
        
        ess_prop.setAlternateSource(new_footage);

        //Cleanup the previous alt source if it was one of the dummy comps created by AE
        if(prev_alt_src!== undefined
          && prev_alt_src instanceof CompItem 
          && prev_alt_src.usedIn.length === 0
          && prev_alt_src.name.indexOf(ess_prop.name) === 0) {
          prev_alt_src.remove();
        }
      }

      continue;
    } //if replaceable

    //>>>TEXT
    else if (
      ess_prop.propertyValueType === PropertyValueType.TEXT_DOCUMENT
    ) {
      //Check if is different from the current value
      if (
        (!replace_orgs && ess_prop.value.text === col.values[row_i]) ||
        (replace_orgs &&
          /** @type {Property<any>} */ (/** @type {unknown} */ (ess_prop.essentialPropertySource)).value.text ===
          col.values[row_i])
      ) {
        continue;
      }

      if (replace_orgs)
        /** @type {Property<any>} */ (/** @type {unknown} */ (ess_prop.essentialPropertySource)).setValue(col.values[row_i]);
      else ess_prop.setValue(col.values[row_i]);
      continue;
    }

    //>>>MOGRAPH COMMENT
    else if (ess_prop.matchName === "ADBE Layer Overrides Comment") {
      continue;
    }

    //>>>COLOR / POSITION / SCALE / ROTATION
    else {
      //Check if is different from the current value
      if (
        (ess_prop.value == col.values[row_i] && !replace_orgs) ||
        (replace_orgs &&
          /** @type {Property<any>} */ (/** @type {unknown} */ (ess_prop.essentialPropertySource)).value == col.values[row_i])
      ) {
        continue;
      }

      if (replace_orgs)
        /** @type {Property<any>} */ (/** @type {unknown} */ (ess_prop.essentialPropertySource)).setValue(col.values[row_i]);
      else ess_prop.setValue(col.values[row_i]);

      continue;
    }
  }
  return errors;
}

function _ComparePaths(path1, path2) {
  try {
    // Normalize paths by converting to absolute paths
    var fl1 = path1 instanceof File ? path1 : File(path1);
    var fl2 = path2 instanceof File ? path2 : File(path2);
  } catch (e) {
    return false;
  }

  if (fl1 instanceof File && fl2 instanceof File) {
    return fl1.fullName.toLowerCase() === fl2.fullName.toLowerCase();
  } else if (fl1 instanceof Folder && fl2 instanceof Folder) {
    return fl1.fullName.toLowerCase() === fl2.fullName.toLowerCase();
  } else {
    return false;
  }
}

/**
 * Load the data of a single row in the preview composition
 *  and open it in the viewer.
 * @param {string} s_template
 * @param {number} row_i
 * @param {boolean} open_prev If true, the composition will be opened in the viewer.
 */
function PreviewRow(s_template, row_i, open_prev) {
  _EscapeArgs(arguments);
  if (open_prev === undefined) {
    open_prev = false;
  }

  /** @type {PreviewRowResult} */
  var result = { success: true };

  try {

    /** @type {TemplateData} */
    var templ = JSON.parse(s_template);

    //Find the composition referenced by the template in the project
    var templ_comp = /** @type {CompItem} */ (app.project.itemByID(templ.comp_id));

    if (templ_comp == undefined) {
      throw new Error("@PreviewRow: Template composition not found");
    }

    //The template composition will be loaded in our render comp and then we will set the values of the essential properties
    var render_comp = _SetupTemplatePreviewComp(false);

    _AdaptCompToTempl(render_comp, templ_comp);

    //The layer referencing the template composition
    var templ_layer = null;

    //If the comp already has layers, check if one of them references the template, delete the rest
    for (var i_layer = 1; i_layer <= render_comp.numLayers; i_layer++) {
      var layer = render_comp.layer(i_layer);
      if (layer.source instanceof CompItem && layer.source.id == templ.comp_id) {
        //Template layer found
        templ_layer = layer;
      } else {
        layer.remove();
      }
    }

    //If the template layer was not found, add it
    if (templ_layer === null) {
      //add the template composition to the render comp as a layer
      templ_layer = render_comp.layers.add(templ_comp);
    }

    var props_errors = _ApplyTemplProps(/** @type {AVLayer} */ (templ_layer), templ, row_i);

    //If errors while applying the properties, transfer them to the result object
    if (props_errors.length > 0) {

      result.errors = [];
      //Transfer the errors to the result object
      for (var i_err = 0; i_err < props_errors.length; i_err++) {
        result.errors.push({ message: props_errors[i_err].message, type: "property", row: row_i });
      }
    }

    if (open_prev) render_comp.openInViewer();

    return JSON.stringify(result);
  } catch (e) {
    result.success = false;
    result.error_obj = e;
    result.error_obj.source = "host.jsx @ PreviewRow";
    return JSON.stringify(result);
  }
}

/**
 * Retrieves the current values for the properties in the template composition.
 * These will be copied to a row in the client side.
 * @param {string} s_template
 */
function GetCurrentValues(s_template) {
  _EscapeArgs(arguments);
  /**
   * @type {GetCurrentValuesResults}
   */
  var result = { success: true, values: [] };

  try {
    //The template composition will be loaded in our render comp
    var render_comp = _SetupTemplatePreviewComp(false);

    /** @type {TemplateData} */
    var templ = JSON.parse(s_template);

    //Add a layer with the template composition to the render comp
    var avl_templ = null;

    //Find the layer referencing the template
    for (var i_layer = 1; i_layer <= render_comp.numLayers; i_layer++) {
      var layer = render_comp.layer(i_layer);
      if (layer.source instanceof CompItem && layer.source.id == templ.comp_id) {
        avl_templ = layer;
        break;
      }
    }

    if (avl_templ === null) {
      //TODO: create the layer
      throw new ResponseError(
        "@GetCurrentValues: Layer referencing the template not found",
        { not_found: true }
      );
    }

    //Go through the Essential Properties and extract the values
    var props = _FlattenPropertyGroup(avl_templ.essentialProperty);

    for (var i_prop = 0; i_prop < props.length; i_prop++) {
      var templ_prop = props[i_prop];
      var val;

      if (templ_prop.propertyValueType === PropertyValueType.TEXT_DOCUMENT) {
        val = templ_prop.value.text;
      } else if (templ_prop.propertyValueType !== PropertyValueType.NO_VALUE) {
        val = templ_prop.value;
      } else {
        continue;
      }

      result.values.push({ name: templ_prop.name, value: val });
    }

    return JSON.stringify(result);
  } catch (e) {
    result.success = false;
    result.error_obj = e;
    result.error_obj.source = "host.jsx @ GetCurrentValues";
    return JSON.stringify(result);
  }
}

/**
 * Flattens a property group into a list of properties, going through all the groups inside it.
 * If keep_comments is true, it will pass groups labeled as ADBE Layer Overrides Comment
 * @param {PropertyGroup} pg
 * @param {boolean} [keep_comments]
 * @returns {Property<any>[]}
 */
function _FlattenPropertyGroup(pg, keep_comments) {
  if (keep_comments === undefined) {
    keep_comments = false;
  }

  var props = [];

  for (var i_prop = 1; i_prop <= pg.numProperties; i_prop++) {
    var prop = /** @type {Property<any>} */ (pg.property(i_prop));

    if (prop.propertyType === PropertyType.INDEXED_GROUP || prop.propertyType === PropertyType.NAMED_GROUP) {

      //Comments can be used to hold arbitrary data for patterns in the client side, so we can keep them
      if (prop.matchName === "ADBE Layer Overrides Comment" && keep_comments) {
        props.push(prop);
      } else {
        //This is a group, go deeper
        var group_props = _FlattenPropertyGroup(/** @type {PropertyGroup} */ (/** @type {unknown} */ (prop)), keep_comments);
        props = props.concat(group_props);
      }
    } else {
      props.push(prop);
    }
  }

  return props;
}

/**
 * Creates a render queue item for each row in the template and starts the render queue asynchronously.
 * @param {string} str_template JSON of `TemplateData` object
 * @param {string} folder Name of the project folder to store the generated render compositions
 * @returns {string}
 */
function BatchRender(str_template, folder) {
  _EscapeArgs(arguments);

  /** @type {BatchRenderResult} */
  var result = { success: false, errors: [], row_results: [] };

  try {
    /** @type {TemplateData}*/
    var templ = JSON.parse(str_template);

    //Find the composition referenced by the template in the project
    var tmpl_comp = /** @type {CompItem} */ (app.project.itemByID(templ.comp_id));

    if (tmpl_comp == undefined)
      throw new Error("@BatchRender: Template composition not found");

    //delete all items in the render queue
    for (var i = app.project.renderQueue.numItems; i >= 1; i--) {
      app.project.renderQueue.item(i).remove();
    }

    //Loop through the rows and set the values of the template
    for (var i_row = 0; i_row < templ.columns[0].values.length; i_row++) {
      var render_comp = _CreateTemplateRenderComp(
        templ.name + "_" + i_row,
        tmpl_comp,
        i_row === 0,
        folder
      );

      try {
        //Add the template composition to the render comp as a layer
        var layer = render_comp.layers.add(tmpl_comp);

        //Set the values of the essential properties
        var p_err = _ApplyTemplProps(layer, templ, i_row);

        //Convert errors to a string
        var prop_error_str = null;
        if (p_err.length > 0) {

          prop_error_str = "";
          for (var i_err = 0; i_err < p_err.length; i_err++) {
            prop_error_str += p_err[i_err].message + " in column " + p_err[i_err].column + "; ";
          }
        }

        //Render the template
        _QueueComp(
          render_comp,
          templ.save_paths[i_row],
          templ.render_setts_templ,
          templ.render_out_module_templ
        );

        result.row_results.push({
          row: i_row,
          status: prop_error_str === null ? 'success' : 'warning',
          rendered_path: templ.save_paths[i_row],
          error: prop_error_str
        });



      } catch (e) {
        result.row_results.push({
          row: i_row,
          status: 'error',
          error: e.message
        });


        result.errors.push({ message: e.message, type: '@row', row: i_row });
      }
    } //loop template rows

    //Start the render queue
    app.project.renderQueue.renderAsync();

    result.success = true;
    return JSON.stringify(result);
  } catch (e) {
    result.success = false;
    result.error_obj = e;
    result.error_obj.source = "host.jsx @ BatchRender";
    return JSON.stringify(result);
  }
}

/**
 * Generates one composition per row in the project, populated with the template data. Does not render.
 * @param {string} str_template - Stringified JSON of `TemplateData` object
 * @returns {string} Stringified JSON of `BatchGenerateResult` object
 */
function BatchGenerate(str_template) {
  _EscapeArgs(arguments);
  /** @type {BatchGenerateResult} */
  var result = { success: false, errors: [] };

  try {
    /** @type {TemplateData}*/
    var tmpl_data = JSON.parse(str_template);

    //Find the composition referenced by the template in the project
    var templ_comp = /** @type {CompItem} */ (app.project.itemByID(tmpl_data.comp_id));

    if (templ_comp == undefined)
      throw new Error("@BatchRender: Template composition not found");

    //delete all items in the render queue
    for (var i = app.project.renderQueue.numItems; i >= 1; i--) {
      app.project.renderQueue.item(i).remove();
    }

    //Loop through the rows and set the values of the template
    for (var i_row = 0; i_row < tmpl_data.columns[0].values.length; i_row++) {
      var comp_name =
        tmpl_data.generate_names[i_row] || tmpl_data.name + "_" + i_row;

      var render_comp = _CreateTemplateRenderComp(
        comp_name,
        templ_comp,
        i_row === 0,
        tmpl_data.gen_comps_folder
      );

      try {
        //Add the template composition to the render comp as a layer
        var layer = render_comp.layers.add(templ_comp);

        //Set the values of the essential properties
        _ApplyTemplProps(layer, tmpl_data, i_row);
      } catch (e) {
        result.errors.push({ message: e.message, type: '@row', row: i_row });
      }
    } //loop template rows

    result.success = true;
    return JSON.stringify(result);
  } catch (e) {
    result.success = false;
    result.error_obj = e;
    result.error_obj.source = "host.jsx @ BatchGenerate";
    return JSON.stringify(result);
  }
}

function _QueueComp(comp, path, render_preset, output_preset) {
  _SetGlobalCurrentPath();

  //Create a new render queue item
  var rq_item = app.project.renderQueue.items.add(comp);

  //Set the output module template
  var om = rq_item.outputModule(1);
  om.applyTemplate(output_preset);

  //Set the render settings template
  rq_item.applyTemplate(render_preset);

  _CreateSubfolders(path);

  //Set the output file name
  var output_file = new File(path);
  om.file = output_file;

  //Tests to remove the frame number from the file name
  var om_setts = om.getSettings(GetSettingsFormat.STRING);

  //Todo make this configurable
  if (
    om_setts["Format"].search(/Sequence/gm) !== -1 &&
    om_setts["Output File Info"]["File Template"].search(/\[\#*\]/gm) === -1
  ) {
    var new_setts = {
      "Output File Info": {
        "Base Path": om_setts["Output File Info"]["Base Path"],
        "File Template": output_file.displayName + "_[#].[fileExtension]",
      },
    };

    om.setSettings(new_setts);
  }
  return rq_item;
}

function _ClearRenderQueue() {
  //delete all items in the render queue
  for (var i = app.project.renderQueue.numItems; i >= 1; i--) {
    app.project.renderQueue.item(i).remove();
  }
}

/**
 * Retrieves the available render settings and output module templates from After Effects.
 * Temporarily adds a dummy item to the render queue in order to read the template lists.
 * @returns {string} Stringified JSON of `RenderSettsResults` object
 */
function GetRenderTemplates() {
  //Per the documentation we can only gather the templates once an item is in the render queue

  /**@type {RenderSettsResults}*/
  var result = {};

  result.default_output_module_templ = 0;
  result.default_render_templ = 0;

  try {
    //Setup the render the render composition and send it to the render queue
    var render_comp = _SetupTemplatePreviewComp();
    var rq_item = app.project.renderQueue.items.add(render_comp);
    result.render_templs = rq_item.templates;
    result.output_modules_templs = rq_item.outputModule(1).templates;

    //Delete the render queue item
    rq_item.remove();

    // Default OM Index
    for (var i = 28; i <= 60; i++) {
      if (app.preferences.havePref("Output Module Preference Section v" + i, "Default OM Index", PREFType.PREF_Type_MACHINE_INDEPENDENT_OUTPUT)) {
        result.default_output_module_templ =
          app.preferences.getPrefAsLong("Output Module Preference Section v" + i, "Default OM Index", PREFType.PREF_Type_MACHINE_INDEPENDENT_OUTPUT);
        break;
      }
    }

    // Default RS Index
    for (var i = 70; i <= 90; i++) {
      if (app.preferences.havePref("Render Settings Preference Section v" + i + " ", "Default RS Index", PREFType.PREF_Type_MACHINE_INDEPENDENT_RENDER)) {
        result.default_render_templ =
          app.preferences.getPrefAsLong("Render Settings Preference Section v" + i + " ", "Default RS Index", PREFType.PREF_Type_MACHINE_INDEPENDENT_RENDER);
        break;
      }
    }

    result.success = true;
  } catch (e) {
    result.success = false;
    result.error_obj = e;
    result.error_obj.source = "host.jsx @ GetRenderTemplates";
  }

  return JSON.stringify(result);
}

function PickColorFromPreview(startValue) {
  _EscapeArgs(arguments);
  if (!startValue || startValue.length != 3) {
    startValue = [1, 1, 1]; // default value
  }

  var prev_comp = _SetupTemplatePreviewComp(false);

  prev_comp.openInViewer();

  //add a null
  var null_layer = prev_comp.layers.addNull();

  var cc = /** @type {PropertyGroup} */ (null_layer
    .property("ADBE Effect Parade"))
    .addProperty("ADBE Color Control");
  var color_prop = /** @type {Property<any>} */ (cc.property("ADBE Color Control-0001"));

  color_prop.setValue(startValue);
  color_prop.selected = true;

  app.executeCommand(2240); // Edit the color value, therefore show the color picker
  var res_value = color_prop.value;
  null_layer.remove();

  return JSON.stringify(res_value);
}

function _SetGlobalCurrentPath() {
  if (app.project.file !== null) {
    Folder.current = new Folder(app.project.file.path);
  }
}

function GetRelativeFolderPath(path) {
  _EscapeArgs(arguments);
  var folder = new Folder(path);
  if (folder.exists) {
    if (app.project.file !== null) {
      var base_path = app.project.file.path;
      return folder.getRelativeURI(base_path);
    } else {
      return folder.fsName;
    }
  }
  return null;
}

function GetRelativeFilePath(path) {
  _EscapeArgs(arguments);
  var file = new File(path);
  if (file.exists) {
    if (app.project.file !== null) {
      var base_path = app.project.file.path;
      return file.getRelativeURI(base_path);
    } else {
      return file.fsName;
    }
  }
  return null;
}

function SelectFolder(default_path) {
  _EscapeArgs(arguments);
  var folder;

  //Setup the default path for the folder selection dialog
  if (default_path === undefined && app.project.file === null) {
    default_path = Folder.desktop.path;
  } else if (!Folder(default_path).exists) {
    default_path = app.project.file.path;
  }

  folder = new Folder(default_path);
  folder = folder.selectDlg();

  if (folder != null) {
    if (app.project.file !== null) {
      var base_path = app.project.file.path;
      return folder.getRelativeURI(base_path);
    } else {
      return folder.fsName;
    }
  }
  return null;
}

/**Generic file import, returns an URI encoded string */
function ImportFile(filter) {
  _EscapeArgs(arguments);
  if (filter === undefined) {
    filter = "*.*";
  }

  var file = /** @type {File} */ (File.openDialog("Select a file", filter));

  file.open("r");
  var content = file.read();
  file.close();

  return encodeURIComponent(content);
}

function ExportFile(content, filters) {
  _EscapeArgs(arguments);

  if (filters === undefined) {
    filters = "All Files: *.*";
  }

  var file = File.saveDialog("Save a file", filters);
  file.open("w");
  file.write(content);
  file.close();
}

/**
 * Creates the subfolders needed to save the file at te given path.
 * @param {string} path
 */
function _CreateSubfolders(path) {
  _EscapeArgs(arguments);
  //remove the file name from the path
  var folder_path = path.substring(0, path.lastIndexOf("/"));

  //Make sure the directory exists
  var folder = new Folder(folder_path);
  if (!folder.exists) {
    if (!folder.create()) {
      if (folder.error !== null) throw new Error(folder.error);
      else
        throw new Error(
          "@_CreateSubfolders: Could not create folder at path: " + path
        );
    }
  }
}

///DEPENDANT COMPOSITIONS///

/** @type {BatchRenderResult} */
var dep_result;

/** @type {{rqi: RenderQueueItem, row_result: RowRenderResult}[]} */
var queued_items;

/**
 * Renders all dependent compositions for each row in the template (One-to-Many mode).
 * Renders synchronously, blocking the AE UI until complete.
 * @param {string} str_template - Stringified JSON of `TemplateData` object
 * @returns {string} Stringified JSON of `BatchRenderResult` object
 */
function BatchRenderDepComps(str_template) {
  _EscapeArgs(arguments);

  dep_result = { success: false, row_results: [] };
  queued_items = [];

  try {
    _SetGlobalCurrentPath();

    /** @type {TemplateData} */
    var tmpl = JSON.parse(str_template);

    //Add the template composition to the render comp as a layer
    //to get essential properties and though those access the original properties
    var prev_comp = _SetupTemplatePreviewComp(true);

    //Find the composition referenced by the template in the project
    var templ_comp = /** @type {CompItem} */ (app.project.itemByID(tmpl.comp_id));

    if (templ_comp === undefined)
      throw new Error("@BatchRender: Template composition not found");

    //Add the template composition to the render comp as a layer to find the essential properties
    var props_layer = prev_comp.layers.add(templ_comp);

    //Clean the render queue
    for (var i = app.project.renderQueue.numItems; i >= 1; i--) {
      app.project.renderQueue.item(i).remove();
    }

    // Start rendering the dependent compositions
    RenderDeps(tmpl, props_layer);

    dep_result.success = true;
    return JSON.stringify(dep_result);
  } catch (e) {
    dep_result.success = false;
    dep_result.error_obj = e;
    dep_result.error_obj.source = "host.jsx @ BatchRenderDepComps";
    return JSON.stringify(dep_result);
  }
}


/**
 * Renders the dependent compositions
 * @param {TemplateData} tmpl
 */
function RenderDeps(tmpl, props_layer) {

  //Loop through the rows and set the values of the template
  for (var dep_render_row = 0; dep_render_row < tmpl.columns[0].values.length; dep_render_row++) {

    try {
      var p_err = _ApplyTemplProps(props_layer, tmpl, dep_render_row, true);

      //Convert errors to a string
      var prop_error_str = null;
      if (p_err.length > 0) {

        prop_error_str = "";
        for (var i_err = 0; i_err < p_err.length; i_err++) {
          prop_error_str += p_err[i_err].message + " in column " + p_err[i_err].column + "; ";
        }
      }

      //Add the dependent compositions to the render queue
      for (var i = 0; i < tmpl.dep_comps.length; i++) {

        if (ShouldCancelRenderDeps()) {
          dep_result.user_stopped = true;
          return;
        }

        //Find the configuration of the dep composition to get the render settin  gs and the path
        /**@type {DepCompSetts} */
        var dep_config = tmpl.dep_config[tmpl.dep_comps[i].id];

        //If disabled, skip
        if (!dep_config.enabled) continue;

        var dep_comp = /** @type {CompItem} */ (app.project.itemByID(tmpl.dep_comps[i].id));

        /** @type {RowRenderResult} */
        var row_result;

        //Check if the render is a single frame
        if (dep_config.render_out_module_templ === "EB_Single_Frame_PNG") {
          _CreateSubfolders(dep_config.save_paths[dep_render_row]);
          var file = new File(dep_config.save_paths[dep_render_row] + ".png");
          dep_comp.saveFrameToPng(0, file);

          row_result = {
            row: dep_render_row,
            status: prop_error_str === null ? 'success' : 'warning',
            rendered_path: file.fsName,
            error: prop_error_str
          };

        } else {
          var rq_item = _QueueComp(
            dep_comp,
            dep_config.save_paths[dep_render_row],
            dep_config.render_setts_templ,
            dep_config.render_out_module_templ
          );

          /** @type {RowRenderResult} */
          row_result = {
            row: dep_render_row,
            status: prop_error_str === null ? 'success' : 'warning',
            rendered_path: dep_config.save_paths[dep_render_row],
            error: prop_error_str
          };
        }

        queued_items.push({
          rqi: rq_item,
          row_result: row_result
        });

        //Store result for UI
        dep_result.row_results.push(row_result);

      }//Loop dep comps

    } catch (e) {
      dep_result.row_results.push({
        row: dep_render_row,
        status: 'error',
        error: e.message
      });
    }

    if (app.project.renderQueue.numItems > 0) app.project.renderQueue.render();
  } //loop template rows
}

/**
 * Checks if any of the queued render items has been stopped by the user,
 * in which case the whole process should be stopped to avoid rendering unwanted files.
 * @returns {boolean}
 */
function ShouldCancelRenderDeps() {
  for (var i = 0; i < queued_items.length; i++) {
    if (queued_items[i].rqi !== undefined 
      && queued_items[i].rqi.status === RQItemStatus.USER_STOPPED) {
      queued_items[i].row_result.status = 'stopped';
      queued_items[i].row_result.error = 'Render stopped by user';
      queued_items = [];
      return true;
    }
  }
  return false;
}

////////////
//POLYFILLS
////////////

Object.create = function (o) {
  function F() { }
  F.prototype = o;
  return new F();
};
function extend(Child, Parent) {
  Child.prototype = Object.create(Parent.prototype);
  Child.prototype.constructor = Child;
}

var ResponseError = function (message, reasons) {
  this.reasons = reasons;
  Error.call(this, message);
};
extend(ResponseError, Error); // B inherits A's prototype

// polyfill for replaceAll
String.prototype.replaceAll = function (target, replacement) {
  return this.split(target).join(replacement);
};


/////////
//UTILS
/////////

/**Escapes string arguments that are URI encoded */
function _EscapeArgs(args) {
  if (!args || args.length === 0) return;

  for (var i = 0; i < args.length; i++) {
    if (typeof args[i] === 'string') {
      args[i] = decodeURIComponent(args[i]);
    }
  }
}

function _EscapeJSON(str) {
  return str.replaceAll(/\r?\n|\r/g, "\\n").replaceAll(/\\/g, "\\\\");
}

function _DumpLogs(erase) {
  for (var i = 0; i < local_logs.length; i++) {
    writeLn(local_logs[i]);
  }
  if (erase===undefined || erase) local_logs = [];
}

_SetGlobalCurrentPath();

//////////
//TESTING
//////////

/**
 * Testing function: Finds the "Control" layer inside the "MasterOtM" composition,
 * locates an effect called "Additional Property", and adds it to the
 * Essential Graphics panel with the name "Other Prop".
 * @returns {string} Stringified JSON result object
 */
function Test_AddPropToEGP() {
  /** @type {{ success: boolean, error_obj?: any }} */
  var result = { success: false };

  try {
    // 1. Find the "MasterOtM" composition in the project
    /** @type {CompItem|undefined} */
    var master_comp;
    for (var i = 1; i <= app.project.numItems; i++) {
      var item = app.project.item(i);
      if (item instanceof CompItem && item.name === "MasterOtM") {
        master_comp = item;
        break;
      }
    }
    if (master_comp === undefined) {
      throw new Error("@Test_AddPropToEGP: Composition 'MasterOtM' not found");
    }

    // 2. Find the layer called "Controls" inside MasterOtM
    /** @type {AVLayer|undefined} */
    var control_layer;
    for (var i = 1; i <= master_comp.numLayers; i++) {
      var layer = master_comp.layer(i);
      if (layer.name === "Controls") {
        control_layer = /** @type {AVLayer} */ (layer);
        break;
      }
    }
    if (control_layer === undefined) {
      throw new Error("@Test_AddPropToEGP: Layer 'Control' not found in 'MasterOtM'");
    }

    // 3. Find the effect called "Additional Property" on the Control layer
    var effects = /** @type {PropertyGroup} */ (control_layer.property("ADBE Effect Parade"));
    if (effects === null || effects === undefined) {
      throw new Error("@Test_AddPropToEGP: No effects found on layer 'Control'");
    }

    /** @type {PropertyGroup|undefined} */
    var target_effect;
    for (var i = 1; i <= effects.numProperties; i++) {
      var effect = effects.property(i);
      if (effect.name === "Additional Property") {
        target_effect = /** @type {PropertyGroup} */ (effect);
        break;
      }
    }
    if (target_effect === undefined) {
      throw new Error("@Test_AddPropToEGP: Effect 'Additional Property' not found on layer 'Control'");
    }

    // 4. Add the effect property to the Essential Graphics panel with the name "Other Prop"
    var added = /** @type {Property<any>} */ (target_effect.property(1)).addToMotionGraphicsTemplateAs(master_comp, "Other Prop");

    result.success = true;
    return JSON.stringify(result);
  } catch (e) {
    result.success = false;
    result.error_obj = e;
    result.error_obj.source = "host.jsx @ Test_AddPropToEGP";
    return JSON.stringify(result);
  }
}

Test_AddPropToEGP();



