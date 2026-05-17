<script lang="ts">
  import { l } from "./States.svelte.ts";

  //Used to check the license from AeScripts
  //Does nothing on this branch

let {proceed = $bindable(true)} = $props();
  let show = $state(true);

  export function ShouldProceed() {

  }
</script>

