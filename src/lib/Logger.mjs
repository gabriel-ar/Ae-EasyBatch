//This is the way to import the node modules in the CEP environment
//Is a mix of node.js and browser environment
// @ts-ignore
let fs = cep_node.require('fs');
// @ts-ignore
let path = cep_node.require('path');
// @ts-ignore
let os = cep_node.require('os');

class Logger {
    constructor(logLevel = 'info', logFilePath = null, prefix = '') {
        this.logLevel = logLevel;
        this.prefix = prefix;
        const defaultLogDir = path.join(os.homedir(), 'Documents', 'TemplatorLogs');
        const defaultLogFileName = `${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
        this.logFilePath = logFilePath || path.join(defaultLogDir, defaultLogFileName);
        this.logLevels = ['error', 'warn', 'info', 'debug'];
    }

    logToFile(message) {
        const logDir = path.dirname(this.logFilePath);
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        fs.appendFileSync(this.logFilePath, message + '\n', 'utf8');
    }

    DoLog(level, ...messages) {
        //Everything gets logged to the console
        console[level](...messages);

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
        if (this.logLevels.indexOf(level) <= this.logLevels.indexOf(this.logLevel)) {
            const logMessage = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${this.prefix} ${messages.join(' ')}`;
            this.logToFile(logMessage);
        }


    }

    error(...messages) {
        this.DoLog('error', ...messages);
    }

    warn(...messages) {
        this.DoLog('warn', ...messages);
    }

    log(...messages) {
        this.DoLog('info', ...messages);
    }

    debug(...messages) {
        this.DoLog('debug', ...messages);
    }
}

export default Logger;