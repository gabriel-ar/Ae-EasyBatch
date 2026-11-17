/**Returns only sanitized bridge failures; native errors are numeric Keychain statuses.*/
function SecretStoreRequest(extension_path, request) {
  var library;
  try {
    var bundle_path = decodeURIComponent(extension_path) + "/native/EasyBatchSecretStore.bundle";
    library = new ExternalObject("lib:" + bundle_path);
    return library.Execute(decodeURIComponent(request));
  } catch (error) {
    return JSON.stringify({ status: -1 });
  } finally {
    if (library) library.unload();
  }
}
