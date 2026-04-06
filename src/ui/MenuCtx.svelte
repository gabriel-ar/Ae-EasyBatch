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
    ArrowUp,
    ArrowDown,
    FileText,
    GithubLogo,
    Face,
  } from "radix-icons-svelte";
  import AddAfter from "../assets/AddAfter.svelte";
  import AddBefore from "../assets/AddBefore.svelte";

  let { onselect = (option, index) => {} } = $props();

  let open = $state(false);
  let positioned = $state(false);
  let elm_menu: HTMLDivElement = $state();
  let x = $state(0);
  let y = $state(0);
  let mode: string = $state("");

  let req_pos = { x: 0, y: 0 };

  export function Open(
    pos_x,
    pos_y,
    option_callback: (option: string) => void,
    show_mode: string = "row",
  ) {
    onselect = option_callback;
    open = true;
    positioned = false;

    req_pos.x = pos_x;
    req_pos.y = pos_y;
    mode = show_mode;
  }

  export function Close() {
    open = false;
    positioned = false;
    x = 0;
    y = 0;
  }

  // Position the menu after it has been rendered to ensure we have the correct dimensions
  $effect(() => {
    if (open && elm_menu) {
      requestAnimationFrame(() => {
        const rect = elm_menu.getBoundingClientRect();
        if (req_pos.x + rect.width > window.innerWidth) {
          x = req_pos.x - (req_pos.x + rect.width - window.innerWidth + 10); // 10px padding from edge
        }else{
          x = req_pos.x;
        }

        if (req_pos.y + rect.height > window.innerHeight) {
          y = req_pos.y - (req_pos.y + rect.height - window.innerHeight + 10); // 10px padding from edge
        }else{
          y = req_pos.y;
        }
        positioned = true;
      });
    }
  });

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
    <div class="c_menu" bind:this={elm_menu} style="left: {x}px; top: {y}px; opacity: {positioned ? 1 : 0};">
      {#if mode === "row"}
        <button
          class="c_item"
          onclick={() => Selected("add_after")}
          data-tooltip="Add a row after this one"
          ><AddAfter />Add Row After
          <span class="c_shortcut">N</span></button>
        <button
          class="c_item"
          onclick={() => Selected("add_before")}
          data-tooltip="Add a row before this one"
          ><AddBefore />Add Row Before
          <span class="c_shortcut">Shift + N</span></button>
        <button
          class="c_item"
          onclick={() => Selected("delete")}
          data-tooltip="Deletes this row"
          ><Trash />Delete<span class="c_shortcut">Delete</span></button>
        <div class="c_divider"></div>
        <button
          class="c_item"
          onclick={() => Selected("preview")}
          data-tooltip="Previews this row"
          ><EyeOpen />Preview
          <span class="c_shortcut">P</span></button>
        <button
          class="c_item"
          onclick={() => Selected("copy_from_preview")}
          data-tooltip="Copies data from properties panel"
          ><Crosshair2 />Copy from Preview<span class="c_shortcut">S</span
          ></button>
        <button
          class="c_item"
          onclick={() => Selected("render_row")}
          data-tooltip="Renders this row"
          ><Camera />Render Row<span class="c_shortcut">R</span></button>
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
          ><Table />Show as Table<span class="c_shortcut">T</span></button>
        <button
          class="c_item"
          onclick={() => Selected("view_detail")}
          data-tooltip="Shows data in detail view"
          ><ActivityLog />Show in Detail<span class="c_shortcut">D</span
          ></button>
        <div class="c_divider"></div>
        <button
          class="c_item"
          onclick={() => Selected("previous_row")}
          data-tooltip="Move to the previous row in the table"
          ><ArrowUp />Previous Row<span class="c_shortcut">Opt + ↑</span
          ></button>
        <button
          class="c_item"
          onclick={() => Selected("next_row")}
          data-tooltip="Move to the next row in the table"
          ><ArrowDown />Next Row<span class="c_shortcut">Opt + ↓</span></button>
        <div class="c_divider"></div>
        <button
          class="c_item"
          onclick={() => Selected("edit_view")}
          data-tooltip="Edits the properties visible in the table and detail views"
          data-tt-pos="middle-right"
          ><Columns />Edit View...<span class="c_shortcut"></span></button>
      {:else if mode === "help"}
        <button
          class="c_item"
          onclick={() => Selected("open_help")}
          data-tooltip="Open the documentation in your browser"
          ><FileText />Open Documentation</button>
        <button
          class="c_item"
          onclick={() => Selected("report_issue")}
          data-tooltip="Report an issue on GitHub"
          ><GithubLogo />Report Issue</button>
        <div class="c_divider"></div>
        <button
          class="c_item"
          onclick={() => Selected("surprise")}
          data-tooltip="IDK, just click it"
          ><Face />Surprise</button>
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
