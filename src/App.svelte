<script lang="ts">
  /**
  This is a CEP app for After Effects that proceeds the user with automation tools for mograph templates.
  The user can either use a table or an external CSV file to populate the template. Each row in the table or CSV file will be used to populate a single instance of the template.
  */

  import CSAdapter from "./lib/CSAdapter.ts";
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
    CheckCircled,
    CrossCircled,
    Pencil1,
    ExclamationTriangle,
    HamburgerMenu,
    ArrowLeft,
    ArrowRight,
    Table,
  } from "radix-icons-svelte";

  import {
    Settings,
    Template,
    Column,
    type DepCompSetts,
    type Comp,
    Tabs,
  } from "./lib/Settings";

  import Logger from "./lib/Logger";

  import { SaveSettsRequest } from "./lib/Messaging";
  import type {
    GetTmplsResult,
    GetSettsResult,
    SaveSettingsResults,
    RenderSettsResults,
    BatchRenderResult,
    BatchGenerateResult,
    IsSameProjectResult,
    GetAllCompsResult,
    RowRenderResult,
  } from "./lib/Messaging";

  import PropInput from "./ui/PropInput.svelte";
  import ModalAlternateSrcV2 from "./ui/ModalAlternateSrcV2.svelte";
  import ModalFilePattern from "./ui/ModalDepFilePattern.svelte";
  import Dropdown from "./ui/Dropdown.svelte";
  import ModalMessage from "./ui/ModalMessage.svelte";
  import ModalEditView from "./ui/ModalEditView.svelte";
  import SettingsPanel from "./ui/SettingsTab.svelte";
  import MenuRow from "./ui/MenuCtx.svelte";
  import AddAfter from "./assets/AddAfter.svelte";
  import AddBefore from "./assets/AddBefore.svelte";
  import ActionCoordinator from "./lib/ActionCoordinator.ts";
  import { l } from "./ui/States.svelte.ts";

  let csa = new CSAdapter();
  let setts = new Settings();
  let ac = new ActionCoordinator();

  let no_templs = false;
  let false_blur = false;

  let m_file_pattern: ModalFilePattern;
  let m_message: ModalMessage;
  let m_edit_view: ModalEditView;
  let menu_row: MenuRow;
  let curr_row_i = 0;

  //Update the log level of the logger when the settings changes
  $: {
    l.log_lvl = setts.log_level;
    setContext("logger", l);
  }

  onMount(() => {
    StartupSequence();
    SetupShortcuts();
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
      //IsSameProject();
    };
  }

  function GetTemplates(): Promise<Template[]> {
    return new Promise((resolve, reject) => {
      csa.Eval("GetTemplates").then((s_result) => {
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
      csa.Eval("LoadSettings").then((s_result) => {
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

    csa.Eval("SaveSettings", s_request).then((s_result) => {
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

  let last_opened_tab = null;

  //Updates the render settings templates when the output tab is opened
  $: {
    if (setts.active_tab === "output" && last_opened_tab !== "output") {
      //Check if there's any template selected, otherwise just select the first one

      if (setts.tmpls[setts.sel_tmpl] !== undefined) {
        if (setts.tmpls[setts.sel_tmpl].render_setts_templ == "") {
          setts.tmpls[setts.sel_tmpl].render_setts_templ =
            render_setts_templs.render_templs[
              render_setts_templs.default_render_templ
            ] || render_setts_templs.render_templs[0];
        }

        if (setts.tmpls[setts.sel_tmpl].render_out_module_templ == "") {
          setts.tmpls[setts.sel_tmpl].render_out_module_templ =
            render_setts_templs.output_modules_templs[
              render_setts_templs.default_output_module_templ
            ] || render_setts_templs.output_modules_templs[0];
        }
      }
    }
    last_opened_tab = setts.active_tab;
  }

  /** @type {RenderSettsResults}*/
  let render_setts_templs;

  function GetRenderSettsTempls() {
    return new Promise((resolve, reject) => {
      csa.Eval("GetRenderTemplates").then((s_result) => {
        /**@type {RenderSettsResults}*/
        let result;

        try {
          result = JSON.parse(s_result);
        } catch (e) {
          l.error("Failed to parse render templates:", s_result);
          reject(e);
          return;
        }

        if (result.success == false) {
          l.error("Failed to load render templates:", result.error_obj);
          reject(result.error_obj);
        } else {
          resolve(result);
          l.log(`Parsed Render Settings Templates:`, result);
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

  function DeleteRow(row_i) {
    setts.tmpls[setts.sel_tmpl].DeleteRow(row_i);
    setts = setts;
    l.debug("DeleteRow called with row index:", row_i);
  }

  /**
   * 
   * @param row_i
   * @param prop_changed True if the preview is being called due to a property change
   */
  function PreviewRow(row_i, prop_changed = false) {
    l.debug("PreviewRow called with row index:", row_i, "and live:", prop_changed);
    if (!setts.auto_preview && prop_changed) return;

    let show_prev_comp = !setts.auto_preview;

    setts.tmpls[setts.sel_tmpl].ResolveAltSrcPathsRow(row_i);
    setts.tmpls[setts.sel_tmpl] = setts.tmpls[setts.sel_tmpl]; //Force reactivity to update path previews

    //Trim the template to contain only the modified row
    let send_templ = Template.MakeCopy(setts.tmpls[setts.sel_tmpl]);

    for (let col of send_templ.columns) {
      col.values = [col.values[row_i]];
    }
    send_templ.save_paths = [send_templ.save_paths[0]];
    send_templ.generate_names = [send_templ.generate_names[0]];

    let s_templt = JSON.stringify(send_templ);
    l.debug(`Previewing Row:`, s_templt, row_i, show_prev_comp);

    csa.Eval("PreviewRow", s_templt, 0, show_prev_comp).then((s_result) => {
      l.debug(`Preview Row Result`, s_result);

      let result;
      try {
        result = JSON.parse(s_result);
      } catch (e) {
        l.error("Failed to parse preview row result", s_result);
        return;
      }

      if (result.success == false) {
        l.error("Failed to preview row", result.error_obj);
        if (!prop_changed)
          m_message.Open(
            result.error_obj.map((e) => e.message).join("<br>"),
            "Error While Previewing Row",
          );
        return;
      }

      if (result.errors !== undefined && result.errors.length > 0 && !prop_changed) {
        m_message.Open(
          result.errors.map((e) => e.message).join("<br>"),
          "Errors While Previewing Row",
        );
      }
    });
  }

  /**
   * Copies the values in the template composition to the current row
   * @param row_i
   */
  function SampleRow(row_i) {
    let s_templt = JSON.stringify(setts.tmpls[setts.sel_tmpl]);
    l.debug("SampleRow called with row index:", row_i);

    csa.Eval("GetCurrentValues", s_templt).then((s_result) => {
      l.debug(`Sample Row Result: ${s_result}`);

      let result;
      try {
        result = JSON.parse(s_result);

        setts.tmpls[setts.sel_tmpl].CopyValuesFromPreview(result, row_i);
        setts = setts;
      } catch (e) {
        l.error("Failed to parse sample row result", s_result);
        return;
      }
    });
  }

  function RenderRow(row_i) {
    switch (setts.out_mode) {
      case "render":
        setts.active_tab = Tabs.Output;
        BatchRender(row_i);
        break;
      case "dependant":
        setts.active_tab = Tabs.Output;
        BatchOneToMany(row_i);
        break;
    }
  }

  //User facing render results
  let render_results: RowRenderResult[] = [];
  function BatchRender(row_i = -1) {
    l.log("BatchRender called");

    let send_templ;
    //If just rendering a single row, clone the template and trim it down to that row
    if (row_i !== undefined && row_i !== -1) {
      send_templ = Template.MakeCopy(setts.tmpls[setts.sel_tmpl]);

      for (let col of send_templ.columns) {
        col.values = [col.values[row_i]];
      }
    } else {
      send_templ = setts.tmpls[setts.sel_tmpl];
    }

    send_templ.ResolveCompsNames();
    send_templ.ResolveSavePaths();
    send_templ.ResolveAltSrcPaths();

    render_results = [];

    let string_templt = JSON.stringify(send_templ);
    l.debug("String sent to csa:", string_templt);

    csa
      .Eval("BatchRender", string_templt, setts.render_comps_folder)
      .then((s_result) => {
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
          m_message.Open(
            result.error_obj.message,
            "Error While Batch Rendering",
          );
          return;
        }

        //Some errors happened, log it as a warning (defalut txt log file level)
        else if (result.errors !== undefined && result.errors.length > 0) {
          l.warn(`Batch Render completed with errors`, result.errors);
          render_results = result.row_results;
        }

        //All rows queued up successfully
        else {
          l.debug(`Batch Render Results`, render_results);
          render_results = result.row_results;
        }
      });
  }

  function BatchGenerate() {
    setts.tmpls[setts.sel_tmpl].ResolveCompsNames();
    setts.tmpls[setts.sel_tmpl].ResolveAltSrcPaths();

    let string_templt = JSON.stringify(setts.tmpls[setts.sel_tmpl]);
    l.debug("BatchGenerate called");
    l.log("Rendering:", string_templt);

    csa.Eval("BatchGenerate", string_templt).then((s_result) => {
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

  let dep_row_results: RowRenderResult[] = [];
  function BatchOneToMany(row_i = -1) {
    l.log("BatchOneToMany called");

    let send_templ;

    //If just rendering a single row, clone the template and trim it down to that row
    if (row_i !== undefined && row_i !== -1) {
      //TODO this is a hack, find a better way to do this
      send_templ = Template.MakeCopy(setts.tmpls[setts.sel_tmpl]);

      for (let col of send_templ.columns) {
        col.values = [col.values[row_i]];
      }
    } else {
      send_templ = setts.tmpls[setts.sel_tmpl];
    }

    send_templ.UpdateRows();
    send_templ.ResolveCompsNames();
    send_templ.ResolveAltSrcPaths();
    send_templ.ResolveSavePathDeps();

    let string_templt = JSON.stringify(send_templ);
    l.debug("OtM String Sent to csa:", string_templt);

    csa.Eval("BatchRenderDepComps", string_templt).then((s_result) => {
      let result: BatchRenderResult;

      try {
        result = JSON.parse(s_result);
      } catch (e) {
        l.error("Failed to parse OtM render result", s_result);
        return;
      }

      l.debug(`OtM Render Results`, result);

      if (result.success == false) {
        l.error("Failed to render OtM", result.error_obj);
        m_message.Open(
          result.error_obj.message,
          "Error While Rendering One to Many",
        );
        return;
      }

      //Some rows had errors, but the queing went through
      else if (result.errors !== undefined && result.errors.length > 0) {
        l.warn(`OtM Render completed with errors`, result.errors);
        dep_row_results = result.row_results;
      }

      //All rows rendered successfully
      else {
        dep_row_results = result.row_results;
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

  //Updates the preview of the generate names based on the current generate pattern
  $: {
    if (setts.tmpls[setts.sel_tmpl] !== undefined) {
      setts.tmpls[setts.sel_tmpl].generate_names[0] = setts.tmpls[
        setts.sel_tmpl
      ].ResolveCompName(setts.tmpls[setts.sel_tmpl].generate_pattern, 0);
    }
  }

  let all_comps: Comp[] = [];
  function GetAllComps() {
    csa.Eval("GetAllComps").then((s_result) => {
      /**@type {GetAllCompsResult}*/
      let result;

      try {
        result = JSON.parse(s_result);
      } catch (e) {
        l.error("Failed to parse all comps", s_result);
        return;
      }

      if (result.success == false) {
        l.error("Failed to get all comps", result.error_obj);
        return;
      } else {
        all_comps = result.comps;
        l.debug(`Got All Comps`, all_comps);
      }
    });
  }

  let selected_comp = "";
  function AddCompToDependents() {
    if (selected_comp !== "") {
      let comp = all_comps.find((c) => c.id === selected_comp);

      if (comp) {
        setts.tmpls[setts.sel_tmpl].AddDependantComp(comp, render_setts_templs);
        setts.tmpls[setts.sel_tmpl].CleanupDependantComps(all_comps);

        //force Svelte reactivity
        setts.tmpls[setts.sel_tmpl].dep_comps =
          setts.tmpls[setts.sel_tmpl].dep_comps;
      }
    }
  }

  function DeleteDependantComp(dep_comp_id) {
    setts.tmpls[setts.sel_tmpl].RemoveDependantComp(dep_comp_id);
    setts.tmpls[setts.sel_tmpl].CleanupDependantComps(all_comps);

    //force Svelte reactivity
    setts.tmpls[setts.sel_tmpl].dep_comps =
      setts.tmpls[setts.sel_tmpl].dep_comps;
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

  function OpenEditViewModal() {
    m_edit_view.Open(setts.tmpls[setts.sel_tmpl], EditViewModalClosed);
  }

  function EditViewModalClosed(new_table_cols: number[]) {
    setts.tmpls[setts.sel_tmpl].table_cols = new_table_cols;
    setts = setts; // Force reactivity
    l.debug("Edit view modal closed with new table_cols:", new_table_cols);
  }

  function SetupShortcuts() {
    //csa.KeyRegisterOverride();
    ac.Init();
    csa.RegisterKeyEventsInterest([
      //MAC
      { keyCode: 0x7d, ctrlKey: true, altKey: true, shiftKey: true }, // Arrow Down
      { keyCode: 0x7e, ctrlKey: true, altKey: true, shiftKey: true }, // Arrow Up

      { keyCode: 0x7d, ctrlKey: false, altKey: true, shiftKey: false }, // Arrow Down ALT
      { keyCode: 0x7e, ctrlKey: false, altKey: true, shiftKey: false }, // Arrow Up ALT

      { keyCode: 0x33, ctrlKey: false, altKey: false, shiftKey: false }, // Delete
      { keyCode: 0x24, ctrlKey: false, altKey: false, shiftKey: false }, // Delete

      { keyCode: 0x01, ctrlKey: false, altKey: false, shiftKey: false }, // S
      { keyCode: 0x0f, ctrlKey: false, altKey: false, shiftKey: false }, // R
      { keyCode: 0x23, ctrlKey: false, altKey: false, shiftKey: false }, // P
      { keyCode: 0x2d, ctrlKey: false, altKey: false, shiftKey: false }, // N
      { keyCode: 0x2d, ctrlKey: false, altKey: false, shiftKey: true }, // Shift+N

      { keyCode: 0x11, ctrlKey: false, altKey: false, shiftKey: true }, // T
      { keyCode: 0x02, ctrlKey: false, altKey: false, shiftKey: true }, // D

    ]);

    //File Actions
    ac.AddListener(
      "import_csv",
      () => {
        ImportCSV();
      },
      "i",
    );

    ac.AddListener(
      "export_csv",
      () => {
        ExportCSV();
      },
      "e",
    );

    // Row/Edit Actions
    ac.AddListener(
      "preview",
      () => {
        PreviewRow(curr_row_i);
      },
      "p",
    );

    ac.AddListener(
      "copy_from_preview",
      () => {
        SampleRow(curr_row_i);
      },
      "s",
      false,
    );

    ac.AddListener(
      "render_row",
      () => {
        RenderRow(curr_row_i);
      },
      "r",
    );

    ac.AddListener(
      "delete",
      () => {
        DeleteRow(curr_row_i);
      },
      "Delete",
    );

    ac.AddListener(
      "delete",
      () => {
        DeleteRow(curr_row_i);
      },
      "Backspace",
    );

    ac.AddListener(
      "add_after",
      () => {
        setts.tmpls[setts.sel_tmpl].AddRowAfter(curr_row_i);
        setts = setts;
        NextRow();
      },
      "N",
      false,
      false,
    );

    ac.AddListener(
      "add_before",
      () => {
        setts.tmpls[setts.sel_tmpl].AddRowBefore(curr_row_i);
        setts = setts;
      },
      "N",
      false,
      true,
    );

    // View Actions

    ac.AddListener(
      "view_detail",
      () => {
        setts.data_mode = "detail";
      },
      "D",
      false,
      true,
    );

    ac.AddListener(
      "view_table",
      () => {
        setts.data_mode = "table";
      },
      "T",
      false,
      true,
    );

    ac.AddListener(
      "edit_view",
      () => {
        OpenEditViewModal();
      },
      "",
    );

    // Navigation Actions

    ac.AddListener(
      "previous_row",
      () => {
        PrevRow();
      },
      "arrowup",
      false,
      false,
      true,
    );
    ac.AddListener(
      "next_row",
      () => {
        NextRow();
      },
      "arrowdown",
      false,
      false,
      true,
    );
  }

  function OpenRowMenu(e, row_i) {
    //if the active element is an input, don't open the menu
    if (
      document.activeElement instanceof HTMLInputElement ||
      document.activeElement instanceof HTMLTextAreaElement
    ) {
      return;
    }

    curr_row_i = row_i;
    e.preventDefault();
    menu_row.Open(e.pageX, e.pageY, RowMenuSelected);
  }

  function RowMenuSelected(action) {
    l.debug("RowMenuSelected called with action:", action, "row:", curr_row_i);
    ac.Fire(action);
  }

  function OpenBarMenu(e: MouseEvent, type: string) {
    let btn = e.target as HTMLButtonElement;
    menu_row.Open(
      btn.offsetLeft,
      btn.offsetTop + btn.offsetHeight,
      BarMenuSelected,
      type,
    );
  }

  function BarMenuSelected(action: string) {
    l.debug("BarMenuSelected called with action:", action);
    ac.Fire(action);
  }

  function NextRow() {
    if (curr_row_i < setts.tmpls[setts.sel_tmpl].rows.length - 1) {
      curr_row_i++;
    }
  }

  function PrevRow() {
    if (curr_row_i > 0) {
      curr_row_i--;
    }
  }
  /**
   * Selects a folder to save the files to and adds it to the save pattern
   */
  function ImportCSV() {
    l.debug("ImportCSV called");
    csa
      .Eval("ImportFile", "CSV Files: *.csv, All Files: *.*")
      .then((result) => {
        if (result === "null") return;

        let decoded = decodeURIComponent(result);

        setts.tmpls[setts.sel_tmpl].LoadFromCSV(decoded);

        setts = setts;
      });
  }

  function ExportCSV() {
    let content = setts.tmpls[setts.sel_tmpl].MakeCSV();
    l.debug("ExportCSV called");

    csa
      .Eval("ExportFile", content, "CSV Files: *.csv, All Files: *.*")
      .then((result) => {
        if (result == "null") return;
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
      bind:value={setts.sel_tmpl} />
  </div>

  <div class="header_tabs">
    <button
      class:curr_tab={setts.active_tab === "data"}
      onclick={() => (setts.active_tab = Tabs.Data)}>Data</button>
    <button
      class:curr_tab={setts.active_tab === "output"}
      onclick={() => {
        setts.active_tab = Tabs.Output;
        if (setts.out_mode === "dependant") GetAllComps();
      }}>Output</button>
    <button
      class:curr_tab={setts.active_tab === "settings"}
      onclick={() => (setts.active_tab = Tabs.Settings)}>Settings</button>
  </div>

  <div class="header_reload">
    <button onclick={F_Reload} class="delete_col"><Update /></button>
    <button
      class="delete_col"
      onclick={() =>
        csa.OpenURLInDefaultBrowser(
          "https://gabriel-ar.github.io/Ae-EasyBatch/",
        )}><QuestionMark /></button>
  </div>
</header>

<!-- DATA -->
{#if setts.active_tab === "data"}
  <nav class="dat_bar">
    <button data-variant="discrete" onclick={(e) => OpenBarMenu(e, "file")}
      >File</button>
    <button data-variant="discrete" onclick={(e) => OpenBarMenu(e, "row")}
      >Edit</button>
    <button data-variant="discrete" onclick={(e) => OpenBarMenu(e, "view")}
      >View</button>
  </nav>
  <main>
    {#if setts.sel_tmpl >= 0 && setts.tmpls[setts.sel_tmpl] !== undefined && setts.tmpls.length > 0}
      {#if setts.data_mode === "table"}
        <table class="dat_table">
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
                    bind:value={
                      setts.tmpls[setts.sel_tmpl].table_cols[view_i]
                    } />
                  {#if setts.tmpls[setts.sel_tmpl].columns[col_i].type == Column.PropertyValueType.SRC_ALTERNATE}
                    <button
                      class="delete_col"
                      data-tooltip="Setup alternate source"
                      data-tt-pos="bottom-right"
                      onclick={() => {
                        SetupAlternateSource(col_i);
                      }}><Gear /></button>
                  {/if}
                </th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each setts.tmpls[setts.sel_tmpl].rows as row, row_i}
              <tr
                oncontextmenu={function (e) {
                  OpenRowMenu(e, row_i);
                }}
                onclick={() => {
                  curr_row_i = row_i;
                }}
                data-selected={row_i === curr_row_i}>
                <td>
                  {row_i + 1}
                  <button
                    class="delete_row"
                    data-tooltip="Row menu"
                    data-tt-pos="top-right"
                    onclick={(e) => OpenRowMenu(e, row_i)}
                    ><HamburgerMenu /></button>
                </td>
                {#each setts.tmpls[setts.sel_tmpl].table_cols as td_col_i}
                  <td
                    class={{
                      table_cell:
                        setts.tmpls[setts.sel_tmpl].columns[td_col_i].type !==
                        Column.PropertyValueType.SRC_ALTERNATE,
                    }}>
                    <PropInput
                      bind:value={
                        setts.tmpls[setts.sel_tmpl].columns[td_col_i].values[
                          row_i
                        ]
                      }
                      type={setts.tmpls[setts.sel_tmpl].columns[td_col_i].type}
                      onchange={() => {
                        PreviewRow(row_i, true);
                      }} />
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      {:else if setts.data_mode === "detail"}
        <div class="dets_header">
          <div class="dets_header_left">
            <button
              onclick={() => (setts.data_mode = "table")}
              data-tooltip="Switch to Table View"
              data-tt-pos="bottom"><Table />Table View</button>
          </div>

          <div class="dets_header_nav">
            <button
              data-variant="discrete"
              onclick={() => ac.Fire("add_before")}
              data-tooltip="Add Row Before"
              data-tt-pos="bottom"><AddBefore /></button>
            <button
              data-variant="discrete"
              onclick={PrevRow}
              data-tooltip="Previous Row"
              data-tt-pos="bottom"><ArrowLeft /></button>
            <input
              type="number"
              min="1"
              max={setts.tmpls[setts.sel_tmpl].rows.length}
              onchange={(e)=>curr_row_i = +(e.target as HTMLInputElement).value - 1}
              value={curr_row_i+1} />
            / {setts.tmpls[setts.sel_tmpl].rows.length}
            <button
              onclick={NextRow}
              data-tooltip="Next Row"
              data-tt-pos="bottom"
              data-variant="discrete"><ArrowRight /></button>
            <button
              data-variant="discrete"
              onclick={() => ac.Fire("add_after")}
              data-tooltip="Add Row After"
              data-tt-pos="bottom"><AddAfter /></button>
          </div>
        </div>

        <div class="dets_field_cont">
          {#each setts.tmpls[setts.sel_tmpl].table_cols as td_col_i}
            <div class="dets_field">
              <h5>
                {setts.tmpls[setts.sel_tmpl].columns[td_col_i].cont_name}

                {#if setts.tmpls[setts.sel_tmpl].columns[td_col_i].type == Column.PropertyValueType.SRC_ALTERNATE}
                  <button
                    class="delete_col"
                    data-tooltip="Setup alternate source"
                    data-tt-pos="bottom-right"
                    onclick={() => {
                      SetupAlternateSource(td_col_i);
                    }}><Gear /></button>
                {/if}
              </h5>
              <div class="dets_prop">
                <PropInput
                  inline={false}
                  bind:value={
                    setts.tmpls[setts.sel_tmpl].columns[td_col_i].values[
                      curr_row_i
                    ]
                  }
                  type={setts.tmpls[setts.sel_tmpl].columns[td_col_i].type}
                  onchange={() => {
                    PreviewRow(curr_row_i, true);
                  }} />
              </div>
            </div>
          {/each}<!-- End of detail fields -->
        </div>
      {/if}
    {/if}
  </main>
{:else if setts.active_tab === "output"}
  <!-- OUTPUT -->
  <main class="output">
    <span
      >Render Mode:
      <Dropdown
        variant="discrete"
        labels={["One to One", "One to Many", "Generate Comps"]}
        options={["render", "dependant", "generate"]}
        bind:value={setts.out_mode} />
    </span>

    <!-- MODE: RENDER -->
    {#if setts.out_mode === "render"}
      <p class="modal-description">
        Exports a single render per row. Perfect for creating multiple
        variations of a template from a spreadsheet.
      </p>

      <h4>
        File Name Pattern
        <button
          class="info"
          data-tt-pos="bottom-right"
          data-tt-width="large"
          data-tooltip="Generates the file name of every export using this pattern."
          >?</button>
      </h4>

      <textarea
        id="save_pattern_ta"
        spellcheck="false"
        bind:value={setts.tmpls[setts.sel_tmpl].save_pattern}></textarea>

      <div class="setting" style="margin-top: 4px;">
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
          bind:value={sel_add_field} />

        <button onclick={AddField}>Add Field</button>
      </div>

      <div class="setting">
        <span>Preview File Path:</span>
        <span class="out_prev"
          >{setts.tmpls[setts.sel_tmpl].save_paths[0]}</span>
      </div>

      <h4>
        Render Settings
        <button
          class="info"
          data-tt-pos="bottom-right"
          data-tt-width="x-large"
          data-tooltip="Go to Edit > Templates to create or edit render settings and output module templates."
          >?</button>
      </h4>

      <div class="setting">
        <label for="sel_render_setts_templ">Render Settings Template</label>

        <Dropdown
          labels={render_setts_templs.render_templs.filter(
            (templ) => !templ.startsWith("_HIDDEN"),
          )}
          options={render_setts_templs.render_templs.filter(
            (templ) => !templ.startsWith("_HIDDEN"),
          )}
          bind:value={setts.tmpls[setts.sel_tmpl].render_setts_templ} />
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
          bind:value={setts.tmpls[setts.sel_tmpl].render_out_module_templ} />
      </div>

      <button class="setting" onclick={() => BatchRender()}
        >Start Batch Render</button>

      <!--Results-->
      {#if render_results.length > 0}
        <h4>Render Results</h4>
        <table class="render_results">
          <thead>
            <tr>
              <th>Row</th>
              <th>Queued</th>
              <th>Path</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {#each render_results as row}
              <tr>
                <td>{row.row}</td>
                <td>
                  {#if row.status == "success"}
                    <CheckCircled color="green" size={23} />
                  {:else}
                    <CrossCircled color="red" size={23} />
                  {/if}
                </td>
                <td>{row.rendered_path}</td>
                <td>{row.error}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    {:else if setts.out_mode === "generate"}
      <!-- MODE: GENERATE -->

      <p class="modal-description">
        Creates editable compositions in your project for each row. Use this
        when you need to manually adjust outputs later.
      </p>

      <h4>Composition Name Pattern</h4>
      <textarea
        id="generate_proj_ta"
        spellcheck="false"
        bind:value={setts.tmpls[setts.sel_tmpl].generate_pattern}></textarea>

      <div class="setting">
        <span>Preview:</span>
        <span class="out_prev"
          >{setts.tmpls[setts.sel_tmpl].generate_names[0]}</span>
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
            bind:value={sel_add_field_gen} />
        </div>
      </div>

      <div class="setting">
        <label for="in_imported_folder">Generated Comps Folder Name </label>
        <input
          id="in_gen_folder"
          type="text"
          bind:value={setts.tmpls[setts.sel_tmpl].gen_comps_folder} />
      </div>

      <button class="setting" onclick={BatchGenerate}
        >Generate Compositions</button>
    {:else if setts.out_mode === "dependant"}
      <!-- MODE: DEPENDANT -->

      <p class="modal-description">
        Exports multiple files per row of data. Ideal for creating assets in
        different formats or from nested compositions.
      </p>

      <h4>
        Common Base Folder
        <button
          class="info"
          data-tt-pos="bottom-right"
          data-tt-width="x-large"
          data-tooltip="All renders will be saved relative to this folder. Use the 'Edit File Pattern' button to set the full save path for each composition."
          >?</button>
      </h4>

      <div class="setting">
        <span>{setts.tmpls[setts.sel_tmpl].base_path}</span>
        <div><button onclick={SelRenderBasePath}>Choose Folder...</button></div>
      </div>

      <h4>
        Add Composition to Renders
        <button
          class="info"
          data-tt-pos="bottom-right"
          data-tt-width="x-large"
          data-tooltip="The compositions you select will be rendered for every row of data. You can select any composition in the project, even if is not directly related to the template composition."
          >?</button>
      </h4>

      <div class="setting">
        <Dropdown
          labels={[
            "Select a Composition",
            ...all_comps.map((comp) => comp.name),
          ]}
          options={["", ...all_comps.map((comp) => comp.id)]}
          bind:value={selected_comp} />

        <button
          onclick={() => {
            AddCompToDependents();
          }}>Add</button>
      </div>

      <!-- Dependant Compositions -->
      {#each setts.tmpls[setts.sel_tmpl].dep_comps as dc}
        <div class="out_sub_render">
          <input
            type="checkbox"
            style="margin: 5px 5px 3px 0;"
            bind:checked={
              setts.tmpls[setts.sel_tmpl].dep_config[dc.id].enabled
            } />
          <h4 style="display: inline;">{dc.name}</h4>
          <button
            class="delete_col"
            style="vertical-align: top;"
            data-tooltip="Remove composition from renders"
            data-tt-pos="bottom-right"
            onclick={() => DeleteDependantComp(dc.id)}><Trash /></button>

          <div class="setting">
            <h5>
              Render Save Pattern: {setts.tmpls[setts.sel_tmpl].dep_config[
                dc.id
              ].save_pattern}
              <button
                data-tooltip="Edit the pattern that will determine the save path for this render."
                data-tt-pos="top-right"
                data-tt-width="large"
                onclick={() => DepFilePatternModalOpen(dc.id)}>
                <Pencil1 /> Edit</button>
            </h5>

            <div>
              <span>Preview:</span>
              <span class="out_prev"
                >{setts.tmpls[setts.sel_tmpl].dep_config[dc.id]
                  .save_path}</span>
            </div>
          </div>

          <h5>
            Render Settings

            <button
              class="info"
              data-tt-pos="bottom-right"
              data-tt-width="x-large"
              data-tooltip="Go to Edit > Templates to create or edit render settings and output module templates."
              >?</button>
          </h5>

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
              } />
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
              } />
          </div>

          <div class="setting">
            <label
              for="sel_render_out_module"
              data-tooltip="Will attempt to render the composition as a single frame PNG image, removing the '0000' that After Effects attaches to image sequences. May not work in Mac."
              data-tt-pos="top-right"
              data-tt-width="large">As Single Frame PNG</label>
            <input
              type="checkbox"
              bind:checked={
                setts.tmpls[setts.sel_tmpl].dep_config[dc.id].single_frame
              } />
          </div>
        </div>
      {/each}

      <div class="OtM_ui_warn">
        <ExclamationTriangle color="white" size={15} />
        This render mode will block the user interface, press Esc to cancel all renders.
      </div>
      <button onclick={() => BatchOneToMany()}>Batch One to Many</button>

      <!--Results-->
      {#if dep_row_results.length > 0}
        <h4>Render Results</h4>
        <table class="render_results">
          <thead>
            <tr>
              <th>Row</th>
              <th>Queued</th>
              <th>Path</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {#each dep_row_results as row}
              <tr>
                <td>{row.row}</td>
                <td>
                  {#if row.status == "success"}
                    <CheckCircled color="green" size={23} />
                  {:else if row.status == "warning"}
                    <ExclamationTriangle color="yellow" size={21} />
                  {:else}
                    <CrossCircled color="red" size={23} />
                  {/if}
                </td>
                <td>{row.rendered_path}</td>
                <td>{row.error}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    {/if}
  </main>
{:else if setts.active_tab == "settings"}
  <!-- SETTINGS -->
  <SettingsPanel bind:setts bind:csa />
{/if}

{#if setts.tmpls[setts.sel_tmpl] !== undefined && show_alt_src_modal}
  <ModalAlternateSrcV2
    bind:show={show_alt_src_modal}
    tmpl={setts.tmpls[setts.sel_tmpl]}
    col_i={alt_src_modal_col}
    onclose={AlertSrcModalClosed} />
{/if}

<ModalFilePattern bind:this={m_file_pattern}></ModalFilePattern>
<ModalMessage bind:this={m_message}></ModalMessage>
<ModalEditView bind:this={m_edit_view}></ModalEditView>
<MenuRow bind:this={menu_row} onselect={RowMenuSelected}></MenuRow>

{#if no_templs}
  <div class="fs_no_tmpls">
    No Essential Graphics Templates Found
    <span>Create one and reload the extension</span>
    <div><button onclick={StartupSequence}><Update /> Reload</button></div>
  </div>
{/if}

<style>
  :global(#app) {
    display: grid;
    height: 100vh;

    grid-template-rows: auto auto 1fr auto;
    grid-template-columns: auto;

    grid-template-areas:
      "header"
      "nav"
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

  :global(main) {
    display: flex;
    flex-direction: column;
    /*gap: 1rem;*/

    padding: 10px 10px;

    overflow: auto;

    grid-area: main;

    /* background-color: var(--color-m1); */
  }

  /* ////// DATA //////// */

  .dat_bar {
    display: flex;
    gap: 1rem;

    grid-area: nav;
    padding: 4px 10px;

    height: 22px;

    border-bottom: solid 1px var(--color-border-p0);
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

  tr:hover {
    background-color: rgba(255, 255, 255, 0.02);
  }

  :global(tr[data-selected="true"]) {
    background-color: rgba(255, 255, 255, 0.07) !important;
  }

  :global(.dat_table td:first-child) {
    text-align: center;
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

  .render_results thead th {
    padding: 0 5px;
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
    margin: 13px 0 7px 0;
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

  .OtM_ui_warn {
    text-align: center;
    margin: 10px 0;
  }

  :global(.OtM_ui_warn svg) {
    vertical-align: middle;
    margin-right: 3px;
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

  .dets_header {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    justify-content: center;
    gap: 7px;

    margin-bottom: 15px;
  }

  .dets_field_cont {
    display: flex;
    flex-direction: column;
    gap: 13px;
  }

  .dets_field {
    display: flex;
    flex-direction: column;
  }

  .dets_field h5 {
    font-size: 0.93rem;
    margin: 0 0 7px 0;
  }

  .dets_prop {
    display: flex;
    flex-direction: row;
    gap: 6px;
  }

  :global(.dets_prop textarea) {
    width: 100%;
    box-sizing: border-box;
  }
</style>
