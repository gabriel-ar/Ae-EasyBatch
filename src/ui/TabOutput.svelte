<script lang="ts">
  import { onMount } from "svelte";
  import {
    Play,
    ActivityLog,
    CheckCircled,
    CrossCircled,
    ExternalLink,
    ExclamationTriangle,
    Trash,
    Pencil1,
  } from "radix-icons-svelte";
  import { TemplateHelper } from "../lib/Settings.svelte.ts";
  import type { GetSelectedCompsResult } from "../lib/Messaging";
  import { l, s, csa } from "../lib/States.svelte.ts";
  import {
    out,
    output_hooks,
    GetAllComps,
    BatchRender,
    BatchGenerate,
    BatchOneToMany,
  } from "../lib/Output.svelte.ts";
  import Dropdown from "./Dropdown.svelte";
  import ModalFilePattern from "./ModalDepFilePattern.svelte";

  let m_file_pattern = $state<ModalFilePattern>();

  //Fill in the default templates the first time the tab is shown for a template
  onMount(() => {
    if (s.tmpl === undefined) return;

    let render_templs = s.render_setts_templs.render_templs ?? [];
    let output_module_templs = s.render_setts_templs.output_modules_templs ?? [];
    let default_render_templ_i = s.render_setts_templs.default_render_templ ?? 0;
    let default_output_module_templ_i =
      s.render_setts_templs.default_output_module_templ ?? 0;

    if (s.tmpl.render_setts_templ == "") {
      s.tmpl.render_setts_templ =
        render_templs[default_render_templ_i] || render_templs[0] || "";
    }

    if (s.tmpl.render_out_module_templ == "") {
      s.tmpl.render_out_module_templ =
        output_module_templs[default_output_module_templ_i] ||
        output_module_templs[0] ||
        "";
    }
  });

  function OpenRenderedPath(path?: string) {
    if (!path) return;
    csa
      .OpenPath(path)
      .then((ok) => {
        if (!ok) output_hooks.Footer("Could not open: " + path);
      })
      .catch((e) => l.error("Failed to open rendered path", e));
  }

  /**
   * Selects a folder to save the files to and adds it to the save pattern
   */
  function SelRenderBasePath() {
    l.debug("SelectBasePath called");
    let initial_folder = s.tmpl.base_path || "";

    csa.OpenSelectFolder(initial_folder).then((result) => {
      if (result === null) return;

      s.tmpl.base_path = result;
    });
  }

  let sel_add_field = $state("base_path");
  function RenderSave_AddField() {
    let save_pattern_ta =
      document.querySelector<HTMLTextAreaElement>("#save_pattern_ta");
    if (!save_pattern_ta) return;

    let cursor_pos = save_pattern_ta.selectionStart;
    let old_val = s.tmpl.save_pattern;

    //Insert the selected field at the cursor position
    s.tmpl.save_pattern =
      old_val.slice(0, cursor_pos) +
      `{${sel_add_field}}` +
      old_val.slice(cursor_pos);
  }

  let sel_add_field_gen = $state("row_number");
  function GenerateName_AddField() {
    let pattern_ta =
      document.querySelector<HTMLTextAreaElement>("#generate_proj_ta");
    if (!pattern_ta) return;

    let cursor_pos = pattern_ta.selectionStart;
    let old_val = s.tmpl.generate_pattern;

    //Insert the selected field at the cursor position
    s.tmpl.generate_pattern =
      old_val.slice(0, cursor_pos) +
      `{${sel_add_field_gen}}` +
      old_val.slice(cursor_pos);
  }

  let selected_comp = $state<number | "">("");
  function AddCompToDependents() {
    if (selected_comp !== "") {
      let comp = out.all_comps.find((c) => c.id === selected_comp);

      if (comp) {
        TemplateHelper.AddDependantComp(s.tmpl, comp, s.render_setts_templs);
        TemplateHelper.CleanupDependantComps(s.tmpl, out.all_comps);
        TemplateHelper.ResolveSavePathFirstDeps(s.tmpl, 0);
      }
    }
  }

  async function AddSelectedCompsToDependents() {
    const result = await csa.Exec<GetSelectedCompsResult>("GetSelectedComps");
    l.debug(`Got selected Comps`, result);

    if (!result.success) {
      l.error("Failed to get selected comps", result.error_obj);
      return;
    }

    await GetAllComps();

    for (let comp_info of result.comps ?? []) {
      let comp = out.all_comps.find((c) => c.id === comp_info.id);

      if (comp) {
        //TODO snapshot used because structuredClone doesn't work with the reactive objects, find a better way to do this
        TemplateHelper.AddDependantComp(s.tmpl, comp, s.render_setts_templs);
      }
    }

    TemplateHelper.CleanupDependantComps(s.tmpl, out.all_comps);
    TemplateHelper.ResolveSavePathFirstDeps(s.tmpl, 0);
  }

  function DeleteDependentComp(dep_index: number) {
    TemplateHelper.RemoveDependantComp(s.tmpl, dep_index);
    TemplateHelper.CleanupDependantComps(s.tmpl, out.all_comps);

    //force Svelte reactivity
    s.tmpl.dep_comps = s.tmpl.dep_comps;
  }

  let edit_dep_comp_index = $state<number | undefined>();
  function DepFilePatternModalOpen(dep_index: number) {
    edit_dep_comp_index = dep_index;
    m_file_pattern?.Open(dep_index, DepFilePatternModalClosed);
  }

  function DepFilePatternModalClosed(base_path: string, pattern: string) {
    if (edit_dep_comp_index === undefined) return;
    s.tmpl.dep_config[edit_dep_comp_index].save_pattern = pattern;

    TemplateHelper.ResolveSavePathFirstDeps(s.tmpl, 0);
  }
</script>

<main class="output">
  <span
    >Render Mode:
    <Dropdown
      variant="discrete"
      labels={["One Per Row", "Multi-Output", "Generate Comps"]}
      options={["render", "dependant", "generate"]}
      bind:value={s.tmpl.out_mode} />
  </span>

  <!-- MODE: RENDER -->
  {#if s.tmpl.out_mode === "render"}
    <p class="modal-description">
      Exports a single render per row. When you only need to export a final
      file for each version.
    </p>

    <h4>
      File Name Pattern
      <button
        class="info"
        data-tt-pos="middle-right"
        data-tt-width="large"
        data-tooltip="Generates the file name of every export using this pattern."
        >?</button>
    </h4>

    <textarea
      id="save_pattern_ta"
      spellcheck="false"
      bind:value={s.tmpl.save_pattern}></textarea>

    <div class="setting" style="margin-top: 4px;">
      <button onclick={SelRenderBasePath}>Pick Base Folder</button>

      <Dropdown
        style={"margin-left: 15px;"}
        labels={[
          "Base Folder",
          "Template Name",
          "Row Number",
          "Increment",
          ...s.tmpl.columns.map((col) => col.cont_name),
        ]}
        options={[
          "base_folder",
          "template_name",
          "row_number",
          "increment:0000",
          ...s.tmpl.columns.map((col) => col.cont_name),
        ]}
        title="Add Field..."
        onselect={() => RenderSave_AddField()}
        bind:value={sel_add_field} />
    </div>

    <div class="setting">
      <span>Preview File Path:</span>
      <span class="out_prev">{s.tmpl.save_paths[0]}</span>
    </div>

    <h4>
      Render Settings
      <button
        class="info"
        data-tt-pos="middle-right"
        data-tt-width="x-large"
        data-tooltip="Go to Edit > Templates to create or edit render settings and output module templates."
        >?</button>
    </h4>

    <div class="setting">
      <label for="sel_render_setts_templ">Render Settings Template</label>

      <Dropdown
        labels={s.visible_render_templates}
        options={s.visible_render_templates}
        bind:value={s.tmpl.render_setts_templ} />
    </div>

    <div class="setting">
      <label for="sel_render_out_module">Output Module Template</label>
      <Dropdown
        labels={s.visible_output_module_labels}
        options={s.visible_output_module_templates}
        bind:value={s.tmpl.render_out_module_templ} />
    </div>

    <div class="out_actions_cont">
      <div class="out_actions">
        <button class="setting" onclick={() => BatchRender()}
          ><Play size={18} />Start Batch Render</button>

        <button
          class="setting"
          onclick={() => BatchRender(-1, false)}
          data-tooltip="Useful if you want to send the queue to Media Encoder."
          data-tt-width="x-large"
          ><ActivityLog size={18} />Queue Renders</button>
      </div>
    </div>

    <!--Results-->
    {#if out.render_results.length > 0}
      <h4>Results</h4>
      <table class="render_results">
        <colgroup>
          <col style="width: 45px;" />
          <col style="width: 70px;" />
          <col />
          <col />
        </colgroup>
        <thead>
          <tr>
            <th>Row</th>
            <th>Queued</th>
            <th>Path</th>
            <th>Message</th>
          </tr>
        </thead>
        <tbody>
          {#each out.render_results as row}
            <tr>
              <td>{row.row}</td>
              <td>
                {#if row.status == "success"}
                  <CheckCircled color="green" size={23} />
                {:else}
                  <CrossCircled color="red" size={23} />
                {/if}
              </td>
              <td
                >{row.rendered_path}
                <button
                  onclick={() => OpenRenderedPath(row.rendered_path)}
                  data-variant="discrete"
                  style="margin-left: 4px;">
                  <ExternalLink color="white" size={15} />
                </button>
              </td>
              <td>{row.error}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  {:else if s.tmpl.out_mode === "generate"}
    <!-- MODE: GENERATE -->

    <p class="modal-description">
      Creates editable compositions in your project for each row. Use this if
      you need to share the project with someone without the extension.
    </p>

    <h4>Composition Name Pattern</h4>
    <textarea
      id="generate_proj_ta"
      spellcheck="false"
      bind:value={s.tmpl.generate_pattern}></textarea>
    <div class="setting" style="margin-top: 4px;">
      <Dropdown
        labels={[
          "Template Name",
          "Row Number",
          "Increment",
          ...s.tmpl.columns.map((col) => col.cont_name),
        ]}
        options={[
          "template_name",
          "row_number",
          "increment:0000",
          ...s.tmpl.columns.map((col) => col.cont_name),
        ]}
        title="Add Field..."
        onselect={() => GenerateName_AddField()}
        bind:value={sel_add_field_gen} />
    </div>

    <div class="setting">
      <span>Preview:</span>
      <span class="out_prev">{s.tmpl.generate_names[0]}</span>
    </div>

    <div class="setting">
      <label for="in_imported_folder">Generated Comps Folder Name</label>
      <input
        id="in_gen_folder"
        type="text"
        bind:value={s.tmpl.gen_comps_folder} />
    </div>

    <div class="out_actions_cont">
      <div class="out_actions">
        <button class="setting" onclick={() => BatchGenerate()}
          ><Play size={18} />Generate Compositions</button>
      </div>
    </div>
  {:else if s.tmpl.out_mode === "dependant"}
    <!-- MODE: DEPENDANT -->

    <p class="modal-description">
      Exports multiple files per row of data. Ideal for creating assets in
      different formats or from nested compositions.
    </p>

    <h4>
      Common Base Folder
      <button
        class="info"
        data-tt-pos="middle-right"
        data-tt-width="x-large"
        data-tooltip="All renders will be saved relative to this folder. Use the 'Edit File Pattern' button to set the full save path for each composition."
        >?</button>
    </h4>

    <div class="setting">
      <span>{s.tmpl.base_path}</span>
      <div><button onclick={SelRenderBasePath}>Choose Folder...</button></div>
    </div>

    <h4>
      Add Composition to Renders
      <button
        class="info"
        data-tt-pos="middle-right"
        data-tt-width="x-large"
        data-tooltip="The compositions you select will be rendered for every row of data. You can select any composition in the project, even if is not directly related to the template composition."
        >?</button>
    </h4>

    <div class="setting">
      <Dropdown
        search_enabled={true}
        labels={[
          "Select a Composition",
          ...out.all_comps.map((comp) => comp.name),
        ]}
        options={["", ...out.all_comps.map((comp) => comp.id)]}
        bind:value={selected_comp} />

      <button
        onclick={() => {
          AddCompToDependents();
        }}>Add</button>
      <button
        style="margin-left: 12px;"
        onclick={() => {
          AddSelectedCompsToDependents();
        }}>Add Selected</button>
    </div>

    <!-- Dependant Compositions -->
    {#each s.tmpl.dep_comps as dc, dc_i}
      <details class="out_sub_render">
        <summary>
          <input
            type="checkbox"
            style="margin: 5px 5px 3px 7px;"
            bind:checked={s.tmpl.dep_config[dc_i].enabled} />
          <h4 style="display: inline;">{dc.name}</h4>
          <button
            class="delete_col"
            data-tooltip="Remove composition from renders"
            data-tt-pos="middle-right"
            onclick={() => DeleteDependentComp(dc_i)}><Trash /></button>
        </summary>

        <div class="out_sub_render_cont">
          <h5>
            Render Save Pattern
            <button
              class="info"
              data-tt-pos="middle-right"
              data-tt-width="x-large"
              data-tooltip="This pattern determines where the renders are saved and their file names."
              >?</button>
          </h5>
          <div class="setting">
            <div>
              {s.tmpl.dep_config[dc_i].save_pattern}
              <button
                style="vertical-align: middle; margin-left: 8px;"
                data-tooltip="Edit the pattern that will determine the save path for this render."
                data-tt-pos="middle-right"
                data-tt-width="large"
                onclick={() => DepFilePatternModalOpen(dc_i)}>
                <Pencil1 /> Edit</button>
            </div>

            <div class="out_prev">
              <span>Preview:</span>
              <span
                style="text-overflow: ellipsis; max-width: 100%; display: inline-block;"
                >{s.tmpl.dep_config[dc_i].save_path}</span>
            </div>
          </div>

          <h5>
            Render
            <button
              class="info"
              data-tt-pos="middle-right"
              data-tt-width="x-large"
              data-tooltip="Go to Edit > Templates to create or edit render settings and output module templates."
              >?</button>
          </h5>

          <div class="setting">
            <label for="sel_render_setts_templ">Render Settings</label>
            <Dropdown
              labels={s.visible_render_templates}
              options={s.visible_render_templates}
              bind:value={s.tmpl.dep_config[dc_i].render_setts_templ} />
          </div>

          <div class="setting">
            <label for="sel_render_out_module">Output Module</label>

            <Dropdown
              labels={s.visible_output_module_labels}
              options={s.visible_output_module_templates}
              bind:value={
                s.tmpl.dep_config[dc_i].render_out_module_templ
              } />
          </div>
        </div>
      </details>
    {/each}

    <div class="out_actions_cont">
      <div class="out_actions">
        <button class="setting" onclick={() => BatchOneToMany()}
          ><Play size={18} />Start Batch Render</button>

        <!-- <button class="setting" onclick={() => BatchOneToMany(-1, true)}
          ><ActivityLog size={18} />Queue in Media Encoder</button> -->
      </div>
      <div class="OtM_ui_warn">
        <ExclamationTriangle color="white" size={15} />
        Using this render mode and rendering in After Effects will block the user
        interface, press Esc to cancel all renders.
      </div>
    </div>

    <!--Results-->
    {#if out.dep_row_results.length > 0}
      <h4>Results</h4>
      {#if out.user_stopped_deps}
        <div class="OtM_stopped_warn">
          <ExclamationTriangle color="yellow" size={14} />
          Renders stopped by user.
        </div>
      {/if}
      <table class="render_results">
        <colgroup>
          <col style="width: 45px;" />
          <col style="width: 70px;" />
          <col />
          <col />
        </colgroup>
        <thead>
          <tr>
            <th>Row</th>
            <th>Queued</th>
            <th>Path</th>
            <th>Message</th>
          </tr>
        </thead>
        <tbody>
          {#each out.dep_row_results as row}
            <tr>
              <td>{row.row}</td>
              <td>
                {#if row.status == "success"}
                  <CheckCircled color="green" size={23} />
                {:else if row.status == "warning" || row.status == "stopped"}
                  <ExclamationTriangle color="yellow" size={21} />
                {:else}
                  <CrossCircled color="red" size={23} />
                {/if}
              </td>
              <td
                >{row.rendered_path}
                <button
                  onclick={() => OpenRenderedPath(row.rendered_path)}
                  data-variant="discrete"
                  style="margin-left: 4px;">
                  <ExternalLink color="white" size={15} />
                </button>
              </td>
              <td>{row.error}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  {/if}
</main>

<ModalFilePattern bind:this={m_file_pattern}></ModalFilePattern>

<style>
  /* Results tables */
  .render_results,
  .render_results th,
  .render_results td {
    border-collapse: collapse;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .render_results td {
    padding: 0 8px;
  }

  .render_results tr:hover {
    background-color: rgba(255, 255, 255, 0.02);
  }

  .render_results thead th {
    padding: 0 5px;
  }

  .render_results td:nth-of-type(n + 1):nth-of-type(-n + 2) {
    text-align: center;
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

  .out_actions_cont {
    display: flex;
    flex-direction: column;
    align-items: center;

    border-top: 1px solid rgba(255, 255, 255, 0.05);
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);

    background-color: rgba(0, 0, 0, 0.15);

    margin: 10px -10px;
    padding: 10px 10px;
  }

  .out_actions {
    display: flex;
    justify-content: center;
    gap: 10px;
  }

  .out_actions button {
    font-weight: bold;
    font-size: 1.05rem;

    padding: 5px 8px;
    margin: 0 !important;
  }

  :global(.out_actions svg) {
    vertical-align: middle;
    margin-right: 5px;
  }

  .out_prev {
    word-break: break-all;
    display: flex;
    overflow: hidden;
  }

  .out_prev span {
    display: inline-block;
    color: var(--color-text-sec);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .out_sub_render {
    padding: 12px 0 12px 0;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }

  .out_sub_render summary > * {
    vertical-align: middle;
  }

  .out_sub_render summary::marker {
    color: rgb(255 255 255 / 30%);
  }

  .out_sub_render:hover summary::marker {
    color: rgb(255 255 255 / 90%);
  }

  .out_sub_render_cont {
    margin-left: 5px;
  }

  .out_sub_render_cont .setting {
    margin-left: 5px;
  }

  .OtM_ui_warn {
    text-align: center;
    margin: 5px 0 0 0;
  }

  :global(.OtM_ui_warn svg) {
    vertical-align: middle;
    margin-right: 3px;
  }

  .OtM_stopped_warn {
    margin: 10px 0;
    color: var(--color-warning);
  }

  :global(.OtM_stopped_warn svg) {
    vertical-align: middle;
    margin-right: 3px;
  }
</style>
