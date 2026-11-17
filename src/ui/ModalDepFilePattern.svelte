<script lang="ts">
  import { TemplateHelper } from "../lib/Settings.svelte.ts";
  import { l, s, csa } from "../lib/States.svelte.ts";
  import { Check, Cross2, Trash } from "radix-icons-svelte";
  import { LocalSettings, type SavePatternPreset } from "../lib/LocalSettings.ts";
  import Dropdown from "./Dropdown.svelte";
  import Save from "../assets/Save.svelte";

  type OnCloseFunc = (base_path: string, pattern: string) => void;

  let show =  $state(false);
  let pick_base = $state(false);
  let sel_add_field = $state("base_path");

  let dc_index = $state<number>(0);

  let presets = $state<SavePatternPreset[]>([]);
  let sel_preset = $state("");
  let naming_preset = $state(false);
  let preset_name = $state("");
  let preset_error = $state("");

  let onclose: OnCloseFunc;

  export function Open(
    dep_index: number,
    on_close_callback: OnCloseFunc,
    pick_base: boolean = false,
  ) {
    l.debug("[ModalDepFile] Open called with template:", s.tmpl);

    dc_index = dep_index;
    pick_base = pick_base;

    sel_preset = "";
    naming_preset = false;
    LoadPresets();

    onclose = on_close_callback;
    show = true;
  }

  /**Runs a preset storage operation, showing any storage error in the dialog*/
  function RunPresetOp(op: () => SavePatternPreset[]) {
    try {
      presets = op();
      preset_error = "";
      return true;
    } catch (error) {
      l.error("[ModalDepFile] Preset storage failed", error);
      preset_error = "Could not access the saved presets: " + (error as Error).message;
      return false;
    }
  }

  function LoadPresets() {
    RunPresetOp(() => LocalSettings.LoadSavePatternPresets());
  }

  function ApplyPreset(name: string) {
    let preset = presets.find((item) => item.name === name);
    if (!preset) return;

    s.tmpl.dep_config[dc_index].save_pattern = preset.pattern;
    UpdatePreview();
  }

  function StartNamingPreset() {
    preset_name = sel_preset;
    naming_preset = true;
  }

  function SavePreset() {
    let name = preset_name.trim();
    if (name === "") return;

    let ok = RunPresetOp(() =>
      LocalSettings.UpsertSavePatternPreset({
        name,
        pattern: s.tmpl.dep_config[dc_index].save_pattern,
      }),
    );

    if (ok) sel_preset = name;
    naming_preset = false;
  }

  function DeletePreset() {
    if (RunPresetOp(() => LocalSettings.DeleteSavePatternPreset(sel_preset))) {
      sel_preset = "";
    }
  }

  function FocusOnMount(node: HTMLInputElement) {
    node.focus();
    node.select();
  }

  function AddField() {
    let save_pattern_ta =
      document.querySelector<HTMLTextAreaElement>("#file_pattern_ta");
    if (save_pattern_ta === null) return;

    let cursor_pos = save_pattern_ta.selectionStart;
    let old_val = s.tmpl.dep_config[dc_index].save_pattern;

    //Insert the selected field at the cursor position
    s.tmpl.dep_config[dc_index].save_pattern =
      old_val.slice(0, cursor_pos) +
      `{${sel_add_field}}` +
      old_val.slice(cursor_pos);
    l.debug(
      "[ModalDepFile] AddField called with pattern:",
      s.tmpl.dep_config[dc_index].save_pattern,
    );
  }

  let update_prev_timeout: number;
  function DebounceUpdatePreview() {
    if (update_prev_timeout) clearTimeout(update_prev_timeout);

    update_prev_timeout = window.setTimeout(UpdatePreview, 800);
  }

  function UpdatePreview() {
    TemplateHelper.ResolveSavePathFirstDeps(s.tmpl, 0);
    s.tmpl.dep_config = s.tmpl.dep_config;
  }

  /**
   * Selects a folder to save the files to and adds it to the save pattern
   */
  function SelectBasePath() {

    csa.OpenSelectFolder(s.tmpl.base_path).then((result) => {
      if (result === null) return;

      s.tmpl.base_path = result;
    });
  }

  export function CloseDialog() {
    show = false;
    onclose(s.tmpl.base_path, s.tmpl.dep_config[dc_index].save_pattern);
  }
</script>

{#if show && s.tmpl !== undefined}
  <div class="modal">
    <div class="wrapper">
      <div class="modal-header">
        <h4>Render Save Path Pattern</h4>

        <div class="presets">
          {#if naming_preset}
            <input
              type="text"
              placeholder="Preset name"
              spellcheck="false"
              use:FocusOnMount
              bind:value={preset_name}
              onkeydown={(e) => {
                if (e.key === "Enter") SavePreset();
                else if (e.key === "Escape") naming_preset = false;
              }} />
            <button
              data-tooltip={presets.some((p) => p.name === preset_name.trim())
                ? "Overwrite preset"
                : "Save preset"}
              data-tt-pos="middle-left"
              disabled={preset_name.trim() === ""}
              onclick={SavePreset}><Check /></button>
            <button
              data-tooltip="Cancel"
              data-tt-pos="middle-left"
              onclick={() => (naming_preset = false)}><Cross2 /></button>
          {:else}
            <Dropdown
              bind:value={sel_preset}
              options={presets.map((p) => p.name)}
              labels={presets.map((p) => p.name)}
              html_labels={false}
              title={sel_preset === "" ? "Select preset" : null}
              style_list="right: 0; max-height: 250px; overflow-y: auto;"
              onselect={(name: string) => ApplyPreset(name)} />
            <button
              data-tooltip="Save the current pattern as a preset"
              data-tt-pos="middle-left"
              onclick={StartNamingPreset}><Save /></button>
            {#if sel_preset !== ""}
              <button
                data-tooltip="Delete the selected preset"
                data-tt-pos="middle-left"
                onclick={DeletePreset}><Trash /></button>
            {/if}
          {/if}
        </div>
      </div>
      {#if preset_error}
        <div class="preset_error">{preset_error}</div>
      {/if}
      <div class="modal-description">
        Define the pattern used to resolve where to save the rendered files.
      </div>

      <div
        style="display: flex; flex-direction: column; gap: 5px; margin-bottom: 10px;">
        <textarea
          id="file_pattern_ta"
          spellcheck="false"
          onkeyup={DebounceUpdatePreview}
          bind:value={s.tmpl.dep_config[dc_index].save_pattern}></textarea>
        <div>
          {#if pick_base}
            <button onclick={SelectBasePath} style="margin-right: 15px;"
              >Pick Base Folder</button>
          {/if}

          <Dropdown 
            bind:value={sel_add_field}
            labels={[
              "<b>Base Folder</b>",
              "<b>Template Name</b>",
              "<b>Composition</b>",
              "<b>Row Number</b>",
              "<b>Increment</b>",
              ...s.tmpl.columns.map((col) => col.cont_name),
            ]}
            options={[
              "base_folder",
              "template_name",
              "comp_name",
              "row_number",
              "increment:0000",
              ...s.tmpl.columns.map((col) => col.cont_name),
            ]}
            title="Add Field..."
            onselect={() => AddField()}
            />
        </div>
      </div>

      <div style="margin-bottom: 10px;">
        <span>Preview:</span>
        <span class="out_prev">{s.tmpl.dep_config[dc_index].save_path}</span>
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

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      margin-bottom: 0.5rem;
    }

    :global(.modal .wrapper .modal-header h4) {
      margin: 0;
    }

    .presets {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .preset_error {
      color: var(--color-text-sec);
      margin-bottom: 0.5rem;
    }
  </style>
{/if}
