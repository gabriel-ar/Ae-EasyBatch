<script>
    import CSAdapter from "../lib/CSAdapter.ts";
    import { getContext, onMount } from "svelte";
    import Logger from "../lib/Logger.ts";

    const l =
        getContext("logger") ||
        new Logger(Logger.Levels.Warn, "ModalAlternateSrcV2");

    let {
        show = $bindable(false),
        tmpl,
        col_i,
        onclose = $bindable(() => {}),
    } = $props();

    let sel_add_field = $state("base_path");
    let preview = $state("");

    let pattern = $state();
    let base_path = $state();

    onMount(() => {
        pattern = tmpl.columns[col_i].alt_src_pattern;
        base_path = tmpl.columns[col_i].alt_src_base;
    });

    function AddField() {
        /**@type {HTMLTextAreaElement}*/
        let save_pattern_ta = document.querySelector("#alt_src_pattern_ta");

        let cursor_pos = save_pattern_ta.selectionStart;
        let old_val = pattern;

        //Insert the selected field at the cursor position
        pattern =
            old_val.slice(0, cursor_pos) +
            `{${sel_add_field}}` +
            old_val.slice(cursor_pos);

        tmpl = tmpl;
        l.debug("AddField called with pattern:", pattern);
    }

    /**
     * Selects a folder to save the files to and adds it to the save pattern
     */
    function SelectBasePath() {
        let csa = new CSAdapter();

        csa.OpenFolderDialog(base_path).then((result) => {
            if (result === null) return;

            base_path = result;
        });
    }

    $effect(() => {
        UpdatePreview(pattern, base_path);
        //l.debug('Effect triggered: UpdatePreview');
    });

    function UpdatePreview(dummy, dummy2) {
        let col = tmpl.columns[col_i];

        col.alt_src_pattern = pattern;
        col.alt_src_base = base_path;

        preview = col.ResolveAltSrcPath(0, tmpl.columns);
        l.debug(
            "UpdatePreview called with pattern:",
            pattern,
            "and base_path:",
            base_path,
        );
    }

    function CloseDialog() {
        show = false;
        onclose(base_path, pattern);
    }
</script>

{#if show}

<div class="modal" id="alternate_modal" style:display={"block"}>
    <div class="wrapper">
        <h4>File Path Pattern</h4>
        <textarea
            id="alt_src_pattern_ta"
            spellcheck="false"
            bind:value={pattern}
        ></textarea>

        <div>
            <button onclick={SelectBasePath}>Pick Base Path</button>

            <select style="margin-left: 15px;" bind:value={sel_add_field}>
                <option value="base_path">Base Path</option>
                <option value="row_number">Row Number</option>
                <option value="increment:0000">Increment</option>
                {#each tmpl.columns as col}
                    <option value={col.cont_name}>{col.cont_name}</option>
                {/each}
            </select>

            <button onclick={AddField}>Add Field</button>
        </div>



        <div class="out_prev_cont">
            <span>Preview:</span>
            <span class="out_prev">{preview}</span>
        </div>
        <button onclick={CloseDialog}>Close</button>
    </div>
</div>

<style>
    .out_prev {
        word-break: break-all;
    }
</style>

{/if}