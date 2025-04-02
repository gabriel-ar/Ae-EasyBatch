class CSAdapter {
  constructor() {}

  /**
   * @enum {string}
   */
  SystemPath = {
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
  Eval(script, callback) {
    if (callback === null || callback === undefined) {
      callback = function (result) {
        console.log("From Eval undefined callback: " + result);
      };
    }

    return this.a_cep.evalScript(script, callback);
  }
  /**
   * Loads a jsx file in the CPE environment
   */
  LoadFile(name) {
    let path =
      this.a_cep.getSystemPath(this.SystemPath.EXTENSION) + "/host/" + name;
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
  async OpenFolderDialog(initial_folder) {
    let i_folder = initial_folder || "";

    let res = cep.fs.showOpenDialogEx(
      false,
      true,
      "Select Base Path",
      i_folder
    );

    if (res.data[0] !== undefined && res.data[0] !== null) {
      return new Promise((resolve, reject) => {
        this.Eval(
          `GetRelativeFolderPath("${encodeURIComponent(res.data[0])}")`,
          (res) => {
            resolve(decodeURIComponent(res));
          }
        );
      });
    }else {
      return new Promise((resolve, reject) => {
        resolve(null);
      });
    }
  }

  /**
   Uses the CEP API to open a file selection dialog. Returns a path relative to the project folder.
   * @param {string} initial_folder 
   * @returns {Promise<string|null>} The selected file path or null if the user cancels the dialog.
   */
async OpenFileDialog(initial_folder) {

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
