import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const webDir = join(root, "www");
const bundledPaths = [
  "index.html",
  "styles.css",
  "app.js",
  "calculator.js",
  "contract-specs.js",
  "exchange-max-leverage.js",
  "exchange-fee-rates.js",
  "exchange-presets.js",
  "i18n.js",
  "manifest.webmanifest",
  "sw.js",
  "assets",
];

rmSync(webDir, { recursive: true, force: true });
mkdirSync(webDir, { recursive: true });

for (const relativePath of bundledPaths) {
  const source = join(root, relativePath);
  const destination = join(webDir, relativePath);

  if (!existsSync(source)) {
    throw new Error(`Cannot prepare Android bundle: missing ${relativePath}`);
  }

  mkdirSync(dirname(destination), { recursive: true });
  if (statSync(source).isDirectory()) {
    cpSync(source, destination, { recursive: true });
  } else {
    copyFileSync(source, destination);
  }
}

console.log(`Prepared offline web bundle in ${webDir}`);
