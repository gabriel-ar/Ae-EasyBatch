import Logger from "../lib/Logger";
export const l = $state<Logger>(new Logger(Logger.Levels.Warn, "APP"));