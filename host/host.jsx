/**
This is a CEP extension for After Effects that provides automation tools for mograph templates.
The user can either use a table or an external CSV file to populate the After Effects composition that makes the template.

This file is the CEP side of the app. The javascript app will make requests through window.__adobe_cep__.evalScript and those requests will be received in this file.

Internal use functions are prefixed with an underscore `_`.
*/

//@include "json2.js"
//script EasyBatch

/**
 * @typedef {import('../src/lib/Settings').Settings} Settings
 * @typedef {import('../src/lib/Settings').Template} Template
 * @typedef {import('../src/lib/Settings').Column} Column
 * @typedef {import('../src/lib/Settings').Comp} Comp
 * @typedef {import('../src/lib/Settings').DepCompSetts} DepCompSetts
 * @typedef {import('../src/lib/Messaging').GetSettsResult} GetSettsResult
 * @typedef {import('../src/lib/Messaging').GetAllCompsResult} GetAllCompsResult
 * @typedef {import('../src/lib/Messaging').SaveSettingsResults} SaveSettingsResults
 * @typedef {import('../src/lib/Messaging').BatchRenderResult} BatchRenderResult
 * @typedef {import('../src/lib/Messaging').RenderSettsResults} RenderSettsResults
 * @typedef {import('../src/lib/Messaging').BatchGenerateResult} BatchGenerateResult
 * @typedef {import('../src/lib/Messaging').GetCurrentValuesResults} GetCurrentValuesResults
 * @typedef {import('../src/lib/Messaging').GetTmplsResult} GetTmplsResult
 * @typedef {import('../src/lib/Messaging').PreviewRowResult} PreviewRowResult
 * @typedef {import('../src/lib/Messaging').SaveSettsRequest} SaveSettsRequest
 * @typedef {import('../src/lib/Messaging').IsSameProjectResult} IsSameProjectResult
 */

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
   * @type {Template[]}}
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
         * @type {Column[]}}
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
        var e_props = av_templ_comp.essentialProperty;

        //Loop through the properties and extract the name and type
        for (var i_prop = 1; i_prop <= e_props.numProperties; i_prop++) {
          var templ_prop = e_props.property(i_prop);

          if (templ_prop.isDropdownEffect) {
            //todo: handle dropdowns
            // var org_prop = templ_prop.essentialPropertySource.parentProperty.property(2);
            // var dummy = 5;
          }

          var val =
            templ_prop.propertyValueType === PropertyValueType.NO_VALUE
              ? ""
              : templ_prop.value;
          var t_type = templ_prop.propertyValueType;

          //Check if the property is a replaceable and change the type so the client handles it correctly
          if (
            templ_prop.canSetAlternateSource &&
            templ_prop.matchName === "ADBE Layer Source Alternate"
          ) {
            t_type = 9001;
          }

          //Check if the property is a text document and extract the text
          else if (
            templ_prop.propertyValueType === PropertyValueType.TEXT_DOCUMENT
          ) {
            val = val.text;
          }

          cols.push({
            cont_name: templ_prop.name,
            type: t_type,
            values: [val],
          });
        }

        //Finally check if the composition is included in other compositions
        //var deps = _GetDependentComps(templ_comp);

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
    result.error_obj.source = "index.jsx @ GetTemplates";
    return JSON.stringify(result);
  }
}

/**
 * Checks if the given composition is included on other compositions
 * @returns {DependentComps}
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
 * @param {string} used_in_id - The ID of the composition used to for the is_dependent parameter. Determines if the composition passed is included in the returned compositions.
 * //todo: implement used_in_id
 */
function GetAllComps(used_in_id) {
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
    result.error_obj.source = "index.jsx @ GetAllComps";
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
    var xmp = XMPMeta.getNamespaceURI("xmp");

    var prop = mdata.getProperty(xmp, "AUTOMATOR_DATA", XMPConst.STRING);

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
    var xmp = XMPMeta.getNamespaceURI("xmp");

    var prop = mdata.getProperty(xmp, "AUTOMATOR_DATA", XMPConst.STRING);

    if (prop === undefined || prop.value === undefined) {
      not_found = true;
      throw new ResponseError("No settings found in the project", {
        not_found: true,
      });
    }

    var data = prop.value;

    /**@type {Settings} */
    var setts = JSON.parse(data);
    return setts.id;
  } catch (e) {
    return null;
  }
}

function LoadSettings() {
  /**@type {GetSettsResult} */

  var result = {};

  try {
    // load the XMPlibrary as an ExtendScript ExternalObject
    if (ExternalObject.AdobeXMPScript === undefined) {
      ExternalObject.AdobeXMPScript = new ExternalObject("lib:AdobeXMPScript");
    }
    var mdata = new XMPMeta(app.project.xmpPacket); //get the project's XMPmetadata
    var xmp = XMPMeta.getNamespaceURI("xmp");

    var prop = mdata.getProperty(xmp, "AUTOMATOR_DATA", XMPConst.STRING);

    if (prop === undefined || prop.value === undefined) {
      not_found = true;
      throw new ResponseError("No settings found in the project", {
        not_found: true,
      });
    }

    var data = prop.value;

    result.setts = JSON.parse(data);

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
    result.error_obj.source = "index.jsx @ LoadSettings";
  }

  return JSON.stringify(result);
}

function SaveSettings(s_request) {
  _EscapeArgs(arguments);

  /**@type {SaveSettingsResults} */
  var response = {};
  try {
    // load the XMPlibrary as an ExtendScript ExternalObject

    /** @type {SaveSettsRequest}*/
    var request = JSON.parse(s_request);

    var str_setts = JSON.stringify(request.setts);

    //If this is the default project, we will not save the settings
    if (!_HasTemplates()) {
      throw new ResponseError("No templates found in the project", {
        no_templates: true,
      });
    }

    var setts_id = _SettingsId();

    if (!request.is_new && setts_id !== null && setts_id !== request.setts.id) {
      throw new ResponseError(
        "The settings in the project have a different ID",
        {
          id_mismatch: true,
        }
      );
    }

    if (ExternalObject.AdobeXMPScript === undefined) {
      ExternalObject.AdobeXMPScript = new ExternalObject("lib:AdobeXMPScript");
    }
    var mdata = new XMPMeta(app.project.xmpPacket); //get the project's XMPmetadata
    var xmp = XMPMeta.getNamespaceURI("xmp");

    mdata.setProperty(xmp, "AUTOMATOR_DATA", str_setts, 0, XMPConst.STRING);
    var serialized = mdata.serialize();
    app.project.xmpPacket = serialized;

    response.success = true;
  } catch (e) {
    response.success = false;
    response.error_obj = e;
    response.error_obj.source = "index.jsx @ SaveSettings";
  }

  return JSON.stringify(response);
}

function IsSameProject(proj_id) {
  _EscapeArgs(arguments);
  /**@type {IsSameProjectResult} */
  var response = { success: true };
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
    response.error_obj.source = "index.jsx @ IsSameProject";
    return JSON.stringify(response);
  }
}

function _SetupTemplatePreviewComp(remove_layers) {
  if (remove_layers === undefined) {
    remove_layers = true;
  }

  //Check if the composition already exists
  for (var i_items = 1; i_items <= app.project.numItems; i_items++) {
    var comp = app.project.item(i_items);
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
  var comp = app.project.items.addComp(
    "TemplatePreview",
    1920,
    1080,
    1,
    10,
    30
  );

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
  var import_file = new File(path.replaceAll("\\\\", "/").replaceAll("<b>", "").replaceAll("</b>", ""));

  var repl_f_item;
  for (var i_items = 1; i_items <= app.project.numItems; i_items++) {
    var proj_item = app.project.item(i_items);
    if (proj_item instanceof FootageItem
      && proj_item.file !== null
      && proj_item.file.fullName.toLowerCase() == import_file.fullName.toLowerCase()) {
      return proj_item;
    }
  }

  if (repl_f_item === undefined) {
    //Import the file

    var import_opt = new ImportOptions(import_file);
    repl_f_item = app.project.importFile(import_opt);
    repl_f_item.parentFolder = folder;
  }

  return repl_f_item;
}

/**
 * Replaces the values in the Essential Properties of a layer
 * with the values on the corresponding row of the template.
 * @param {*} layer
 * @param {Template} template
 * @param {number} row_i
 * @param {boolean} replace_orgs Instead of replacing the values of the Ess. Props. in the layer, will replace the values of the original properties in the master composition.
 * @returns {errors[]{message: string, column: number}} List of errors found during the process
 */
function _ApplyTemplProps(layer, template, row_i, replace_orgs) {
  if (replace_orgs === undefined) {
    replace_orgs = false;
  }

  var errors = [];

  //Access the Essential Properties of the layer
  var e_props = layer.essentialProperty;

  //Loop through the properties and set the values
  for (var i_prop = 1; i_prop <= e_props.numProperties; i_prop++) {
    var ess_prop = e_props.property(i_prop);

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

    //REPLACEABLE / ALT SOURCE
    if (
      ess_prop.canSetAlternateSource &&
      ess_prop.matchName === "ADBE Layer Source Alternate"
    ) {

      if (col.values[row_i] == "") {
        errors.push({ message: "No file path provided for '" + col.cont_name + "' at row " + row_i, column: i_col });
        continue;
      }

      //Depending if we're replacing the original or the Essential Property, we compare the correct source
      if (replace_orgs) {
        var alt_src = ess_prop.essentialPropertySource.source;
      } else {
        var alt_src = ess_prop.alternateSource;
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
      else if (alt_src !== null && alt_src.source instanceof FootageItem
        && _ComparePaths(alt_src.source.file, col.values[row_i])
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
        ess_prop.essentialPropertySource.replaceSource(new_footage, false);
      } else {
        ess_prop.setAlternateSource(new_footage);
      }


      continue;
    } //if replaceable

    //TEXT
    else if (
      ess_prop.propertyValueType === PropertyValueType.TEXT_DOCUMENT
    ) {
      //Check if is different from the current value
      if (
        (!replace_orgs && ess_prop.value.text === col.values[row_i]) ||
        (replace_orgs &&
          ess_prop.essentialPropertySource.value.text ===
          col.values[row_i])
      ) {
        continue;
      }

      if (replace_orgs)
        ess_prop.essentialPropertySource.setValue(col.values[row_i]);
      else ess_prop.setValue(col.values[row_i]);

      continue;
    }

    //MOGRAPH COMMENT
    else if (ess_prop.matchName === "ADBE Layer Overrides Comment") {
      continue;
    }

    //COLOR / POSITION / SCALE / ROTATION
    else {
      //Check if is different from the current value
      if (
        (ess_prop.value == col.values[row_i] && !replace_orgs) ||
        (replace_orgs &&
          ess_prop.essentialPropertySource.value == col.values[row_i])
      ) {
        continue;
      }

      if (replace_orgs)
        ess_prop.essentialPropertySource.setValue(col.values[row_i]);
      else ess_prop.setValue(col.values[row_i]);

      continue;
    }
  }


  return { errors: errors };
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
 */
function PreviewRow(s_template, row_i, is_auto_prev) {
  _EscapeArgs(arguments);
  if (is_auto_prev === undefined) {
    is_auto_prev = false;
  }

  /** @type {PreviewRowResult} */
  var result = { success: true };

  try {

    /** @type {Template} */
    var templ = JSON.parse(s_template);

    //Find the composition referenced by the template in the project
    var templ_comp = app.project.itemByID(templ.comp_id);

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

    var props_res = _ApplyTemplProps(templ_layer, templ, row_i);

    //If errors while applying the properties, transfer them to the result object
    if (props_res.errors.length > 0) {

      result.errors = [];
      //Transfer the errors to the result object
      for (var i_err = 0; i_err < props_res.errors.length; i_err++) {
        result.errors.push({ message: props_res.errors[i_err].message, type: "property", row: row_i });
      }
    }

    if (!is_auto_prev) render_comp.openInViewer();

    return JSON.stringify(result);
  } catch (e) {
    result.success = false;
    result.error_obj = e;
    result.error_obj.source = "index.jsx @ PreviewRow";
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

    /** @type {Template} */
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
    var e_props = avl_templ.essentialProperty;

    for (var i_prop = 1; i_prop <= e_props.numProperties; i_prop++) {
      var templ_prop = e_props.property(i_prop);
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
    result.error_obj.source = "index.jsx @ GetCurrentValues";
    return JSON.stringify(result);
  }
}


function BatchRender(str_template, folder) {
  _EscapeArgs(arguments);

  /** @type {BatchRenderResult} */
  var result = { errors: [], row_results: [] };

  try {
    /** @type {Template}*/
    var templ = JSON.parse(str_template);

    //Find the composition referenced by the template in the project
    var tmpl_comp = app.project.itemByID(templ.comp_id);

    if (tmpl_comp == undefined)
      throw new Error("@BatchRender: Template composition not found");

    //delete all items in the render queue
    for (var i = app.project.renderQueue.numItems; i >= 1; i--) {
      app.project.renderQueue.item(i).remove();
    }

    //Loop through the rows and set the values of the template
    for (var i_row = 0; i_row < templ.rows.length; i_row++) {
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
        var p_err = _ApplyTemplProps(layer, templ, i_row).errors;

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
          error_message: e.message
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
    result.error_obj.source = "index.jsx @ BatchRender";
    return JSON.stringify(result);
  }
}

function BatchGenerate(str_template) {
  _EscapeArgs(arguments);
  /** @type {BatchGenerateResult} */
  var result = { errors: [] };

  try {
    /** @type {Template}*/
    var tmpl_data = JSON.parse(str_template);

    //Find the composition referenced by the template in the project
    var templ_comp = app.project.itemByID(tmpl_data.comp_id);

    if (templ_comp == undefined)
      throw new Error("@BatchRender: Template composition not found");

    //delete all items in the render queue
    for (var i = app.project.renderQueue.numItems; i >= 1; i--) {
      app.project.renderQueue.item(i).remove();
    }

    //Loop through the rows and set the values of the template
    for (var i_row = 0; i_row < tmpl_data.rows.length; i_row++) {
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
        result.errors.push({ message: e.message, row: i_row });
      }
    } //loop template rows

    result.success = true;
    return JSON.stringify(result);
  } catch (e) {
    result.success = false;
    result.error_obj = e;
    result.error_obj.source = "index.jsx @ BatchGenerate";
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
    result.error_obj.source = "index.jsx @ GetRenderTemplates";
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

  var cc = null_layer
    .property("ADBE Effect Parade")
    .addProperty("ADBE Color Control");
  var color_prop = cc.property("ADBE Color Control-0001");

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

  var file = File.openDialog("Select a file", filter);

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

function BatchRenderDepComps(str_template) {
  _EscapeArgs(arguments);

  dep_result = { success: false, row_results: [] };

  try {

    _SetGlobalCurrentPath();

    /** @type {Template} */
    var tmpl = JSON.parse(str_template);

    //Add the template composition to the render comp as a layer
    //to get essential properties and though those access the original properties
    var prev_comp = _SetupTemplatePreviewComp(true);

    //Find the composition referenced by the template in the project
    var templ_comp = app.project.itemByID(tmpl.comp_id);

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
    dep_result.error_obj.source = "index.jsx @ BatchRenderDepComps";
    return JSON.stringify(dep_result);
  }
}


/**
 * Renders the dependent compositions
 * @param {Template} tmpl
 */
function RenderDeps(tmpl, props_layer) {

  //Loop through the rows and set the values of the template
  for (var dep_render_row = 0; dep_render_row < tmpl.rows.length; dep_render_row++) {

    try {
      var p_err = _ApplyTemplProps(props_layer, tmpl, dep_render_row, true).errors;

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

        //Find the configuration of the dep composition to get the render settings and the path
        /**@type {DepCompSetts} */
        var dep_config = tmpl.dep_config[tmpl.dep_comps[i].id];

        var dep_comp = app.project.itemByID(tmpl.dep_comps[i].id);

        //Check if the render is a single frame
        if (dep_config.single_frame) {
          _CreateSubfolders(dep_config.save_paths[dep_render_row]);
          var file = new File(dep_config.save_paths[dep_render_row] + ".png");
          dep_comp.saveFrameToPng(0, file);

          //Log the result
          dep_result.row_results.push({
            row: dep_render_row,
            status: prop_error_str === null ? 'success' : 'warning',
            rendered_path: file.fsName,
            error: prop_error_str
          });

        } else {
          var rq_item = _QueueComp(
            dep_comp,
            dep_config.save_paths[dep_render_row],
            dep_config.render_setts_templ,
            dep_config.render_out_module_templ
          );

          //Log the result
          dep_result.row_results.push({
            row: dep_render_row,
            status: prop_error_str === null ? 'success' : 'warning',
            rendered_path: dep_config.save_paths[dep_render_row],
            error: prop_error_str
          });
        }
      }

    } catch (e) {
      dep_result.row_results.push({
        row: dep_render_row,
        status: 'error',
        message: e.message
      });
    }

    if (app.project.renderQueue.numItems > 0) app.project.renderQueue.render();
  }
}

// POLYFILLS //
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

// UTILS //
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

_SetGlobalCurrentPath();