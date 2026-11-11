export type RecentSource = {
  type: "csv" | "excel";
  path: string;
};

const RECENT_SOURCES_KEY = "easybatch.recentSources";
const RECENT_SOURCES_LIMIT = 10;

export class LocalSettings {
  static LoadRecentSources(): RecentSource[] {
    const stored = localStorage.getItem(RECENT_SOURCES_KEY);
    if (!stored) return [];
    const data: unknown = JSON.parse(stored);
    if (!Array.isArray(data)) throw new Error("The recent sources list is invalid.");
    return data.filter((item): item is RecentSource =>
      item !== null && typeof item === "object" &&
      (item.type === "csv" || item.type === "excel") &&
      typeof item.path === "string" && item.path.length > 0
    ).slice(0, RECENT_SOURCES_LIMIT);
  }

  static RememberRecentSource(source: RecentSource): RecentSource[] {
    const path = cep_node.require("path");
    const normalize = (value: string) => {
      const normalized = path.normalize(value);
      return cep_node.require("os").platform() === "win32" ? normalized.toLowerCase() : normalized;
    };
    const recent = [
      source,
      ...this.LoadRecentSources().filter((item) =>
        item.type !== source.type || normalize(item.path) !== normalize(source.path)),
    ].slice(0, RECENT_SOURCES_LIMIT);
    localStorage.setItem(RECENT_SOURCES_KEY, JSON.stringify(recent));
    return recent;
  }
}
