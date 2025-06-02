import papa from "papaparse";
import { type SaveSettsRequest } from "./Messaging";
import "./ces.t.ts"
import Logger from "./Logger.js";

class Settings {
  constructor() {
    this.id = this.MakeId();
  }
  /**
   * Creates a Settings object from a JSON version of Settings
   * @param {Settings | Object} json
   */
  FromJson(json) {

    Object.assign(this, json);

    this.tmpls = [];

    if (json.tmpls !== undefined)
      json.tmpls.forEach((templ) => {
        this.tmpls.push(Template.FromJson(templ));
      });
  }

  UpdateTemplates(host_templates: object[]) {
    let scanned_templs: Template[] = [];
    host_templates.forEach((templ) => {
      scanned_templs.push(Template.FromJson(templ));
    });

    //Get the templates that don't exist in the current array
    let new_templs = scanned_templs.filter((s_templ) => {
      return !this.tmpls.some((old_templ) => old_templ.comp_id === s_templ.comp_id);
    });

    //Add the new templates to the current ones
    new_templs.forEach((new_templ) => {
      this.tmpls.push(new_templ);
    });

    //Filter the templates that exist in the current array but not in the new one
    let old_templs = this.tmpls.filter((old_templ) => {
      return !scanned_templs.some(
        (new_templ) => new_templ.comp_id === old_templ.comp_id
      );
    });

    //Delete the old templates
    old_templs.forEach((old_templ) => {
      this.tmpls.splice(this.tmpls.indexOf(old_templ), 1);
    });

    //Find the templates that are in both
    let same_templs = this.tmpls.filter((old_templ) => {
      return scanned_templs.some(
        (new_templ) => new_templ.comp_id === old_templ.comp_id
      );
    });

    //Update the templates with the new data
    same_templs.forEach((old_templ) => {
      let new_templ = scanned_templs.find(
        (new_templ) => new_templ.comp_id === old_templ.comp_id
      );
      old_templ.Update(new_templ);
    });
  }

  static version = "0.1.1";

  /**
   * Stores data from Essential GFXs templates that have automated data
   * @type {Array<Template>}
   */
  tmpls: Template[] = [];

  /**
   * The mode of the automator, either "table" or "csv"
   * @type {string}
   */
  mode;

  /**
   * Selected template to edit
   * @type {number}
   */
  sel_tmpl = -1;

  active_tab = "data";

  log_level = Logger.Levels.Warn;

  /**
   * When the user Batch Renders, the intermediate compositions used to render are stored here
   */
  render_comps_folder = "~Render Templates";

  out_mode = "render";

  auto_preview = true;

  /**Unique ID created by the constructor */
  id = null;

  MakeId() {
    return (
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15)
    );
  }
}

class Template {
  /**
   * @param {string} eg_name Name of the template given in the Essential Graphics panel
   * @param {*} comp_name Name of the composition associated with the template
   * @param {Column[]} columns Array of columns associated with 'controllers' in the Essential Graphics panel
   */
  constructor(eg_name = "", comp_name = "", columns = []) {
    this.name = eg_name;
    this.comp = comp_name;
    this.columns = columns;
    this.rows = this.#AsRows();
  }

  /**
   * Creates a Template object from a JSON version of Template
   * @param {Template} json
   */
  static FromJson(json) {

    let templ = Object.assign(new Template(), json);
    templ.columns = [];

    if (json.columns !== undefined)
      json.columns.forEach((col) => {
        templ.columns.push(Column.FromJson(col));
      });

    templ.rows = templ.#AsRows();

    // console.log("MAKING JSON");  
    // console.dir(json);
    // console.dir(templ);
    return templ;
  }

  /**
   * Updates the columns of the template stored in settings with the new template
   * @param {Template} new_template
   */
  Update(new_template) {
    //Find the columns that are in the new template but not in the old one
    let new_cols = new_template.columns.filter((new_col) => {
      return !this.columns.some(
        (old_col) => old_col.cont_name === new_col.cont_name
      );
    });

    //Add the new columns to the template
    new_cols.forEach((new_col) => {

      //Fill the new column with empty values
      //Not using fill() method because it copies the objects by reference

      let base_val = new_col.values[0] || Column.ValidateValue("", new_col.type);

      new_col.values = new Array(this.rows.length);
      this.rows.forEach((row, i) => {
        new_col.values[i] = Object.assign({}, base_val);
      });

      this.columns.push(new_col);
    });

    //Find the columns that are in the old template but not in the new one
    let old_cols = this.columns.filter((old_col) => {
      return !new_template.columns.some(
        (new_col) => new_col.cont_name === old_col.cont_name
      );
    });

    //Delete the old columns from the template
    old_cols.forEach((old_col) => {
      this.columns.splice(this.columns.indexOf(old_col), 1);
    });

    //find the columns that are in both templates
    let same_cols = this.columns.filter((old_col) => {
      return new_template.columns.some(
        (new_col) => new_col.cont_name === old_col.cont_name
      );
    });

    //Update the existing columns with the new data
    same_cols.forEach((old_col) => {
      let new_col = new_template.columns.find(
        (new_col) => new_col.cont_name === old_col.cont_name
      );
      old_col.Update(new_col);
    });

    //Make sure that the table view columns are referencing an existing column
    this.table_cols = this.table_cols.filter((col_i) => {
      return this.columns[col_i] !== undefined;
    });

    this.rows = this.#AsRows();

    this.UpdateDependantComps(new_template.dep_comps);
  }

  /**
   * Updated the dependant comps of the template and the settings associated with them
   */
  UpdateDependantComps(new_dep_comps: Comp[]) {

    //updates the dependant comps of the template
    this.dep_comps = new_dep_comps;

    // console.log("Updating dependant comps", new_dep_comps);
    // console.log("Current dependant comps", this.dep_comps);
    // console.log("Current dependant comps settings", this.dep_config);

    for (let i_conf in this.dep_config) {
      //Delete stray dep config settings that are not in the new dependant comps
      if (!new_dep_comps.some((dep_comp) => dep_comp.id === this.dep_config[i_conf].id)) {
        console.log("Deleting stray settings for comp", this.dep_config[i_conf].id);
        delete this.dep_config[i_conf];
      }
    }

    // Add new settings for the new dependant comps
    new_dep_comps.forEach((new_dc) => {

      for (let i_conf in this.dep_config) {
        //Check if the settings for the dependant comp already exist
        if (this.dep_config[i_conf].id === new_dc.id) {
          return;
        }
      }

      //Add the new composition to the settings with id as key
      this.dep_config[new_dc.id.toString()] = {
        id: new_dc.id,
        enabled: true,
        render_setts_templ: "",
        render_out_module_templ: "",
        save_pattern: "",
        save_path: "",
        save_paths: [],
        single_frame: false,
      };
    });

  }

  /**
   * Template name
   */
  name: string;

  /**
   * Name of the composition associated with the template
   */
  comp: string;

  comp_id: number;

  active = true;

  /**
   * Array of columns associated with controllers
   * @type {Column[]}
   */
  columns = [];

  /**
   * Returns the template as a table
   */
  rows = [];

  /**
   * Selected row in the table
   */
  save_pattern = "{base_path}";

  base_path = "";

  render_setts_templ = "";
  render_out_module_templ = "";

  generate_pattern = "Generated_{increment:0000}";

  /**
   * Array of save paths calculated from the save pattern
   * @type {string[]}
   */
  save_paths = [];

  generate_names = [];

  /**
   * When importing footage to fulfill a replaceable, we place it in this folder
   */
  imported_footage_folder = "~Imported by Automator";

  /**
   * When generating comps, we place them in this folder
   */
  gen_comps_folder = "~Generated Comps";

  /**
   * The user is able to customize the columns shown in the Data tab.
   * This array what columns are shown in the Data view.
   */
  table_cols = [0];

  /**
   * These are the compositions that have the current templates as a layer.
   * Called dependant comps in the UI
   */
  dep_comps: Comp[] = [];

  /**
   * Settings belonging to the dependant comps
   */
  dep_config: { [key: string]: DepCompSetts } = {};


  /**Used to remember the last path of the Save File dialogues, per categories */
  import_file_lasts = {
    csv_folder: null,
    config_folder: null,
  }

  /**Used to remember the last path of the Open File dialogues, per categories */
  save_file_lasts = {
    csv_folder: null,
    config_folder: null,
  }

  /**
   * Resolves the save path for the output a given row
   */
  ResolveSavePath(pattern, index) {
    pattern = pattern.replaceAll("{base_path}", this.base_path);
    pattern = pattern.replaceAll("{row_number}", index);
    pattern = pattern.replaceAll("{template_name}", this.name);

    //Replace the increment pattern
    pattern = pattern.replace(/\{increment:(\d.*?)\}/gm, (match, p1) => {
      let incr = parseInt(p1) + index;

      let incr_str = incr.toString().padStart(p1.length, "0");

      //cero fill the increment
      return incr_str;
    });

    for (let i_col in this.columns) {
      pattern = pattern.replaceAll(
        `{${this.columns[i_col].cont_name}}`,
        this.columns[i_col].values[index]
      );
    }
    return pattern;
  }

  ResolveSavePaths() {
    this.save_paths = [];
    for (let i = 0; i < this.rows.length; i++) {
      this.save_paths.push(this.ResolveSavePath(this.save_pattern, i));
    }
  }

  /**Resolve the save paths of dependant composition on dependant mode */
  ResolveSavePathFirstDeps(index) {

    console.log("Resolving save paths for dependant comps", index);

    for (let dc in this.dep_config) {
      let dep_setts = this.dep_config[dc];

      console.log("Resolving save path for dependant comp", dep_setts.id);
      console.log("Current save path", dep_setts.save_pattern);
      dep_setts.save_path = this.ResolveSavePath(dep_setts.save_pattern, index);
    }
  }


  /**Resolve the save paths of dependant composition on dependant mode */
  ResolveSavePathDeps() {

    console.log("Resolving save paths for all rows of dependant comps");

    for (let dc in this.dep_config) {
      let dep_setts = this.dep_config[dc];

      console.log("Resolving save path for dependant comp", dep_setts.id);
      console.log("Current save path", dep_setts.save_pattern);
      dep_setts.save_paths = [];

      for (let row_i in this.rows) {
        dep_setts.save_paths.push(this.ResolveSavePath(dep_setts.save_pattern, row_i));
      }
    }
  }


  /**
   * When generating comps, we name them with this pattern
   */
  ResolveCompName(pattern, index) {
    pattern = pattern.replace("{row_number}", index);
    pattern = pattern.replace("{template_name}", this.name);

    //Replace the increment pattern
    pattern = pattern.replace(/\{increment:(\d.*?)\}/gm, (match, p1) => {
      let incr = parseInt(p1) + index;

      let incr_str = incr.toString().padStart(p1.length, "0");

      //cero fill the increment
      return incr_str;
    });

    for (let i_col in this.columns) {
      pattern = pattern.replace(
        `{${this.columns[i_col].cont_name}}`,
        this.columns[i_col].values[index]
      );
    }
    return pattern;
  }

  ResolveCompsNames() {
    this.generate_names = [];
    for (let i = 0; i < this.rows.length; i++) {
      this.generate_names.push(this.ResolveCompName(this.generate_pattern, i));
    }
  }

  /**
   * Resolves the path for the alternate source for a given row
   * Alternate sources are the name we give to the footage we import to fulfill a replaceable
   */
  ResolveAltSrcPaths() {
    this.NormalizeRows();
    this.columns.forEach((col) => {
      if (col.type === Column.PropertyValueType.SRC_ALTERNATE) {
        col.ResolveAltSrcPaths(this.columns);
      }
    });
    this.rows = this.#AsRows();
  }

  AddRow() {
    let last_row = this.#AsRows().pop();

    for (let col in this.columns) {
      this.columns[col].values.push(
        Column.ValidateValue(last_row[col], this.columns[col].type)
      );
    }

    this.rows = this.#AsRows();
    this.ResolveAltSrcPaths();
    this.columns = this.columns;
  }

  /**
   * Adds a column to the UI table
   * It doesn't add a column to the template
   */
  AddColumn() {
    this.table_cols.push(0);
  }

  DeleteRow(index) {
    this.columns.forEach((col) => {
      col.values.splice(index, 1);
    });

    this.ResolveAltSrcPaths();
    this.rows = this.#AsRows();
  }

  /**
   * Deletes a column from the UI table
   * It doesn't delete a column from the template
   */
  DeleteColumn(index) {
    this.table_cols.splice(index, 1);
  }

  /**
   * Converts the template to a table
   */
  #AsRows() {
    this.NormalizeRows();

    let rows = [];
    this.columns.forEach((col, i) => {
      col.values.forEach((val, j) => {
        if (rows[j] === undefined) {
          rows[j] = {};
        }

        rows[j][i] = val;
      });
    });
    return rows;
  }

  /**
   * Checks that all the columns have the same number of rows (values)
   */
  NormalizeRows() {
    let max = 0;
    this.columns.forEach((col) => {
      if (col.values.length > max) {
        max = col.values.length;
      }
    });

    this.columns.forEach((col) => {
      while (col.values.length < max) {
        col.values.push("");
      }
    });
  }

  /**
   * Loads the template from a CSV file
   * @param {string} csv
   */
  LoadFromCSV(csv) {
    let csv_rows = papa.parse(csv).data;

    //Try to match the header with the columns
    let header: any[] = csv_rows.shift() as any[];

    this.columns.forEach((tmpl_col) => {
      let col_i = header.indexOf(tmpl_col.cont_name);

      if (col_i !== -1) {
        tmpl_col.values = csv_rows.map((csv_row) => {
          return Column.ValidateValue(csv_row[col_i], tmpl_col.type);
        });
      }
    });

    this.ResolveAltSrcPaths();
    this.ResolveCompsNames();

    this.rows = this.#AsRows();
  }

  MakeCSV() {
    this.rows = this.#AsRows();

    let cols = [];
    this.columns.forEach((col) => {
      cols.push(col.cont_name);
    });

    let headers = papa.unparse([cols]);
    let csv = papa.unparse(this.rows, {
      header: false,
    });

    return headers + "\r\n" + csv;
  }

  /**
   * @param {GetCurrentValuesResults} data
   * @param {number} row_i
   */
  ReplaceRowValues(data, row_i) {
    //Match columns by name
    this.columns.forEach((col) => {
      let tmpl_col = data.values.find((val) => val.name === col.cont_name);

      //TODO: Ignoring text documents because After Effects is returning the value of the original template comp and not the current value;
      if (tmpl_col !== undefined && col.type !== Column.PropertyValueType.TEXT_DOCUMENT) {
        col.values[row_i] = tmpl_col.value;
      }
    });
  }
}

/**
 * Represents a 'controller' in the Essential Graphics panel.
 * In the UI this is represented as a column. Each row will become an individual render or a generated comp.
 */
class Column {
  constructor(name = "", values = []) {
    this.cont_name = name;
    this.values = values;
    this.type = Column.PropertyValueType.TEXT_DOCUMENT;
  }

  /**
   * Name given to the controller in the Essential Graphics panel
   * @type {string}
   */
  cont_name;

  /**
   * Type of the controller/property/column
   * @type {PropTypeType}
   */
  type;

  values = [];

  /**
   * If the property/controller is a dropdown menu, these are the options
   * TODO: Currently not implemented/ we don't seem to have a wat to get the menu items
   * @type {string[]}
   */
  menu_params = [];

  /**
   * If the property is of type alternate source, this pattern determines the path of the alternate source
   * @type {string}
   */
  alt_src_pattern = "";

  alt_src_base = "";

  /**
   * Resolves the path for the alternate source for a given row
   * @param {number} index
   * @param {Column[]} columns
   */
  ResolveAltSrcPath(index, columns) {
    let pattern = this.alt_src_pattern;

    pattern = pattern.replace("{base_path}", this.alt_src_base);
    pattern = pattern.replace("{row_number}", index.toString());

    //Replace the increment pattern
    pattern = pattern.replace(/\{increment:(\d.*?)\}/gm, (match, p1) => {
      let incr = parseInt(p1) + index;

      let incr_str = incr.toString().padStart(p1.length, "0");

      //cero fill the increment
      return incr_str;
    });

    for (let i_col in columns) {
      pattern = pattern.replace(
        `{${columns[i_col].cont_name}}`,
        columns[i_col].values[index]
      );
    }
    return pattern;
  }

  ResolveAltSrcPaths(columns) {
    let row_count = this.values.length;

    let old_values = this.values;

    this.values = [];
    for (let i = 0; i < row_count; i++) {
      if (!old_values[i].startsWith("<b>"))
        this.values.push(this.ResolveAltSrcPath(i, columns));
      else
        this.values.push(old_values[i]);
    }
  }

  /**
   * Creates a Column object from a JSON version of Column
   * @param {Column} json
   */
  static FromJson(json) {
    return Object.assign(new Column(), json);
  }

  /**
   * Updates the current column with the new one keeping the values
   *  unless the type is different.
   * @param {Column} new_col
   */
  Update(new_col) {
    //Check if the column is the same type, otherwise reset the values
    if (this.type !== new_col.type) {
      this.type = new_col.type;

      //todo fill with values of type
      this.values = new Array(this.values.length).fill("");
    }
  }

  static ValidateValue(value, type) {
    switch (type) {
      case Column.PropertyValueType.TEXT_DOCUMENT:
        if (value === undefined || typeof value !== "string") {
          value = "";
        }
        break;

      case Column.PropertyValueType.OneD:
        if (value === undefined || typeof value !== "number") {
          try {
            value = parseFloat(value);
          } catch (e) {
            value = 0;
          }
        }
        break;

      case Column.PropertyValueType.TwoD:
      case Column.PropertyValueType.TwoD_SPATIAL:
        value = this.ValidateArray(value, 2);
        break;

      case Column.PropertyValueType.ThreeD:
      case Column.PropertyValueType.ThreeD_SPATIAL:
        value = this.ValidateArray(value, 3);
        break;

      case Column.PropertyValueType.COLOR:
        value = this.ValidateArray(value, 4);
        break;
    }

    return value;
  }

  static ValidateArray(value, length) {
    if (value === undefined) {
      return new Array(length).fill(0);
    } else if (
      !Array.isArray(value) ||
      value.length !== length ||
      !value.every((v) => typeof v === "number")
    ) {
      if (typeof value === "string") {
        try {
          if (value !== "" && (!value.startsWith("[") && !value.endsWith("]"))) {
            value = JSON.parse("[" + value + "]");
          } else {
            value = JSON.parse(value);
          }
        } catch (e) {
          value = new Array(length).fill(0);
        }
      } else {
        value = new Array(length).fill(0);
      }
    }
    return value;
  }

  /**
   * @typedef {number} PropTypeType
   * @enum {PropTypeType}
   */
  static PropertyValueType = {
    COLOR: 6418,
    CUSTOM_VALUE: 6419,
    LAYER_INDEX: 6421,
    MARKER: 6420,
    MASK_INDEX: 6422,
    NO_VALUE: 6412,
    OneD: 6417,
    SHAPE: 6423,
    TEXT_DOCUMENT: 6424,
    ThreeD: 6414,
    ThreeD_SPATIAL: 6413,
    TwoD: 6416,
    TwoD_SPATIAL: 6415,
    SRC_ALTERNATE: 9001,
  };
}

type Comp = {
  name: string;
  id: string;
}

/**
 * Settings for the dependant compositions
 */
type DepCompSetts = {
  id: string;
  enabled: boolean;
  render_setts_templ: string;
  render_out_module_templ: string;
  save_pattern: string;
  save_path: string;
  save_paths: string[];
  single_frame: boolean;
}

export { Settings, Template, Column, type Comp, type DepCompSetts };
