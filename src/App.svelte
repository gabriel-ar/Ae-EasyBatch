<script lang="ts">
  /**
  This is a CEP app for After Effects that proceeds the user with automation tools for mograph templates.
  The user can either use a table or an external CSV file to populate the template. Each row in the table or CSV file will be used to populate a single instance of the template.
  */

  import CSAdapter from "./lib/CSAdapter.mjs";
  import { onMount, setContext } from "svelte";

  import {
    Camera,
    Crosshair2,
    EyeOpen,
    Gear,
    OpenInNewWindow,
    QuestionMark,
    Reload,
    Trash,
    Update,
  } from "radix-icons-svelte";

  import {
    Settings,
    Template,
    Column,
    type DepCompSetts,
    type Comp,
  } from "./lib/Settings";

  import Logger from "./lib/Logger";

  import { SaveSettsRequest } from "./lib/Messaging";

  import PropInput from "./lib/PropInput.svelte";
  import ModalAlternateSrcV2 from "./lib/ModalAlternateSrcV2.svelte";
  import ModalFilePattern from "./lib/ModalDepFilePattern.svelte";
  import Dropdown from "./lib/Dropdown.svelte";

  const l = new Logger(Logger.Levels.Warn, "App");
  setContext("logger", l);

  let csa = new CSAdapter();

  let setts = new Settings();

  let no_templs = false;

  let false_blur = false;

  let m_file_pattern: ModalFilePattern;

  //Update the log level of the logger when the settings changes
  $: {
    l.log_lvl = setts.log_level;
    setContext("logger", l);
  }

  onMount(() => {
    StartupSequence();
  });

  async function StartupSequence() {
    let n_tmpls = (await GetTemplates()) as Template[];
    l.debug("StartupSequence called with templates:", n_tmpls);

    no_templs = n_tmpls.length == 0;
    if (no_templs) return;

    let loaded_setts = await GetSettings().catch((e) => {
      if (e.reasons !== undefined && e.reasons.not_found) {
        l.warn(`Settings not found, creating new ones`);
        return new Settings();
      } else {
        l.error("StartupSequence-> GetSettings error:", e);
        return;
      }
    });

    let loaded_render_setts = await GetRenderSettsTempls().catch((e) => {
      l.error("StartupSequence-> GetRenderSettsTempls error:", e);
      return;
    });

    render_setts_templs = loaded_render_setts;

    loaded_setts.UpdateTemplates(n_tmpls);

    setts = loaded_setts;

    if (setts.sel_tmpl == -1) {
      setts.sel_tmpl = 0;
    }

    //TODO Find another way to trigger the save settings
    window.onblur = (e) => {
      IsSameProject();
    };
  }

  function GetTemplates(): Promise<Template[]> {
    return new Promise((resolve, reject) => {
      csa.Eval("GetTemplates()", function (s_result) {
        try {
          l.debug("GetTemplates Eval result:", s_result);
          /**@type {GetTmplsResult}*/
          let result = JSON.parse(s_result);

          if (result.success == false) {
            l.error("Failed to load templates", result.error_obj);
            reject(result.error_obj);
          } else {
            l.log(`Parsed Templates`, result);
            resolve(result.tmpls);
          }
        } catch (e) {
          l.error("GetTemplates error:", e, s_result);
          reject(e);
        }
      });
    });
  }

  function GetSettings(): Promise<Settings> {
    return new Promise((resolve, reject) => {
      csa.Eval(`LoadSettings()`, function (s_result) {
        l.debug("GetSettings Eval result:", s_result);

        /**@type {GetSettsResult} */
        let result;

        try {
          result = JSON.parse(s_result);
        } catch (e) {
          l.error("Failed to parse settings, string: ", s_result);
          reject(e);
        }

        if (result.success === false) {
          l.error("Failed to load settings", result.error_obj);

          reject(result.error_obj);
        } else {
          let setts = new Settings();
          setts.FromJson(result.setts);

          l.log(`Parsed Settings`, result);
          resolve(setts);
        }
      });
    });
  }

  $: DebouncedSaveSetts(setts);

  let last_sett_time;

  /**
   * Debounces the save function
   * @param dummy
   */
  function DebouncedSaveSetts(dummy) {
    if (last_sett_time !== undefined) {
      clearTimeout(last_sett_time);
    }
    last_sett_time = setTimeout(SaveSettings, 2000);
  }

  function SaveSettings(is_new = false) {
    if (
      setts.sel_tmpl === undefined ||
      setts.sel_tmpl == -1 ||
      setts === undefined ||
      no_templs
    )
      return;

    let request = new SaveSettsRequest();
    request.setts = setts;
    request.is_new = is_new;

    l.debug("SaveSettings called with request:", request);
    let s_request = JSON.stringify(request);

    csa.Eval(`SaveSettings('${s_request}')`, function (s_result) {
      /**@type {SaveSettingsResults}*/
      let result;

      try {
        result = JSON.parse(s_result);
      } catch (e) {
        l.error("Failed to parse save result", result);

        //todo Handle Failed Save
        return;
      }

      if (result.success == false) {
        let e = result.error_obj;
        if (e.reasons !== undefined && e.reasons.id_mismatch) {
          l.warn(`Different project ID, reloading settings`);
          StartupSequence();
          return;
        } else if (e.reasons !== undefined && e.reasons.no_templates) {
          l.warn(`No templates to save.`);
          no_templs = true;
          return;
        } else {
          l.error("Failed to save settings", result.error_obj);
          //todo Handle Failed Save
          return;
        }
      } else {
        l.log(`Saved Settings`, result);
      }
    });
  }

  function ResetSettings() {
    setts = new Settings();
    setts.sel_tmpl = 0;
    setts = setts;
    l.debug("ResetSettings called");
    SaveSettings(true);
    setTimeout(() => window.location.reload(), 1000);
  }

  function IsSameProject() {
    if (setts.id === undefined) {
      l.error("Project ID not set");
      return;
    } else if (no_templs) {
      return;
    }

    l.debug("IsSameProject called with project ID:", setts.id);
    csa.Eval(`IsSameProject("${setts.id}")`, function (s_result) {
      /**@type {IsSameProjectResult} */
      let result;

      l.debug(`Checking if same project`, setts.id, s_result);

      try {
        result = JSON.parse(s_result);
      } catch (e) {
        l.error("Failed to parse project check", s_result);
        return;
      }

      if (result.success == false) {
        l.error("Failed to check project", result.error_obj);
        return;
      } else {
        if (result.same_project === false) {
          l.warn(`Different project ID @IsSameProject, reloading settings`);
          StartupSequence();
        }
      }
    });
  }

  let last_opened_tab = null;

  //Updates the render settings templates when the output tab is opened
  $: {
    if (setts.active_tab === "output" && last_opened_tab !== "output") {
      //Check if there's any template selected, otherwise just select the first one

      if (setts.tmpls[setts.sel_tmpl] !== undefined) {
        if (setts.tmpls[setts.sel_tmpl].render_setts_templ == "") {
          setts.tmpls[setts.sel_tmpl].render_setts_templ =
            render_setts_templs.render_templs[0];
        }

        if (setts.tmpls[setts.sel_tmpl].render_out_module_templ == "") {
          setts.tmpls[setts.sel_tmpl].render_out_module_templ =
            render_setts_templs.output_modules_templs[0];
        }
      }

      last_opened_tab = "output";
    } else {
      last_opened_tab = setts.active_tab;
    }
  }

  /** @type {RenderSettsResults}*/
  let render_setts_templs;

  function GetRenderSettsTempls() {
    return new Promise((resolve, reject) => {
      csa.Eval(`GatherRenderTemplates()`, function (s_result) {
        /**@type {RenderSettsResults}*/
        let result;

        try {
          result = JSON.parse(s_result);
        } catch (e) {
          l.error("Failed to parse render templates", s_result);
          reject(e);
          return;
        }

        if (result.success == false) {
          l.error("Failed to load render templates", result.error_obj);
          reject(result.error_obj);
        } else {
          resolve(result);
          l.log(`Parsed Render Settings Templates`, result);
        }
      }); //Eval
    }); //Promise
  }

  async function F_Reload() {
    let n_tmpls = (await GetTemplates().catch((e) => {
      l.error("F_Reload GetTemplates error:", e);
      return;
    })) as Template[];

    if (n_tmpls.length == 0) {
      no_templs = true;
      return;
    } else {
      no_templs = false;
    }

    let loaded_render_setts = await GetRenderSettsTempls().catch((e) => {
      l.error(e);
      return;
    });

    render_setts_templs = loaded_render_setts;

    setts.UpdateTemplates(n_tmpls);
    setts = setts;
    l.debug("F_Reload called with templates:", n_tmpls);
  }

  function Test() {
    l.error("Test called");
  }

  function AddRow() {
    setts.tmpls[setts.sel_tmpl].AddRow();
    setts = setts;
    l.debug("AddRow called");
  }

  function AddColumn() {
    setts.tmpls[setts.sel_tmpl].AddColumn();
    setts = setts;
    l.debug("AddColumn called");
  }

  function DeleteRow(row_i) {
    setts.tmpls[setts.sel_tmpl].DeleteRow(row_i);
    setts = setts;
    l.debug("DeleteRow called with row index:", row_i);
  }

  function DeleteColumn(col_i) {
    setts.tmpls[setts.sel_tmpl].DeleteColumn(col_i);
    setts = setts;
    l.debug("DeleteColumn called with column index:", col_i);
  }

  function PreviewRow(row_i, live = false) {
    l.debug("PreviewRow called with row index:", row_i, "and live:", live);
    if (!setts.auto_preview && live) return;

    if (!setts.auto_preview) live = false;

    //Trim the template to contain only the modified row

    //TODO this is a hack, find a better way to do this
    let send_templ = Template.FromJson(
      JSON.parse(JSON.stringify(setts.tmpls[setts.sel_tmpl])),
    );
    for (let col of send_templ.columns) {
      col.values = [col.values[row_i]];
    }

    send_templ.ResolveAltSrcPaths();
    send_templ.save_paths = [send_templ.save_paths[0]];
    send_templ.generate_names = [send_templ.generate_names[0]];

    let s_templt = JSON.stringify(send_templ);
    l.debug(`Previewing Row:`, s_templt, row_i, live);

    csa.Eval(`PreviewRow('${s_templt}', ${0}, ${live})`, function (s_result) {
      l.debug(`Preview Row Result`, s_result);
    });
  }

  /**
   * Copies the values in the template composition to the current row
   * @param row_i
   */
  function SampleRow(row_i) {
    let s_templt = JSON.stringify(setts.tmpls[setts.sel_tmpl]);
    l.debug("SampleRow called with row index:", row_i);

    csa.Eval(`GetCurrentValues('${s_templt}')`, function (s_result) {
      l.debug(`Sample Row Result: ${s_result}`);

      let result;
      try {
        result = JSON.parse(s_result);

        setts.tmpls[setts.sel_tmpl].ReplaceRowValues(result, row_i);
        setts = setts;
      } catch (e) {
        l.error("Failed to parse sample row result", s_result);
        return;
      }
    });
  }

  function RenderSingleRow(row_i) {
    l.debug("RenderSingleRow called with row index:", row_i);

    //Trim the template to contain only the modified row

    //TODO this is a hack, find a better way to do this
    let send_templ = Template.FromJson(
      JSON.parse(JSON.stringify(setts.tmpls[setts.sel_tmpl])),
    );
    send_templ.ResolveSavePaths();

    for (let col of send_templ.columns) {
      col.values = [col.values[row_i]];
    }

    send_templ.ResolveAltSrcPaths();
    send_templ.save_paths = [send_templ.save_paths[row_i]];
    send_templ.generate_names = [send_templ.generate_names[row_i]];

    let string_templt = JSON.stringify(send_templ);
    l.debug("Rendering:", string_templt);

    csa.Eval(
      `BatchRender('${string_templt}', "${setts.render_comps_folder}")`,
      function (s_result) {
        /**@type {BatchRenderResult}*/
        let result;

        try {
          result = JSON.parse(s_result);
        } catch (e) {
          l.error(
            "Failed to parse batch render result in RenderSingleRow: ",
            s_result,
          );
          return;
        }

        if (result.success == false) {
          l.error(
            "Failed to batch render in RenderSingleRow",
            result.error_obj,
          );
          return;
        } else {
          l.debug(`Batch Render Started in Render Single Row`);
        }
      },
    );
  }

  let render_errors = [];

  function BatchRender() {
    setts.tmpls[setts.sel_tmpl].ResolveCompsNames();
    setts.tmpls[setts.sel_tmpl].ResolveSavePaths();
    setts.tmpls[setts.sel_tmpl].ResolveAltSrcPaths();

    render_errors = [];

    let string_templt = JSON.stringify(setts.tmpls[setts.sel_tmpl]);
    l.debug("BatchRender called");
    l.log("Rendering:", setts.tmpls[setts.sel_tmpl]);

    csa.Eval(
      `BatchRender('${string_templt}', "${setts.render_comps_folder}")`,
      function (s_result) {
        /**@type {BatchRenderResult}*/
        let result;

        try {
          result = JSON.parse(s_result);
        } catch (e) {
          l.error("Failed to parse batch render result", s_result);
          return;
        }

        if (result.success == false) {
          l.error("Failed to batch render", result.error_obj);
          return;
        } else {
          l.debug(`Batch Render Started`);
          if (result.errors !== undefined && result.errors.length > 0) {
            l.warn(`Batch Render Errors`, result.errors);

            render_errors = result.errors.map((e) => {
              if (e.message !== undefined) {
                return e.row + " " + e.message;
              } else {
                return e;
              }
            });

            l.debug(`Batch Render Errors`, render_errors);
          }
        }
      },
    );
  }

  function BatchGenerate() {
    setts.tmpls[setts.sel_tmpl].ResolveCompsNames();
    setts.tmpls[setts.sel_tmpl].ResolveAltSrcPaths();

    let string_templt = JSON.stringify(setts.tmpls[setts.sel_tmpl]);
    l.debug("BatchGenerate called");
    l.log("Rendering:", string_templt);

    csa.Eval(`BatchGenerate('${string_templt}')`, function (s_result) {
      /**@type {BatchGenerateResult}*/
      let result;

      try {
        result = JSON.parse(s_result);
      } catch (e) {
        l.error("Failed to parse batch render result", s_result);
        return;
      }

      if (result.success == false) {
        l.error("Failed to batch render", result.error_obj);
        return;
      } else {
        l.debug(`Batch Render Started`);
      }
    });
  }

  function BatchOneToMany() {
    l.debug("BatchOneToMany called");

    setts.tmpls[setts.sel_tmpl].ResolveCompsNames();
    // setts.tmpls[setts.sel_tmpl].ResolveSavePaths();
    setts.tmpls[setts.sel_tmpl].ResolveAltSrcPaths();
    setts.tmpls[setts.sel_tmpl].ResolveSavePathDeps();

    render_errors = [];

    let string_templt = JSON.stringify(setts.tmpls[setts.sel_tmpl]);
    l.debug("BatchOneToMany called");
    l.log("Rendering:", string_templt);

    csa.Eval(`BatchRenderDepComps('${string_templt}')`, function (s_result) {
      /**@type {BatchRenderResult}*/
      let result;

      try {
        result = JSON.parse(s_result);
      } catch (e) {
        l.error("Failed to parse OtM render result", s_result);
        return;
      }

      if (result.success == false) {
        l.error("Failed to render OtM", result.error_obj);
        return;
      } else {
        l.debug(`OtM Render Started`);
        if (result.errors !== undefined && result.errors.length > 0) {
          l.warn(`OtM Render Errors`, result.errors);

          render_errors = result.errors.map((e) => {
            if (e.message !== undefined) {
              return e.row + " " + e.message;
            } else {
              return e;
            }
          });

          l.debug(`OtM Render Errors`, render_errors);
        }
      }
    });
  }

  /**
   * Selects a folder to save the files to and adds it to the save pattern
   */
  function SelRenderBasePath() {
    l.debug("SelectBasePath called");
    let initial_folder = setts.tmpls[setts.sel_tmpl].base_path || "";

    csa.OpenFolderDialog(initial_folder).then((result) => {
      if (result === null) return;

      setts.tmpls[setts.sel_tmpl].base_path = result;
    });
  }

  /**
   * Updates the preview of the save path based on the current save pattern
   */
  $: {
    if (setts.tmpls[setts.sel_tmpl] !== undefined) {
      setts.tmpls[setts.sel_tmpl].save_paths[0] = setts.tmpls[
        setts.sel_tmpl
      ].ResolveSavePath(setts.tmpls[setts.sel_tmpl].save_pattern, 0);
    }
  }

  let sel_add_field = "base_path";
  function AddField() {
    let save_pattern_ta: HTMLTextAreaElement =
      document.querySelector("#save_pattern_ta");

    let cursor_pos = save_pattern_ta.selectionStart;
    let old_val = setts.tmpls[setts.sel_tmpl].save_pattern;

    //Insert the selected field at the cursor position
    setts.tmpls[setts.sel_tmpl].save_pattern =
      old_val.slice(0, cursor_pos) +
      `{${sel_add_field}}` +
      old_val.slice(cursor_pos);
  }

  function AddField_Dep(dep_comps_s: DepCompSetts) {
    let pattern_ta: HTMLTextAreaElement = document.querySelector(
      `[data-dc-pattern="${dep_comps_s.id}"]`,
    );

    console.log(pattern_ta);
    console.log(dep_comps_s);

    let cursor_pos = pattern_ta.selectionStart;
    let old_val =
      setts.tmpls[setts.sel_tmpl].dep_config[dep_comps_s.id].save_pattern;

    //Insert the selected field at the cursor position
    setts.tmpls[setts.sel_tmpl].dep_config[dep_comps_s.id].save_pattern =
      old_val.slice(0, cursor_pos) +
      `{${sel_add_field}}` +
      old_val.slice(cursor_pos);
  }

  $: {
    if (setts.tmpls[setts.sel_tmpl] !== undefined) {
      setts.tmpls[setts.sel_tmpl].generate_names[0] = setts.tmpls[
        setts.sel_tmpl
      ].ResolveCompName(setts.tmpls[setts.sel_tmpl].generate_pattern, 0);
    }
  }

  let sel_add_field_gen = "row_number";
  function AddField_Gen() {
    let pattern_ta: HTMLTextAreaElement =
      document.querySelector("#generate_proj_ta");

    let cursor_pos = pattern_ta.selectionStart;
    let old_val = setts.tmpls[setts.sel_tmpl].generate_pattern;

    //Insert the selected field at the cursor position
    setts.tmpls[setts.sel_tmpl].generate_pattern =
      old_val.slice(0, cursor_pos) +
      `{${sel_add_field_gen}}` +
      old_val.slice(cursor_pos);
  }

  let show_alt_src_modal = false;
  let alt_src_modal_col;

  function SetupAlternateSource(col_i) {
    show_alt_src_modal = true;
    alt_src_modal_col = col_i;
  }

  function AlertSrcModalClosed(base_path, pattern) {
    setts.tmpls[setts.sel_tmpl].columns[alt_src_modal_col].alt_src_base =
      base_path;
    setts.tmpls[setts.sel_tmpl].columns[alt_src_modal_col].alt_src_pattern =
      pattern;

    setts.tmpls[setts.sel_tmpl].columns[alt_src_modal_col].ResolveAltSrcPaths(
      setts.tmpls[setts.sel_tmpl].columns,
    );
  }

  let edit_dep_comp_id;
  function DepFilePatternModalOpen(dep_comp_id) {
    edit_dep_comp_id = dep_comp_id;

    m_file_pattern.Open(
      setts.tmpls[setts.sel_tmpl],
      dep_comp_id,
      DepFilePatternModalClosed,
    );
  }

  function DepFilePatternModalClosed(base_path, pattern) {
    setts.tmpls[setts.sel_tmpl].dep_config[edit_dep_comp_id].save_pattern =
      pattern;

    setts.tmpls[setts.sel_tmpl].ResolveSavePathFirstDeps(0);
  }

  /**
   * Selects a folder to save the files to and adds it to the save pattern
   */
  function ImportCSV() {
    l.debug("ImportCSV called");
    csa.Eval(`ImportFile()`, function (result) {
      if (result === "null") return;

      let decoded = decodeURIComponent(result);

      setts.tmpls[setts.sel_tmpl].LoadFromCSV(decoded);

      setts = setts;
    });
  }

  function ExportCSV() {
    let content = setts.tmpls[setts.sel_tmpl].MakeCSV();
    l.debug("ExportCSV called");
    //URL encode the content
    content = encodeURIComponent(content);

    csa.Eval(`ExportFile('${content}')`, function (result) {
      if (result == "null") return;
    });
  }

  function SaveJSON() {
    let content = JSON.stringify(setts);
    l.debug("SaveJSON called");
    //URL encode the content
    content = encodeURIComponent(content);

    csa.Eval(`ExportFile('${content}')`, function (result) {
      if (result == "null") return;
    });
  }

  function LoadJSON() {
    l.debug("LoadJSON called");
    csa.Eval(`ImportFile()`, function (result) {
      if (result === "null") return;

      let decoded = decodeURIComponent(result);

      let json_setts = JSON.parse(decoded);

      setts.FromJson(json_setts);
      setts.id = setts.MakeId();
      SaveSettings(true);
      setts = setts;
    });
  }
</script>

<!-- HEADER -->
<header>
  <div class="header_template">
    <label for="sel_comp">Template</label>
    <Dropdown
      options={setts.tmpls.map((templ) => setts.tmpls.indexOf(templ))}
      labels={setts.tmpls.map((templ) => templ.name)}
      bind:value={setts.sel_tmpl}
    />
  </div>

  <div class="header_tabs">
    <button
      class:curr_tab={setts.active_tab === "data"}
      onclick={() => (setts.active_tab = "data")}>Data</button
    >
    <button
      class:curr_tab={setts.active_tab === "output"}
      onclick={() => (setts.active_tab = "output")}>Output</button
    >
    <button
      class:curr_tab={setts.active_tab === "settings"}
      onclick={() => (setts.active_tab = "settings")}>Settings</button
    >
  </div>

  <div class="header_reload">
    <button onclick={F_Reload} class="delete_col"><Update /></button>
    <button
      class="delete_col"
      onclick={() =>
        csa.OpenURLInDefaultBrowser(
          "https://gabriel-ar.github.io/Ae-EasyBatch/",
        )}><QuestionMark /></button
    >
  </div>
</header>

<!-- DATA -->
{#if setts.active_tab === "data"}
  <main>
    {#if setts.sel_tmpl >= 0 && setts.tmpls[setts.sel_tmpl] !== undefined && setts.tmpls.length > 0}
      <table>
        <thead>
          <tr>
            <th></th>
            {#each setts.tmpls[setts.sel_tmpl].table_cols as col_i, view_i}
              <th class="table_header">
                <Dropdown
                  variant="discrete"
                  options={setts.tmpls[setts.sel_tmpl].columns.map((col) =>
                    setts.tmpls[setts.sel_tmpl].columns.indexOf(col),
                  )}
                  labels={setts.tmpls[setts.sel_tmpl].columns.map(
                    (col) => col.cont_name,
                  )}
                  bind:value={setts.tmpls[setts.sel_tmpl].table_cols[view_i]}
                />
                {#if setts.tmpls[setts.sel_tmpl].columns[col_i].type == Column.PropertyValueType.SRC_ALTERNATE}
                  <button
                    class="delete_col"
                    data-tooltip="Setup alternate source"
                    data-tt-pos="bottom-right"
                    onclick={() => {
                      SetupAlternateSource(col_i);
                    }}><Gear /></button
                  >
                {/if}
                <button
                  class="delete_col"
                  data-tooltip="Delete column"
                  data-tt-pos="bottom-right"
                  onclick={() => DeleteColumn(view_i)}><Trash /></button
                >
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each setts.tmpls[setts.sel_tmpl].rows as row, row_i}
            <tr>
              <td
                ><button
                  class="delete_row"
                  data-tooltip="Delete Row"
                  data-tt-pos="top-right"
                  onclick={() => DeleteRow(row_i)}
                >
                  <Trash />
                </button>
                <button
                  class="delete_row"
                  data-tooltip="Preview this row"
                  data-tt-pos="top-right"
                  onclick={() => PreviewRow(row_i)}><EyeOpen /></button
                >
                <button
                  class="delete_row"
                  data-tooltip="Copy data from preview"
                  data-tt-pos="top-right"
                  onclick={() => SampleRow(row_i)}><Crosshair2 /></button
                >
                <button
                  class="delete_row"
                  data-tooltip="Render this row"
                  data-tt-pos="top-right"
                  onclick={() => RenderSingleRow(row_i)}><Camera /></button
                >
              </td>
              {#each setts.tmpls[setts.sel_tmpl].table_cols as td_col_i}
                <td
                  class={{
                    table_cell:
                      setts.tmpls[setts.sel_tmpl].columns[td_col_i].type !==
                      Column.PropertyValueType.SRC_ALTERNATE,
                  }}
                >
                  <PropInput
                    bind:value={
                      setts.tmpls[setts.sel_tmpl].columns[td_col_i].values[
                        row_i
                      ]
                    }
                    type={setts.tmpls[setts.sel_tmpl].columns[td_col_i].type}
                    onchange={() => {
                      PreviewRow(row_i, true);
                    }}
                  />
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </main>

  <footer class="table_tools">
    <div>
      <button onclick={AddRow}>Add Row</button>
      <button onclick={AddColumn}>Add Column</button>
    </div>
    <div class="table_tools">
      <button onclick={ImportCSV}>Import from CSV</button>
      <button onclick={ExportCSV}>Export to CSV</button>
    </div>
  </footer>
  <!-- OUTPUT -->
{:else if setts.active_tab === "output"}
  <main class="output">
    <span
      >Mode:
      <Dropdown
        variant="discrete"
        labels={["Render", "One to Many", "Generate Comps"]}
        options={["render", "dependant", "generate"]}
        bind:value={setts.out_mode}
      />
    </span>

    <!-- MODE: RENDER -->
    {#if setts.out_mode === "render"}
      <h4>
        File Name Pattern<button
          class="info"
          data-tooltip="Generates the file name of every export depending on the pattern."
          >i</button
        >
      </h4>

      <textarea
        id="save_pattern_ta"
        spellcheck="false"
        bind:value={setts.tmpls[setts.sel_tmpl].save_pattern}
      ></textarea>

      <div class="setting">
        <span>Preview:</span>
        <span class="out_prev">{setts.tmpls[setts.sel_tmpl].save_paths[0]}</span
        >
      </div>

      <div class="setting">
        <button onclick={SelRenderBasePath}>Pick Base Path</button>

        <Dropdown
          style={"margin-left: 15px;"}
          labels={[
            "Base Path",
            "Template Name",
            "Row Number",
            "Increment",
            ...setts.tmpls[setts.sel_tmpl].columns.map((col) => col.cont_name),
          ]}
          options={[
            "base_path",
            "template_name",
            "row_number",
            "increment:0000",
            ...setts.tmpls[setts.sel_tmpl].columns.map((col) => col.cont_name),
          ]}
          bind:value={sel_add_field}
        />

        <button onclick={AddField}>Add Field</button>
      </div>

      <h4>Render Settings</h4>

      <div class="setting">
        <label for="sel_render_setts_templ">Render Settings Template</label>

        <Dropdown
          labels={render_setts_templs.render_templs.filter(
            (templ) => !templ.startsWith("_HIDDEN"),
          )}
          options={render_setts_templs.render_templs.filter(
            (templ) => !templ.startsWith("_HIDDEN"),
          )}
          bind:value={setts.tmpls[setts.sel_tmpl].render_setts_templ}
        />
      </div>

      <div class="setting">
        <label for="sel_render_out_module">Output Module Template</label>
        <Dropdown
          labels={render_setts_templs.output_modules_templs.filter(
            (templ) => !templ.startsWith("_HIDDEN"),
          )}
          options={render_setts_templs.output_modules_templs.filter(
            (templ) => !templ.startsWith("_HIDDEN"),
          )}
          bind:value={setts.tmpls[setts.sel_tmpl].render_out_module_templ}
        />
      </div>

      <button class="setting" onclick={BatchRender}>Start Batch Render</button>

      {#if render_errors.length > 0}
        <div class="render_msgs">
          <h4>Errors</h4>
          {#each render_errors as error}
            <div>{error}</div>
          {/each}
        </div>
      {/if}
    {:else if setts.out_mode === "generate"}
      <!-- MODE: GENERATE -->

      <h4>Project Name Pattern</h4>
      <textarea
        id="generate_proj_ta"
        spellcheck="false"
        bind:value={setts.tmpls[setts.sel_tmpl].generate_pattern}
      ></textarea>

      <div class="setting">
        <span>Preview:</span>
        <span class="out_prev"
          >{setts.tmpls[setts.sel_tmpl].generate_names[0]}</span
        >
      </div>

      <div class="setting">
        <div>
          <button onclick={AddField_Gen}>Add Field</button>
          <Dropdown
            labels={[
              "Template Name",
              "Row Number",
              "Increment",
              ...setts.tmpls[setts.sel_tmpl].columns.map(
                (col) => col.cont_name,
              ),
            ]}
            options={[
              "template_name",
              "row_number",
              "increment:0000",
              ...setts.tmpls[setts.sel_tmpl].columns.map(
                (col) => col.cont_name,
              ),
            ]}
            bind:value={sel_add_field_gen}
          />
        </div>
      </div>

      <div class="setting">
        <label for="in_imported_folder">Generated Comps Folder Name </label>
        <input
          id="in_gen_folder"
          type="text"
          bind:value={setts.tmpls[setts.sel_tmpl].gen_comps_folder}
        />
      </div>

      <button class="setting" onclick={BatchGenerate}>Generate Projects</button>
    {:else if setts.out_mode === "dependant"}
      <!-- MODE: DEPENDANT -->

      <h4>Common Base Path</h4>

      <div class="setting">
        <span>{setts.tmpls[setts.sel_tmpl].base_path}</span>
        <div><button onclick={SelRenderBasePath}>Choose Folder...</button></div>
      </div>

      {#each setts.tmpls[setts.sel_tmpl].dep_comps as dc}
        <div class="out_sub_render">
          <input
            type="checkbox"
            style="margin: 5px 5px 3px 0;"
            bind:checked={setts.tmpls[setts.sel_tmpl].dep_config[dc.id].enabled}
          />
          <h4 style="display: inline;">{dc.name}</h4>

          <div class="setting">
            <h5>
              File Pattern: {setts.tmpls[setts.sel_tmpl].dep_config[dc.id]
                .save_pattern}
            </h5>

            <div>
              <span>Preview:</span>
              <span class="out_prev"
                >{setts.tmpls[setts.sel_tmpl].dep_config[dc.id].save_path}</span
              >
            </div>
            <button
              style="margin-top: 5px;"
              data-tooltip="Edit file pattern"
              data-tt-pos="top-right"
              onclick={() => DepFilePatternModalOpen(dc.id)}
              >Edit Pattern <Gear /></button
            >
          </div>

          <h5>Render Settings</h5>

          <div class="setting">
            <label for="sel_render_setts_templ">Render Settings Template</label>
            <Dropdown
              labels={render_setts_templs.render_templs.filter(
                (templ) => !templ.startsWith("_HIDDEN"),
              )}
              options={render_setts_templs.render_templs.filter(
                (templ) => !templ.startsWith("_HIDDEN"),
              )}
              bind:value={
                setts.tmpls[setts.sel_tmpl].dep_config[dc.id].render_setts_templ
              }
            />
          </div>

          <div class="setting">
            <label for="sel_render_out_module">Output Module Template</label>

            <Dropdown
              variant={setts.tmpls[setts.sel_tmpl].dep_config[dc.id]
                .single_frame
                ? "disabled"
                : ""}
              labels={render_setts_templs.output_modules_templs.filter(
                (templ) => !templ.startsWith("_HIDDEN"),
              )}
              options={render_setts_templs.output_modules_templs.filter(
                (templ) => !templ.startsWith("_HIDDEN"),
              )}
              bind:value={
                setts.tmpls[setts.sel_tmpl].dep_config[dc.id]
                  .render_out_module_templ
              }
            />
          </div>

          <div class="setting">
            <label for="sel_render_out_module">As Single Frame PNG</label>
            <input
              type="checkbox"
              bind:checked={
                setts.tmpls[setts.sel_tmpl].dep_config[dc.id].single_frame
              }
            />
          </div>
        </div>
      {/each}

      <!-- <button onclick={BatchGenerate}>Generate Projects</button> -->
      <button onclick={BatchOneToMany}>Batch One to Many</button>
    {/if}
  </main>
{:else if setts.active_tab == "settings"}
  <main class="settings">
    <div class="setting">
      <label for="in_imported_folder"
        >Imported Footage Folder Name
        <br /><span class="sett_label_note">Per template</span>
      </label>
      <input
        id="in_gen_folder"
        type="text"
        bind:value={setts.tmpls[setts.sel_tmpl].imported_footage_folder}
      />
    </div>

    <div class="setting">
      <label for="in_imported_folder"
        >Template Comps Render Folder Name
        <br /><span class="sett_label_note">Global</span>
      </label>
      <input
        id="in_gen_folder"
        type="text"
        bind:value={setts.render_comps_folder}
      />
    </div>

    <div class="setting">
      <label for="in_imported_folder">
        Automatically preview when changing values
        <input type="checkbox" bind:checked={setts.auto_preview} />
      </label>
    </div>

    <div class="row">
      <label for="in_imported_folder">Log Level </label>

      <Dropdown
        style_list="text-transform: capitalize;"
        labels={Object.entries(Logger.Levels).map(
          ([key, val]) => val + " - " + key,
        )}
        options={Object.entries(Logger.Levels).map(([key, val]) => val)}
        bind:value={setts.log_level}
      />
    </div>

    <div class="row">
      <button onclick={LoadJSON}>Load Config as JSON</button>
      <button onclick={SaveJSON}>Save Config as JSON</button>
      <button onclick={ResetSettings}>Reset Settings</button>
    </div>
  </main>
{/if}

{#if setts.tmpls[setts.sel_tmpl] !== undefined && show_alt_src_modal}
  <ModalAlternateSrcV2
    bind:show={show_alt_src_modal}
    tmpl={setts.tmpls[setts.sel_tmpl]}
    col_i={alt_src_modal_col}
    onclose={AlertSrcModalClosed}
  />
{/if}

<ModalFilePattern bind:this={m_file_pattern}></ModalFilePattern>

{#if no_templs}
  <div class="fs_no_tmpls">
    No Essentials Graphics Templates Found
    <span>Create one and reload the extension</span>
    <div><button onclick={StartupSequence}><Update /> Reload</button></div>
  </div>
{/if}

<style>
  :global(#app) {
    display: grid;
    height: 100vh;

    grid-template-rows: auto 1fr auto;
    grid-template-columns: auto;

    grid-template-areas:
      "header"
      "main"
      "footer";
  }

  /* h3, */
  h4 {
    margin: 0;
  }

  header {
    display: flex;

    padding: 0;
    margin: 0;

    grid-area: header;
  }

  header > * {
    border-bottom: 2px solid var(--color-divider);
  }

  .header_template {
    display: flex;
    gap: 7px;

    padding: 10px 10px;
  }

  .header_tabs {
    display: flex;
    flex-grow: 1;

    padding-left: 10px;
    margin: 0;
  }

  .header_tabs button {
    display: flex;
    margin: 0;

    padding: 2px 7px 0 7px;

    align-items: center;

    background-color: transparent;
    border: none;
    border-bottom: solid 2px transparent;

    color: white;

    transition: border 0.2s;

    border-radius: 0;
  }

  .header_tabs button:hover {
    cursor: pointer;
    border: none;
    outline: none;
    border-bottom: solid 2px rgba(255, 255, 255, 0.2) !important;
  }

  .header_tabs button:focus,
  .curr_tab {
    cursor: pointer;
    border: none;
    outline: none;
    border-bottom: solid 2px rgba(255, 255, 255, 1) !important;
  }

  .header_reload {
    display: flex;
    padding-right: 10px;
  }

  main {
    display: flex;
    flex-direction: column;
    /*gap: 1rem;*/

    padding: 10px 10px;

    overflow: auto;

    /* background-color: var(--color-m1); */
  }

  footer {
    display: flex;
    gap: 1rem;

    padding: 10px 10px;

    border-top: 2px solid var(--color-divider);
  }

  table,
  th,
  td {
    border-collapse: collapse;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  tr {
    height: 20px;
  }

  td {
    padding: 0 8px;
  }

  .table_header {
    white-space: nowrap;
  }

  .table_cell {
    white-space: nowrap;
  }

  .delete_row,
  .delete_col {
    background-color: transparent;
    border: none;

    padding: 3px;

    vertical-align: middle;
  }
  .delete_row:hover,
  .delete_col:hover {
    cursor: pointer;
    background-color: rgba(255, 255, 255, 0.1);
  }

  /*/////OUTPUT/////*/

  .output textarea {
    min-height: 1.5em;
    resize: vertical;
  }

  .output .setting {
    margin: 2px 0 9px 0;
  }

  .output h5 {
    font-size: 1rem;
    margin: 13px 0 2px 0;
    color: rgba(255, 255, 255, 0.7);
  }

  .output h4 {
    font-size: 1.1rem;
    margin: 13px 0 2px 0;
  }

  .output label,
  .output span {
    font-size: 1rem;
    color: rgba(255, 255, 255, 0.8);
  }

  .output label {
    margin: 0 5px 0 0;
  }

  /* .output h3 {
    text-align: center;
  }*/

  .out_prev {
    color: rgba(255, 255, 255, 0.6);
    word-break: break-all;
  }

  .out_sub_render {
    padding: 12px 0 12px 0;

    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }

  .settings .setting {
    display: flex;
    flex-direction: column;
    margin: 2px 0 7px 0;
  }

  .settings .setting label {
    margin: 0 0 5px 0;
  }

  .settings .row {
    margin: 2px 0 8px 0;
  }

  .settings .row > label {
    margin: 0 5px 0 0;
  }

  .sett_label_note {
    margin: 0;
    line-height: 0.8em;
    font-size: 0.8em;
    color: rgba(255, 255, 255, 0.6);
  }

  .fs_no_tmpls {
    position: fixed;

    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;

    font-size: 18px;

    width: 100%;
    height: 100%;

    background-color: rgba(0, 0, 0, 0.597);
    backdrop-filter: blur(5px);
  }

  .fs_no_tmpls span {
    font-size: 16px;
    color: rgba(255, 255, 255, 0.6);

    margin-bottom: 1em;
  }
</style>
