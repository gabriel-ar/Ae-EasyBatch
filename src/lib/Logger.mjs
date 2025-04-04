//This is the way to import the node modules in the CEP environment
//Is a mix of node.js and browser environment

import CSAdapter from "./CSAdapter.mjs";

// @ts-ignore
let fs = cep_node.require('fs');
// @ts-ignore
let path = cep_node.require('path');
// @ts-ignore
let os = cep_node.require('os');

class Logger {
    constructor(log_level = Logger.Levels.Warn, prefix = '') {
        this.log_lvl = log_level;
        this.prefix = prefix;

        //Resolve the documents folder
        const docs_folder = new CSAdapter().GetSystemPath(CSAdapter.SystemPath.MY_DOCUMENTS);
        const log_filename = `${new Date().toISOString().replace(/[:.]/g, '-')}.log`;

        this.log_path = path.join(docs_folder,"EasyBatch Logs", log_filename);
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
    log_lvl;

    logToFile(message) {
        const logDir = path.dirname(this.log_path);
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        fs.appendFileSync(this.log_path, message + '\n', 'utf8');
    }

    DoLog(level, ...messages) {
        //Everything gets logged to the console
        //TODO As sketchy as it gets, fix me please
        const txt_lvl = Object.entries(Logger.Levels)[level][0].toLowerCase();

        console[txt_lvl](...messages);

        messages = messages.map(message => {
            if (message instanceof Error) {
                return message.stack;
            } else if (typeof message === 'object') {
                return JSON.stringify(message, null, 2);
            } else {
                return message;
            }
        }   );
        
        //Only the messages with the log level equal or higher than the logLevel property will be logged to the file
        if (level <= this.log_lvl) {
            const logMessage = `[${new Date().toISOString()}] [${txt_lvl.toUpperCase()}] ${this.prefix} ${messages.join(' ')}`;
            this.logToFile(logMessage);
        }
    }

    error(...messages) {
        this.DoLog(Logger.Levels.Error, ...messages);
    }

    warn(...messages) {
        this.DoLog(Logger.Levels.Warn, ...messages);
    }

    log(...messages) {
        this.DoLog(Logger.Levels.Info, ...messages);
    }

    debug(...messages) {
        this.DoLog(Logger.Levels.Debug, ...messages);
    }
}

export default Logger;