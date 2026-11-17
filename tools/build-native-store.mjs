import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function BuildNativeStore(output) {
  if (process.platform !== "darwin") return;
  const source = fileURLToPath(new URL("../src/native/", import.meta.url));
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
