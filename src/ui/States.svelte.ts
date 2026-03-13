import { derived } from "svelte/store";
import Logger from "../lib/Logger";
import { type ProjSettings, type ProjData, SettingsHelper } from "../lib/Settings";
import CSAdapter from "../lib/CSAdapter";

export const l = new Logger(Logger.Levels.Warn, "APP");

export const csa = new CSAdapter();

/**App wide states store */
export const s = $state({
    setts: SettingsHelper.DefaultProjSettings,
    proj: SettingsHelper.DefaultProjectData,
});

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as any).__app_state__ = s;
}