<script lang="ts">
    import { Column, Template, type DepCompSetts } from "./Settings.ts";
    import CSAdapter from "./CSAdapter.ts";
    import { getContext, onMount } from "svelte";
    import Logger from "./Logger.ts";
     import Dropdown from "./Dropdown.svelte";

    type OnCloseFunc = (base_path: string, pattern: string) => void;

    const l = new Logger(Logger.Levels.Warn, "ModalFilePattern");

    let show: boolean;
    let pick_base: boolean;
    let sel_add_field: string = "base_path";

    let tmpl: Template;
    let dc_id: string;

    let onclose: OnCloseFunc;

    export function Open(
        template: Template,
        dep_comp_id: string,
        on_close_callback: OnCloseFunc,
        pick_base: boolean = false,
    ) {
        l.debug("Open called with template:", template);

        if (template === undefined) {
            l.error("Template is undefined");
            return;
        }

        tmpl = template;
        dc_id = dep_comp_id;
        pick_base = pick_base;

        onclose = on_close_callback;
        show = true;
    }

    function AddField() {
        /**@type {HTMLTextAreaElement}*/
        let save_pattern_ta: HTMLTextAreaElement =
            document.querySelector("#file_pattern_ta");

        let cursor_pos = save_pattern_ta.selectionStart;
        let old_val = tmpl.dep_config[dc_id].save_pattern;

        //Insert the selected field at the cursor position
        tmpl.dep_config[dc_id].save_pattern =
            old_val.slice(0, cursor_pos) +
            `{${sel_add_field}}` +
            old_val.slice(cursor_pos);

        tmpl = tmpl;
        l.debug(
            "AddField called with pattern:",
            tmpl.dep_config[dc_id].save_pattern,
        );
    }

    let update_preview_timeout: number;
    function DebounceUpdatePreview() {
        if (update_preview_timeout) clearTimeout(update_preview_timeout);

        update_preview_timeout = setTimeout(UpdatePreview, 800);
    }

    function UpdatePreview() {
        tmpl.ResolveSavePathFirstDeps(0);
            tmpl.dep_config = tmpl.dep_config;
    }

    /**
     * Selects a folder to save the files to and adds it to the save pattern
     */
    function SelectBasePath() {
        let csa = new CSAdapter();

        csa.OpenFolderDialog(tmpl.base_path).then((result) => {
            if (result === null) return;

            tmpl.base_path = result;
        });
    }

    export function CloseDialog() {
        show = false;
        onclose(tmpl.base_path, tmpl.dep_config[dc_id].save_pattern);
    }


</script>

{#if show && tmpl !== undefined}
    <div id="file_pattern_modal">
        <div class="wrapper">
            <h4>File Path Pattern</h4>
            <textarea
                id="file_pattern_ta"
                spellcheck="false"
                onkeyup={DebounceUpdatePreview}
                bind:value={tmpl.dep_config[dc_id].save_pattern}
            ></textarea>

            <div>
                {#if pick_base}
                    <button onclick={SelectBasePath} style="margin-right: 15px;"
                        >Pick Base Path</button
                    >
                {/if}

                <button onclick={AddField}>Add Field</button>

                <select bind:value={sel_add_field}>
                    <option value="base_path" style="font-weight: bold; font-style: italic;">Base Path</option>
                    <option value="comp_name" style="font-weight: bold; font-style: italic;">Composition Name</option>
                    <option value="row_number" style="font-weight: bold; font-style: italic;">Row Number</option>
                    <option value="increment:0000" style="font-weight: bold; font-style: italic;">Increment</option>
                    {#each tmpl.columns as col}
                        <option value={col.cont_name}>{col.cont_name}</option>
                    {/each}
                </select>
            </div>

            <div class="out_prev_cont">
                <span>Preview:</span>
                <span class="out_prev">{tmpl.dep_config[dc_id].save_path}</span>
            </div>
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
