<script lang="ts">
  import {
    EyeOpen,
    Crosshair2,
    Camera,
    Trash,
    ActivityLog,
  } from "radix-icons-svelte";
  import AddAfter from "../assets/AddAfter.svelte";
  import AddBefore from "../assets/AddBefore.svelte";

  let { onselect = (option, index) => {} } = $props();

  let open = $state(false);
  let elm_menu: HTMLDivElement = $state();
  let x = $state(0);
  let y = $state(0);

  export function Open(
    pos_x,
    pos_y,
    option_callback: (option: string) => void,
  ) {
    onselect = option_callback;
    open = true;

    x = pos_x;
    y = pos_y;
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
      <button
        class="c_item"
        onclick={() => Selected("add_after")}
        data-tooltip="Add a row after this one"
        ><AddAfter />Add After
        <span class="c_shortcut">N</span></button>
      <button
        class="c_item"
        onclick={() => Selected("add_before")}
        data-tooltip="Add a row before this one"
        ><AddBefore />Add Before
        <span class="c_shortcut">Shift + N</span></button>
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
        <span class="c_shortcut">P</span></button>
      <button
        class="c_item"
        onclick={() => Selected("copy")}
        data-tooltip="Copy data from properties panel"
        ><Crosshair2 />Copy from Preview<span class="c_shortcut">D</span
        ></button>
      <button
        class="c_item"
        onclick={() => Selected("render")}
        data-tooltip="Render this row"
        ><Camera />Render<span class="c_shortcut">R</span></button>

      <button
        class="c_item"
        onclick={() => Selected("detail")}
        data-tooltip="Open this row in detail view"
        ><ActivityLog />View in detail<span class="c_shortcut">Shift + D</span
        ></button>
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
