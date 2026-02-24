import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dist_dir = path.join( path.resolve(__dirname, ".."), "dist");
const ext_name = "EasyBatch";

const ResolveExtDir = (platform) => {
  switch (platform) {
    case "windows": {
      const appData = process.env.APPDATA;
      if (!appData) {
        throw new Error("APPDATA is not set. Cannot resolve CEP extensions path.");
      }
      return path.join(appData, "Adobe", "CEP", "extensions");
    }
    case "macos":
      return path.join(os.homedir(), "Library", "Application Support", "Adobe", "CEP", "extensions");
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
};

const ResolveLinkTarget = (linkPath, linkTarget) => {
  if (path.isAbsolute(linkTarget)) {
    return linkTarget;
  }
  return path.resolve(path.dirname(linkPath), linkTarget);
};

const ParseArgs = () => {
  const platformFlagIndex = process.argv.indexOf("--platform");
  if (platformFlagIndex !== -1 && process.argv[platformFlagIndex + 1]) {
    return { platform: process.argv[platformFlagIndex + 1] };
  }

  const platformArg = process.argv.find((arg) => arg.startsWith("--platform="));
  if (platformArg) {
    return { platform: platformArg.split("=")[1] };
  }

  return {};
};

const MakeSymlink = async () => {
  const { platform } = ParseArgs();

  const exts_dir = ResolveExtDir(platform);
  const link_path = path.join(exts_dir, ext_name);

  await fs.mkdir(exts_dir, { recursive: true });

  if (!fsSync.existsSync(dist_dir)) {
    throw new Error(`Warning: dist folder not found at ${dist_dir}. Build the project first if needed.`);
  }

  try {
    const stat = await fs.lstat(link_path);
    if (stat.isSymbolicLink()) {
      const link_target = await fs.readlink(link_path);
      const resolvedTarget = ResolveLinkTarget(link_path, link_target);
      const expectedTarget = fsSync.existsSync(dist_dir) ? await fs.realpath(dist_dir) : dist_dir;

      if (path.resolve(resolvedTarget) === path.resolve(expectedTarget)) {
        console.log(`Symlink already exists at ${link_path}.`);
        return;
      }

      await fs.unlink(link_path);
    } else {
      throw new Error(`${link_path} exists and is not a symlink. Remove it manually to continue.`);
    }
  } catch (error) {
    if (error && error.code !== "ENOENT") {
      throw error;
    }
  }

  try {
    const linkType = platform === "windows" ? "junction" : "dir";
    await fs.symlink(dist_dir, link_path, linkType);
  } catch (error) {
    const hint = platform === "windows"
      ? "Try running in an elevated shell or enable Developer Mode to allow symlink creation."
      : "Try rerunning with sufficient permissions.";
    throw new Error(`Failed to create symlink: ${error.message}. ${hint}`);
  }

  console.log(`Created symlink: ${link_path} -> ${dist_dir}`);
};

MakeSymlink().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
