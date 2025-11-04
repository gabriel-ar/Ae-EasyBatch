<script lang="ts">
    import Logger from "./Logger.ts";

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
    <div id="file_pattern_modal">
        <div class="wrapper">
            <h3>{i_title}</h3>
            <div>{@html msg}</div>
            <button onclick={CloseDialog}>Close</button>
        </div>
    </div>

    <style>
        #file_pattern_modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.8);
            z-index: 1000;

            display: flex;
            width: 100%;
            justify-content: center;
            align-items: center;
        }

        .wrapper {
            display: flex;
            flex-direction: column;

            min-width: 80%;
            margin: 20px;
            padding: 10px;

            gap: 1rem;

            background-color: var(--color-base);
            border: 1px solid var(--color-border-p1);

            border-radius: var(--radius-form);
        }

        .out_prev {
            word-break: break-all;
        }
    </style>
{/if}
