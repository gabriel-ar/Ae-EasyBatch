import "./cep_node.t";

//Modernized CEP adapter for easier interaction with the CEP environment
class CSAdapter {
  constructor() { }

  /**
   * @enum {string}
   */
  static SystemPath = {
    EXTENSION: "extension",
    COMMON_FILES: "commonFiles",
    MY_DOCUMENTS: "myDocuments",
    USER_DATA: "userData",
    HOST_APPLICATION: "hostApplication",
  };

  // @ts-ignore
  a_cep = window.__adobe_cep__;

  async Eval(method, ...args): Promise<string> {
    return new Promise((resolve) => {

      //build the script to be evaluated
      let script = `${method}(`;
      if (args.length > 0) {
        script += args.map(arg => {
          if (typeof arg === "string") { arg = '"' + encodeURIComponent(arg) + '"' }
          return arg;
        }
        ).join(", ");
      }
      script += `)`;

      this.a_cep.evalScript(script, (result) => {
        resolve(result);
      });
    });//Promise
  }

  EvalSync(method, callback, ...args) {
    //build the script to be evaluated
    let script = `${method}(`;
    if (args.length > 0) {
      script += args.map(arg => {
        if (typeof arg === "string") { arg = '"' + encodeURIComponent(arg) + '"' }
        return arg;
      }
      ).join(", ");
    }
    script += `)`;

    console.warn("EvalSync script: " + script);

    if (callback === null || callback === undefined) {
      callback = function (result) {
        console.log("From Eval undefined callback: " + result);
      };
    }

    this.a_cep.evalScript(script, callback);
  }



  /**
   * Evaluates a JavaScript script, which can use the JavaScript DOM
   * of the host application.
   *
   * @param script    The JavaScript script.
   * @param callback  Optional. A callback function that receives the result of execution.
   *          If execution fails, the callback function receives the error message \c EvalScript_ErrMessage.
   */
  // @ts-ignore
  EvalDirect(script, callback?) {
    if (callback === null || callback === undefined) {
      callback = function (result) {
        console.log("From Eval undefined callback: " + result);
      };
    }

    return this.a_cep.evalScript(script, callback);
  }


  async EvalDirectAsync(script) {
    return new Promise((resolve, reject) => {
      this.EvalDirect(script, (result) => {
        resolve(result);
      });
    });
  }

  /**
   * Loads a jsx file in the CPE environment
   */
  LoadFile(name) {
    let path =
      this.a_cep.getSystemPath(CSAdapter.SystemPath.EXTENSION) + "/host/" + name;
    console.log("Loading .jsx in: " + path);
    return this.EvalDirect(`$.evalFile("${path}")`);
  }

  GetHostEnvironment() {
    return this.a_cep.getHostEnvironment();
  }

  OpenURLInDefaultBrowser(url) {
    cep.util.openURLInDefaultBrowser(url);
  }

  /**
   * Uses the CEP API to open a folder selection dialog. Returns a path relative to the project folder.
   * @param {string} initial_folder 
   * @returns {Promise<string|null>} The selected folder path or null if the user cancels the dialog.
   */
  async OpenFolderDialog(initial_folder = ""): Promise<string | null> {

    if (initial_folder !== "" && initial_folder !== undefined && initial_folder !== null) {
      let proj_folder = await this.EvalDirectAsync(`app.project.file.parent.fsName`);

      let path = cep_node.require("path");
      initial_folder = path.join(proj_folder, initial_folder);
    }

    console.log("Initial folder: " + initial_folder);

    let res = cep.fs.showOpenDialogEx(
      false,
      true,
      "Select a Folder",
      initial_folder
    );

    if (res.data[0] !== undefined && res.data[0] !== null) {

      console.log("Selected folder: " + res.data[0]);

      let rel_path: string = await this.EvalDirectAsync(
        `GetRelativeFolderPath("${encodeURIComponent(res.data[0])}")`
      ) as string;

      console.log("Relative path: " + rel_path);

      return new Promise((resolve, reject) => {
        if (rel_path !== undefined && rel_path !== null) {
          resolve(decodeURIComponent(rel_path));
        }
        else {
          reject(null);
        }
      });
    } else {
      return new Promise((resolve, reject) => {
        reject(null);
      });
    }
  }

  /**
   Uses the CEP API to open a file selection dialog. Returns a path relative to the project folder.
   * @param {string} initial_folder 
   * @returns {Promise<string|null>} The selected file path or null if the user cancels the dialog.
   */
  async OpenFileDialog(initial_folder) {

    console.log("OpenFileDialog called with initial_folder: " + initial_folder);

    let i_folder = initial_folder || "";

    return new Promise((resolve, reject) => {
      let res = cep.fs.showOpenDialogEx(false, false, "Select File", i_folder);

      if (res.data[0] !== undefined && res.data[0] !== null) {
        this.EvalDirect(
          `GetRelativeFilePath("${encodeURIComponent(res.data[0])}")`,
          (res) => {
            resolve(decodeURIComponent(res));
          }
        );
      } else {
        resolve(null);
      }
    });
  }

  /**
   * 
   * @param {SystemPath} pathType 
   */
  GetSystemPath(pathType) {
    var path = decodeURI(this.a_cep.getSystemPath(pathType));
    return path.replace("file:///", "").replace("file://", "");
  };

/**
 * 
 * @param keyEventsInterest  * Register an interest in some key events to prevent them from being sent to the host application.
 *
 * This function works with modeless extensions and panel extensions.
 * Generally all the key events will be sent to the host application for these two extensions if the current focused element
 * is not text input or dropdown,
 * If you want to intercept some key events and want them to be handled in the extension, please call this function
 * in advance to prevent them being sent to the host application.
 *
 * Since 6.1.0
 *
 * @param keyEventsInterest      A JSON string describing those key events you are interested in. A null object or
                                 an empty string will lead to removing the interest
 *
 * This JSON string should be an array, each object has following keys:
 *
 * keyCode:  [Required] represents an OS system dependent virtual key code identifying
 *           the unmodified value of the pressed key.
 * ctrlKey:  [optional] a Boolean that indicates if the control key was pressed (true) or not (false) when the event occurred.
 * altKey:   [optional] a Boolean that indicates if the alt key was pressed (true) or not (false) when the event occurred.
 * shiftKey: [optional] a Boolean that indicates if the shift key was pressed (true) or not (false) when the event occurred.
 * metaKey:  [optional] (Mac Only) a Boolean that indicates if the Meta key was pressed (true) or not (false) when the event occurred.
 *                      On Macintosh keyboards, this is the command key. To detect Windows key on Windows, please use keyCode instead.
 * An example JSON string:
 *
 * [
 *     {
 *         "keyCode": 48
 *     },
 *     {
 *         "keyCode": 123,
 *         "ctrlKey": true
 *     }, 
 *     {
 *         "keyCode": 123,
 *         "ctrlKey": true,
 *         "metaKey": true
 *     }
 * ]
 *
 * @returns 
 */
  RegisterKeyEventsInterest(keyEventsInterest: {keyCode: number, ctrlKey?: boolean, altKey?: boolean, shiftKey?: boolean, metaKey?: boolean}[] | null | string) {
    console.log("RegisterKeyEventsInterest called with: ", keyEventsInterest);
    return this.a_cep.registerKeyEventsInterest(JSON.stringify(keyEventsInterest));
  }


}

export default CSAdapter;
