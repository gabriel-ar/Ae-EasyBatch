import { createWriteStream, existsSync, unlinkSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import readline from "node:readline";

const require = createRequire(import.meta.url);
const { ZipArchive } = require("archiver");
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

// Certificate configuration
const CERT_COUNTRY = "US";
const CERT_STATE = "FL";
const CERT_ORG = "EasyBatch";
const CERT_COMMON_NAME = "EasyBatch";

const pkg = require("../package.json");
const zxpSignExe = path.join(__dirname, "ZXPSignCmd.exe");
const certPath = path.join(rootDir, "pkg", "EasyBatch.p12");
const distDir = path.join(rootDir, "dist");
const exportsDir = path.join(rootDir, "pkg", "exports");
const zxpName = `${pkg.name}_v${pkg.version}.zxp`;
const exportPkg = `${pkg.name}_v${pkg.version}.zip`;
const zxpPath = path.join(exportsDir, zxpName);

// Get password from command line or prompt user
async function getPassword() {
  const argPassword = process.argv[2];
  
  if (argPassword) {
    console.log("Using password from command-line argument");
    return argPassword;
  }

  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question("Enter certificate password: ", (password) => {
      rl.close();
      resolve(password);
    });
  });
}

// Create self-signed certificate
function createCertificate(password) {
  if (existsSync(certPath)) {
    console.log(`Certificate already exists at ${certPath}`);
    return;
  }

  console.log("Creating self-signed certificate...");
  const cmd = `"${zxpSignExe}" -selfSignedCert "${CERT_COUNTRY}" "${CERT_STATE}" "${CERT_ORG}" "${CERT_COMMON_NAME}" "${password}" "${certPath}"`;
  
  try {
    execSync(cmd, { stdio: "inherit" });
    console.log(`Certificate created at ${certPath}\n`);
  } catch (error) {
    console.error("Failed to create certificate:", error.message);
    process.exit(1);
  }
}

// Create signed ZXP
function createSignedZxp(password) {
  if (!existsSync(exportsDir)) {
    mkdirSync(exportsDir, { recursive: true });
    console.log(`Created exports directory at ${exportsDir}`);
  }

  if (existsSync(zxpPath)) {
    unlinkSync(zxpPath);
    console.log(`Removed existing ${zxpName}`);
  }

  console.log("Creating signed ZXP package...");
  const cmd = `"${zxpSignExe}" -sign "${distDir}" "${zxpPath}" "${certPath}" "${password}"`;
  
  try {
    execSync(cmd, { stdio: "inherit" });
    console.log(`Signed ZXP created at ${zxpPath}\n`);
  } catch (error) {
    console.error("Failed to create signed ZXP:", error.message);
    process.exit(1);
  }
}

// Create distributable ZIP with ZXP and ReadMe
async function createDistributableZip() {
  const exportPath = path.join(exportsDir, exportPkg);

  if (existsSync(exportPath)) {
    unlinkSync(exportPath);
    console.log(`Removed existing ${exportPkg}`);
  }

  console.log("Creating distributable ZIP package...");
  const exportOutput = createWriteStream(exportPath);
  const exportArchive = new ZipArchive({ zlib: { level: 9 } });

  const exportClosed = new Promise((resolve, reject) => {
    exportOutput.on("close", () => {
      const kb = (exportArchive.pointer() / 1024).toFixed(1);
      console.log(`Created pkg/exports/${exportPkg} (${kb} KB)`);
      resolve();
    });
    
    exportOutput.on("error", reject);
  });

  exportArchive.on("error", (err) => {
    throw err;
  });

  exportArchive.pipe(exportOutput);
  exportArchive.file(zxpPath, { name: zxpName });
  exportArchive.file(path.join(rootDir, "pkg", "ReadMe.txt"), { name: "ReadMe.txt" });
  const manifestPath = path.join(rootDir, "pkg", "EasyBatch.manifest");
  const manifest = readFileSync(manifestPath, "utf8").replace(/__version__/g, pkg.version);
 // exportArchive.append(manifest, { name: ".manifest" });

  await exportArchive.finalize();
  await exportClosed;
}

// Main execution
async function main() {
  try {
    const password = await getPassword();
    
    if (!password) {
      console.error("Password cannot be empty");
      process.exit(1);
    }

    createCertificate(password);
    createSignedZxp(password);
    await createDistributableZip();
    
    console.log("\n✓ All packaging steps completed successfully!");
  } catch (error) {
    console.error("Error during packaging:", error);
    process.exit(1);
  }
}

main();
