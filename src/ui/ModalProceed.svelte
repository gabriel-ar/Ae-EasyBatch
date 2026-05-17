<script lang="ts">
  import { l } from "./States.svelte.ts";
  import AESP from "aescripts-cep-license";

  let { proceed = $bindable(true) } = $props();

  const aesp = new AESP(
    {
      productVersion: _VERSION_,
      aboutText: "EasyBatch for After Effects. Make versions of your templates without duplicating comps, batch render them with one click! Keep your project light and your renders organized.",
    },
    LicenseCallbacks,
  );

  function LicenseCallbacks(
    is_valid: boolean,
    is_trial: boolean,
    license_type: string,
  ) {
    console.log("[Proceed] License valid:", is_valid);

    proceed = is_valid;

  if(!is_valid || is_trial) {

      //edit the app element to allow for the banner to show properly
      const app : HTMLDivElement | null = document.querySelector("#app");
      if (app) {
        app.style.height = "calc(100vh - 20px)";
      }
    }else{
      //edit the app element to allow for the banner to show properly
      const app : HTMLDivElement | null = document.querySelector("#app");
      if (app) {
        app.style.height = "100vh";
      }
    }
  }

 export function OpenLicense() {
    aesp.openDialogOnPage('license');
  }

  export function OpenBug() {
    aesp.openDialogOnPage('support', 'bug-report' );
  }
</script>