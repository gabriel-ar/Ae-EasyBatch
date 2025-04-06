<script>
    import {Template} from "./AutomatorTypes.svelte"
    import CSAdapter from "./CSAdapter.mjs";
    import { getContext, onMount } from "svelte";
    import Logger from './Logger.mjs';

    const l = getContext("logger") || new Logger(Logger.Levels.Warn, 'ModalAlternateSrcV2');

    let {show = $bindable(false),
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
    
    
    function AddField(){
        /**@type {HTMLTextAreaElement}*/
        let save_pattern_ta = document.querySelector("#alt_src_pattern_ta");
        
        let cursor_pos = save_pattern_ta.selectionStart;
        let old_val = pattern;
        
        //Insert the selected field at the cursor position
        pattern = old_val.slice(0, cursor_pos) 
        +`{${sel_add_field}}` 
        + old_val.slice(cursor_pos);
        
        tmpl = tmpl;
        l.debug('AddField called with pattern:', pattern);
    }
    
    /**
    * Selects a folder to save the files to and adds it to the save pattern
    */
    function SelectBasePath(){
        let csa = new CSAdapter();
        
        csa.OpenFolderDialog(base_path).then((result) => {
            if(result === null) return;
            
            base_path = result;
        });
    }
    
    $effect(() => {
        UpdatePreview(pattern, base_path);
        //l.debug('Effect triggered: UpdatePreview');
    });
    
    function UpdatePreview(dummy, dummy2){
        let col = tmpl.columns[col_i];

        col.alt_src_pattern = pattern;
        col.alt_src_base = base_path;

        preview = col.ResolveAltSrcPath(0, tmpl.columns);
        l.debug('UpdatePreview called with pattern:', pattern, 'and base_path:', base_path);
    }

    function CloseDialog(){
        show = false;
        onclose(base_path, pattern);
    }
    
</script>

<div id="alternate_modal" style:display={show ? "block" : "none"}>
    <div class="wrapper">
        
        <h4>File Path Pattern</h4>
        <textarea id="alt_src_pattern_ta"
        spellcheck="false"
        bind:value={pattern}></textarea>
        
        <div>
            <button onclick={SelectBasePath}>Pick Base Path</button>
            
            <button style="margin-left: 15px;" 
            onclick={AddField}>Add Field</button>
            
            <select bind:value={sel_add_field}>
                <option value="base_path">Base Path</option>
                <option value="row_number">Row Number</option>
                <option value="increment:0000">Increment</option>
                {#each tmpl.columns as col}
                <option value={col.cont_name}>{col.cont_name}</option>
                {/each}
            </div>
            
            <div class="out_prev_cont"><span>Preview:</span>
                <span class="out_prev">{preview}</span>
            </div>
            <button onclick={CloseDialog}>Close</button>
        </div>
    </div>
    <style>
        
        #alternate_modal {
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
        
        .wrapper{
            background-color: #242424;
            
            display: flex;
            flex-direction: column;
            
            margin: 20px;
            padding: 10px;
            
            gap: 1rem;
        }
        
        .out_prev{
            
            word-break: break-all;
        }
        
    </style>