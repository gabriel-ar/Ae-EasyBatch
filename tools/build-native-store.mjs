import { execFileSync } from "node:child_process";
import { closeSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, openSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("../src/native/", import.meta.url));

/**
 * Builds the native secret store for the current OS. Windows builds both x64 and ARM64 libraries,
 * because After Effects 26+ runs natively on Windows ARM and cannot load x64 libraries.
 * Pass `all_architectures: false` to build only this machine's architecture.
 */
export function BuildNativeStore(output, { all_architectures = true } = {}) {
  if (process.platform === "darwin") BuildMacStore(output);
  else if (process.platform === "win32") BuildWindowsStore(output, all_architectures);
}

function BuildMacStore(output) {
  const bundle = resolve(output, "native/EasyBatchSecretStore.bundle");
  mkdirSync(resolve(bundle, "Contents/MacOS"), { recursive: true });
  copyFileSync(resolve(source, "Info.plist"), resolve(bundle, "Contents/Info.plist"));
  execFileSync("/usr/bin/xcrun", [
    "clang", "-arch", "arm64", "-arch", "x86_64", "-mmacosx-version-min=11.0",
    "-Wall", "-Wextra", "-Werror", "-fobjc-arc", "-fvisibility=hidden",
    "-framework", "Foundation", "-framework", "Security",
    "-bundle", resolve(source, "SecretStore.m"),
    "-o", resolve(bundle, "Contents/MacOS/EasyBatchSecretStore"),
  ], { stdio: "inherit" });
  const identity = process.env.EASYBATCH_SIGN_IDENTITY || "-";
  execFileSync("/usr/bin/codesign", [
    "--force", "--sign", identity, ...(identity === "-" ? [] : ["--timestamp"]), bundle,
  ], { stdio: "inherit" });
}

function BuildWindowsStore(output, all_architectures) {
  const host = process.arch === "arm64" ? "arm64" : "x64";
  const directory = resolve(output, "native");
  mkdirSync(directory, { recursive: true });
  const work = mkdtempSync(resolve(tmpdir(), "easybatch-native-"));

  try {
    for (const target of all_architectures ? ["x64", "arm64"] : [host]) {
      const library = resolve(directory, `EasyBatchSecretStore.${target}.dll`);
      //After Effects keeps a library mapped until it quits, so an unchanged one is reused rather than relinked
      if (!all_architectures && IsUpToDate(library)) continue;
      AssertWritable(library);

      const environment = MsvcEnvironment(host, target);
      execFileSync(FindOnPath(environment, "cl.exe"), [
        "/nologo", "/std:c11", "/O2", "/MT", "/W4", "/WX", "/GS", "/guard:cf", "/LD",
        `/Fo:${resolve(work, `SecretStore.${target}.obj`)}`,
        `/Fe:${library}`,
        resolve(source, "SecretStore.win.c"),
        "/link", "/DLL", "/DYNAMICBASE", "/HIGHENTROPYVA", "/NXCOMPAT", "/guard:cf",
        `/IMPLIB:${resolve(work, `SecretStore.${target}.lib`)}`, "advapi32.lib",
      ], { env: environment, cwd: work, stdio: "inherit" });
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function IsUpToDate(library) {
  if (!existsSync(library)) return false;
  const built = statSync(library).mtimeMs;
  return [resolve(source, "SecretStore.win.c"), fileURLToPath(import.meta.url)]
    .every((input) => statSync(input).mtimeMs <= built);
}

/**Windows cannot overwrite a library that After Effects has loaded, so say so instead of failing in the linker.*/
function AssertWritable(library) {
  if (!existsSync(library)) return;
  try {
    closeSync(openSync(library, "r+"));
  } catch (error) {
    throw new Error(`${library} is in use (${error.code}). Quit After Effects, then rebuild the native secret store.`);
  }
}


/**Loads the environment `vcvarsall.bat` sets up, so `cl.exe` finds its headers and libraries.*/
function MsvcEnvironment(host, target) {
  const vswhere = resolve(process.env["ProgramFiles(x86)"] ?? "C:/Program Files (x86)",
    "Microsoft Visual Studio/Installer/vswhere.exe");
  const component = target === "arm64" ? "Microsoft.VisualStudio.Component.VC.Tools.ARM64"
    : "Microsoft.VisualStudio.Component.VC.Tools.x86.x64";
  const installation = existsSync(vswhere) ? execFileSync(vswhere, [
    "-latest", "-products", "*", "-requires", component, "-property", "installationPath",
  ], { encoding: "utf8" }).trim() : "";
  if (!installation) {
    throw new Error(`The Windows secret store needs Visual Studio Build Tools with the C++ ${target} compiler (${component}) and a Windows SDK.`);
  }

  const marker = "__EASYBATCH_ENVIRONMENT__";
  const vcvars = resolve(installation, "VC/Auxiliary/Build/vcvarsall.bat");
  const configuration = host === target ? target : `${host}_${target}`;
  //cmd /s strips the outer quotes, which keeps paths with spaces intact.
  const output = execFileSync(process.env.ComSpec ?? "cmd.exe", [
    "/d", "/s", "/c", `""${vcvars}" ${configuration} && echo ${marker} && set"`,
  ], { encoding: "utf8", windowsVerbatimArguments: true, stdio: ["ignore", "pipe", "inherit"] });

  const separator = output.indexOf(marker);
  if (separator < 0) throw new Error(`Could not configure the MSVC ${target} toolchain:\n${output}`);
  const environment = {};
  for (const line of output.slice(separator + marker.length).split(/\r?\n/)) {
    const equals = line.indexOf("=");
    if (equals > 0) environment[line.slice(0, equals)] = line.slice(equals + 1);
  }
  if (environment.VSCMD_ARG_TGT_ARCH !== target) throw new Error(`Could not configure the MSVC ${target} toolchain.`);
  return environment;
}

function FindOnPath(environment, name) {
  const path_key = Object.keys(environment).find((key) => key.toLowerCase() === "path");
  const found = (environment[path_key] ?? "").split(delimiter).map((directory) => resolve(directory, name)).find(existsSync);
  if (!found) throw new Error(`${name} was not found in the MSVC environment.`);
  return found;
}
