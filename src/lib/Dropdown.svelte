<script>
  import { ChevronDown } from "radix-icons-svelte";
  import Logger from './Logger.mjs';
  import { getContext } from "svelte";

  const l = getContext("logger") || new Logger('warn', null, 'Dropdown');
  let { value = $bindable(), options, labels, variant = "" } = $props();

  let sel_label = $state();

  function Selected(e, option, index) {
    e.preventDefault();
    e.target.blur();
    value = option;
    l.debug('Selected called with option:', option, 'and index:', index);
  }

  $effect(() => {
    if (labels !== undefined) {
      sel_label = labels[options.indexOf(value)];
    } else {
      sel_label = value;
      labels = options;
    }
    //l.debug('Effect triggered with value:', value, 'and labels:', labels);
  });
</script>

<div class={["dropdown", variant]}>
  <button class="dropbtn">{sel_label}<ChevronDown 
    style="vertical-align:middle; margin-left: 5px;" />
</button>
  <div class="dropdown-content">
    {#each options as option, opt_i}
      <button onclick={(e) => Selected(e, option, opt_i)}>{labels[opt_i]}</button>
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

    border: none;
    background: none;
  }

  .dropdown-content button:hover {
    background-color: var(--color-p1);
  }

  .dropdown:focus-within .dropdown-content {
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
</style>
