import { derived } from "svelte/store";
import Logger from "./Logger";
import { type ProjSettings, type ProjData, SettingsHelper } from "./Settings.svelte";
import CSAdapter from "./CSAdapter";
import type { RenderSettsResults } from "./Messaging";

export const l = new Logger(Logger.Levels.Warn, "APP");

export const csa = new CSAdapter();

/**
 * App wide states store.
 * `tmpl` and the `visible_*` lists are getters derived from other state. Only `setts` and `proj` are saved or serialized.
 */
export const s = $state({
    setts: SettingsHelper.DefaultProjSettings,
    proj: SettingsHelper.DefaultProjectData,
    /**Render settings and output module templates available in After Effects*/
    render_setts_templs: {
        success: true,
        render_templs: [],
        default_render_templ: 0,
        output_modules_templs: [],
        default_output_module_templ: 0,
    } as RenderSettsResults,
    get tmpl() {
        return this.proj.tmpls[this.proj.sel_tmpl];
    },
    get visible_render_templates() {
        return (this.render_setts_templs.render_templs ?? []).filter(
            (templ) => !templ.startsWith("_HIDDEN"),
        );
    },
    get visible_output_module_templates() {
        return (this.render_setts_templs.output_modules_templs ?? []).filter(
            (templ) => !templ.startsWith("_HIDDEN"),
        );
    },
    get visible_output_module_labels() {
        return this.visible_output_module_templates.map((templ) =>
            templ === "EB_Single_Frame_PNG" ? "<b>Single Frame PNG</b>" : templ,
        );
    },
});

//used to access the app state from the browser console during development
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as any).__app_state__ = s;
}