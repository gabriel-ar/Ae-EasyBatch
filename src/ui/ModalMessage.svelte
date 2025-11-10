<script lang="ts">
    import Logger from "../lib/Logger.ts";

    const l = new Logger(Logger.Levels.Warn, "ModalFilePattern");

    let show = $state(false);

    let msg= $state("");
    let i_title= $state("");

    export function Open(message: string, title: string = "Message") {
        show = true;
        msg = message;
        i_title = title;

        l.debug(`Opened modal with title: ${title} and message: ${message}`);
    }

    export function CloseDialog() {
        show = false;
    }


</script>

{#if show}
    <div class="modal">
        <div class="wrapper">
            <h3>{i_title}</h3>
            <div>{@html msg}</div>
            <button onclick={CloseDialog}>Close</button>
        </div>
    </div>
{/if}
