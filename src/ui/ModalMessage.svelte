<script lang="ts">
  import { l } from "./States.svelte.ts";

  let show = $state(false);

  let msg = $state("");
  let i_title = $state("");
  let i_actions = $state<{ label: string; callback?: () => void }[]>([]);

  export function Open(message: string, title: string = "Message", actions: { label: string; callback?: () => void }[] = []) {
    show = true;
    msg = message;
    i_title = title;

    if (actions.length === 0) {
      i_actions = [{ label: "Close"}];
    } else {
    i_actions = actions;
    }

    l.debug(
      `[ModalMsg] Opened modal with title: ${title} and message: ${message}`,
    );
  }

  export function CloseDialog(callback?: () => void) {
    show = false;
    console.debug(`[ModalMsg] Closed modal with title: ${i_title} and callback: ${callback ? "Yes" : "No"}`);
    if (callback) callback();
  }
</script>

{#if show}
  <div class="modal">
    <div class="wrapper" style="gap: 1em;">
      <h3>{i_title}</h3>
      <div>{@html msg}</div>

      <div style="display: flex; gap: 0.5em; justify-content: flex-end; margin-top: 1em;">
      {#each i_actions as action}
        <button onclick={() => CloseDialog(action.callback)}>{action.label}</button>
      {/each}
      </div>
    </div>
  </div>
{/if}
