<script lang="ts">
  import CSAdapter from "./lib/CSAdapter.ts";
  import {onMount, setContext} from "svelte";
  import {
    Camera,
    Crosshair2,
    EyeOpen,
    Gear,
    OpenInNewWindow,
    QuestionMark,
    Reload,
    Update,
    HamburgerMenu,
    ArrowLeft,
    ArrowRight,
    Table,
  } from "radix-icons-svelte";

  import {
    type ProjData,
    type ColumnData,
    SettingsHelper,
    TemplateHelper,
    ColumnHelper,
    type DepCompSetts,
    Tabs,
    type ProjSettings,
  } from "./lib/Settings.svelte.ts";

  import {
    SaveSettsRequest, 
    type HostTemplateData,
  } from "./lib/Messaging";

  import type {
    GetTmplsResult,
    GetSettsResult,
    SaveSettingsResults,
    RenderSettsResults,  
    ProjectPathResult,  
    PreviewRowResult,
    GetCurrentValuesResults,
  } from "./lib/Messaging";

  import PropInput from "./ui/PropInput.svelte";
  import ModalAltSrcFilePattern from "./ui/ModalAltSrcFilePattern.svelte";
  import Dropdown from "./ui/Dropdown.svelte";
  import ModalMessage from "./ui/ModalMessage.svelte";
  import ModalEditView from "./ui/ModalEditView.svelte";
  import TabSettings from "./ui/TabSettings.svelte";
  import TabOutput from "./ui/TabOutput.svelte";
  import Menu from "./ui/MenuCtx.svelte";
  import AddAfter from "./assets/AddAfter.svelte";
  import AddBefore from "./assets/AddBefore.svelte";
  import ActionCoordinator from "./lib/ActionCoordinator.ts";
  import {l, s, csa} from "./lib/States.svelte.ts";
  import { output_hooks, GetAllComps, RenderRow } from "./lib/Output.svelte.ts";
  import ModalProceed from "./ui/ModalProceed.svelte";
  import DataImport, { type ImportResult, type ImportSaveResult } from "./ui/DataImport.svelte";
  import DataExport, { type ExportResult } from "./ui/DataExport.svelte";
  import { LocalSettings, type RecentSource } from "./lib/LocalSettings.ts";
  let ac = $state(new ActionCoordinator());
  let no_tmpls = $state(false);
  let not_ready = $state(true);

  //Modals
  let m_message = $state<ModalMessage>();
  let m_edit_view = $state<ModalEditView>();
  let m_proceed = $state<ModalProceed>();
  let m_import_data = $state<DataImport>();
  let m_export_data = $state<DataExport>();
  let recent_sources = $state<RecentSource[]>([]);
  let proceed = $state(true);

  let menu = $state<Menu>();
  let curr_row_i = $state(0);
  /**Rows highlighted for batch actions (delete, checkbox sync). Independent of the render checkboxes.*/
  let sel_rows = $state<Set<number>>(new Set([0]));
  let sel_anchor = 0;

  $effect(() => {
    if (!sel_rows.has(curr_row_i) && sel_rows.size === 0) {
      sel_rows = new Set([curr_row_i]);
    }
  });

  function ResetRowSelection() {
    sel_rows = new Set([curr_row_i]);
    sel_anchor = curr_row_i;
  }

  function RowClicked(e: MouseEvent, row_i: number) {
    if (e.shiftKey) {
      const [a, b] = [Math.min(sel_anchor, row_i), Math.max(sel_anchor, row_i)];
      const range = new Set<number>();
      for (let i = a; i <= b; i++) range.add(i);
      sel_rows = range;
      curr_row_i = row_i;
    } else if (e.ctrlKey || e.metaKey) {
      const next = new Set(sel_rows);
      if (next.has(row_i)) {
        next.delete(row_i);
      } else {
        next.add(row_i);
        curr_row_i = row_i;
      }
      sel_rows = next;
      sel_anchor = row_i;
    } else {
      curr_row_i = row_i;
      if (!sel_rows.has(row_i) || sel_rows.size > 1) {
        sel_rows = new Set([row_i]);
      }
      sel_anchor = row_i;
    }
  }

  /**A checkbox on a selected row applies its new state to every selected row.*/
  function RowCheckChanged(row_i: number, checked: boolean) {
    TemplateHelper.EnsureRowFlags(s.tmpl);
    const targets = sel_rows.has(row_i) ? sel_rows : new Set([row_i]);
    targets.forEach((i) => {
      s.tmpl.row_enabled[i] = checked;
    });
  }

  function AllRowsChecked(): boolean {
    return (
      row_count > 0 && TemplateHelper.EnabledRows(s.tmpl).length === row_count
    );
  }

  function SetAllRowsChecked(checked: boolean) {
    TemplateHelper.EnsureRowFlags(s.tmpl);
    s.tmpl.row_enabled = s.tmpl.row_enabled.map(() => checked);
  }

  let footer_txt = $state<string | undefined>();
  let footer_txt_long = $state<string | undefined>();

  let has_opened_viewer = false;
  let last_scroll_top = 0;
  let loaded_project_path = $state<string | null>(null);

  let is_new_setts = false;

  /**Number of rows in the selected template, derived from the first column's values */
  let row_count = $derived(s.tmpl ? TemplateHelper.RowCount(s.tmpl) : 0);

  //Update the log level of the logger when the settings changes
  $effect(() => {
    l.log_lvl = s.setts.log_level;
    setContext("logger", l);
  });

  onMount(() => {
    not_ready = false;

    StartupSequence();
    SetupShortcuts();

    output_hooks.Message = (msg, title) => m_message?.Open(msg, title);
    output_hooks.Footer = UpdateStatusFooter;
    output_hooks.CanProceed = () => proceed;

    m_proceed?.ShouldProceed();

    let window_returns = 0;
    window.onfocus = (e) => {
      CheckDifferentProject();

      if (window_returns < 1) {
        window_returns++;
      } else {
        has_opened_viewer = false;
        window_returns = 0;
      }
    };
  });

  async function StartupSequence() {
    l.debug("StartupSequence started");

    //fail in silence
    //errors are handled in the functions called within
    try {
      let n_tmpls = await GetTemplates();

      //if no templates, return and show message
      no_tmpls = n_tmpls.length == 0;
      if (no_tmpls) return;

      let {l_proj, l_setts} = await GetSettings();

      loaded_project_path = await GetProjectPath();

      s.render_setts_templs = await GetRenderSettsTempls();

      //for templates that where changed with the extension closed
      SettingsHelper.UpdateTemplates(l_proj, n_tmpls);

      s.proj = l_proj;
      s.setts = l_setts;
      await GetAllComps();

      if (s.proj.sel_tmpl == -1) {
        s.proj.sel_tmpl = 0;
      }
    } catch (e) {
      l.warn("StartupSequence error:", e);
    }

    l.debug("StartupSequence completed");
  }

  function GetTemplates(): Promise<HostTemplateData[]> {
    return new Promise((resolve, reject) => {
      csa
        .Exec<GetTmplsResult>("GetTemplates")
        .then((result) => {
          l.debug("GetTemplates result:", result);

          if (!result.success) {
            l.error("Failed to load templates", result.error_obj);
            reject(result.error_obj);
          } else {
            l.log(`Retrieved Templates`, result);
            resolve(result.tmpls ?? []);
          }
        })
        .catch((e) => {
          l.error("GetTemplates error:", e);
          reject(e);
        });
    });
  }

  function GetSettings(): Promise<{l_proj: ProjData; l_setts: ProjSettings}> {
    return new Promise((resolve, reject) => {
      csa.Exec<GetSettsResult>("LoadSettings").then((result) => {
        l.debug("GetSettings result:", result);

        if (!result.success) {
          if (result.error_obj?.reasons?.not_found) {
            l.warn(`Project settings and data not found, creating new ones`);
            is_new_setts = true;
            resolve({
              l_proj: SettingsHelper.DefaultProjectData,
              l_setts: SettingsHelper.DefaultProjSettings,
            });
          } else {
            l.error("Failed to load settings", result.error_obj);
            m_message?.Open(
              `There was a problem loading the data in this project. Do you want to reset the EasyBatch data?`,
              "Open Error",
              [
                {
                  label: "Start Blank Project",
                  callback: () => {
                    l.warn(
                      `User chose to start a blank project after load failure`,
                    );
                    is_new_setts = true;
                    resolve({
                      l_proj: SettingsHelper.DefaultProjectData,
                      l_setts: SettingsHelper.DefaultProjSettings,
                    });
                  },
                },
                {
                  label: "Cancel",
                  callback: () => {
                    l.warn(`User ignored loading errors`);
                    no_tmpls = true;
                    reject(
                      new Error(
                        "User cancelled loading project after load failure",
                      ),
                    );
                  },
                },
              ],
            );
          }
        } else {
          let l_proj = SettingsHelper.LoadProjectData(result.proj_data);
          let l_setts = {
            ...SettingsHelper.DefaultProjSettings,
            ...result.proj_settings,
          };

          //check if the version is newer and warn the user
          const project_version = l_proj.version ?? "0.0.0";
          if (
            project_version.localeCompare(_VERSION_, undefined, {
              numeric: true,
            }) > 0
          ) {
            //Open a message
            m_message?.Open(
              `This project was saved with version ${project_version} of EasyBatch, and you're using ${_VERSION_}. There may be potential incompatibilities. Do you want to continue loading the project?`,
              "Version Mismatch",
              [
                {
                  label: "Open Anyway",
                  callback: () => {
                    l.warn(`User ignored version mismatch`);
                    l_proj.version = _VERSION_;
                    resolve({l_proj, l_setts});
                  },
                },
                {
                  label: "Start Blank Project",
                  callback: () => {
                    l.warn(
                      `User started a blank project after version mismatch`,
                    );
                    is_new_setts = true;
                    resolve({
                      l_proj: SettingsHelper.DefaultProjectData,
                      l_setts: SettingsHelper.DefaultProjSettings,
                    });
                  },
                },
                {
                  label: "Cancel",
                  callback: () => {
                    no_tmpls = true;
                    reject(
                      new Error(
                        "User cancelled loading project due to version mismatch",
                      ),
                    );
                  },
                },
              ],
            );
          } else {
            l.log(`Parsed Settings`, result);
            //update project version
            l_proj.version = _VERSION_;
            resolve({l_proj, l_setts});
          }
        }
      });
    });
  }

  function CheckDifferentProject() {
    csa.Exec<ProjectPathResult>("ProjectPath").then((result) => {
      if (!result.success) {
        l.error("Failed to check project path", result.error_obj);
        return;
      }
      if (loaded_project_path !== result.path) {
        l.warn("Project path changed, reloading settings");
        StartupSequence();
      }
    });
  }

  function GetProjectPath(): Promise<string | null> {
    return new Promise((resolve, reject) => {
      csa.Exec<ProjectPathResult>("ProjectPath").then((result) => {
        if (!result.success) {
          l.error("Failed to get project path", result.error_obj);
          reject(result.error_obj);
          return;
        }

        resolve(result.path ?? null);
      });
    });
  }

  //Auto save settings
  $effect(() => {
    DebouceSaveSettings("setts");
    $state.snapshot(s.setts);
  });

  //Auto save project data
  $effect(() => {
    DebouceSaveSettings("proj");
    $state.snapshot(s.proj);
  });

  let save_timeout: ReturnType<typeof setTimeout> | undefined;
  let last_type = "";
  function DebouceSaveSettings(what = "all") {
    if (save_timeout !== undefined) {
      clearTimeout(save_timeout);
    }

    if (last_type !== what && last_type !== "") {
      what = "all";
    } else {
      last_type = what;
    }

    save_timeout = setTimeout(SaveSettings, 2000, what);
  }

  async function SaveSettings(
    what: "reset" | "proj" | "setts" | "all" = "all",
  ): Promise<boolean> {
    console.debug("SaveSettings called with type:", what);

    last_type = "";

    if (
      not_ready ||
      s.proj.sel_tmpl === undefined ||
      s.proj.sel_tmpl == -1 ||
      s.proj === undefined ||
      no_tmpls
    )
      return false;

    let request = new SaveSettsRequest();

    if (is_new_setts) {
      what = "all";
    }

    if (what === "proj" || what === "all") {
      request.proj_data = s.proj; // Sending project data
    }

    if (what === "setts" || what === "all") {
      request.proj_settings = s.setts; // Sending settings data
    }

    if (what === "reset") {
      request.proj_settings = SettingsHelper.DefaultProjSettings;
      request.proj_data = SettingsHelper.DefaultProjectData;
    }

    request.project_path = await GetProjectPath();
    request.is_new = is_new_setts;

    l.debug("SaveSettings called with request:", request);
    let s_request = JSON.stringify(request);

    //promise used for settings tab reset option
    return new Promise((resolve, reject) => {
      csa
        .Exec<SaveSettingsResults>("SaveSettings", s_request)
        .then((result) => {
          is_new_setts = false;

          if (!result.success) {
            let e = result.error_obj;
            if (e?.reasons?.path_mismatch) {
              l.warn(`Different project path, reloading settings`);
              console.debug("Path mismatch error details:", e);
              StartupSequence();
              resolve(false);
            } else if (e?.reasons?.no_templates) {
              l.warn(`No templates to save.`);
              console.debug("No templates error details:", e);
              no_tmpls = true;
              resolve(false);
            } else {
              l.error("Failed to save settings", result.error_obj);
              console.debug("Save settings error details:", e);
              reject(result.error_obj);
            }
          } else {
            l.log(`Saved Settings`, result);
            resolve(true);
          }
        });
    });
  }

  async function ResetSettings() {
    l.debug("ResetSettings called");
    let res = await SaveSettings("reset").catch((e) => {
      l.error("Failed to save settings after reset", e);
      return false;
    });

    if (!res) {
      l.error("Failed to save settings after reset");
      return;
    }

    console.debug("Settings reset, reloading...");
    StartupSequence();
  }

  function GetRenderSettsTempls(): Promise<RenderSettsResults> {
    return new Promise((resolve, reject) => {
      csa.Exec<RenderSettsResults>("GetRenderTemplates").then((result) => {
        if (!result.success) {
          l.error("Failed to load render templates:", result.error_obj);
          reject(result.error_obj);
        } else {
          l.log(`Parsed Render Settings Templates:`, result);
          resolve(result);
        }
      }); //Exec
    }); //Promise
  }

  async function F_Reload() {
    let n_tmpls: any[] = await GetTemplates().catch((e) => {
      l.error("F_Reload GetTemplates error:", e);
      return [];
    });

    if (n_tmpls.length == 0) {
      no_tmpls = true;
      return;
    } else {
      no_tmpls = false;
    }

    s.render_setts_templs = await GetRenderSettsTempls();

    SettingsHelper.UpdateTemplates(s.proj, n_tmpls);
    await GetAllComps();
    l.debug("F_Reload called with templates:", n_tmpls);
  }

  ////GENERAL UI////
  //////////////////

  function SetupShortcuts() {
    //csa.KeyRegisterOverride();
    ac.Init();
    const is_mac = cep_node.require("os").platform() === "darwin";
    csa.RegisterKeyEventsInterest([
      //MAC
      {keyCode: 0x7d, ctrlKey: true, altKey: true, shiftKey: true}, // Arrow Down
      {keyCode: 0x7e, ctrlKey: true, altKey: true, shiftKey: true}, // Arrow Up

      {keyCode: 0x7d, ctrlKey: false, altKey: true, shiftKey: false}, // Arrow Down Opt
      {keyCode: 0x7e, ctrlKey: false, altKey: true, shiftKey: false}, // Arrow Up Opt

      {keyCode: 0x33, ctrlKey: false, altKey: false, shiftKey: false}, // Delete
      {keyCode: 0x24, ctrlKey: false, altKey: false, shiftKey: false}, // Delete

      {keyCode: 0x01, ctrlKey: false, altKey: false, shiftKey: false}, // S
      {keyCode: 0x0f, ctrlKey: false, altKey: false, shiftKey: false}, // R
      {keyCode: is_mac ? 0x01 : 0x53, ctrlKey: false, altKey: true, shiftKey: false}, // Alt/Option+S
      {keyCode: is_mac ? 0x0f : 0x52, ctrlKey: false, altKey: true, shiftKey: false}, // Alt/Option+R
      {keyCode: 0x23, ctrlKey: false, altKey: false, shiftKey: false}, // P
      {keyCode: 0x2d, ctrlKey: false, altKey: false, shiftKey: false}, // N
      {keyCode: 0x2d, ctrlKey: false, altKey: false, shiftKey: true}, // Shift+N

      {keyCode: 0x11, ctrlKey: false, altKey: false, shiftKey: false}, // T
      {keyCode: 0x02, ctrlKey: false, altKey: false, shiftKey: false}, // D
    ]);

    //File Actions
    ac.AddListener(
      "import_data",
      () => {
        OpenDataImporter();
      },
      "",
    );

    ac.AddListener(
      "reimport_data",
      (event?: KeyboardEvent) => {
        if (s.tmpl?.import_file_lasts?.active_source &&
            (!event || (!event.metaKey && !event.repeat && !document.querySelector(".modal")))) {
          ReImportLast();
        }
      },
      "r",
      false,
      false,
      true,
    );

    ac.AddListener(
      "save_data",
      (event?: KeyboardEvent) => {
        if (s.tmpl?.import_file_lasts?.active_source &&
            (!event || (!event.metaKey && !event.repeat && !document.querySelector(".modal")))) {
          SaveToOpenedFile();
        }
      },
      "s",
      false,
      false,
      true,
    );

    ac.AddListener(
      "export_data",
      () => {
        if (s.tmpl) {
          m_export_data?.Open(s.tmpl, HandleExportResult);
        }
      },
      "",
    );

    // Row/Edit Actions
    ac.AddListener(
      "preview",
      () => {
        console.debug("Preview shortcut triggered for row index:", curr_row_i);
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
        const to_delete = sel_rows.size > 0 ? [...sel_rows] : [curr_row_i];

        //prevent deleting the row if only one row is left
        if (row_count - to_delete.length < 1) {
          footer_txt = "⚠️ Cannot delete all rows";
          return;
        }

        TemplateHelper.DeleteRows(s.tmpl, to_delete);

        //move the selected row up if the last row was deleted
        if (curr_row_i >= row_count) {
          curr_row_i = row_count - 1;
        }
        ResetRowSelection();
      },
      "Backspace",
    );

    ac.AddListener(
      "add_after",
      () => {
        TemplateHelper.AddRowAfter(s.tmpl, curr_row_i);
        s.proj = s.proj;
        NextRow();
        ResetRowSelection();
      },
      "N",
      false,
      false,
    );

    ac.AddListener(
      "add_before",
      () => {
        TemplateHelper.AddRowBefore(s.tmpl, curr_row_i);
        s.proj = s.proj;
        ResetRowSelection();
      },
      "N",
      false,
      true,
    );

    // View Actions

    ac.AddListener(
      "view_detail",
      () => {
        s.setts.data_mode = "detail";
      },
      "D",
    );

    ac.AddListener(
      "view_table",
      () => {
        s.setts.data_mode = "table";
      },
      "T",
    );

    ac.AddListener(
      "edit_view",
      () => {
        m_edit_view?.Open(EditViewModalClosed);
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

    ac.AddListener(
      "open_help",
      () => {
        OpenHelp();
      },
      "",
    );

    ac.AddListener(
      "report_issue",
      () => {
        ReportIssue();
      },
      "",
    );

    ac.AddListener(
      "contact",
      () => {
        Contact();
      },
      "",
    );

    ac.AddListener(
      "surprise",
      () => {
        Surprise();
      },
      "",
    );
  }

  let active_tab = $state<string | null>(null);
  //Tab changed
  $effect(() => {
    if (active_tab === "data" && s.setts.active_tab !== "data") {
      //Save the scroll position of the data tab when leaving it, so we can restore it when coming back
      const main_data = document.querySelector("#main_data");
      if (main_data) {
        last_scroll_top = main_data.scrollTop;
      }
      console.debug("Saved scroll position:", last_scroll_top);
    }

    if (s.setts.active_tab === "data" && active_tab !== "data") {
      has_opened_viewer = false;

      //Restore the scroll position of the data tab when coming back to it
      requestAnimationFrame(() => {
        const main_data = document.querySelector("#main_data");
        if (main_data) {
          main_data.scrollTop = last_scroll_top;
        }
      });
    }

    active_tab = s.setts.active_tab;
  });

  /////DATA TAB/////
  //////////////////

  /**
   * Opens a comp in the project to preview the template with the row's values
   * @param row_i
   * @param prop_changed True if the preview is being called due to a property change
   */
  function PreviewRow(row_i: number, prop_changed = false) {
    l.debug(
      "PreviewRow called with row index:",
      row_i,
      "and live:",
      prop_changed,
    );
    if (!s.setts.auto_preview && prop_changed) return;

    //Because opening the comp in the viewer takes away focus from the panel we limit the amout of times this happens 'per session'.
    let open_comp_viewer = false;
    if (s.setts.auto_preview && !has_opened_viewer && !prop_changed) {
      has_opened_viewer = true;
      open_comp_viewer = true;
    }

    TemplateHelper.ResolveAltSrcPathsRow(s.tmpl, row_i);

    //Trim the template to contain only the modified row
    let send_templ = structuredClone($state.snapshot(s.tmpl));

    for (let col of send_templ.columns) {
      col.values = [col.values[row_i]];
    }

    TemplateHelper.UpdateRows(s.tmpl);

    send_templ.save_paths = [send_templ.save_paths[0]];
    send_templ.generate_names = [send_templ.generate_names[0]];

    let s_templt = JSON.stringify(send_templ);
    l.debug(`Previewing Row:`, s_templt, row_i, open_comp_viewer);

    csa
      .Exec<PreviewRowResult>("PreviewRow", s_templt, 0, open_comp_viewer)
      .then((result) => {
        l.debug(`Preview Row Result`, result);

        //General failure
        if (!result.success) {
          l.error("Failed to preview row", result.error_obj);
          const error_msg =
            result.error_obj?.message ?? "Unknown preview error";
          if (!prop_changed) {
            m_message?.Open(error_msg, "Error Previewing Row");
          } else {
            UpdateStatusFooter("⚠️ Error Previewing Row " + row_i, error_msg);
          }
          return;
        }

        //No critical errors happened
        else if (result.errors !== undefined && result.errors.length > 0) {
          if (prop_changed) {
            UpdateStatusFooter(
              "⚠️ Error Previewing Row " + row_i,
              result.errors.map((e) => e.message).join("<br>"),
            );
            return;
          } else {
            m_message?.Open(
              result.errors.map((e) => e.message).join("<br>"),
              "Error Previewing Row",
            );
          }
        } else {
          UpdateStatusFooter("Previewed Row " + row_i);
        }
      });
  }

  /**
   * Copies the values in the previrew to the template for the given row, then previews the row again to update the viewer with the new values
   * @param row_i
   */
  function SampleRow(row_i: number) {
    let s_templt = JSON.stringify(s.tmpl);
    l.debug("SampleRow called with row index:", row_i);

    csa
      .Exec<GetCurrentValuesResults>("GetCurrentValues", s_templt)
      .then((result) => {
        l.debug(`Sample Row Result:`, result);

        if (!result.success) {
          l.error("Failed to sample row", result.error_obj);
          if (row_i !== -1) {
            UpdateStatusFooter(
              "⚠️ Error While Sampling Row " + row_i,
              result.error_obj?.message,
            );
          }
          return;
        }

        TemplateHelper.CopyValuesFromPreview(s.tmpl, result, row_i);
        TemplateHelper.ResolveAltSrcPathsRow(s.tmpl, row_i);
        s.proj = s.proj;

        PreviewRow(row_i, true);
      });
  }

  function OpenRowMenu(e: MouseEvent, row_i: number) {
    //if the active element is an input, don't open the menu
    if (
      document.activeElement instanceof HTMLInputElement ||
      document.activeElement instanceof HTMLTextAreaElement
    ) {
      return;
    }

    curr_row_i = row_i;
    e.preventDefault();
    menu?.Open(e.pageX, e.pageY, MenuItemSelected);
  }

  function MenuItemSelected(action: string) {
    l.debug("RowMenuSelected called with action:", action, "row:", curr_row_i);
    ac.Fire(action);
  }

  function OpenBarMenu(e: MouseEvent, type: string) {
    if (type === "file") {
      try {
        recent_sources = LocalSettings.LoadRecentSources();
      } catch (error) {
        l.error("Failed to load recent sources", error);
        recent_sources = [];
      }
    }
    let btn = e.target as HTMLButtonElement;
    menu?.Open(
      btn.offsetLeft,
      btn.offsetTop + btn.offsetHeight,
      BarMenuSelected,
      type,
    );
  }

  function BarMenuSelected(action: string) {
    l.debug("BarMenuSelected called with action:", action);
    if (action.startsWith("recent_source:")) {
      const source = recent_sources[Number(action.slice("recent_source:".length))];
      if (source && s.tmpl) {
        m_import_data?.OpenPath(s.tmpl, source.path, HandleImportResult);
      }
      return;
    }
    ac.Fire(action);
  }

  function NextRow() {
    if (curr_row_i < row_count - 1) {
      curr_row_i++;
      ResetRowSelection();
    }
  }

  /**
   * Fixed width in px for non-text columns, or null for flexible (text) columns.
   * @param {{type: number, display?: string}} col
   */
  function ColWidth(col: {type: number; display?: string}) {
    const T = ColumnHelper.PropertyValueType;
    if (col.display === "checkbox") return 56;
    if (col.display === "menu") return 140;
    switch (col.type) {
      case T.TEXT_DOCUMENT:
        return null;
      case T.OneD:
        return 90;
      case T.TwoD:
      case T.TwoD_SPATIAL:
        return 100;
      case T.ThreeD:
      case T.ThreeD_SPATIAL:
        return 180;
      case T.COLOR:
        return 160;
      case T.SRC_ALTERNATE:
        return 260;
      default:
        return 120;
    }
  }

  function PrevRow() {
    if (curr_row_i > 0) {
      curr_row_i--;
      ResetRowSelection();
    }
  }

  function OpenDataImporter() {
    if (s.tmpl === undefined) return;

    m_import_data?.Open(s.tmpl, (result: ImportResult) => {
      HandleImportResult(result);
    });
  }

  function ReImportLast() {
    if (s.tmpl === undefined) return;

    m_import_data?.ReImportLast(s.tmpl, (result: ImportResult) => {
      HandleImportResult(result);
    });
  }

  function SaveToOpenedFile() {
    if (s.tmpl === undefined) return;

    m_import_data?.SaveToOpenedFile(s.tmpl, (result: ImportSaveResult) => {
      HandleSaveResult(result);
    });
  }

  function HandleImportResult(result: ImportResult) {
    if (!result.success) {
      m_message?.Open(EscapeHTML(result.error), "Import Error");
      return;
    }

    s.proj = s.proj;

    const details =
      (result.stats.sheet ? `Sheet: ${EscapeHTML(result.stats.sheet)}<br>` : "") +
      `Rows imported: ${result.stats.rows}<br>` +
      `Mapped properties: ${result.stats.mapped}/${result.stats.total}`;
    UpdateStatusFooter(result.title, details);

    try {
      recent_sources = LocalSettings.RememberRecentSource(result.source);
    } catch (error) {
      l.error("Failed to save recent source", error);
      m_message?.Open(`The data was imported, but the recent source could not be saved: ${EscapeHTML(error instanceof Error ? error.message : String(error))}`, "Recent Sources Error");
      return;
    }

    if (result.warnings.length > 0) {
      m_message?.Open(result.warnings.map(EscapeHTML).join("<br>"), "Import Warnings");
    }
  }

  function HandleSaveResult(result: ImportSaveResult) {
    if (!result.success) {
      m_message?.Open(EscapeHTML(result.error), "Save Updates Error");
      return;
    }

    const details =
      `Updated cells: ${result.stats.written_cells}<br>` +
      `Formula cells protected: ${result.stats.formula_cells_skipped}`;
    UpdateStatusFooter(result.title, details);

    const warnings: string[] = [];
    if (result.stats.formula_cells_skipped > 0) {
      warnings.push(
        `${result.stats.formula_cells_skipped} formula cells were not overwritten.`,
      );
    }
    if (result.stats.missing_columns.length > 0) {
      warnings.push(
        `Missing mapped columns: ${result.stats.missing_columns.map(EscapeHTML).join(", ")}.`,
      );
    }
    if (warnings.length > 0) {
      m_message?.Open(warnings.join("<br>"), "Save Updates Warnings");
    }
  }

  function GetActiveImportPath(): string {
    const source_path = s.tmpl?.import_file_lasts?.active_source?.path;
    if (!source_path) return "";
    const path = cep_node.require("path");
    if (path.isAbsolute(source_path) || !loaded_project_path) return source_path;
    return path.join(path.dirname(loaded_project_path), source_path);
  }

  function HandleExportResult(result: ExportResult) {
    if (!result.success) {
      m_message?.Open(EscapeHTML(result.error), "Export Error");
      return;
    }
    UpdateStatusFooter(result.title);
  }

  function EscapeHTML(text: string): string {
    const escaped: Record<string, string> = {
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    };
    return text.replace(/[&<>"']/g, (character) => escaped[character]);
  }

  function UpdateStatusFooter(txt: string, long_msg = "") {
    footer_txt = txt;
    footer_txt_long = long_msg;
  }

  function OpenStatusLongMsg() {
    if (footer_txt_long !== undefined && footer_txt_long !== "") {
      m_message?.Open(footer_txt_long, "Details");
    }
  }

  //////HELP MENU//////
  ////////////////////

  function OpenHelp() {
    csa.OpenURLInDefaultBrowser("https://gabriel-ar.github.io/Ae-EasyBatch/");
  }

  function ReportIssue() {
    csa.OpenURLInDefaultBrowser(
      "https://github.com/gabriel-ar/Ae-EasyBatch/issues",
    );
  }

  function Contact() {
    m_message?.Open(
      `
    Contact us at info@easybatch.net <button onclick="window.cep.util.openURLInDefaultBrowser('mailto:info@easybatch.net')">Open</button><br>
    Suggest improvements on our <a onclick="window.cep.util.openURLInDefaultBrowser('https://github.com/gabriel-ar/Ae-EasyBatch/discussions')" href="#" target="_blank">GitHub discussions page</a>.
    `,
      "Contact",
    );
  }

  function Surprise() {
    fetch("https://dog.ceo/api/breeds/image/random")
      .then(async (r) => {
        if (r.status === 200) {
          let data = await r.json();
          m_message?.Open(
            `<image src='${data.message}' style='max-height: 75vh; max-width: 100%;' /><br> <a href='https://dog.ceo/dog-api/'>dog.ceo</a>`,
            "🐶 Take a Break",
          );
        }
      })
      .catch((error) => {
        l.error("Failed to fetch dog image", error);
      });
  }

  function EditViewModalClosed(new_table_cols: number[]) {
    s.tmpl.view_cols = new_table_cols;
    s.proj = s.proj; // Force reactivity
    l.debug("Edit view modal closed with new table_cols:", new_table_cols);
  }

  /////OUTPUT TAB SYNC/////
  /////////////////////////

  // Render save pattern updated
  $effect(() => {
    if (s.tmpl !== undefined) {
      s.tmpl.save_paths[0] = TemplateHelper.ResolveSavePath(
        s.tmpl,
        s.tmpl.save_pattern,
        0,
      );
    }
  });

  //Generate Comps pattern updated
  $effect(() => {
    if (s.tmpl !== undefined) {
      s.tmpl.generate_names[0] = TemplateHelper.ResolveCompName(
        s.tmpl,
        s.tmpl.generate_pattern,
        0,
      );
    }
  });

  function SetupAlternateSource(col_i: number) {
    show_alt_src_modal = true;
    alt_src_modal_col = col_i;
  }

  let show_alt_src_modal = $state(false);
  let alt_src_modal_col = $state<number | undefined>();
  function AlertSrcModalClosed(base_path: string, pattern: string) {
    if (alt_src_modal_col === undefined) return;
    s.tmpl.columns[alt_src_modal_col].alt_src_base = base_path;
    s.tmpl.columns[alt_src_modal_col].alt_src_pattern = pattern;

    ColumnHelper.ResolveColumnAltSrcPaths(
      s.tmpl.columns[alt_src_modal_col],
      s.tmpl.columns,
    );
  }

</script>

<!-- HEADER -->
<header>
  <div class="header_template">
    <label for="sel_comp">Template</label>
    <Dropdown
      options={s.proj.tmpls.map((templ) => s.proj.tmpls.indexOf(templ))}
      labels={s.proj.tmpls.map((templ) => templ.name)}
      bind:value={s.proj.sel_tmpl} />
  </div>

  <div class="header_tabs">
    <button
      class:curr_tab={s.setts.active_tab === "data"}
      onclick={() => (s.setts.active_tab = Tabs.Data)}>Data</button>
    <button
      class:curr_tab={s.setts.active_tab === "output"}
      onclick={() => {
        s.setts.active_tab = Tabs.Output;
        GetAllComps();
      }}>Output</button>
    <button
      class:curr_tab={s.setts.active_tab === "settings"}
      onclick={() => (s.setts.active_tab = Tabs.Settings)}>Settings</button>
  </div>

  <div class="header_reload">
    <button onclick={F_Reload} class="delete_col"><Update /></button>
    <button
      class="delete_col"
      onclick={(e) => menu?.Open(e.pageX, e.pageY, MenuItemSelected, "help")}
      ><QuestionMark /></button>
  </div>
</header>

<!-- DATA -->
{#if active_tab === "data"}
  <nav class="dat_bar">
    <button data-variant="discrete" onclick={(e) => OpenBarMenu(e, "file")}
      >File</button>
    <button data-variant="discrete" onclick={(e) => OpenBarMenu(e, "row")}
      >Edit</button>
    <button data-variant="discrete" onclick={(e) => OpenBarMenu(e, "view")}
      >View</button>
  </nav>
  <main id="main_data">
    {#if s.proj.sel_tmpl >= 0 && s.tmpl !== undefined && s.proj.tmpls.length > 0}
      {#if s.setts.data_mode === "table"}
        <table class="dat_table">
          <colgroup>
            <col style="width: 64px;" />
            {#each s.tmpl.view_cols as col_i}
              {@const w = ColWidth(s.tmpl.columns[col_i])}
              <col style={w ? `width: ${w}px;` : "min-width: 200px;"} />
            {/each}
          </colgroup>
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  data-tooltip="Render all rows"
                  data-tt-pos="middle-right"
                  checked={AllRowsChecked()}
                  onchange={(e) =>
                    SetAllRowsChecked(
                      (e.target as HTMLInputElement).checked,
                    )} />
              </th>
              {#each s.tmpl.view_cols as col_i, view_i}
                <th class="table_header">
                  {s.tmpl.columns[col_i].cont_name}
                  {#if s.tmpl.columns[col_i].type == ColumnHelper.PropertyValueType.SRC_ALTERNATE}
                    <button
                      class="delete_col"
                      data-tooltip="Setup alternate source"
                      data-tt-pos="bottom"
                      onclick={() => {
                        SetupAlternateSource(col_i);
                      }}><Gear /></button>
                  {/if}
                </th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each {length: row_count} as _, row_i}
              <tr
                oncontextmenu={function (e) {
                  OpenRowMenu(e, row_i);
                }}
                onclick={(e) => RowClicked(e, row_i)}
                data-selected={sel_rows.has(row_i)}>
                <td>
                  <div class="row_opts">
                    <input
                      class="row_opts_check"
                      type="checkbox"
                      checked={s.tmpl.row_enabled?.[row_i] !== false}
                      onclick={(e) => e.stopPropagation()}
                      onchange={(e) =>
                        RowCheckChanged(
                          row_i,
                          (e.target as HTMLInputElement).checked,
                        )} />
                    <span class="row_opts_num">{row_i + 1}</span>
                    <button
                      class="delete_row row_opts_menu"
                      data-tooltip="Row menu"
                      data-tt-pos="middle-right"
                      onclick={(e) => OpenRowMenu(e, row_i)}
                      ><HamburgerMenu /></button>
                    <button
                      class="delete_row row_opts_preview"
                      data-tooltip="Preview Row"
                      data-tt-pos="middle-right"
                      onclick={(e) => PreviewRow(row_i)}><EyeOpen /></button>
                  </div>
                </td>
                {#each s.tmpl.view_cols as td_col_i}
                  <td
                    class={{
                      table_cell:
                        s.tmpl.columns[td_col_i].type !==
                        ColumnHelper.PropertyValueType.SRC_ALTERNATE,
                    }}>
                    <PropInput
                      bind:value={s.tmpl.columns[td_col_i].values[row_i]}
                      type={s.tmpl.columns[td_col_i].type}
                      display={s.tmpl.columns[td_col_i].display}
                      menu_params={s.tmpl.columns[td_col_i].menu_params}
                      onchange={() => {
                        PreviewRow(row_i, true);
                      }} />
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      {:else if s.setts.data_mode === "detail"}
        <div class="dets_header">
          <div class="dets_header_left">
            <button
              onclick={() => (s.setts.data_mode = "table")}
              data-tooltip="Switch to Table View"
              data-tt-pos="middle-right"><Table />Table View</button>
          </div>

          <div class="dets_header_nav">
            <button
              data-variant="discrete"
              onclick={() => ac.Fire("add_before")}
              data-tooltip="Add Row Before"
              data-tt-pos="middle-right"><AddBefore /></button>
            <button
              data-variant="discrete"
              onclick={PrevRow}
              data-tooltip="Previous Row"
              data-tt-pos="middle-right"><ArrowLeft /></button>
            <input
              type="number"
              min="1"
              max={row_count}
              onchange={(e) =>
                (curr_row_i = +(e.target as HTMLInputElement).value - 1)}
              value={curr_row_i + 1} />
            / {row_count}
            <button
              onclick={NextRow}
              data-tooltip="Next Row"
              data-tt-pos="middle-right"
              data-variant="discrete"><ArrowRight /></button>
            <button
              data-variant="discrete"
              onclick={() => ac.Fire("add_after")}
              data-tooltip="Add Row After"
              data-tt-pos="middle-right"><AddAfter /></button>
          </div>
        </div>

        <div class="dets_field_cont">
          {#each s.tmpl.view_cols as td_col_i}
            <div class="dets_field">
              <h5>
                {s.tmpl.columns[td_col_i].cont_name}

                {#if s.tmpl.columns[td_col_i].type == ColumnHelper.PropertyValueType.SRC_ALTERNATE}
                  <button
                    class="delete_col"
                    data-tooltip="Setup alternate source"
                    data-tt-pos="middle-right"
                    onclick={() => {
                      SetupAlternateSource(td_col_i);
                    }}><Gear /></button>
                {/if}
              </h5>
              <div class="dets_prop">
                <PropInput
                  inline={false}
                  bind:value={s.tmpl.columns[td_col_i].values[curr_row_i]}
                  type={s.tmpl.columns[td_col_i].type}
                  display={s.tmpl.columns[td_col_i].display}
                  menu_params={s.tmpl.columns[td_col_i].menu_params}
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

  <footer>
    {footer_txt}
    {#if footer_txt_long !== undefined && footer_txt_long !== ""}
      <button data-variant="discrete" onclick={OpenStatusLongMsg}
        >Details</button>
    {/if}
  </footer>

  <ModalEditView bind:this={m_edit_view}></ModalEditView>
{:else if active_tab === "output"}
  <TabOutput />
{:else if active_tab == "settings"}
  <!-- SETTINGS -->
  <TabSettings {ResetSettings} />
{/if}

{#if s.tmpl !== undefined && show_alt_src_modal}
  <ModalAltSrcFilePattern
    bind:show={show_alt_src_modal}
    col_i={alt_src_modal_col ?? 0}
    onclose={AlertSrcModalClosed} />
{/if}

<Menu
  bind:this={menu}
  onselect={MenuItemSelected}
  active_source_path={GetActiveImportPath()}
  {recent_sources}></Menu>
<ModalMessage bind:this={m_message}></ModalMessage>
<ModalProceed bind:this={m_proceed} bind:proceed></ModalProceed>
<DataImport bind:this={m_import_data}></DataImport>
<DataExport bind:this={m_export_data}></DataExport>

{#if no_tmpls}
  <div class="fs_no_tmpls">
    No Essential Graphics Templates Found
    <span>Create one and reload the extension</span>
    <div><button onclick={StartupSequence}><Update />Reload</button></div>
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

  #main_data {
    padding: 0;
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

  .dat_table {
    user-select: none;
    -webkit-user-select: none;
    table-layout: fixed;
    width: max-content;
    min-width: 100%;
    border-top: none;
  }

  .dat_table :global(input),
  .dat_table :global(textarea) {
    user-select: text;
    -webkit-user-select: text;
  }

  .dat_table,
  .dat_table th:first-child,
  .dat_table td:first-child {
    border-left: none;
  }

  .dat_table td:first-child,
  .dat_table th:first-child {
    border-right: none;
  }
  .dat_table td:nth-child(2),
  .dat_table th:nth-child(2) {
    border-left: none;
  }

  .dat_table,
  .dat_table th:last-child,
  .dat_table td:last-child {
    border-right: none;
  }

  .dat_table thead th:first-child {
    left: 0;
    z-index: 91;
  }

  .dat_table thead th:first-child {
    box-shadow: inset -1px 0 0 rgba(255, 255, 255, 0.1);
  }

  .dat_table th {
    border-top: none;
    z-index: 90;
    position: sticky;
    top: 0;
    background-color: #131313;
  }

  .dat_table td {
    height: 28px;
    text-overflow: ellipsis;
    vertical-align: middle;

    padding: 4px 6px;
  }

  tr:hover {
    background-color: rgba(255, 255, 255, 0.02);
  }

  :global(tr[data-selected="true"]) {
    background-color: rgba(255, 255, 255, 0.07) !important;
  }

  .dat_table td:first-child {
    text-align: center;
  }

  .dat_table td:first-child {
    position: sticky;
    left: 0;
    background-color: rgb(30 30 30);
    box-shadow: inset -1px 0 0 rgba(255, 255, 255, 0.1);
  }

  /* The row tint is semi-transparent, so overlay it on the opaque sticky cell */
  .dat_table tr:hover td:first-child {
    background-image: linear-gradient(
      rgba(255, 255, 255, 0.02),
      rgba(255, 255, 255, 0.02)
    );
  }

  .dat_table tr[data-selected="true"] td:first-child {
    background-image: linear-gradient(
      rgba(255, 255, 255, 0.07),
      rgba(255, 255, 255, 0.07)
    );
  }

  td {
    padding: 0 8px;
  }

  .table_header {
    white-space: nowrap;
    padding: 0 7px;
  }

  .table_cell {
    white-space: nowrap;
  }

  .row_opts {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: auto auto;
    gap: 4px;
    align-items: center;
  }

  .row_opts_check,
  .row_opts_menu {
    justify-self: start;
  }

  .row_opts_num {
    justify-self: stretch;
    text-align: center;
  }

  .row_opts_preview {
    justify-self: end;
  }

  .delete_row {
    background-color: transparent;
    border: none;

    padding: 3px;

    vertical-align: middle;
  }
  .delete_row:hover {
    cursor: pointer;
    background-color: rgba(255, 255, 255, 0.1);
  }

  footer {
    grid-area: footer;
    height: 22px;
    padding: 4px 10px;
    overflow: hidden;

    color: var(--color-text-sec);

    border-top: solid 1px var(--color-border-p0);
  }

  footer button {
    background-color: transparent;
    border: none;
    color: var(--color-text-sec);
    text-decoration: underline;
    cursor: pointer;
    padding: 0;
    margin-left: 10px;
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

    z-index: 1000;
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

    padding: 10px 10px 0 10px;
  }

  .dets_field_cont {
    display: flex;
    flex-direction: column;
    gap: 13px;

    margin-top: 5px;
    padding: 10px;
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
