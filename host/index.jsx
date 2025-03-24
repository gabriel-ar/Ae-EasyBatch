/**
This is a CEP extension for After Effects that provides automation tools for mograph templates.
The user can either use a table or an external CSV file to populate the template. 
Each row in the table or CSV file will be used to populate a single instance of the template.

This file is the CEP side of the app. The javascript app will make requests through window.__adobe_cep__.evalScript and those requests will be received in this file.
*/

//Load JSON
//@include "json2.js";

//BatchRender(test_render_order);
//SaveSettings('{"templates":[],"cloned":false}');
//LoadSettings();
//GetTemplates();
//ExtractPropTypesNames();
//GatherRenderTemplates();
//PreviewRow(test_prev_template, 0);

//ImportFile();

//_ImportFootageItem(test_repleaceable_import);

//var result = $.colorPicker(-1);

/**
 * @typedef {import('../src/lib/AutomatorTypes.svelte.js').Settings} Settings
 * @typedef {import('../src/lib/AutomatorTypes.svelte.js').Template} Template
 * @typedef {import('../src/lib/AutomatorTypes.svelte.js').Column} Column
 * @typedef {import('../src/lib/Messaging.mjs').GetSettsResult} GetSettsResult
 * @typedef {import('../src/lib/Messaging.mjs').SaveSettingsResults} SaveSettingsResults
 * @typedef {import('../src/lib/Messaging.mjs').BatchRenderResult} BatchRenderResult
 * @typedef {import('../src/lib/Messaging.mjs').RenderSettsResults} RenderSettsResults
 * @typedef {import('../src/lib/Messaging.mjs').BatchGenerateResult} BatchGenerateResult
 * @typedef {import('../src/lib/Messaging.mjs').GetCurrentValuesResults} GetCurrentValuesResults
 * @typedef {import('../src/lib/Messaging.mjs').GetTmplsResult} GetTmplsResult
 * @typedef {import('../src/lib/Messaging.mjs').PreviewRowResult} PreviewRowResult
 * @typedef {import('../src/lib/Messaging.mjs').SaveSettsRequest} SaveSettsRequest
 * @typedef {import('../src/lib/Messaging.mjs').IsSameProjectResult} IsSameProjectResult
 *
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
   * @type {Template}}
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

          //Check if the property is a replaceble and change the type so the client handles it correctly
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

        out_tmpls.push({
          comp: templ_comp.name,
          name: templ_comp.motionGraphicsTemplateName,
          columns: cols,
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
  } catch (e) {
    result.success = false;
    result.error_obj = e;
    result.error_obj.source = "index.jsx @ LoadSettings";
  }

  return JSON.stringify(result);
}

function SaveSettings(s_request) {
  //Escape new lines
  var s_request = s_request.replaceAll(/\r?\n|\r/g, "\\n");

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

/**
 * Creates a composition to be used to render a row of the template.
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

  if (folder == undefined) {
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
  comp.parentFolder = folder;

  return comp;
}

function _AdaptCompToTempl(render_comp, templ_comp) {
  //Set the composition so it has the same duration and size as the template
  render_comp.duration = templ_comp.duration;
  render_comp.width = templ_comp.width;
  render_comp.height = templ_comp.height;
  render_comp.pixelAspect = templ_comp.pixelAspect;
  render_comp.frameRate = templ_comp.frameRate;
  render_comp.workAreaStart = 0;
  render_comp.workAreaDuration = render_comp.duration;
}

/**
 * Load the data of a single row in the preview composition
 *  and open it in the viewer.
 * @param {string} s_template
 * @param {number} row_i
 */
function PreviewRow(s_template, row_i, is_auto_prev) {
  var s_template = s_template.replaceAll(/\r?\n|\r/g, "\\n");
  if (is_auto_prev === undefined) {
    is_auto_prev = false;
  }

  /** @type {PreviewRowResult} */
  var result = { success: true };

  try {
    //The template composition will be loaded in our render comp and then we will set the values of the essential properties
    var render_comp = _SetupTemplatePreviewComp(false);

    /** @type {Template} */
    var templ = JSON.parse(s_template);

    //Find the composition referenced by the template in the project
    var templ_comp;
    for (var i_items = 1; i_items <= app.project.numItems; i_items++) {
      var item = app.project.item(i_items);
      if (item instanceof CompItem && item.name == templ.comp) {
        templ_comp = item;
        break;
      }
    }

    if (templ_comp == undefined) {
      throw new Error("@PreviewRow: Template composition not found");
    }

    //Check if the preview composition has a layer referenceing the template
    //Otherwise add it and adapt the properties

    for (var i_layer = 1; i_layer <= render_comp.numLayers; i_layer++) {
      var layer = render_comp.layer(i_layer);
      if (layer.source instanceof CompItem && layer.source.name == templ.comp) {
        //Template layer found, apply the properties and open in viewer
        _ApplyTemplProps(layer, templ, row_i);
        if (!is_auto_prev) render_comp.openInViewer();

        return JSON.stringify(result);
      } else {
        layer.remove();
      }
    }

    _AdaptCompToTempl(render_comp, templ_comp);

    //add the template composition to the render comp as a layer
    var avl_templ = render_comp.layers.add(templ_comp);

    _ApplyTemplProps(avl_templ, templ, row_i);

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
      if (layer.source instanceof CompItem && layer.source.name == templ.comp) {
        avl_templ = layer;
        break;
      }
    }

    if (avl_templ === null) {
      //TODO: create the layer
      throw new ResponseError(
        "@GetCurrentValues: Layer referencing the tamplate not found",
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

/**
 * Replce the values in the Essential Properties of a layer
 * with the values in the corresponding row of the template.
 * @param {*} layer
 * @param {Template} template
 * @param {number} row_i
 */
function _ApplyTemplProps(layer, template, row_i) {
  //Access the Essential Properties of the layer and chance the values to the template data
  var e_props = layer.essentialProperty;

  //Loop through the properties and set the values
  for (var i_prop = 1; i_prop <= e_props.numProperties; i_prop++) {
    var templ_prop = e_props.property(i_prop);

    //find the column that matches the prop name
    for (var i_col = 0; i_col < template.columns.length; i_col++) {
      var col = template.columns[i_col];
      if (col.cont_name == templ_prop.name) {
        //set the value of the prop to the first value in the column

        //Replaceable/Alt Source
        if (
          templ_prop.canSetAlternateSource &&
          templ_prop.matchName === "ADBE Layer Source Alternate"
        ) {
          //Check if the source is already linked otherwise import the file

          var alt_src = templ_prop.alternateSource;

          //The current alt source is a composition,
          //check if it includes the footage item linked to the correct file
          if (alt_src !== null && alt_src instanceof CompItem) {
            var alt_src_layer = alt_src.layer(1);
            if (
              alt_src_layer.source instanceof FootageItem &&
              alt_src_layer.source.file.fullName == col.values[row_i]
            ) {
              break;
            }
          }

          //It is a footage item and if it is linked to the correct file
          if (alt_src !== null && alt_src instanceof AVLayer) {
            if (
              alt_src_layer.source instanceof FootageItem &&
              alt_src_layer.source.file.fullName == col.values[row_i]
            ) {
              break;
            }
          }

          var footage_item = _ImportFootageItem(
            col.values[row_i],
            template.imported_footage_folder
          );
          templ_prop.setAlternateSource(footage_item);

          break;
        }

        //Text
        else if (
          templ_prop.propertyValueType === PropertyValueType.TEXT_DOCUMENT
        ) {
          if (templ_prop.value.text === col.values[row_i]) {
            break;
          } else {
            templ_prop.setValue(col.values[row_i]);
            break;
          }
        }

        //Color / Position / Scale / Rotation
        else {
          //Check if is different from the current value
          if (templ_prop.value == col.values[row_i]) {
            break;
          }

          templ_prop.setValue(col.values[row_i]);
          break;
        }
      }
    }
  }
}

/**
 * Given a path to a file, import it into the project and return the FootageItem
 * @param {string} path
 * @param {string} proj_folder
 */

function _ImportFootageItem(path, proj_folder) {
  //Update the Folder.current global so that relative paths can be solved
  if (app.project.file !== null)
    Folder.current = new Folder(app.project.file.path);

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

  var repl_f_item;
  for (var i_items = 1; i_items <= app.project.numItems; i_items++) {
    var proj_item = app.project.item(i_items);
    if (proj_item instanceof FootageItem && proj_item.file !== null) {
      if (proj_item.file.fullName == path) {
        return proj_item;
      }
    }
  }

  if (repl_f_item === undefined) {
    //Import the file
    var file = new File(path);
    var import_opt = new ImportOptions(file);
    repl_f_item = app.project.importFile(import_opt);
    repl_f_item.parentFolder = folder;
  }

  return repl_f_item;
}

function BatchRender(str_template, folder) {
  str_template = str_template.replaceAll(/\r?\n|\r/g, "\\n");

  /** @type {BatchRenderResult} */
  var result = { errors: [] };

  try {
    /** @type {Template}*/
    var tmpl_data = JSON.parse(str_template);

    //Find the composition referenced by the template in the project
    var tmpl_comp;

    for (var i_items = 1; i_items <= app.project.numItems; i_items++) {
      var item = app.project.item(i_items);
      if (item instanceof CompItem && item.name == tmpl_data.comp) {
        tmpl_comp = item;
        break;
      }
    }

    if (tmpl_comp == undefined)
      throw new Error("@BatchRender: Template composition not found");

    //delete all items in the render queue
    for (var i = app.project.renderQueue.numItems; i >= 1; i--) {
      app.project.renderQueue.item(i).remove();
    }

    //Loop through the rows and set the values of the template
    for (var i_row = 0; i_row < tmpl_data.rows.length; i_row++) {
      var render_comp = _CreateTemplateRenderComp(
        tmpl_data.name + "_" + i_row,
        tmpl_comp,
        i_row === 0,
        folder
      );

      try {
        //Add the template composition to the render comp as a layer
        var layer = render_comp.layers.add(tmpl_comp);

        //Set the values of the essential properties
        _ApplyTemplProps(layer, tmpl_data, i_row);

        //Render the template
        _QueueComp(
          render_comp,
          tmpl_data.save_paths[i_row],
          tmpl_data.render_settings_templ,
          tmpl_data.render_output_module_templ
        );
      } catch (e) {
        result.errors.push({ message: e.message, row: i_row });
      }
    } //loop template rows

    //Start the render queue
    app.project.renderQueue.render();

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
  str_template = str_template.replaceAll(/\r?\n|\r/g, "\\n");
  /** @type {BatchGenerateResult} */
  var result = { errors: [] };

  try {
    /** @type {Template}*/
    var tmpl_data = JSON.parse(str_template);

    //Find the composition referenced by the template in the project
    var templ_comp;

    for (var i_items = 1; i_items <= app.project.numItems; i_items++) {
      var item = app.project.item(i_items);
      if (item instanceof CompItem && item.name == tmpl_data.comp) {
        templ_comp = item;
        break;
      }
    }

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
  //Create a new render queue item
  var rq_item = app.project.renderQueue.items.add(comp);

  //Set the output module template
  var om = rq_item.outputModule(1);
  om.applyTemplate(output_preset);

  //Set the render settings template
  rq_item.applyTemplate(render_preset);

  //remove the file name from the path
  var folder_path = path.substring(0, path.lastIndexOf("/"));

  //Make sure the directory exists
  var folder = new Folder(folder_path);
  if (!folder.exists) {
    if (!folder.create())
      throw new Error("@_Render: Could not create folder at path: " + path);
  }

  //Update the Folder.current global so that relative paths can be solved
  if (app.project.file !== null)
    Folder.current = new Folder(app.project.file.path);

  //Set the output file name
  var output_file = new File(path);
  om.file = output_file;
}

function GatherRenderTemplates() {
  
  //Per the documnetation we can only gather the templates once an item is in the render queue

  /**@type {RenderSettsResults}*/
  var result = {};

  try {
    //Setup the render the render composition and send it to the render queue
    var render_comp = _SetupTemplatePreviewComp();
    var rq_item = app.project.renderQueue.items.add(render_comp);
    result.render_templs = rq_item.templates;
    result.output_modules_templs = rq_item.outputModule(1).templates;

    //Delete the render queue item
    rq_item.remove();

    result.success = true;
  } catch (e) {
    result.success = false;
    result.error_obj = e;
    result.error_obj.source = "index.jsx @ GatherRenderTemplates";
  }

  return JSON.stringify(result);
}

function SelectFolder() {
  var folder = Folder.selectDialog("Select a folder");
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

function ImportFile() {
  var file = File.openDialog("Select a file");

  file.open("r");
  var content = file.read();
  file.close();

  return encodeURIComponent(content);
}

function ExportFile(content) {
  content = decodeURIComponent(content);

  var file = File.saveDialog("Save a file");
  file.open("w");
  file.write(content);
  file.close();
}

// polyfills
Object.create = function (o) {
  function F() {}
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
String.prototype.replaceAll = function(target, replacement) {
  return this.split(target).join(replacement);
};