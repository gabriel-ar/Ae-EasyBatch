<script>
  import CSAdapter from "../lib/CSAdapter.ts";
  import { getContext, onMount } from "svelte";
  import { l } from "./States.svelte.ts";
    import Dropdown from "./Dropdown.svelte";

  let {
    show = $bindable(false),
    tmpl,
    col_i,
    onclose = $bindable(() => {}),
  } = $props();

  let sel_add_field = $state("base_path");
  let preview = $state("");

  let pattern = $state();
  let base_path = $state();

  onMount(() => {
    pattern = tmpl.columns[col_i].alt_src_pattern;
    base_path = tmpl.columns[col_i].alt_src_base;
  });

  function AddField() {
    /**@type {HTMLTextAreaElement}*/
    let save_pattern_ta = document.querySelector("#alt_src_pattern_ta");

    let cursor_pos = save_pattern_ta.selectionStart;
    let old_val = pattern;

    //Insert the selected field at the cursor position
    pattern =
      old_val.slice(0, cursor_pos) +
      `{${sel_add_field}}` +
      old_val.slice(cursor_pos);

    tmpl = tmpl;
    l.debug("[ModalAltSrc] AddField called with pattern:", pattern);
  }

  /**
   * Selects a folder to save the files to and adds it to the save pattern
   */
  function SelectBasePath() {
    let csa = new CSAdapter();

    csa.OpenFolderDialog(base_path).then((result) => {
      if (result === null) return;

      base_path = result;
    });
  }

  $effect(() => {
    UpdatePreview(pattern, base_path);
    //l.debug('Effect triggered: UpdatePreview');
  });

  function UpdatePreview(dummy, dummy2) {
    let col = tmpl.columns[col_i];

    col.alt_src_pattern = pattern;
    col.alt_src_base = base_path;

    preview = col.ResolveAltSrcPath(0, tmpl.columns);
    l.debug(
      "[ModalAltSrc] UpdatePreview called with pattern:",
      pattern,
      "and base_path:",
      base_path,
    );
  }

  function CloseDialog() {
    show = false;
    onclose(base_path, pattern);
  }
</script>

{#if show}
  <div class="modal" id="alternate_modal" style:display={"flex"}>
    <div class="wrapper">
      <h4>File Path Pattern</h4>
      <div class="modal-description">
        This is the pattern the extension will use to find the files for this
        property.
      </div>
      <div
        style="display: flex; flex-direction: column; gap: 5px; margin-bottom: 10px;">
        <textarea
          id="alt_src_pattern_ta"
          spellcheck="false"
          bind:value={pattern}></textarea>
        <div>
          <button onclick={SelectBasePath}>Pick Base Path</button>

          <Dropdown 
            bind:value={sel_add_field}
            labels={[
              "<b>Base Path</b>",
              "<b>Row Number</b>",
              "<b>Increment</b>",
              ...tmpl.columns.map((col) => col.cont_name),
            ]}
            options={[
              "base_path",
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
        <span class="out_prev">{preview}</span>
      </div>

      <div class="modal-actions">
        <button onclick={CloseDialog}>Done</button>
      </div>
    </div>
  </div>

  <style>
    .out_prev {
      word-break: break-all;
    }
  </style>
{/if}
