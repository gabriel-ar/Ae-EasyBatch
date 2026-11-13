export type RecentSource = {
  type: "csv" | "excel" | "google";
  path: string;
  name?: string;
};

const recent_sources_key = "easybatch.recentSources";
const recent_sources_limit = 10;

/**Settings kept on this computer (browser storage) instead of in the project, shared by every project.*/
export class LocalSettings {
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
}
