//This is the way to import the node modules in the CEP environment
//Is a mix of node.js and browser environment

import CSAdapter from "./CSAdapter.js";

// @ts-ignore
let fs = cep_node.require('fs');
// @ts-ignore
let path = cep_node.require('path');
// @ts-ignore
let os = cep_node.require('os');

class Logger {
    static readonly max_log_files = 50;
    static readonly max_log_age_ms = 30 * 24 * 60 * 60 * 1000;
    static cleanup_scheduled = false;
    static cleanup_in_progress = false;

    prefix: string;
    log_path: string;

    constructor(log_level = Logger.Levels.Warn, prefix = '') {
        this.log_lvl = log_level;
        this.prefix = prefix;

        console.log("Logger created with prefix: " + this.prefix);

        //Resolve the documents folder
        let docs_folder = new CSAdapter().GetSystemPath(CSAdapter.SystemPath.MY_DOCUMENTS);

        // Fix for CEP on Mac: sometimes it returns the path without the leading root slash
        if (os.platform() === 'darwin' && !docs_folder.startsWith('/')) {
            docs_folder = '/' + docs_folder;
        }
        const log_filename = `${new Date().toISOString().replace(/[:.]/g, '-')}.log`;

        this.log_path = path.join(docs_folder, "EasyBatch Logs", log_filename);

        console.log("Log file path: " + this.log_path);

        // Run cleanup in the background to avoid slowing down extension startup.
        this.ScheduleLogCleanup();
    }

    /**
     * @enum {number}
     * @description Log levels for the logger.
     */
    static Levels = {
        Error: 0,
        Warn: 1,
        Info: 2,
        Debug: 3
    };

    /**
     * @type {Levels}
     */
    log_lvl: number;

    ScheduleLogCleanup() {
        if (Logger.cleanup_scheduled) {
            return;
        }

        Logger.cleanup_scheduled = true;

        // Defer cleanup so logger construction stays fast and non-blocking.
        setTimeout(() => {
            this.CleanupLogFiles();
        }, 1000);
    }

    CleanupLogFiles() {
        if (Logger.cleanup_in_progress) {
            return;
        }

        Logger.cleanup_in_progress = true;

        const log_dir = path.dirname(this.log_path);

        fs.readdir(log_dir, (read_err: any, files: string[]) => {
            if (read_err || !files || files.length === 0) {
                Logger.cleanup_in_progress = false;
                return;
            }

            const log_files = files.filter(file => file.toLowerCase().endsWith('.log'));

            if (log_files.length === 0) {
                Logger.cleanup_in_progress = false;
                return;
            }

            const now_ms = Date.now();
            const file_infos: { full_path: string; mtime_ms: number }[] = [];
            let pending = log_files.length;

            const ProcessStats = () => {
                const files_by_age = file_infos
                    .filter(file => file.full_path !== this.log_path)
                    .sort((a, b) => a.mtime_ms - b.mtime_ms);

                const to_delete = new Set<string>();

                // Always remove logs older than the retention window.
                files_by_age.forEach(file => {
                    if (now_ms - file.mtime_ms > Logger.max_log_age_ms) {
                        to_delete.add(file.full_path);
                    }
                });

                // If still above the file cap, remove the oldest remaining logs.
                const total_after_age_cleanup = log_files.length - to_delete.size;
                const overflow = total_after_age_cleanup - Logger.max_log_files;

                if (overflow > 0) {
                    const oldest_remaining = files_by_age.filter(file => !to_delete.has(file.full_path));
                    for (let i = 0; i < overflow && i < oldest_remaining.length; i++) {
                        to_delete.add(oldest_remaining[i].full_path);
                    }
                }

                if (to_delete.size === 0) {
                    Logger.cleanup_in_progress = false;
                    return;
                }

                let pending_deletes = to_delete.size;
                to_delete.forEach(file_path => {
                    fs.unlink(file_path, () => {
                        pending_deletes--;
                        if (pending_deletes <= 0) {
                            Logger.cleanup_in_progress = false;
                        }
                    });
                });
            };

            log_files.forEach(file => {
                const full_path = path.join(log_dir, file);
                fs.stat(full_path, (stat_err: any, stats: any) => {
                    if (!stat_err && stats && typeof stats.mtimeMs === 'number') {
                        file_infos.push({ full_path, mtime_ms: stats.mtimeMs });
                    }

                    pending--;
                    if (pending <= 0) {
                        ProcessStats();
                    }
                });
            });
        });
    }

    async LogToFile(message: any): Promise<void> {
        const log_dir = path.dirname(this.log_path);

        await new Promise<void>((resolve, reject) => {
            fs.mkdir(log_dir, { recursive: true }, (mkdir_err: any) => {
                if (mkdir_err) {
                    reject(mkdir_err);
                    return;
                }

                fs.appendFile(this.log_path, message + '\n', 'utf8', (append_err: any) => {
                    if (append_err) {
                        reject(append_err);
                        return;
                    }

                    resolve();
                });
            });
        });
    }

    DoLog(level: number, ...messages: any[]) {
        //Everything gets logged to the console
        //TODO As sketchy as it gets, fix me please
        const txt_lvl = Object.entries(Logger.Levels)[level][0].toLowerCase();

        //@ts-ignore
        console[txt_lvl](...messages);

        messages = messages.map(message => {
            if (message instanceof Error) {
                return message.stack;
            } else if (typeof message === 'object') {
                return JSON.stringify(message, null, 2);
            } else {
                return message;
            }
        });

        //Only the messages with the log level equal or higher than the logLevel property will be logged to the file
        if (level <= this.log_lvl) {
            const logMessage = `[${new Date().toISOString()}] [${txt_lvl.toUpperCase()}] ${this.prefix} ${messages.join(' ')}`;
            this.LogToFile(logMessage).catch((err) => {
                console.error("[Logger] Failed to write log to file", err);
            });
        }
    }

    error(...messages: any[]) {
        this.DoLog(Logger.Levels.Error, ...messages);
    }

    warn(...messages: any[]) {
        this.DoLog(Logger.Levels.Warn, ...messages);
    }

    log(...messages: any[]) {
        this.DoLog(Logger.Levels.Info, ...messages);
    }

    debug(...messages: any[]) {
        this.DoLog(Logger.Levels.Debug, ...messages);
    }

    OpenLogFolder() {
        let dir = path.dirname(this.log_path);
        console.log("Opening log folder: " + dir); 

        // Source - https://stackoverflow.com/a
        // Posted by Cleardd, modified by community. See post 'Timeline' for change history
        // Retrieved 2025-11-10, License - CC BY-SA 4.0

        var cmd = ``;
        switch (os.platform().toLowerCase().replace(/[0-9]/g, ``).replace(`darwin`, `macos`)) {
            case `win`:
                dir = dir || '=';
                cmd = `explorer`;
                break;
            case `linux`:
                dir = dir || '/';
                cmd = `xdg-open`;
                break;
            case `macos`:
                dir = dir || '/';
                cmd = `open`;
                break;
        }
        let p = require(`child_process`).spawn(cmd, [dir]);
        p.on('error', (err: any) => {
            p.kill();
        });
    }


}

export default Logger;