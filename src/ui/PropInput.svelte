<script>
  import { getContext } from "svelte";
  import { Column } from "../lib/Settings.ts";
  import { l } from "./States.svelte.ts";
  import EyeDropper from "../assets/EyeDropper.svelte";
  import CSAdapter from "../lib/CSAdapter.ts";
  import { File } from "radix-icons-svelte";

  /** @type {{ value: any, type:any, onchange?: function(value):void, inline?: boolean}}*/
  let { value = $bindable(), type, onchange, inline = true } = $props();

  let is_color_update = false;

  let src_alt_val = $state();

  //ALTERNATE SOURCE PREVIEW

  /**
   * Updates the src alternate display
   */
  $effect(() => {
    if (type === Column.PropertyValueType.SRC_ALTERNATE) {
      if (value.length > 45) {
        src_alt_val = "..." + value.substr(value.length - 45, value.length);
      } else {
        src_alt_val = value;
      }
      //l.debug('SRC_ALTERNATE effect triggered with value:', value);
    }
  });

  //COLOR INPUT FUNCTIONS

  /** @type {string}*/
  let hex_color = $state();

  /**
   * When the value of a color is changed, transform it to a hex value
   *  to display it in color input picker
   */
  $effect(() => {
    if (type === Column.PropertyValueType.COLOR) {
      UpdateColorHex(value);
      //l.debug('COLOR effect triggered with value:', value);
    }
  });
  /**
   * Transforms the rgba value used by After Effects, to hex for CSS
   */
  function UpdateColorHex(value) {
    try {
      if (is_color_update) {
        is_color_update = false;
        return;
      }

      let r = Math.round(value[0] * 255);
      let g = Math.round(value[1] * 255);
      let b = Math.round(value[2] * 255);

      hex_color = ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
      //l.debug('[PropInput] UpdateColorHex called with value:', value);
    } catch (e) {
      l.error("[PropInput]", e);
    }
  }

  /**
   * If the user changes the color value using the hex string input, transform it to rgba
   */
  function UpdateColor4D(input) {
    let hex = input.target.value;
    try {
      let r = parseInt(hex.slice(0, 2), 16) / 255;
      let g = parseInt(hex.slice(2, 4), 16) / 255;
      let b = parseInt(hex.slice(4, 6), 16) / 255;

      value = [r, g, b];
      hex_color = hex;

      DebounceChange();
      l.debug(
        "[PropInput] UpdateColor4D called with input:",
        input.target.value,
      );
    } catch (e) {
      l.error("[PropInput]", e);
    }
  }

  function PromptColor() {
    //To send the current color to the color picker convert it to integer 10
    let r = Math.round(value[0] * 255);
    let g = Math.round(value[1] * 255);
    let b = Math.round(value[2] * 255);
    let a = 100;

    let color_int =
      ((a & 0xff) << 24) | ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);

    // @ts-ignore
    __adobe_cep__.evalScript(`$.colorPicker(${color_int})`, (color) => {
      if(color === "-1") return; //User cancelled color picker

      let color_int = parseInt(color, 10);
      let hex = color_int.toString(16).padStart(6, "0");

      let r = parseInt(hex.slice(0, 2), 16) / 255;
      let g = parseInt(hex.slice(2, 4), 16) / 255;
      let b = parseInt(hex.slice(4, 6), 16) / 255;

      is_color_update = true;
      value = [r, g, b];
      hex_color = hex;
      DebounceChange();
    });
    l.debug("[PropInput] PromptColor called");
  }

  /**
   * Adds a null layer to the preview composition, with a color effect applied
   * Then triggers the edit value menu command
   */
  function DropperPicker() {
    let current_col = JSON.stringify([value[0], value[1], value[2]]);

    let csa = new CSAdapter();
    csa.EvalDirect(`PickColorFromPreview(${current_col})`, (result) => {
      try {
        result = JSON.parse(result);
      } catch (e) {
        l.error("[PropInput]", e);
        return;
      }

      value = result;
    });
  }

  //ON CHANGE CALLBACK

  let change_timeout;
  function DebounceChange() {
    //l.log("Debouncing", value);

    if (change_timeout !== undefined) {
      clearTimeout(change_timeout);
    }

    change_timeout = setTimeout(CallChange, 700);
    //l.debug('DebounceChange called with value:', value);
  }

  function CallChange() {
    if (onchange !== undefined) onchange(value);
    //l.debug('CallChange called with value:', value);
  }

  function PickFile() {
    //l.debug('PickFile called');
    let csa = new CSAdapter();

    let current_file = value.replace(/<b>|<\/b>/g, "") || "";

    csa
      .OpenFileDialog(current_file)
      .then((file) => {
        if (file !== undefined && file !== null) {
          value = `<b>${file}</b>`;
          DebounceChange();
        } else if (file === null) {
          l.debug("[PropInput] File selection cancelled by user");
          value = current_file;
        }
      })
      .catch((err) => {
        l.error("[PropInput] Error picking file:", err);
      });
  }

  //NUMERIC SLIDER FUNCTIONS

  let mouse_start_x;
  let drag_start_val;
  let drag_index = 0;

  function DragPropMD(event, index = -1) {
    //l.log("Drag Start", event);

    event.preventDefault();

    mouse_start_x = event.clientX;

    if (index !== -1) {
      drag_start_val = value[index];
    } else {
      drag_start_val = value;
    }

    drag_index = index;

    window.addEventListener("mouseup", DragPropMU);
    window.addEventListener("mousemove", Dragging);
    //l.debug('DragPropMD called with event:', event, 'and index:', index);
  }

  function DragPropMU(event) {
    //l.log("Drag End", event);

    window.removeEventListener("mouseup", DragPropMU);
    window.removeEventListener("mousemove", Dragging);

    DebounceChange();
    //l.debug('DragPropMU called with event:', event);
  }

  function Dragging(event) {
    //Calculate the distance moved
    let distance = event.clientX - mouse_start_x;

    //calculate the new value
    let new_value = drag_start_val + distance;

    if (drag_index !== -1) {
      value[drag_index] = new_value;
    } else {
      value = new_value;
    }
    //l.debug('Dragging called with event:', event);
  }
</script>

{#if type === Column.PropertyValueType.TEXT_DOCUMENT}
  {@render text_input()}
{:else if type === Column.PropertyValueType.OneD}
  {@render slider("X")}
  {@render number_input()}
{:else if type === Column.PropertyValueType.TwoD || type === Column.PropertyValueType.TwoD_SPATIAL}
  {@render slider("X", 0)}
  {@render array_input(0)}

  {@render slider("Y", 1)}
  {@render array_input(1)}
{:else if type === Column.PropertyValueType.ThreeD || type === Column.PropertyValueType.ThreeD_SPATIAL}
  {@render slider("X", 0)}
  {@render array_input(0)}

  {@render slider("Y", 1)}
  {@render array_input(1)}

  {@render slider("Z", 2)}
  {@render array_input(2)}
{:else if type === Column.PropertyValueType.COLOR}
  <button
    class="color_show"
    style="background-color: #{hex_color};"
    onclick={PromptColor}
    aria-label="Select Color"></button>
  <button style="width: 22px; vertical-align: top;" data-variant="discrete" onclick={DropperPicker}>
    <EyeDropper />
  </button>
  <div>
    #<input
      value={hex_color}
      style="width: 60px;"
      onchange={(e) => UpdateColor4D(e)} />
  </div>
{:else if type === Column.PropertyValueType.SRC_ALTERNATE}
  <div style="display: inline;">
    {@html src_alt_val}
    <button
      class="pick_file"
      style="width: 22px;"
      data-variant="discrete"
      data-tooltip="Override Pattern"
      onclick={PickFile}>
      <File />
    </button>
  </div>
{/if}

{#snippet array_input(index)}
  <!-- svelte-ignore binding_property_non_reactive -->
  <input
    class:inline_input={inline}
    type="number"
    bind:value={value[index]}
    onkeyup={DebounceChange}
    onchange={DebounceChange} /><wbr />
{/snippet}

{#snippet number_input()}
  <input
    class:inline_input={inline}
    type="number"
    bind:value
    onkeyup={DebounceChange}
    onchange={DebounceChange} />
{/snippet}

{#snippet text_input()}
  <textarea
    class:inline_input={inline}
    rows={inline ? 1 : 2}
    cols="15"
    bind:value
    onkeyup={DebounceChange}
    onchange={DebounceChange}></textarea>
{/snippet}

{#snippet slider(axis, index = -1)}
  <button onmousedown={(e) => DragPropMD(e, index)} class="drag_btn"
    >{axis}</button>
{/snippet}

<style>
  input,
  textarea {
    background-color: transparent;
  }

  input:hover,
  textarea:hover {
    background-color: rgba(255, 255, 255, 0.05);
  }

  input:focus,
  textarea:focus {
    border: solid 1px var(--color-highlight);
    background-color: rgba(255, 255, 255, 0.1);
  }

  input[type="number"] {
    width: 50px;
  }

  textarea {
    width: -webkit-fill-available;
  }

  .inline_input {
    background-color: transparent;
    border: 1px solid transparent;

    min-width: 50px;
    margin-left: 2px;

    appearance: none;
  }

  .color_show {
    width: 50px;
    height: 20px;
  }

  .drag_btn {
    cursor: ew-resize;

    display: contents;
    background: none;
    border: none;
  }

  :global(td:hover .pick_file) {
    visibility: visible;
  }
</style>
