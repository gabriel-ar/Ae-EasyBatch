/**Returns only sanitized bridge failures; native errors are numeric OS statuses (Keychain on macOS, Win32 on Windows).*/
function SecretStoreRequest(extension_path, request) {
  var library;
  try {
    var native_path = decodeURIComponent(extension_path) + "/native/";
    var json = decodeURIComponent(request);

    if (Folder.fs !== "Windows") {
      library = new ExternalObject("lib:" + native_path + "EasyBatchSecretStore.bundle");
      return library.Execute(json);
    }

    //After Effects loads only libraries built for its own architecture, and the other one fails to load.
    var architectures = ["x64", "arm64"];
    if ($.getenv("PROCESSOR_ARCHITECTURE") === "ARM64") architectures.reverse();
    for (var i_architecture = 0; !library && i_architecture < architectures.length; i_architecture++) {
      try {
        library = new ExternalObject("lib:" + native_path + "EasyBatchSecretStore." + architectures[i_architecture] + ".dll");
      } catch (load_error) { }
    }
    if (!library) return JSON.stringify({ status: -1 });

    //The Windows library takes plain strings and answers "status" or "status:value", so no JSON is parsed natively.
    var fields = JSON.parse(json);
    var answer = /^(\d+)(?::([\s\S]*))?$/.exec(String(library.Execute(
      fields.action, fields.service, fields.key, fields.value === undefined ? "" : fields.value)));
    if (!answer) return JSON.stringify({ status: -1 });

    var response = { status: parseInt(answer[1], 10) };
    if (answer[2] !== undefined) response.value = answer[2];
    return JSON.stringify(response);
  } catch (error) {
    return JSON.stringify({ status: -1 });
  } finally {
    if (library) library.unload();
  }
}
