<script lang="ts">
  /**
   * Save/select/delete controls for the save pattern presets shared by every save pattern editor
   */

  import { Check, Cross2, Trash } from "radix-icons-svelte";
  import { l } from "../lib/States.svelte.ts";
  import { LocalSettings, type SavePatternPreset } from "../lib/LocalSettings.ts";
  import Dropdown from "./Dropdown.svelte";
  import Save from "../assets/Save.svelte";

  let {
    pattern = $bindable(),
    onapply = () => {},
  }: {
    pattern: string;
    onapply?: () => void;
  } = $props();

  let presets = $state<SavePatternPreset[]>([]);
  let sel_preset = $state("");
  let naming_preset = $state(false);
  let preset_name = $state("");
  let preset_error = $state("");

  /**Runs a preset storage operation, showing any storage error*/
  function RunPresetOp(op: () => SavePatternPreset[]) {
    try {
      presets = op();
      preset_error = "";
      return true;
    } catch (error) {
      l.error("[SavePatternPresets] Preset storage failed", error);
      preset_error = "Could not access the saved presets: " + (error as Error).message;
      return false;
    }
  }

  RunPresetOp(() => LocalSettings.LoadSavePatternPresets());

  function ApplyPreset(name: string) {
    let preset = presets.find((item) => item.name === name);
    if (!preset) return;

    pattern = preset.pattern;
    onapply();
  }

  function StartNamingPreset() {
    preset_name = sel_preset;
    naming_preset = true;
  }

  function SavePreset() {
    let name = preset_name.trim();
    if (name === "") return;

    let ok = RunPresetOp(() =>
      LocalSettings.UpsertSavePatternPreset({ name, pattern }),
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
</script>

<div class="presets_root">
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
        ? "Overwrite Preset"
        : "Save Preset"}
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
      title={sel_preset === "" ? "Select Preset" : null}
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
{#if preset_error}
  <div class="preset_error">{preset_error}</div>
{/if}
</div>

<style>
  .presets_root {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
  }

  .presets {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .preset_error {
    color: var(--color-text-sec);
  }
</style>
