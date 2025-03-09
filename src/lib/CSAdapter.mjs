class CSAdapter {
    constructor() {
        
    }

    /**
     * @enum {string}
     */
    SystemPath = {
        EXTENSION: 'extension',
    }

    // @ts-ignore
    cep = window.__adobe_cep__;
    
    /**
    * Evaluates a JavaScript script, which can use the JavaScript DOM
    * of the host application.
    *
    * @param script    The JavaScript script.
    * @param callback  Optional. A callback function that receives the result of execution.
    *          If execution fails, the callback function receives the error message \c EvalScript_ErrMessage.
    */
    // @ts-ignore
    Eval(script, callback) {
        if(callback === null || callback === undefined){ 
            callback = function(result) { console.log("From Eval undefined callback: " + result);};
        }

        return this.cep.evalScript(script, callback);
}
    /**
     * Loads a jsx file in the CPE environment 
     */
    LoadFile(name){
        let path =  this.cep.getSystemPath(this.SystemPath.EXTENSION) + '/host/' + name;
        console.log("Loading .jsx in: " + path);
        return this.Eval(`$.evalFile("${path}")`);
    }

    /**
     * Open File Dialog
     */
    OpenFileDialog(){
        return this.Eval('openFileDialog()');
    }

    GetHostEnvironment(){
        return this.cep.getHostEnvironment();
    }
}

export default CSAdapter;