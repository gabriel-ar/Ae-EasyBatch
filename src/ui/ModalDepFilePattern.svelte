<script lang="ts">
  import { Column, Template, type DepCompSetts } from "../lib/Settings.ts";
  import CSAdapter from "../lib/CSAdapter.ts";
  import { getContext, onMount } from "svelte";
  import { l } from "./States.svelte.ts";
  import Dropdown from "./Dropdown.svelte";

  type OnCloseFunc = (base_path: string, pattern: string) => void;

  let show: boolean;
  let pick_base: boolean;
  let sel_add_field: string = "base_path";

  let tmpl: Template;
  let dc_id: string;

  let onclose: OnCloseFunc;

  export function Open(
    template: Template,
    dep_comp_id: string,
    on_close_callback: OnCloseFunc,
    pick_base: boolean = false,
  ) {
    l.debug("[ModalDepFile] Open called with template:", template);

    if (template === undefined) {
      l.error("[ModalDepFile] Template is undefined");
      return;
    }

    tmpl = template;
    dc_id = dep_comp_id;
    pick_base = pick_base;

    onclose = on_close_callback;
    show = true;
  }

  function AddField() {
    /**@type {HTMLTextAreaElement}*/
    let save_pattern_ta: HTMLTextAreaElement =
      document.querySelector("#file_pattern_ta");

    let cursor_pos = save_pattern_ta.selectionStart;
    let old_val = tmpl.dep_config[dc_id].save_pattern;

    //Insert the selected field at the cursor position
    tmpl.dep_config[dc_id].save_pattern =
      old_val.slice(0, cursor_pos) +
      `{${sel_add_field}}` +
      old_val.slice(cursor_pos);

    tmpl = tmpl;
    l.debug(
      "[ModalDepFile] AddField called with pattern:",
      tmpl.dep_config[dc_id].save_pattern,
    );
  }

  let update_prev_timeout: number;
  function DebounceUpdatePreview() {
    if (update_prev_timeout) clearTimeout(update_prev_timeout);

    update_prev_timeout = window.setTimeout(UpdatePreview, 800);
  }

  function UpdatePreview() {
    tmpl.ResolveSavePathFirstDeps(0);
    tmpl.dep_config = tmpl.dep_config;
  }

  /**
   * Selects a folder to save the files to and adds it to the save pattern
   */
  function SelectBasePath() {
    let csa = new CSAdapter();

    csa.OpenFolderDialog(tmpl.base_path).then((result) => {
      if (result === null) return;

      tmpl.base_path = result;
    });
  }

  export function CloseDialog() {
    show = false;
    onclose(tmpl.base_path, tmpl.dep_config[dc_id].save_pattern);
  }
</script>

{#if show && tmpl !== undefined}
  <div class="modal">
    <div class="wrapper">
      <h4>Render Save Path Pattern</h4>
      <div class="modal-description">
        Define the pattern used to resolve where to save the rendered files.
      </div>

      <div
        style="display: flex; flex-direction: column; gap: 5px; margin-bottom: 10px;">
        <textarea
          id="file_pattern_ta"
          spellcheck="false"
          onkeyup={DebounceUpdatePreview}
          bind:value={tmpl.dep_config[dc_id].save_pattern}></textarea>
        <div>
          {#if pick_base}
            <button onclick={SelectBasePath} style="margin-right: 15px;"
              >Pick Base Path</button>
          {/if}

          <Dropdown 
            bind:value={sel_add_field}
            labels={[
              "<b>Base Path</b>",
              "<b>Template Name</b>",
              "<b>Row Number</b>",
              "<b>Increment</b>",
              ...tmpl.columns.map((col) => col.cont_name),
            ]}
            options={[
              "base_path",
              "template_name",
              "row_number",
              "increment:0000",
              ...tmpl.columns.map((col) => col.cont_name),
            ]}
            title="Add Field..."
            onselect={() => AddField()}
            />
        </div>
      </div>

      <div style="margin-bottom: 10px;">
        <span>Preview:</span>
        <span class="out_prev">{tmpl.dep_config[dc_id].save_path}</span>
      </div>
      <div class="modal-actions">
        <button onclick={CloseDialog}>Close</button>
      </div>
    </div>
  </div>

  <style>
    .out_prev {
      word-break: break-all;
    }
  </style>
{/if}
