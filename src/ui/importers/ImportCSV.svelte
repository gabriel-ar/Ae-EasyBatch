<script lang="ts">
	import papa from "papaparse";
	import { l, csa } from "../States.svelte.ts";
	import { TemplateHelper, type TemplateData } from "../../lib/Settings.svelte.ts";
	import Dropdown from "../Dropdown.svelte";

	type MatchState = "auto" | "manual" | "unmapped";

	type MappingRow = {
		template_prop: string;
		mapped_col: string;
		auto_col: string;
		state: MatchState;
	};

	type ImportStats = {
		rows: number;
		mapped: number;
		total: number;
	};

	let show = $state(false);
	let loading = $state(false);

	let current_tmpl = $state<TemplateData | undefined>(undefined);
	let csv_raw = $state("");
	let csv_headers = $state<string[]>([]);
	let csv_row_count = $state(0);
	let csv_rows = $state<any[][]>([]);
	let rows = $state<MappingRow[]>([]);
	let dropdown_options = $state<string[]>([]);
	let dropdown_labels = $state<string[]>([]);

	let on_imported = $state<((stats: ImportStats) => void) | undefined>(undefined);

	function Normalize(value: string): string {
		return (value ?? "")
			.toLowerCase()
			.trim()
			.replace(/[_\-\.]/g, " ")
			.replace(/\s+/g, " ")
			.replace(/[^a-z0-9 ]/g, "");
	}

	function AutoMatchHeader(template_prop: string, headers: string[]): string {
		if (headers.includes(template_prop)) return template_prop;

		const template_lower = template_prop.toLowerCase();
		const case_insensitive = headers.find((h) => h.toLowerCase() === template_lower);
		if (case_insensitive !== undefined) return case_insensitive;

		const normalized_target = Normalize(template_prop);
		const normalized = headers.find((h) => Normalize(h) === normalized_target);
		return normalized ?? "";
	}

	function BuildRows(tmpl: TemplateData, headers: string[]) {
		dropdown_options = ["", ...headers];
		dropdown_labels = ["Do not import", ...headers];

		rows = tmpl.columns.map((col) => {
			const matched = AutoMatchHeader(col.cont_name, headers);
			return {
				template_prop: col.cont_name,
				mapped_col: matched,
				auto_col: matched,
				state: matched === "" ? "unmapped" : "auto",
			};
		});
	}

	function MappedCount(): number {
		return rows.filter((r) => r.mapped_col !== "").length;
	}

	function UnmappedCount(): number {
		return rows.filter((r) => r.mapped_col === "").length;
	}

	function MappingObject(): Record<string, string | null> {
		const mapping: Record<string, string | null> = {};
		for (const row of rows) {
			mapping[row.template_prop] = row.mapped_col === "" ? null : row.mapped_col;
		}
		return mapping;
	}

	function ResetState() {
		loading = false;
		csv_raw = "";
		csv_headers = [];
		csv_row_count = 0;
		csv_rows = [];
		rows = [];
		dropdown_options = [];
		dropdown_labels = [];
		current_tmpl = undefined;
		on_imported = undefined;
	}

	export function Close() {
		show = false;
		ResetState();
	}

	export async function Open(
		tmpl: TemplateData,
		imported_callback: ((stats: ImportStats) => void) | undefined = undefined,
	) {
		show = false;
		ResetState();

		current_tmpl = tmpl;
		on_imported = imported_callback;

		loading = true;
		l.debug("[ImportCSV] Open called");

		try {
			const result = await csa.Eval("ImportFile", "CSV Files: *.csv, All Files: *.*");
			if (result === "null") {
				ResetState();
				return;
			}

			csv_raw = decodeURIComponent(result);
			const parsed = papa.parse(csv_raw, { skipEmptyLines: true }).data as any[][];

			if (parsed.length === 0) {
				ResetState();
				return;
			}

			const header = (parsed.shift() ?? []).map((h) => String(h ?? "").trim());
			csv_headers = header;
			csv_row_count = parsed.length;
			csv_rows = parsed;

			BuildRows(tmpl, csv_headers);
			show = true;
		} catch (e) {
			console.error(e);
			ResetState();
		} finally {
			loading = false;
		}
	}

	function OnMappingChange(row: MappingRow, selected: string) {
		row.mapped_col = selected;
		if (selected === "") {
			row.state = "unmapped";
		} else if (selected === row.auto_col) {
			row.state = "auto";
		} else {
			row.state = "manual";
		}
	}

	function ConfirmImport() {
		if (!current_tmpl || csv_headers.length === 0) return;

		const mapping = MappingObject();
		TemplateHelper.ApplyImportedRows(current_tmpl, csv_headers, csv_rows, mapping);

		on_imported?.({
			rows: csv_row_count,
			mapped: MappedCount(),
			total: rows.length,
		});

		Close();
	}
</script>

{#if show}
	<div class="modal">
		<div class="wrapper import_csv_dialog">
			<h3>Import CSV Data</h3>

			<div class="summary">
				<span><b>Rows:</b> {csv_row_count}</span>
				<span><b>CSV Columns:</b> {csv_headers.length}</span>
				<span><b>Mapped:</b> {MappedCount()} / {rows.length}</span>
			</div>

			{#if UnmappedCount() > 0}
				<p class="warning">
					{UnmappedCount()} template properties are not mapped. Those properties will keep existing values.
				</p>
			{/if}

			<div class="map_table_wrap">
				<table class="map_table">
					<thead>
						<tr>
							<th>Template Property</th>
							<th>CSV Column</th>
							<th>Status</th>
						</tr>
					</thead>
					<tbody>
						{#each rows as row}
							<tr>
								<td>{row.template_prop}</td>
								<td>
									<Dropdown
										bind:value={row.mapped_col}
										options={dropdown_options}
										labels={dropdown_labels}
										search_enabled={csv_headers.length > 8}
										style="width: 100%;"
										style_list="max-height: 220px; overflow-y: auto;"
										onselect={(option: string) => OnMappingChange(row, option)} />
								</td>
								<td>
									{#if row.state === "auto"}
										<span class="chip auto">Matched</span>
									{:else if row.state === "manual"}
										<span class="chip manual">Manual</span>
									{:else}
										<span class="chip off">Unmapped</span>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<div class="actions">
				<button data-variant="discrete" onclick={Close}>Cancel</button>
				<button onclick={ConfirmImport}>Confirm Import</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.import_csv_dialog {
		max-width: min(900px, 92vw);
		max-height: 85vh;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.summary {
		display: flex;
		gap: 16px;
		flex-wrap: wrap;
		color: var(--color-text-p0);
		font-size: 0.95rem;
	}

	.warning {
		margin: 0;
		color: var(--color-warning, #d9a441);
	}

	.map_table_wrap {
		border: 1px solid var(--color-border-p1);
		border-radius: var(--radius-form);
		overflow: auto;
		max-height: 52vh;
	}

	.map_table {
		width: 100%;
		border-collapse: collapse;
	}

	.map_table th,
	.map_table td {
		padding: 8px;
		border-bottom: 1px solid var(--color-border-p1);
		text-align: left;
	}

	.chip {
		border-radius: 999px;
		padding: 2px 8px;
		font-size: 0.8rem;
		border: 1px solid transparent;
	}

	.chip.auto {
		color: #76c183;
		border-color: #76c18355;
	}

	.chip.manual {
		color: #66b9ff;
		border-color: #66b9ff55;
	}

	.chip.off {
		color: var(--color-text-disabled);
		border-color: var(--color-border-p1);
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}
</style>
