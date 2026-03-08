import papa from "papaparse";
import { type RenderSettsResults, type SaveSettsRequest } from "./Messaging";
import "./ces.t.ts";
import Logger from "./Logger.js";

// -- Enums & Types --

export const enum OutMode {
  Render = "render",
  Generate = "generate",
  Dependant = "dependant",
}

export const enum Tabs {
  Data = "data",
  Output = "output",
  Settings = "settings",
}

export const PropertyValueType = {
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

export type Comp = {
  name: string;
  id: string;
};

export type DepCompSetts = {
  id: string;
  name: string;
  enabled: boolean;
  render_setts_templ: string;
  render_out_module_templ: string;
  save_pattern: string;
  save_path: string;
  save_paths: string[];
};

// -- Interfaces (State decoupled from Logic) --

export interface AppSettings {
  id: string | null;
  active_tab: Tabs;
  data_mode: "table" | "detail";
  log_level: number;
  render_comps_folder: string;
  out_mode: OutMode;
  auto_preview: boolean;
  update_visible_col_only: boolean;
}

export interface ProjectData {
  tmpls: TemplateData[];
  sel_tmpl: number;
}

export interface TemplateData {
  name: string;
  comp: string;
  comp_id: number;
  active: boolean;
  columns: ColumnData[];
  rows: any[][];
  base_path: string;
  save_pattern: string;
  render_setts_templ: string;
  render_out_module_templ: string;
  generate_pattern: string;
  save_paths: string[];
  generate_names: string[];
  imported_footage_folder: string;
  gen_comps_folder: string;
  table_cols: number[];
  dep_comps: Comp[];
  dep_config: { [key: string]: DepCompSetts };
  import_file_lasts: { csv_folder: string | null; config_folder: string | null };
  save_file_lasts: { csv_folder: string | null; config_folder: string | null };
}

export interface ColumnData {
  cont_name: string;
  type: number;
  values: any[];
  menu_params: string[];
  alt_src_pattern: string;
  alt_src_base: string;
}

// -- Helpers (Logic) --

export class ColumnHelper {
  static Create(name = "", values: any[] = []): ColumnData {
    return {
      cont_name: name,
      values: values,
      type: PropertyValueType.TEXT_DOCUMENT,
      menu_params: [],
      alt_src_pattern: "",
      alt_src_base: ""
    };
  }

  static ValidateValue(value: any, type: number): any {
    switch (type) {
      case PropertyValueType.TEXT_DOCUMENT:
      case PropertyValueType.SRC_ALTERNATE:
        if (value === undefined || typeof value !== "string") value = "";
        break;
      case PropertyValueType.OneD:
        if (value === undefined || typeof value !== "number") {
          try {
            value = parseFloat(value);
          } catch (e) {
            value = 0;
          }
        }
        break;
      case PropertyValueType.TwoD:
      case PropertyValueType.TwoD_SPATIAL:
        value = ColumnHelper.ValidateArray(value, 2);
        break;
      case PropertyValueType.ThreeD:
      case PropertyValueType.ThreeD_SPATIAL:
        value = ColumnHelper.ValidateArray(value, 3);
        break;
      case PropertyValueType.COLOR:
        value = ColumnHelper.ValidateArray(value, 4);
        break;
    }
    return value;
  }

  static ValidateArray(value: any, length: number): any {
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

  static ResolveAltSrcPath(col: ColumnData, index: number, columns: ColumnData[]): string {
    let pattern = col.alt_src_pattern;

    pattern = pattern.replace("{base_path}", col.alt_src_base);
    pattern = pattern.replace("{row_number}", index.toString());

    // Replace the increment pattern
    pattern = pattern.replace(/\{increment:(\d.*?)\}/gm, (match, p1) => {
      let num = parseInt(p1);
      let inc = num + index;
      return inc.toString().padStart(p1.length, "0");
    });

    for (let i_col in columns) {
      pattern = pattern.replace(`{column_${i_col}}`, columns[i_col].values[index]);
    }
    return pattern;
  }

  static ResolveColumnAltSrcPaths(col: ColumnData, columns: ColumnData[]) {
    let row_count = col.values.length;
    let old_values = col.values;

    col.values = [];
    for (let i = 0; i < row_count; i++) {
      if (typeof old_values[i] === "string" && old_values[i].startsWith("<b>")) {
        col.values.push(old_values[i]);
      } else {
        col.values.push(ColumnHelper.ResolveAltSrcPath(col, i, columns));
      }
    }
  }

  static ResolveColumnAltSrcPathsRow(col: ColumnData, index: number, columns: ColumnData[]) {
    if (!col.values[index].startsWith("<b>"))
      col.values[index] = ColumnHelper.ResolveAltSrcPath(col, index, columns);
  }

  static Update(col: ColumnData, new_col: ColumnData) {
    if (col.type !== new_col.type) {
      col.type = new_col.type;
      col.values = new_col.values || [];
      col.menu_params = new_col.menu_params || [];
    }
  }
}

export class TemplateHelper {
  static Create(eg_name = "", comp_name = "", columns: ColumnData[] = []): TemplateData {
    const t: TemplateData = {
      name: eg_name,
      comp: comp_name,
      comp_id: -1,
      active: true,
      columns: columns,
      rows: [],
      base_path: "",
      save_pattern: "{base_path}/{template_name}_{row_number}",
      render_setts_templ: "",
      render_out_module_templ: "",
      generate_pattern: "Generated_{increment:0000}",
      save_paths: [],
      generate_names: [],
      imported_footage_folder: "~Imported by EasyBatch",
      gen_comps_folder: "~Generated by EasyBatch",
      table_cols: [0],
      dep_comps: [],
      dep_config: {},
      import_file_lasts: { csv_folder: null, config_folder: null },
      save_file_lasts: { csv_folder: null, config_folder: null }
    };
    t.rows = TemplateHelper.AsRows(t);
    return t;
  }

  static MakeCopy(template: TemplateData): TemplateData {
    return structuredClone(template);
  }

  static InitTableColumns(tmpl: TemplateData) {
    tmpl.table_cols = [];
    for (let i = 0; i < tmpl.columns.length; i++) {
      tmpl.table_cols.push(i);
    }
    tmpl.rows = TemplateHelper.AsRows(tmpl);
  }

  static AsRows(tmpl: TemplateData): any[][] {
    TemplateHelper.NormalizeRows(tmpl);
    let rows: any[][] = [];
    tmpl.columns.forEach((col, i) => {
      col.values.forEach((val, j) => {
        if (!rows[j]) rows[j] = [];
        rows[j][i] = val;
      });
    });
    return rows;
  }

  static NormalizeRows(tmpl: TemplateData) {
    let max = 0;
    tmpl.columns.forEach((col) => {
      if (col.values.length > max) max = col.values.length;
    });

    tmpl.columns.forEach((col) => {
      while (col.values.length < max) {
        let base_val = col.values[0] || ColumnHelper.ValidateValue("", col.type);
        col.values.push(structuredClone(base_val));
      }
    });
  }

  static UpdateRows(tmpl: TemplateData) {
    tmpl.rows = TemplateHelper.AsRows(tmpl);
  }

  static Update(tmpl: TemplateData, new_template: TemplateData) {
    tmpl.name = new_template.name;

    let new_cols = new_template.columns.filter((new_col) => {
      return !tmpl.columns.some((old_col) => old_col.cont_name === new_col.cont_name);
    });

    new_cols.forEach((new_col) => {
      let base_val = new_col.values[0] || ColumnHelper.ValidateValue("", new_col.type);
      new_col.values = new Array(tmpl.rows.length);
      tmpl.rows.forEach((row, i) => {
        new_col.values[i] = structuredClone(base_val);
      });
      tmpl.columns.push(new_col);
    });

    let old_cols = tmpl.columns.filter((old_col) => {
      return !new_template.columns.some((new_col) => new_col.cont_name === old_col.cont_name);
    });

    old_cols.forEach((old_col) => {
      tmpl.columns.splice(tmpl.columns.indexOf(old_col), 1);
    });

    let same_cols = tmpl.columns.filter((old_col) => {
      return new_template.columns.some((new_col) => new_col.cont_name === old_col.cont_name);
    });

    same_cols.forEach((old_col) => {
      let new_col = new_template.columns.find((nc) => nc.cont_name === old_col.cont_name);
      if (new_col) ColumnHelper.Update(old_col, new_col);
    });

    tmpl.table_cols = tmpl.table_cols.filter((col_i) => {
      return col_i < tmpl.columns.length;
    });

    tmpl.rows = TemplateHelper.AsRows(tmpl);
  }

  static CleanupDependantComps(tmpl: TemplateData, all_comps: Comp[]) {
    tmpl.dep_comps = tmpl.dep_comps.filter((dc) => {
      return all_comps.some((ac) => ac.id === dc.id);
    });

    for (let i_conf in tmpl.dep_config) {
      if (!tmpl.dep_comps.some((dc) => dc.id === i_conf)) {
        delete tmpl.dep_config[i_conf];
      }
    }
  }

  static AddDependantComp(tmpl: TemplateData, comp: Comp, render_templs: RenderSettsResults) {
    let last_dep_comp_setts: DepCompSetts | null = null;
    if (tmpl.dep_comps.length > 0) {
      last_dep_comp_setts = tmpl.dep_config[tmpl.dep_comps[tmpl.dep_comps.length - 1].id];
    }

    tmpl.dep_comps.push(comp);

    if (last_dep_comp_setts !== null) {
      tmpl.dep_config[comp.id] = {
        id: comp.id,
        name: comp.name,
        enabled: true,
        render_setts_templ: last_dep_comp_setts.render_setts_templ,
        render_out_module_templ: last_dep_comp_setts.render_out_module_templ,
        save_pattern: last_dep_comp_setts.save_pattern,
        save_path: "",
        save_paths: [],
      };
    } else {
  let r_s = render_templs && render_templs.render_templs ? render_templs.render_templs[0] : "";
  let o_m = render_templs && render_templs.output_modules_templs ? render_templs.output_modules_templs[0] : "";
      tmpl.dep_config[comp.id] = {
        id: comp.id,
        name: comp.name,
        enabled: true,
        render_setts_templ: r_s,
        render_out_module_templ: o_m,
        save_pattern: "{base_path}/{template_name}_" + comp.name + "_{row_number}",
        save_path: "",
        save_paths: [],
      };
    }
  }

  static RemoveDependantComp(tmpl: TemplateData, id: string) {
    tmpl.dep_comps = tmpl.dep_comps.filter((dc) => dc.id !== id);
    delete tmpl.dep_config[id];
  }

  static ResolveSavePath(tmpl: TemplateData, pattern: string, index: number, comp_name?: string): string {
    pattern = pattern.replaceAll("{base_path}", tmpl.base_path);
    pattern = pattern.replaceAll("{row_number}", index.toString());
    pattern = pattern.replaceAll("{template_name}", tmpl.name);
    pattern = pattern.replaceAll("{comp_name}", comp_name || tmpl.comp);

    pattern = pattern.replace(/\{increment:(\d.*?)\}/gm, (match, p1) => {
      let num = parseInt(p1);
      let inc = num + index;
      return inc.toString().padStart(p1.length, "0");
    });

    for (let i_col in tmpl.columns) {
      pattern = pattern.replaceAll(`{column_${i_col}}`, tmpl.columns[i_col].values[index]);
    }
    return pattern;
  }

  static ResolveSavePaths(tmpl: TemplateData) {
    tmpl.save_paths = [];
    for (let i = 0; i < tmpl.rows.length; i++) {
        tmpl.save_paths.push(TemplateHelper.ResolveSavePath(tmpl, tmpl.save_pattern, i));
    }
  }

  static ResolveSavePathFirstDeps(tmpl: TemplateData, index: number) {
    for (let dc in tmpl.dep_config) {
      let conf = tmpl.dep_config[dc];
      conf.save_path = TemplateHelper.ResolveSavePath(tmpl, conf.save_pattern, index, conf.name);
    }
  }

  static ResolveSavePathDeps(tmpl: TemplateData) {
    for (let dc in tmpl.dep_config) {
      let conf = tmpl.dep_config[dc];
      conf.save_paths = [];
      for (let i = 0; i < tmpl.rows.length; i++) {
        conf.save_paths.push(TemplateHelper.ResolveSavePath(tmpl, conf.save_pattern, i, conf.name));
      }
    }
  }

  static ResolveCompName(tmpl: TemplateData, pattern: string, index: number): string {
    pattern = pattern.replace("{row_number}", index.toString());
    pattern = pattern.replace("{template_name}", tmpl.name);

    pattern = pattern.replace(/\{increment:(\d.*?)\}/gm, (match, p1) => {
      let num = parseInt(p1);
      let inc = num + index;
      return inc.toString().padStart(p1.length, "0");
    });

    for (let i_col in tmpl.columns) {
      pattern = pattern.replaceAll(`{column_${i_col}}`, tmpl.columns[i_col].values[index]);
    }
    return pattern;
  }

  static ResolveCompsNames(tmpl: TemplateData) {
    tmpl.generate_names = [];
    for (let i = 0; i < tmpl.rows.length; i++) {
      tmpl.generate_names.push(TemplateHelper.ResolveCompName(tmpl, tmpl.generate_pattern, i));
    }
  }

  static ResolveAltSrcPaths(tmpl: TemplateData) {
    TemplateHelper.NormalizeRows(tmpl);
    tmpl.columns.forEach((col) => {
      if (col.type === PropertyValueType.SRC_ALTERNATE) {
        ColumnHelper.ResolveColumnAltSrcPaths(col, tmpl.columns);
      }
    });
    tmpl.rows = TemplateHelper.AsRows(tmpl);
  }

  static ResolveAltSrcPathsRow(tmpl: TemplateData, index: number) {
    TemplateHelper.NormalizeRows(tmpl);
    tmpl.columns.forEach((col) => {
      if (col.type === PropertyValueType.SRC_ALTERNATE) {
        ColumnHelper.ResolveColumnAltSrcPathsRow(col, index, tmpl.columns);
      }
    });
    tmpl.rows = TemplateHelper.AsRows(tmpl);
  }

  static AddRow(tmpl: TemplateData) {
    let last_row = TemplateHelper.AsRows(tmpl).pop() || [];

    for (let col = 0; col < tmpl.columns.length; col++) {
      let val = last_row[col] !== undefined ? structuredClone(last_row[col]) : ColumnHelper.ValidateValue("", tmpl.columns[col].type);
      tmpl.columns[col].values.push(val);
    }
    tmpl.rows = TemplateHelper.AsRows(tmpl);
    TemplateHelper.ResolveAltSrcPaths(tmpl);
  }

  static AddRowAfter(tmpl: TemplateData, index: number) {
    if (tmpl.rows.length === 0) {
      TemplateHelper.AddRow(tmpl);
      return;
    } else if (index < 0 || index >= tmpl.rows.length) {
      return;
    }

    let row_data = TemplateHelper.AsRows(tmpl)[index];
    for (let col = 0; col < tmpl.columns.length; col++) {
      let val = structuredClone(row_data[col]);
      tmpl.columns[col].values.splice(index + 1, 0, val);
    }
    tmpl.rows = TemplateHelper.AsRows(tmpl);
    TemplateHelper.ResolveAltSrcPaths(tmpl);
  }

  static AddRowBefore(tmpl: TemplateData, index: number) {
    if (tmpl.rows.length === 0) {
      TemplateHelper.AddRow(tmpl);
      return;
    } else if (index < 0 || index >= tmpl.rows.length) {
      return;
    }

    let row_data = TemplateHelper.AsRows(tmpl)[index];
    for (let col = 0; col < tmpl.columns.length; col++) {
      let val = structuredClone(row_data[col]);
      tmpl.columns[col].values.splice(index, 0, val);
    }
    tmpl.rows = TemplateHelper.AsRows(tmpl);
    TemplateHelper.ResolveAltSrcPaths(tmpl);
  }

  static AddColumn(tmpl: TemplateData) {
    tmpl.table_cols.push(0);
  }

  static DeleteColumn(tmpl: TemplateData, index: number) {
    tmpl.table_cols.splice(index, 1);
  }

  static DeleteRow(tmpl: TemplateData, index: number) {
    tmpl.columns.forEach((col) => {
      col.values.splice(index, 1);
    });
    TemplateHelper.ResolveAltSrcPaths(tmpl);
    tmpl.rows = TemplateHelper.AsRows(tmpl);
  }

  static LoadFromCSV(tmpl: TemplateData, csv: string) {
    if (!csv || csv.trim() === "") return;
    let csv_rows = papa.parse(csv, { skipEmptyLines: true }).data;
    if (csv_rows.length === 0) return;

    let header: any[] = csv_rows.shift() as any[];

    tmpl.columns.forEach((tmpl_col) => {
      let col_index = header.indexOf(tmpl_col.cont_name);
      if (col_index !== -1) {
        tmpl_col.values = [];
        csv_rows.forEach((row: any) => {
          tmpl_col.values.push(ColumnHelper.ValidateValue(row[col_index], tmpl_col.type));
        });
      }
    });

    TemplateHelper.ResolveAltSrcPaths(tmpl);
    TemplateHelper.ResolveCompsNames(tmpl);
    tmpl.rows = TemplateHelper.AsRows(tmpl);
  }

  static MakeCSV(tmpl: TemplateData): string {
    tmpl.rows = TemplateHelper.AsRows(tmpl);
    let cols: string[] = [];
    tmpl.columns.forEach((col) => {
      cols.push(col.cont_name);
    });

    let headers = papa.unparse([cols]);
    let csv = papa.unparse(tmpl.rows, { header: false });
    return headers + "\r\n" + csv;
  }

  static CopyValuesFromPreview(tmpl: TemplateData, data: any, row_i: number) {
    tmpl.columns.forEach((col) => {
      if (data[col.cont_name] !== undefined) {
        let n_val = ColumnHelper.ValidateValue(data[col.cont_name], col.type);
        col.values[row_i] = n_val;
      }
    });
  }
}

export class SettingsHelper {
  static CreateAppSettings(): AppSettings {
    return {
      id: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
      active_tab: Tabs.Data,
      data_mode: "table",
      log_level: Logger.Levels.Warn,
      render_comps_folder: "~Automator Comps",
      out_mode: OutMode.Render,
      auto_preview: true,
      update_visible_col_only: true
    };
  }

  static CreateProjectData(): ProjectData {
    return {
      tmpls: [],
      sel_tmpl: -1
    };
  }

  static UpdateTemplates(project: ProjectData, host_templates: object[]) {
    let scanned_templs: TemplateData[] = [];
    host_templates.forEach((templ: any) => {
      // Create and populate the template
      let t = TemplateHelper.Create();
      Object.assign(t, templ);
      t.columns = [];
      if (templ.columns !== undefined) {
        templ.columns.forEach((col: any) => {
          let c = ColumnHelper.Create();
          Object.assign(c, col);
          t.columns.push(c);
        });
      }
      t.rows = TemplateHelper.AsRows(t);
      scanned_templs.push(t);
    });

    let new_templs = scanned_templs.filter((s_templ) => {
      return !project.tmpls.some((old_templ) => old_templ.comp_id === s_templ.comp_id);
    });

    new_templs.forEach((new_templ) => {
      project.tmpls.push(new_templ);
      TemplateHelper.InitTableColumns(new_templ);
    });

    let old_templs = project.tmpls.filter((old_templ) => {
      return !scanned_templs.some((new_templ) => new_templ.comp_id === old_templ.comp_id);
    });

    old_templs.forEach((old_templ) => {
      project.tmpls.splice(project.tmpls.indexOf(old_templ), 1);
    });

    let same_tmpls = project.tmpls.filter((old_templ) => {
      return scanned_templs.some((new_templ) => new_templ.comp_id === old_templ.comp_id);
    });

    same_tmpls.forEach((s_tmpl) => {
      let new_templ = scanned_templs.find((nt) => nt.comp_id === s_tmpl.comp_id);
      if (new_templ) TemplateHelper.Update(s_tmpl, new_templ);
    });
  }
}
