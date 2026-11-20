import { TemplateHelper, ColumnHelper } from "../../src/lib/Settings.svelte.ts";

export const template = $state(TemplateHelper.DefaultTemplate("Example", "Example", [
  ColumnHelper.DefaultColumn("Name"),
]));

export const menuProps = $state({
  active_source_path: "",
  recent_sources: [{ type: "csv" as const, path: "/project/input.csv" }],
});
