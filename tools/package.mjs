import { createWriteStream, existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { ZipArchive } = require("archiver");
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const pkg = require("../package.json");
const zxpName = `${pkg.name}_v${pkg.version}.zxp`;
const exportPkg = `${pkg.name}_v${pkg.version}.zip`;
const zipPath = path.join(rootDir, "pkg", zxpName);

if (existsSync(zipPath)) {
  unlinkSync(zipPath);
  console.log(`Removed existing ${zxpName}`);
}

const output = createWriteStream(zipPath);
const archive = new ZipArchive({ zlib: { level: 9 } });

const closed = new Promise((resolve) => {
  output.on("close", () => {
    const kb = (archive.pointer() / 1024).toFixed(1);
    console.log(`\nCreated pkg/${zxpName} (${kb} KB)`);
    resolve();
  });
});

archive.on("error", (err) => {
  throw err;
});

archive.pipe(output);

// Add contents of dist/ inside a folder named after the package
archive.directory(path.join(rootDir, "dist"), "/");

// Add ReadMe.txt from the pkg folder
archive.file(path.join(rootDir, "pkg", "ReadMe.txt"), { name: "ReadMe.txt" });

await archive.finalize();
await closed;

// Wrap the generated .zxp inside a distributable .zip
const exportPath = path.join(rootDir, "pkg", exportPkg);

if (existsSync(exportPath)) {
  unlinkSync(exportPath);
  console.log(`Removed existing ${exportPkg}`);
}

const exportOutput = createWriteStream(exportPath);
const exportArchive = new ZipArchive({ zlib: { level: 9 } });

const exportClosed = new Promise((resolve) => {
  exportOutput.on("close", () => {
    const kb = (exportArchive.pointer() / 1024).toFixed(1);
    console.log(`Created pkg/${exportPkg} (${kb} KB)`);
    resolve();
  });
});

exportArchive.on("error", (err) => {
  throw err;
});

exportArchive.pipe(exportOutput);
exportArchive.file(zipPath, { name: zxpName });
exportArchive.file(path.join(rootDir, "pkg", "ReadMe.txt"), { name: "ReadMe.txt" });

await exportArchive.finalize();
await exportClosed;



