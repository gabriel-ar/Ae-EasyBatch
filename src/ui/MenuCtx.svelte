<script lang="ts">
  import {
    EyeOpen,
    Crosshair2,
    Camera,
    Trash,
    ActivityLog,
    Table,
    Enter,
    Exit,
    Columns,
  } from "radix-icons-svelte";
  import AddAfter from "../assets/AddAfter.svelte";
  import AddBefore from "../assets/AddBefore.svelte";

  let { onselect = (option, index) => {} } = $props();

  let open = $state(false);
  let elm_menu: HTMLDivElement = $state();
  let x = $state(0);
  let y = $state(0);
  let mode: string = $state("");

  export function Open(
    pos_x,
    pos_y,
    option_callback: (option: string) => void,
    show_mode: string = "row",
  ) {
    onselect = option_callback;
    open = true;

    x = pos_x;
    y = pos_y;
    mode = show_mode;
  }

  export function Close() {
    open = false;
  }
  function Selected(option: string) {
    console.debug("Selected option:", option);
    if (onselect !== undefined && typeof onselect === "function")
      onselect(option);
    Close();
  }
</script>

{#if open}
  <div
    class="c_menu_bg"
    onclick={() => Close()}
    onkeydown={(e) => e.key === "Escape" && Close()}
    role="button"
    tabindex="0">
    <div class="c_menu" bind:this={elm_menu} style="left: {x}px; top: {y}px;">
      {#if mode === "row"}
        <button
          class="c_item"
          onclick={() => Selected("add_after")}
          data-tooltip="Add a row after this one"
          ><AddAfter />Add After
          <span class="c_shortcut">Ctrl + N</span></button>
        <button
          class="c_item"
          onclick={() => Selected("add_before")}
          data-tooltip="Add a row before this one"
          ><AddBefore />Add Before
          <span class="c_shortcut">Ctrl + Shift + N</span></button>
        <button
          class="c_item"
          onclick={() => Selected("delete")}
          data-tooltip="Delete this row"
          ><Trash />Delete<span class="c_shortcut">Delete</span></button>
        <div class="c_divider"></div>
        <button
          class="c_item"
          onclick={() => Selected("preview")}
          data-tooltip="Preview this row"
          ><EyeOpen />Preview
          <span class="c_shortcut">Ctrl + P</span></button>
        <button
          class="c_item"
          onclick={() => Selected("copy")}
          data-tooltip="Copy data from properties panel"
          ><Crosshair2 />Copy Data<span class="c_shortcut">Ctrl + D</span
          ></button>
        <button
          class="c_item"
          onclick={() => Selected("render")}
          data-tooltip="Render this row"
          ><Camera />Render<span class="c_shortcut">Ctrl + R</span></button>

        <button
          class="c_item"
          onclick={() => Selected("view_detail")}
          data-tooltip="Open this row in detail view"
          ><ActivityLog />View in detail<span class="c_shortcut">Shift + D</span
          ></button>
      {:else if mode === "file"}
        <button
          class="c_item"
          onclick={() => Selected("import_csv")}
          data-tooltip="Import data from CSV file"
          ><Enter />Import CSV Data<span class="c_shortcut"></span></button>
        <button
          class="c_item"
          onclick={() => Selected("export_csv")}
          data-tooltip="Export data to CSV file"
          ><Exit />Export CSV Data<span class="c_shortcut"></span></button>
      {:else if mode === "view"}
        <button
          class="c_item"
          onclick={() => Selected("view_table")}
          data-tooltip="Show data as table"
          ><Table />Show Table<span class="c_shortcut">Shift + T</span></button>
        <button
          class="c_item"
          onclick={() => Selected("view_detail")}
          data-tooltip="Export data to CSV file"
          ><ActivityLog />Show Detail<span class="c_shortcut">Shift + D</span
          ></button>
        <div class="c_divider"></div>
                  <button
          class="c_item"
          onclick={() => Selected("edit_view")}
          data-tooltip="Edits the properties visible in the table and detail views"
          data-tt-pos="middle-right"
          ><Columns />Edit View...<span class="c_shortcut"
            ></span
          ></button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .c_menu {
    position: fixed;
    display: flex;
    flex-direction: column;

    background-color: var(--color-solid-m2);

    font-size: 14px;

    border: 1px solid var(--color-border-p1);
    border-radius: var(--radius-form);

    padding: 0;
    margin: 0;
    box-shadow: 0 1px 10px rgba(0, 0, 0, 0.2);
  }

  .c_menu_bg {
    background: transparent;

    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
  }

  .c_item {
    all: unset;
    padding: 2px 8px;
    cursor: pointer;
    border-radius: var(--radius-form);
  }

  .c_item:hover {
    background-color: var(--color-p1);
    outline: none;
  }

  .c_item:focus {
    background-color: var(--color-p1);
    outline: none;
  }

  .c_shortcut {
    float: right;
    color: var(--color-text-disabled);
    margin-left: 16px;
  }

  .c_divider {
    border-bottom: solid 1px var(--color-border-p1);
    margin: 2px 6px;
  }

  :global(.c_item svg) {
    width: 14px;
    height: 14px;
    margin-right: 8px;
    vertical-align: middle;
  }
</style>
