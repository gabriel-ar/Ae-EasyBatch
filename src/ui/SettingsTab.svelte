<script lang="ts">
  import { getContext } from "svelte";
  import Logger from "../lib/Logger.ts";
  import { l } from "./States.svelte.ts";
  import { Settings, Template } from "../lib/Settings.svelte.ts";
  import Dropdown from "./Dropdown.svelte";
  import type CSAdapter from "../lib/CSAdapter.ts";

  let {
    setts = $bindable<Settings>(),
    csa = $bindable<CSAdapter>(),
    SaveSettings,
  }: {
    setts: Settings;
    csa: CSAdapter;
    SaveSettings?: (bool) => void;
  } = $props();

  function SaveJSON() {
    let content = JSON.stringify(setts);
    l.debug("[SettingsTab] SaveJSON called");

    csa.Eval("ExportFile", content).then((result) => {
      if (result == "null") return;
    });
  }

  function LoadJSON() {
    l.debug("[SettingsTab] LoadJSON called");
    csa.Eval("ImportFile").then((result) => {
      if (result === "null") return;

      let decoded = decodeURIComponent(result);

      let json_setts = JSON.parse(decoded);

      setts.FromJson(json_setts);
      setts.id = setts.MakeId();
      if (SaveSettings !== undefined) SaveSettings(true);
      setts = setts;
    });
  }

  function ResetSettings() {
    setts = new Settings();
    setts.sel_tmpl = 0;
    setts = setts;
    l.debug("[SettingsTab] ResetSettings called");
    SaveSettings(true);
    setTimeout(() => window.location.reload(), 1000);
  }
</script>

<main class="settings">
  <h4>Global Settings</h4>

  <div class="setting">
    <label for="in_imported_folder">Template Comps Render Folder Name</label>
    <input
      id="in_gen_folder"
      type="text"
      bind:value={setts.render_comps_folder} />
  </div>

  <div class="setting">
    <label for="in_imported_folder">
      Automatically preview when changing values
      <input type="checkbox" bind:checked={setts.auto_preview} />
    </label>
  </div>

  <h4>Template Settings ({setts.tmpls[setts.sel_tmpl].name})</h4>
  <div class="setting">
    <label for="in_imported_folder">Imported Footage Folder</label>
    <input
      id="in_gen_folder"
      type="text"
      bind:value={setts.tmpls[setts.sel_tmpl].imported_footage_folder} />
  </div>

  <h4>Logging</h4>
  <div class="row">
    <label for="in_imported_folder">Log Level</label>

    <Dropdown
      style_list="text-transform: capitalize;"
      labels={Object.entries(Logger.Levels).map(
        ([key, val]) =>
          val + " - " + (key === "Warn" ? key + " (Default)" : key),
      )}
      options={Object.entries(Logger.Levels).map(([key, val]) => val)}
      bind:value={setts.log_level} />
  </div>
  <div class="setting">
    <label for="in_imported_folder"
      >Logging Path
      <br /><span class="sett_label_note">{l.log_path}</span>
    </label>
    <div class="row">
      <button onclick={() => l.OpenLogFolder()}>Open Logs Folder</button>
    </div>
  </div>

  <h4>Utilities</h4>
  <div class="row">
    <button onclick={LoadJSON}>Load Config as JSON</button>
    <button onclick={SaveJSON}>Save Config as JSON</button>
    <button onclick={ResetSettings}>Reset Settings</button>
  </div>
</main>

<style>
  h4 {
    margin: 15px 0 10px 0;
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
</style>
