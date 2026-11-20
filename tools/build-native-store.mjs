import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("../src/native/", import.meta.url));
const prebuilt = fileURLToPath(new URL("../prebuilt/", import.meta.url));
const windows_libraries = ["EasyBatchSecretStore.x64.dll", "EasyBatchSecretStore.arm64.dll"];
const mac_bundle = "EasyBatchSecretStore.bundle";

function BuildMacStore(output) {
  const bundle = resolve(output, mac_bundle);
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

function BuildWindowsStore(output) {
  const host = process.arch === "arm64" ? "arm64" : "x64";
  const work = mkdtempSync(resolve(tmpdir(), "easybatch-native-"));

  try {
    for (const target of ["x64", "arm64"]) {
      const library = resolve(output, `EasyBatchSecretStore.${target}.dll`);
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

if (process.platform !== "darwin" && process.platform !== "win32") {
  throw new Error("Native components must be built on Windows or macOS.");
}

const temporary = mkdtempSync(resolve(tmpdir(), "easybatch-release-native-"));
try {
  if (process.platform === "darwin") BuildMacStore(temporary);
  else BuildWindowsStore(temporary);

  mkdirSync(prebuilt, { recursive: true });
  if (process.platform === "darwin") {
    const destination = resolve(prebuilt, mac_bundle);
    rmSync(destination, { recursive: true, force: true });
    cpSync(resolve(temporary, mac_bundle), destination, { recursive: true });
  } else {
    for (const library of windows_libraries) {
      copyFileSync(resolve(temporary, library), resolve(prebuilt, library));
    }
  }
  console.log("Built native components in prebuilt.");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
