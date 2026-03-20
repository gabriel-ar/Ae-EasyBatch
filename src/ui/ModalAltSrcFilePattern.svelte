<script lang="ts">
  /**
   * Input modal to enter the pattern to find the alternate source files for a column
   */

  import { onMount } from "svelte";
  import { l, s, csa } from "./States.svelte.ts";
  import Dropdown from "./Dropdown.svelte";
  import { ColumnHelper } from "../lib/Settings.svelte.ts";
    import { CheckCircled, ExclamationTriangle } from "radix-icons-svelte";

  let {
    show = $bindable(false),
    col_i,
    onclose = $bindable(() => {}),
  } = $props();

  let sel_add_field = $state("base_path");
  let preview = $state("");

  let pattern = $state("");
  let base_path = $state("");

  const tmpl = $derived(s.proj.tmpls[s.proj.sel_tmpl]);

  onMount(() => {
    pattern = tmpl.columns[col_i].alt_src_pattern;
    base_path = tmpl.columns[col_i].alt_src_base;
  });

  function AddField() {
    let save_pattern_ta = document.querySelector<HTMLTextAreaElement>(
      "#alt_src_pattern_ta",
    );

    console.debug("cursor_pos:", save_pattern_ta.selectionStart);

    let cursor_pos = save_pattern_ta.selectionStart;
    let old_val = pattern;

    //Insert the selected field at the cursor position
    pattern =
      old_val.slice(0, cursor_pos) +
      `{${sel_add_field}}` +
      old_val.slice(cursor_pos);

      save_pattern_ta.focus();
      save_pattern_ta.selectionStart = save_pattern_ta.selectionEnd =
        cursor_pos + sel_add_field.length + 2;

    l.debug("[ModalAltSrc] AddField solved pattern:", pattern);
  }

  /**
   * Selects a folder to save the files to and adds it to the save pattern
   */
  function SelectBasePath() {
    csa.OpenFolderDialog(base_path ? base_path : undefined).then((result) => {
      if (result === null) return;

      base_path = result;
    });
  }

  $effect(() => {
    UpdatePreview(pattern, base_path);
  });

  function UpdatePreview(dummy, dummy2) {
    let col = tmpl.columns[col_i];

    col.alt_src_pattern = pattern;
    col.alt_src_base = base_path;

    preview = ColumnHelper.ResolveAltSrcPath(col, 0, tmpl.columns);

    if (file_exists_to) clearTimeout(file_exists_to);
    file_exists_to = setTimeout(FileExists, 1000);

    file_exists = "";

    l.debug(
      "[ModalAltSrc] UpdatePreview called with pattern:",
      pattern,
      "and base_path:",
      base_path,
    );
  }

  let file_exists = $state("");
  let file_exists_to;
  async function FileExists() {
    if(pattern === "" || preview === "") {
      file_exists = "";
      return;
    }

    const fs = window.require("fs");
    const path = window.require("path");

    const proj_folder = (await csa.EvalDirectAsync(
      `app.project.file.parent.fsName`,
    )) as string;
    let file = path.join(proj_folder, preview);

    console.debug("[ModalAltSrc] Checking if file exists at path:", file);

    fs.stat(file, (err, stats) => {
      if (err) {
        if (err.code === "ENOENT") {
          file_exists = "no";
        } else {
          console.error("Error checking file existence:", err);
          file_exists = "";
        }
      } else {
        file_exists = stats.isFile() ? "yes" : "no";
      }
    });
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
            onselect={() => AddField()} />
        </div>
      </div>

      <div style="margin-bottom: 10px;">
        <span>Preview:</span>
        <span class="out_prev">{preview}</span>
        <span style="margin-left: 10px; vertical-align: -webkit-baseline-middle;" data-tooltip={file_exists === "yes" ? "File exists" : "File not found"}>
          {#if file_exists === "yes"}
            <CheckCircled color="green" size={17} />
          {:else if file_exists === "no"}
            <ExclamationTriangle color="yellow" size={17} />
          {/if}
        </span> 
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
