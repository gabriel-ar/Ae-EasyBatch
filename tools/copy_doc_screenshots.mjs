import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "tests", "screenshots");
const dest = path.join(root, "docs", "assets");

if (!fs.existsSync(src)) {
  console.error(`No screenshots found at ${src}. Run the screenshot spec first.`);
  process.exit(1);
}

const files = fs.readdirSync(src).filter((f) => f.endsWith(".png"));
for (const f of files) {
  fs.copyFileSync(path.join(src, f), path.join(dest, f));
  console.log(`Copied ${f} -> docs/assets`);
}
console.log(`${files.length} screenshot(s) copied.`);
