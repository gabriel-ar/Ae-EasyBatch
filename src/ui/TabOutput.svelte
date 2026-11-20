<script lang="ts">
  import { onMount } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import {
    Play,
    ActivityLog,
    CheckCircled,
    Clock,
    CrossCircled,
    ExternalLink,
    ExclamationTriangle,
    Trash,
    Pencil1,
  } from "radix-icons-svelte";
  import { TemplateHelper } from "../lib/Settings.svelte.ts";
  import type { GetSelectedCompsResult, RenderProgress, RowRenderResult } from "../lib/Messaging";
  import { l, s, csa } from "../lib/States.svelte.ts";
  import {
    out,
    output_hooks,
    GetAllComps,
    BatchRender,
    BatchGenerate,
    BatchOneToMany,
    PauseDepRender,
    StopDepRender,
    ContinueDepRender,
    CanContinueDepRender,
    HasUnfinishedDepRender,
  } from "../lib/Output.svelte.ts";
  import Dropdown from "./Dropdown.svelte";
  import ModalFilePattern from "./ModalDepFilePattern.svelte";
  import SavePatternPresets from "./SavePatternPresets.svelte";

  let m_file_pattern = $state<ModalFilePattern>();
  const dep_progress = $derived(out.dep_progress);
  const unfinished_batch = $derived(HasUnfinishedDepRender());
  const rendered_count = $derived(out.dep_row_results.filter((item) => item.status === "rendered").length);
  const failed_count = $derived(out.dep_row_results.filter((item) => item.status === "error").length);
  const progress_labels: Record<RenderProgress["state"], string> = {
    rendering: "Rendering",
    paused_now: "Paused in After Effects",
    stopped: "Stopped",
    error: "Render interrupted",
    completed: "Completed",
  };
  const result_labels: Record<RowRenderResult["status"], string> = {
    success: "Queued",
    error: "Failed",
    warning: "Warning",
    stopped: "Stopped",
    pending: "Pending",
    queued: "Queued",
    rendering: "Rendering",
    rendered: "Rendered",
  };

  function GroupResults(results: RowRenderResult[]) {
    const groups = new Map<number, RowRenderResult[]>();
    for (const result of results) {
      const group = groups.get(result.row);
      if (group) group.push(result);
      else groups.set(result.row, [result]);
    }
    return [...groups];
  }

  function RowStatus(results: RowRenderResult[]) {
    if (results.every((item) => item.status === "rendered")) return "Completed";
    if (results.some((item) => item.status === "rendering")) {
      return dep_progress?.state === "paused_now" ? "Paused" : "Rendering";
    }
    if (results.some((item) => item.status === "queued" || item.status === "success")) return "Queued";
    if (results.some((item) => item.status === "stopped")) return "Stopped";
    if (results.some((item) => item.status === "error")) return "Failed";
    if (results.some((item) => item.status === "warning")) return "Warning";
    return "Pending";
  }

  function BlockRenderEdits(event: Event) {
    if ((!out.dep_running && !out.dep_busy) || !(event.target instanceof Element)) return;
    if (event.target.closest(".out_actions_cont, .render_results")) return;
    event.preventDefault();
    event.stopPropagation();
  }

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

  async function OpenOutputFolder(path: string) {
    try {
      await csa.OpenOutputFolder(path, out.project_path);
    } catch (error) {
      l.error("Could not open output folder", error);
      output_hooks.Footer("Could not open the output folder. Check that the folder exists.");
    }
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

{#snippet result_path(path?: string)}
  {#if path}
    <div class="result_path">
      <span class="result_path_text" dir="rtl" title={path}><bdi dir="ltr">{path}</bdi></span>
      <button onclick={() => OpenOutputFolder(path)} data-variant="discrete" title="Open Containing Folder" aria-label="Open Containing Folder">
        <ExternalLink color="white" size={15} />
      </button>
    </div>
  {/if}
{/snippet}

{#snippet results_list(results: RowRenderResult[], stopped = false)}
  {@const groups = GroupResults(results)}
  {@const expanded_rows = new SvelteSet<number>()}
  {@const any_expanded = groups.some(([row]) => expanded_rows.has(row))}
  <div class="render_results">
    <div class="section_header">
      <h4>Results</h4>
      <button type="button" data-variant="discrete" disabled={!any_expanded}
        onclick={() => expanded_rows.clear()}>Collapse All</button>
    </div>
    {#if stopped}
      <div class="OtM_stopped_warn">
        <ExclamationTriangle color="yellow" size={14} />
        Renders stopped by user.
      </div>
    {/if}
    {#each groups as [row, outputs] (row)}
      <details class="result_row" bind:open={() => expanded_rows.has(row), (open) => {
        if (open) expanded_rows.add(row);
        else expanded_rows.delete(row);
      }}>
        <summary>
          <strong>Row {row + 1}</strong>
          <span class="result_row_status">{RowStatus(outputs)}</span>
        </summary>
        <ul class="result_outputs">
          {#each outputs as output}
            <li class="result_output">
              <span class="result_status" role="img" aria-label={result_labels[output.status]} title={result_labels[output.status]}>
                {#if output.status === "rendered"}
                  <CheckCircled color="green" size={15} />
                {:else if output.status === "warning" || output.status === "stopped"}
                  <ExclamationTriangle color="yellow" size={15} />
                {:else if output.status === "error"}
                  <CrossCircled color="red" size={15} />
                {:else if output.status === "rendering"}
                  <Play size={15} />
                {:else if output.status === "queued" || output.status === "success"}
                  <ActivityLog size={15} />
                {:else}
                  <Clock size={15} />
                {/if}
              </span>
              <div class="result_body">
                <strong>{output.comp_name ?? "Output"}</strong>
                {@render result_path(output.rendered_path)}
                {#if output.error}<div class="result_error">{output.error}</div>{/if}
              </div>
            </li>
          {/each}
        </ul>
      </details>
    {/each}
  </div>
{/snippet}

<main class="output" onclickcapture={BlockRenderEdits} onkeydowncapture={BlockRenderEdits} onpastecapture={BlockRenderEdits}>
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

    <div class="section_header">
      <h4>
        File Name Pattern
        <button
          class="info"
          data-tt-pos="middle-right"
          data-tt-width="large"
          data-tooltip="Generates the file name of every export using this pattern."
          >?</button>
      </h4>
      <SavePatternPresets bind:pattern={s.tmpl.save_pattern} />
    </div>

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
        <button disabled={out.dep_busy || out.dep_running} class="setting" onclick={() => BatchRender()}
          ><Play size={18} />Start Batch Render</button>

        <button
          disabled={out.dep_busy || out.dep_running}
          class="setting"
          onclick={() => BatchRender(-1, false)}
          data-tooltip="Useful if you want to send the queue to Media Encoder."
          data-tt-width="x-large"
          ><ActivityLog size={18} />Queue Renders</button>
      </div>
    </div>

    <!--Results-->
    {#if out.render_results.length > 0}
      {@render results_list(out.render_results)}
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
      Compositions to Render
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
            data-tooltip="Remove Composition from Renders"
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
        {#if !out.dep_running && !unfinished_batch}
          <button disabled={out.dep_busy} class="setting" onclick={() => BatchOneToMany()}
            ><Play size={18} />Start Batch Render</button>
        {:else if out.dep_running}
          <button disabled={out.dep_busy} onclick={PauseDepRender}>Pause</button>
        {:else if CanContinueDepRender()}
          <button disabled={out.dep_busy} onclick={ContinueDepRender}>Continue</button>
        {/if}
        {#if out.dep_running || unfinished_batch}
          <button disabled={out.dep_busy} onclick={StopDepRender}>Stop Batch</button>
        {/if}

        <!-- <button class="setting" onclick={() => BatchOneToMany(-1, true)}
          ><ActivityLog size={18} />Queue in Media Encoder</button> -->
      </div>
      {#if dep_progress && dep_progress.comp_id === s.tmpl.comp_id}
        <div class="dep_progress" data-state={dep_progress.state}>
          <div role="status">
            {progress_labels[dep_progress.state]}
            {#if dep_progress.state === "completed" && failed_count} with errors{/if}
            - {rendered_count}/{out.dep_row_results.length} Outputs Rendered
            {#if failed_count} · {failed_count} failed{/if}
          </div>
          <progress aria-label="Rendered outputs" value={rendered_count} max={out.dep_row_results.length || 1}></progress>
          {#if dep_progress.row_count !== TemplateHelper.RowCount(s.tmpl)}
            <p>The row count changed. Stop the batch, then select the rows you want and start a new batch.</p>
          {/if}
        </div>
      {/if}
    </div>

    <!--Results-->
    {#if out.dep_row_results.length > 0 && dep_progress?.comp_id === s.tmpl.comp_id}
      {@render results_list(out.dep_row_results, out.user_stopped_deps)}
    {/if}
  {/if}
</main>

<ModalFilePattern bind:this={m_file_pattern}></ModalFilePattern>

<style>
  .dep_progress { margin-top: 8px; }

  .dep_progress progress {
    width: 100%;
    margin-top: 4px;
  }

  .output { min-width: 0; }

  .result_row {
    border: 1px solid var(--color-border-p0);
    border-radius: var(--radius-form);
    margin-bottom: 4px;
  }

  .result_row summary {
    cursor: pointer;
    padding: 5px 8px;
  }

  .result_row summary:hover,
  .result_row[open] summary {
    background-color: var(--color-p1);
  }

  .result_row_status { margin-left: 8px; }

  .result_outputs {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .result_output {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    gap: 8px;
    padding: 6px 8px;
  }

  .result_output + .result_output { border-top: 1px solid var(--color-border-p0); }
  .result_status { display: flex; padding-top: 3px; }
  .result_body { overflow-wrap: anywhere; }
  .result_error { color: var(--color-text-sec); }

  .result_path {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .result_path_text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .result_path button { flex: none; }

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

  .output .section_header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    margin: 13px 0 7px 0;
  }

  .output .section_header h4 {
    margin: 0;
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

  .OtM_stopped_warn {
    margin: 10px 0;
    color: var(--color-warning);
  }

  :global(.OtM_stopped_warn svg) {
    vertical-align: middle;
    margin-right: 3px;
  }
</style>
