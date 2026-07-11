import { createWriteStream, existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { ZipArchive } = require("archiver");
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const pkg = require("../package.json");
const zipName = `${pkg.name}_v${pkg.version}.zip`;
const zipPath = path.join(rootDir, "pkg", zipName);

if (existsSync(zipPath)) {
  unlinkSync(zipPath);
  console.log(`Removed existing ${zipName}`);
}

const output = createWriteStream(zipPath);
const archive = new ZipArchive({ zlib: { level: 9 } });

output.on("close", () => {
  const kb = (archive.pointer() / 1024).toFixed(1);
  console.log(`\nCreated pkg/${zipName} (${kb} KB)`);
});

archive.on("error", (err) => {
  throw err;
});

archive.pipe(output);

// Add contents of dist/ inside a folder named after the package
archive.directory(path.join(rootDir, "dist"), pkg.name);

// Add ReadMe.txt from the pkg folder
archive.file(path.join(rootDir, "pkg", "ReadMe.txt"), { name: "ReadMe.txt" });

await archive.finalize();
