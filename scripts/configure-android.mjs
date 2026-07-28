import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const androidRoot = join(root, "android");
const manifestPath = join(
  androidRoot,
  "app",
  "src",
  "main",
  "AndroidManifest.xml",
);
const variablesPath = join(androidRoot, "variables.gradle");
const appBuildPath = join(androidRoot, "app", "build.gradle");
const iconSource = join(root, "assets", "icons", "icon-maskable-512.png");
const iconDestination = join(
  androidRoot,
  "app",
  "src",
  "main",
  "res",
  "drawable-nodpi",
  "trademath_app_icon.png",
);

for (const path of [manifestPath, variablesPath, appBuildPath, iconSource]) {
  if (!existsSync(path)) {
    throw new Error(`Cannot configure Android project: missing ${path}`);
  }
}

mkdirSync(dirname(iconDestination), { recursive: true });
copyFileSync(iconSource, iconDestination);

let manifest = readFileSync(manifestPath, "utf8");
manifest = manifest
  .replace(
    /android:icon="[^"]+"/,
    'android:icon="@drawable/trademath_app_icon"',
  )
  .replace(
    /android:roundIcon="[^"]+"/,
    'android:roundIcon="@drawable/trademath_app_icon"',
  );

if (!manifest.includes("android:usesCleartextTraffic=")) {
  manifest = manifest.replace(
    /<application\b/,
    '<application android:usesCleartextTraffic="false"',
  );
}
if (!manifest.includes("android.permission.INTERNET")) {
  manifest = manifest.replace(
    /<manifest([^>]*)>/,
    '<manifest$1>\n\n    <uses-permission android:name="android.permission.INTERNET" />',
  );
}
writeFileSync(manifestPath, manifest);

let variables = readFileSync(variablesPath, "utf8");
variables = variables.replace(
  /minSdkVersion\s*=\s*\d+/,
  "minSdkVersion = 26",
);
writeFileSync(variablesPath, variables);

let appBuild = readFileSync(appBuildPath, "utf8");
appBuild = appBuild
  .replace(/versionCode\s+\d+/, "versionCode 1")
  .replace(/versionName\s+"[^"]+"/, 'versionName "1.0.0"');
writeFileSync(appBuildPath, appBuild);

console.log("Configured Android 8+ app identity, icon, permissions, and version.");
