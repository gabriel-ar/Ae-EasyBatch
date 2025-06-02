import "./cep_node.t";

class CSAdapter {
  constructor() {}

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

  /**
   * Evaluates a JavaScript script, which can use the JavaScript DOM
   * of the host application.
   *
   * @param script    The JavaScript script.
   * @param callback  Optional. A callback function that receives the result of execution.
   *          If execution fails, the callback function receives the error message \c EvalScript_ErrMessage.
   */
  // @ts-ignore
  Eval(script, callback?) {
    if (callback === null || callback === undefined) {
      callback = function (result) {
        console.log("From Eval undefined callback: " + result);
      };
    }

    return this.a_cep.evalScript(script, callback);
  }


  async EvalA(script) {
    return new Promise((resolve, reject) => {
      this.Eval(script, (result) => {
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
    return this.Eval(`$.evalFile("${path}")`);
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
  async OpenFolderDialog(initial_folder=""): Promise<string|null> {
  
    if(initial_folder !== "" && initial_folder !== undefined && initial_folder !== null) {
      let proj_folder = await this.EvalA(`app.project.file.parent.fsName`);
      
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

      let rel_path:string = await this.EvalA(
        `GetRelativeFolderPath("${encodeURIComponent(res.data[0])}")`
      )as string;

      console.log("Relative path: " + rel_path);



      return new Promise((resolve, reject) => {
        if (rel_path !== undefined && rel_path !== null) {
          resolve(decodeURIComponent(rel_path));
        }
        else {
          reject(null);
        }
      });
    }else{
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
      this.Eval(
        `GetRelativeFilePath("${encodeURIComponent(res.data[0])}")`,
        (res) => {
          resolve(decodeURIComponent(res));
        }
      );
    }else{
        return new Promise((resolve, reject) => {
            resolve(null);
          });
    }
  });
}

/**
 * 
 * @param {SystemPath} pathType 
 */
GetSystemPath(pathType)
{
    var path = decodeURI(this.a_cep.getSystemPath(pathType));
    return path.replace("file:///", "").replace("file://", "");
};
}

export default CSAdapter;
