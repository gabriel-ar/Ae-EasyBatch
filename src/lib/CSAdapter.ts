import "./cep_node.t";
import type { Result } from "./Messaging";

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

  /**
   * Evaluates an ExtendScript function, parses the JSON response as `T`,
   * and returns it typed.   *
   */
  async Exec<T extends Result>(method: string, ...args: unknown[]): Promise<T> {
    const raw = await this.Eval(method, ...args);
    try {
      return JSON.parse(raw) as T;
    } catch (e) {
      return {
        success: false,
        error_obj: {
          message: `[CSAdapter] Failed to parse response from "${method}": ${e}`,
          raw_response: raw,
        },
      } as T;
    }
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
   * Opens a file with the OS default application. Relative paths are resolved against the project folder.
   * If the file doesn't exist, opens its parent folder instead.
   * @returns true if something was opened.
   */
  async OpenPath(path: string): Promise<boolean> {
    if (!path) return false;
    const node_path = cep_node.require("path");
    let abs = path;
    if (!node_path.isAbsolute(path) && !/^[a-zA-Z]:[\\/]/.test(path)) {
      const proj_folder = await this.EvalDirectAsync(`app.project.file.parent.fsName`) as string;
      abs = node_path.resolve(proj_folder, path);
    }
    abs = node_path.normalize(abs);

    const stat = cep.fs.stat(abs);
    const target = stat.err === 0 ? abs : node_path.dirname(abs);
    const res = await this.EvalDirectAsync(
      `(function(){ var f = new File(decodeURIComponent("${encodeURIComponent(target)}")); if (!f.exists) { f = new Folder(f.fsName); } return f.exists && f.execute(); })()`
    );
    return res === true || res === "true";
  }

  /**
   * Uses the CEP API to open a folder selection dialog. Returns a path relative to the project folder.
   * @param {string} starting_folder 
   * @returns {Promise<string|null>} The selected folder path or null if the user cancels the dialog.
   */
  async OpenSelectFolder(starting_folder = ""): Promise<string | null> {

      const proj_folder = await this.EvalDirectAsync(`app.project.file.parent.fsName`) as string;

    if (starting_folder !== "" && starting_folder !== undefined && starting_folder !== null) {
      let path = cep_node.require("path");
      starting_folder = path.join(proj_folder, starting_folder);
    }else{
      starting_folder = proj_folder;
    }

    console.log("[CSAdapter:OpenFolderDialog] Initial folder: " + starting_folder);

    let res = cep.fs.showOpenDialogEx(
      false,
      true,
      "Select a Folder",
      starting_folder
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
   * Opens the native After Effects "open file" dialog (via host `OpenFileDialog`).
   * @param relative If true, returns a path relative to the project folder (when possible).
   * @param initial_path Absolute or project-relative folder/file to start from.
   * @param fileTypes Allowed extensions without dots, e.g. ["png", "jpg"].
   * @returns The selected path, or null if the user cancels.
   */
  async OpenFileDialog(relative = true, title = "Select File", initial_path = "", fileTypes?: string[]): Promise<string | null> {
    const abs_path = await this.Eval("OpenFileDialog", title, initial_path || "", (fileTypes || []).join(","));
    return this.ResolveDialogResult(abs_path, relative);
  }

  /**
   * Opens the native After Effects "save file" dialog (via host `SaveFileDialog`).
   * @param relative If true, returns a path relative to the project folder (when possible).
   * @param initial_path Absolute or project-relative folder (or file path whose name is the default name).
   * @param fileTypes Allowed extensions without dots, e.g. ["csv"].
   * @param default_name Suggested file name.
   * @returns The chosen path, or null if the user cancels.
   */
  async SaveFileDialog(relative = false, title = "Save File", initial_path = "", fileTypes?: string[], default_name = ""): Promise<string | null> {
    const abs_path = await this.Eval("SaveFileDialog", title, initial_path || "", (fileTypes || []).join(","), default_name || "");
    return this.ResolveDialogResult(abs_path, relative);
  }

  private async ResolveDialogResult(abs_path: string, relative: boolean): Promise<string | null> {
    if (!abs_path || abs_path === "null" || abs_path === "undefined" || abs_path.startsWith("EvalScript error")) {
      return null;
    }

    if (!relative) {
      return abs_path;
    }

    const rel_path = await this.Eval("GetRelativeFilePath", abs_path, true);
    if (!rel_path || rel_path === "null" || rel_path === "undefined") {
      return abs_path;
    }
    return decodeURIComponent(rel_path);
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
