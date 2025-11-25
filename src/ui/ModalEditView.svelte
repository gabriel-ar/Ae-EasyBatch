<script lang="ts">
    import { Template } from "../lib/Settings.ts";
    import Logger from "../lib/Logger.ts";
    import { DragHandleDots2, EyeOpen, EyeClosed } from "radix-icons-svelte";

    type OnCloseFunc = (table_cols: number[]) => void;

    const l = new Logger(Logger.Levels.Warn, "ModalEditView");

    let show = $state(false);
    let tmpl = $state<Template>();
    let onclose = $state<OnCloseFunc>();

    // Local state for managing the view
    let viewColumns = $state<Array<{ col_index: number; visible: boolean }>>([]);
    let draggedIndex = $state<number | null>(null);
    let dropTargetIndex = $state<number | null>(null);

    export function Open(
        template: Template,
        on_close_callback: OnCloseFunc,
    ) {
        l.debug("Open called with template:", template);

        tmpl = template;
        onclose = on_close_callback;

        // Initialize viewColumns based on current table_cols
        viewColumns = [];
        
        // First, add all visible columns in their current order
        for (let col_i of template.table_cols) {
            viewColumns.push({ col_index: col_i, visible: true });
        }

        // Then, add all hidden columns at the end
        for (let i = 0; i < template.columns.length; i++) {
            if (!template.table_cols.includes(i)) {
                viewColumns.push({ col_index: i, visible: false });
            }
        }

        show = true;
    }

    export function CloseDialog() {
        // Build the new table_cols array from visible columns only
        const new_table_cols = viewColumns
            .filter(vc => vc.visible)
            .map(vc => vc.col_index);

        show = false;
        onclose(new_table_cols);
    }

    function toggleVisibility(index: number) {
        viewColumns[index].visible = !viewColumns[index].visible;
    }

    function handleDragStart(index: number) {
        draggedIndex = index;
        l.debug("Drag started at index:", index);
    }

    function handleDragEnd() {
        draggedIndex = null;
        dropTargetIndex = null;
        l.debug("Drag ended");
    }

    function handleDragOver(event: DragEvent, index: number) {
        event.preventDefault();
        if (draggedIndex !== null && draggedIndex !== index) {
            dropTargetIndex = index;
        }
    }

    function handleDragLeave() {
        dropTargetIndex = null;
    }

    function handleDrop(event: DragEvent, index: number) {
        event.preventDefault();
        
        if (draggedIndex === null || draggedIndex === index) {
            dropTargetIndex = null;
            return;
        }

        l.debug("Dropping from", draggedIndex, "to", index);

        // Reorder the array
        const newViewColumns = [...viewColumns];
        const [removed] = newViewColumns.splice(draggedIndex, 1);
        newViewColumns.splice(index, 0, removed);
        
        viewColumns = newViewColumns;
        draggedIndex = null;
        dropTargetIndex = null;
    }

    function addColumn() {
        // Find the first hidden column
        const hiddenColumn = viewColumns.find(vc => !vc.visible);
        if (hiddenColumn) {
            hiddenColumn.visible = true;
            l.debug("Made column visible:", hiddenColumn.col_index);
        } else {
            l.warn("No hidden columns available to add");
        }
    }

    function hasHiddenColumns() {
        return viewColumns.some(vc => !vc.visible);
    }
</script>

{#if show}
    <div class="modal">
        <div class="wrapper">
            <h4>Edit View</h4>
            <p class="modal-description">
                Drag to reorder columns. Click the eye icon to show/hide columns.
            </p>

            <div class="column-list">
                {#each viewColumns as viewCol, index (viewCol.col_index)}
                    <div
                        class="column-item"
                        class:dragging={draggedIndex === index}
                        class:visible={viewCol.visible}
                        draggable="true"
                        role="button"
                        tabindex="0"
                        ondragstart={() => handleDragStart(index)}
                        ondragend={handleDragEnd}
                        ondragover={(e) => handleDragOver(e, index)}
                        ondragleave={handleDragLeave}
                        ondrop={(e) => handleDrop(e, index)}
                    >
                        {#if dropTargetIndex === index && draggedIndex !== null && draggedIndex < index}
                            <div class="drop-indicator bottom"></div>
                        {/if}
                        
                        {#if dropTargetIndex === index && draggedIndex !== null && draggedIndex > index}
                            <div class="drop-indicator top"></div>
                        {/if}

                        <button
                            class="drag-handle"
                            data-variant="discrete"
                            type="button"
                        >
                            <DragHandleDots2 />
                        </button>

                        <span class="column-name">
                            {tmpl.columns[viewCol.col_index].cont_name}
                        </span>

                        <button
                            class="visibility-toggle"
                            data-variant="discrete"
                            type="button"
                            onclick={() => toggleVisibility(index)}
                        >
                            {#if viewCol.visible}
                                <EyeOpen />
                            {:else}
                                <EyeClosed />
                            {/if}
                        </button>
                    </div>
                {/each}
            </div>

            <div class="modal-actions">
                {#if hasHiddenColumns()}
                    <button onclick={addColumn}>Add Column</button>
                {/if}
                <button onclick={CloseDialog}>Done</button>
            </div>
        </div>
    </div>

    <style>

        .column-list {
            display: flex;
            flex-direction: column;
            gap: 2px;
            margin-bottom: 1rem;
            max-height: 60vh;
            overflow-y: auto;
        }

        .column-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px;
            background-color: var(--color-m1);
            border: 1px solid var(--color-border-p0);
            border-radius: var(--radius-form);
            cursor: move;
            position: relative;
            transition: opacity 0.2s, background-color 0.2s;
        }

        .column-item:hover {
            background-color: var(--color-p1);
        }

        .column-item.dragging {
            opacity: 0.5;
        }

        .column-item:not(.visible) {
            opacity: 0.5;
            background-color: var(--color-m2);
        }

        .column-item:not(.visible) .column-name {
            text-decoration: line-through;
            color: var(--color-text-disabled);
        }

        .drag-handle {
            cursor: grab;
            color: rgba(255, 255, 255, 0.5);
            padding: 4px;
            margin: 0;
        }

        .drag-handle:active {
            cursor: grabbing;
        }

        .column-name {
            flex: 1;
            font-size: 1rem;
            user-select: none;
        }

        .visibility-toggle {
            padding: 4px;
            margin: 0;
        }

        .drop-indicator {
            position: absolute;
            left: 0;
            right: 0;
            height: 3px;
            background-color: var(--color-highlight);
            border-radius: 2px;
            z-index: 10;
        }

        .drop-indicator.top {
            top: -2px;
        }

        .drop-indicator.bottom {
            bottom: -2px;
        }

        .modal-actions {
            display: flex;
            gap: 8px;
            justify-content: flex-end;
        }
    </style>
{/if}
