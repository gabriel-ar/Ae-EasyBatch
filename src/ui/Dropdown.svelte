<script lang="ts">
  import { ChevronDown } from "radix-icons-svelte";
  import { l } from "./States.svelte.ts";
  import { getContext } from "svelte";

  let {
    value = $bindable(),
    options,
    labels,
    title = null,
    variant = "",
    style = "",
    style_list = "",
    search_enabled = false,
    onselect = (option, index) => {},
  } = $props();

  let sel_label = $state();
  let search_term = $state("");
  let show_options = $state(options);
  let show_labels = $state(labels);

  function Selected(e, option, index) {
    e.target.blur();
    e.target.parentElement.blur();
    e.preventDefault();
    value = option;
    l.debug(
      "[Dropdown] Selected called with option:",
      option,
      "and index:",
      index,
    );

    //reset search
    show_options = options;
    show_labels = labels !== undefined ? labels : options;
    search_term = "";

    onselect(option, index);
  }

  function OnSearchInput(e) {
    if (search_term.length === 0) {
      show_options = options;
      show_labels = labels !== undefined ? labels : options;
      return;
    } else {
      show_options = [];
      show_labels = [];

      for (let i = 0; i < options.length; i++) {
        let opt =
          typeof options[i] === "string" ? options[i] : options[i].toString();
        let lab = labels !== undefined ? labels[i] : opt;
        if (
          lab.toLowerCase().includes(search_term) ||
          opt.toLowerCase().includes(search_term)
        ) {
          show_options.push(options[i]);
          show_labels.push(lab);
        }
      }
    }
  }

  $effect(() => {
    if (title !== null) {
      sel_label = title;
    } else if (labels !== undefined) {
      sel_label = labels[options.indexOf(value)];
    } else {
      sel_label = value;
      labels = options;
    }
  });
</script>

<div
  class={["dropdown", variant, search_enabled ? "search-enabled" : ""]}
  {style}>
  <input
    class="dropsearch"
    type="text"
    placeholder="Search..."
    bind:value={search_term}
    oninput={OnSearchInput} />
  <button class="dropbtn"
    >{@html sel_label}<ChevronDown
      style="vertical-align:middle; margin-left: 5px;" />
  </button>

  <div class="dropdown-content" style={style_list}>
    {#if show_options.length === 0}
      <p>No options available</p>
    {/if}
    {#each show_options as option, opt_i}
      <button onclick={(e) => Selected(e, option, opt_i)}
        >{@html show_labels[opt_i]}</button>
    {/each}
  </div>
</div>

<style>
  .dropdown {
    position: relative;
    display: inline-block;
  }

  .dropdown-content {
    position: absolute;
    margin-top: 5px;

    display: none;
    width: max-content;

    flex-direction: column;
    align-items: stretch;
    text-align: left;

    background-color: var(--color-solid-m1);

    border: 1px solid var(--color-border-p1);
    border-radius: var(--radius-form);

    z-index: 1000;
  }

  .dropdown-content button {
    color: var(--color-text);

    padding: var(--padding-form);

    text-decoration: none;
    text-align: left;
    justify-content: flex-start;

    border: none;
    background: none;
  }

  .dropdown-content button:hover {
    background-color: var(--color-p1);
  }

  :not(.disabled).dropdown:focus-within .dropdown-content {
    display: flex;
  }

  :global(.dropdown-content button svg) {
    vertical-align: middle;
  }

  .discrete .dropbtn {
    background-color: transparent;
    border: 1px solid transparent;
  }

  .discrete .dropbtn:hover {
    border: 1px solid var(--color-border-p1);
    background-color: var(--color-solid-m2);
  }

  .disabled .dropbtn {
    color: var(--color-text-disabled);
  }

  .search-enabled.dropdown:focus-within .dropbtn {
    opacity: 0;
    position: absolute;
  }

  .search-enabled.dropdown:focus-within .dropsearch {
    display: flex !important;
  }

  .dropsearch {
    display: none;
  }
</style>
