import type { RenderProgress } from "./Messaging";

export type RecentSource = {
  type: "csv" | "excel" | "google";
  path: string;
  name?: string;
};

export type SavePatternPreset = {
  name: string;
  pattern: string;
};

const recent_sources_key = "easybatch.recentSources";
const recent_sources_limit = 10;
const save_pattern_presets_key = "easybatch.savePatternPresets";
const render_progress_key = "easybatch.renderProgress";

/**Settings kept on this computer (browser storage) instead of in the project, shared by every project.*/
export class LocalSettings {
  static LoadRenderProgress(): RenderProgress | null {
    const stored = localStorage.getItem(render_progress_key);
    if (!stored) return null;
    const progress: Omit<RenderProgress, "state"> & { state: RenderProgress["state"] | "pausing" | "paused" } = JSON.parse(stored);
    if (!Array.isArray(progress?.rows) || !Array.isArray(progress.results) ||
      !Number.isInteger(progress.current) || progress.current < 0 || progress.current > progress.rows.length ||
      progress.rows.some((row) => !Number.isInteger(row) || row < 0 || row >= progress.row_count) ||
      progress.results.some((item) => item == null)) {
      throw new Error("The saved render progress is invalid.");
    }
    const state = progress.state === "pausing" ? "rendering" :
      progress.state === "paused" ? "paused_now" : progress.state;
    return {...progress, state};
  }

  static SaveRenderProgress(progress: RenderProgress): void {
    localStorage.setItem(render_progress_key, JSON.stringify(progress));
  }

  static ClearRenderProgress(): void {
    localStorage.removeItem(render_progress_key);
  }

  static LoadRecentSources(): RecentSource[] {
    const stored = localStorage.getItem(recent_sources_key);
    if (!stored) return [];

    const data: unknown = JSON.parse(stored);
    if (!Array.isArray(data)) throw new Error("The recent sources list is invalid.");

    //Entries from older or edited storage are dropped instead of failing the whole list
    return data.filter((item): item is RecentSource =>
      item !== null && typeof item === "object" &&
      (item.type === "csv" || item.type === "excel" || item.type === "google") &&
      typeof item.path === "string" && item.path.length > 0
    ).slice(0, recent_sources_limit);
  }

  /**Moves the source to the top of the list, replacing any earlier entry for the same file or spreadsheet.*/
  static RememberRecentSource(source: RecentSource): RecentSource[] {
    const path = cep_node.require("path");

    //Windows paths are case insensitive
    const normalize = (value: string) => {
      const normalized = path.normalize(value);
      return cep_node.require("os").platform() === "win32" ? normalized.toLowerCase() : normalized;
    };

    const recent = [
      source,
      ...this.LoadRecentSources().filter((item) =>
        item.type !== source.type || (item.type === "google"
          ? item.path !== source.path
          : normalize(item.path) !== normalize(source.path))),
    ].slice(0, recent_sources_limit);

    localStorage.setItem(recent_sources_key, JSON.stringify(recent));
    return recent;
  }

  static LoadSavePatternPresets(): SavePatternPreset[] {
    const stored = localStorage.getItem(save_pattern_presets_key);
    if (!stored) return [];

    const data: unknown = JSON.parse(stored);
    if (!Array.isArray(data)) throw new Error("The save pattern presets list is invalid.");

    return data.filter((item): item is SavePatternPreset =>
      item !== null && typeof item === "object" &&
      typeof item.name === "string" && item.name.length > 0 &&
      typeof item.pattern === "string"
    );
  }

  /**Adds the preset, replacing any existing preset with the same name.*/
  static UpsertSavePatternPreset(preset: SavePatternPreset): SavePatternPreset[] {
    const presets = this.LoadSavePatternPresets();
    const existing_index = presets.findIndex((item) => item.name === preset.name);

    if (existing_index >= 0) presets[existing_index] = preset;
    else presets.push(preset);

    localStorage.setItem(save_pattern_presets_key, JSON.stringify(presets));
    return presets;
  }

  static DeleteSavePatternPreset(name: string): SavePatternPreset[] {
    const presets = this.LoadSavePatternPresets().filter((item) => item.name !== name);

    localStorage.setItem(save_pattern_presets_key, JSON.stringify(presets));
    return presets;
  }
}
