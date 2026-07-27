const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const required = [
  "index.html",
  "styles.css",
  "app.js",
  "calculator.js",
  "contract-specs.js",
  "exchange-presets.js",
  "i18n.js",
  "manifest.webmanifest",
  "sw.js",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
  "assets/icons/icon-maskable-512.png",
];

for (const file of required) {
  const fullPath = path.join(root, file);
  if (!fs.existsSync(fullPath)) throw new Error(`Missing required file: ${file}`);
  if (fs.statSync(fullPath).size === 0) throw new Error(`Empty required file: ${file}`);
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.webmanifest"), "utf8"));
if (manifest.start_url !== "./" || manifest.scope !== "./") {
  throw new Error("Manifest must use relative GitHub Pages paths.");
}

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
for (const reference of [
  "./manifest.webmanifest",
  "./styles.css",
  "./contract-specs.js",
  "./app.js",
]) {
  if (!html.includes(reference)) throw new Error(`index.html is missing ${reference}`);
}
if (html.includes('type="number"')) {
  throw new Error("Numeric controls must use manually typed text inputs without spinner buttons.");
}
for (const id of ["balance", "riskValue", "leverage", "symbol", "entryPrice", "stopLoss", "tp1Price"]) {
  const emptyInput = new RegExp(`<input[^>]+id="${id}"[^>]+value=""`);
  if (!emptyInput.test(html)) throw new Error(`#${id} must start empty.`);
}
if (!/<option value="okx" selected>/.test(html)) {
  throw new Error("OKX must be the default exchange.");
}
for (const id of [
  "advancedToggle",
  "exchangeExecutionPanel",
  "stopTriggerSource",
  "stopLimitPrice",
  "fundingEnabled",
  "specMode",
  "quantityMode",
  "contractQuantityValue",
]) {
  if (!html.includes(`id="${id}"`)) throw new Error(`Required feature element #${id} is missing.`);
}
if (!/<details id="exchangeExecutionPanel" class="panel exchange-panel" open>/.test(html)) {
  throw new Error("Exchange & Execution must be expanded by default for new users.");
}
if (!/<option value="maker" data-i18n="makerPostOnly" selected>/.test(html)) {
  throw new Error("Post-Only Limit must be the default entry execution.");
}
if (!/<option value="maker" data-i18n="targetReduceOnlyLimit" selected>/.test(html)) {
  throw new Error("Reduce-Only Limit must be the default target execution.");
}
if (!/<option value="stop-market" data-i18n="stopMarketRecommended" selected>/.test(html)) {
  throw new Error("Stop-Market must be the default stop execution.");
}
if (!/<option value="mark" data-i18n="markPrice" selected>/.test(html)) {
  throw new Error("Mark Price must be the default stop trigger source.");
}
if (!/<label id="stopLimitField" class="field is-hidden">/.test(html)) {
  throw new Error("Stop-Limit price must be hidden while Stop-Market is the default.");
}
for (const key of ["isolatedOnly", "crossUnsupported", "advancedOffBody"]) {
  if (!html.includes(`data-i18n="${key}"`)) {
    throw new Error(`Required isolated/safety copy data-i18n="${key}" is missing.`);
  }
}

const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
if (!appSource.includes('const EXCHANGE_PANEL_KEY = "trademath-exchange-panel-open"')) {
  throw new Error("Exchange panel state must persist between sessions.");
}
const staticIds = [...appSource.matchAll(/\$\("([^"]+)"\)/g)].map((match) => match[1]);
for (const id of new Set(staticIds)) {
  if (!html.includes(`id="${id}"`)) throw new Error(`app.js references missing element #${id}`);
}

const i18nSource = fs.readFileSync(path.join(root, "i18n.js"), "utf8");
const inspectableI18nSource = i18nSource.replace(
  "window.TradeMathI18n = {",
  "window.__tradeMathDictionaries = dictionaries;\n  window.TradeMathI18n = {",
);
const sandbox = {
  window: {},
  localStorage: { getItem: () => null, setItem: () => {} },
  document: {},
  CustomEvent: function CustomEvent() {},
};
vm.createContext(sandbox);
vm.runInContext(inspectableI18nSource, sandbox);
if (sandbox.window.TradeMathI18n.languages.map((language) => language.code).join(",") !== "en,id,ja") {
  throw new Error("Only English, Indonesian, and Japanese may be offered.");
}
const dictionaries = sandbox.window.__tradeMathDictionaries;
for (const language of ["id", "ja"]) {
  const missing = Object.keys(dictionaries.en).filter((key) => !(key in dictionaries[language]));
  if (missing.length) {
    throw new Error(`${language} is missing translations: ${missing.join(", ")}`);
  }
}
const i18nKeys = [...html.matchAll(/data-i18n="([^"]+)"/g)].map((match) => match[1]);
for (const key of new Set(i18nKeys)) {
  if (sandbox.window.TradeMathI18n.t(key) === key) {
    throw new Error(`Missing English translation for data-i18n="${key}"`);
  }
}

const serviceWorker = fs.readFileSync(path.join(root, "sw.js"), "utf8");
for (const file of required.filter((name) => name !== "sw.js")) {
  if (["tests/", "scripts/"].some((prefix) => file.startsWith(prefix))) continue;
  if (!serviceWorker.includes(`./${file}`) && file !== "assets/icons/icon-source-enhanced.png") {
    throw new Error(`Service worker app shell is missing ${file}`);
  }
}

console.log("Project structure and GitHub Pages paths are valid.");
