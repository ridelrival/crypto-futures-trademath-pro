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
for (const id of [
  "balance",
  "riskValue",
  "leverage",
  "entryPrice",
  "stopLoss",
  "tp1Price",
  "instrumentSymbol",
]) {
  const emptyInput = new RegExp(`<input[^>]+id="${id}"[^>]+value=""`);
  if (!emptyInput.test(html)) throw new Error(`#${id} must start empty.`);
}
if (!/<input id="symbol" name="symbol" type="hidden" value="COIN"/.test(html)) {
  throw new Error("The main calculator must use the hidden generic COIN identity.");
}
if (html.includes('data-i18n="symbol"')) {
  throw new Error("The visible Symbol parameter must be removed.");
}
if (!/<option value="okx" selected>/.test(html)) {
  throw new Error("OKX must be the default exchange.");
}
for (const id of [
  "advancedToggle",
  "exchangeExecutionPanel",
  "exitPlanPanel",
  "stopTriggerSource",
  "stopLimitPrice",
  "fundingEnabled",
  "specMode",
  "quantityMode",
  "contractQuantityValue",
  "instrumentSymbol",
  "resultsPanel",
  "advancedResultsPanel",
  "quoteCurrency",
  "settingsButton",
  "settingsDialog",
  "settingsHistoryAction",
  "settingsLanguageAction",
  "settingsThemeAction",
  "settingsRefreshAction",
  "themedSelectDialog",
  "themedSelectTitle",
  "themedSelectList",
]) {
  if (!html.includes(`id="${id}"`)) throw new Error(`Required feature element #${id} is missing.`);
}
if (!/<details id="exchangeExecutionPanel" class="panel exchange-panel" open>/.test(html)) {
  throw new Error("Exchange & Execution must be expanded by default for new users.");
}
if (!/<details id="exitPlanPanel" class="panel targets-panel" open>/.test(html)) {
  throw new Error("Exit plan must be expanded by default for new users.");
}
if (html.includes('id="allocationTotal"')) {
  throw new Error("The redundant total-allocation badge must be replaced by the Exit plan arrow.");
}
if (!/<section id="resultsPanel" class="results-panel" aria-labelledby="resultsHeading">/.test(html)) {
  throw new Error("Results must be a permanently open core-results section.");
}
const resultsPanelMarkup = html.slice(
  html.indexOf('id="resultsPanel"'),
  html.indexOf('<details id="advancedResultsPanel" class="result-details"'),
);
if (resultsPanelMarkup.includes("summary-arrow") || /<summary\b/.test(resultsPanelMarkup)) {
  throw new Error("Core Results must not expose expand/collapse controls.");
}
if ((html.match(/id="tp1Price"/g) || []).length !== 1) {
  throw new Error("TP1 price must appear exactly once in Parameters.");
}
if (!/<input id="tp1Allocation" name="tp1Allocation" type="hidden" value="100"/.test(html)) {
  throw new Error("TP1 allocation must be derived automatically from TP2 and TP3.");
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
if (!appSource.includes('const EXIT_PLAN_PANEL_KEY = "trademath-exit-plan-panel-open"')) {
  throw new Error("Exit plan state must persist between sessions.");
}
if (appSource.includes("CORE_RESULTS_PANEL_KEY") || appSource.includes("restoreResultsPanelState")) {
  throw new Error("Core Results must remain permanently open rather than restoring a collapsed state.");
}
if (
  !appSource.includes(
    'const ADVANCED_RESULTS_PANEL_KEY = "trademath-advanced-results-panel-open"',
  ) ||
  !appSource.includes("restoreAdvancedResultsPanelState") ||
  !appSource.includes("persistAdvancedResultsPanelState") ||
  !appSource.includes('window.addEventListener("pagehide"')
) {
  throw new Error("Advanced Results panel state must persist between sessions.");
}
if (!html.includes('data-theme-option="pitch-black"')) {
  throw new Error("Pitch Black must be available in the theme selector.");
}
if (!appSource.includes('["dark", "light", "pitch-black"]')) {
  throw new Error("Theme logic must support Dark, Light, and Pitch Black.");
}
const stylesSource = fs.readFileSync(path.join(root, "styles.css"), "utf8");
if (!html.includes('<meta name="color-scheme" content="dark light" />')) {
  throw new Error("The document must advertise Dark and Light native control color schemes.");
}
for (const meta of [
  '<meta name="mobile-web-app-capable" content="yes" />',
  '<meta name="apple-mobile-web-app-capable" content="yes" />',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
]) {
  if (!html.includes(meta)) throw new Error(`Missing mobile system-bar metadata: ${meta}`);
}
if (
  !html.includes('localStorage.getItem("trademath-theme")') ||
  !html.includes('document.documentElement.style.backgroundColor = color') ||
  !html.includes('theme === "light" ? "default" : "black-translucent"')
) {
  throw new Error("The saved theme must be applied before the first mobile paint.");
}
if (
  !appSource.includes("function iosStandaloneContext()") ||
  !appSource.includes('matchMedia?.("(display-mode: fullscreen)")') ||
  !appSource.includes("context.major === null || (context.major >= 18 && context.major <= 26)") ||
  !appSource.includes('captureRefreshState("theme")') ||
  !appSource.includes("window.location.replace(url.toString())")
) {
  throw new Error("iOS 18-26 standalone PWAs must preserve the plan and reload after theme changes.");
}
if (
  !stylesSource.includes("--app-safe-top:") ||
  !stylesSource.includes("--safe-area-inset-top") ||
  !stylesSource.includes("env(safe-area-inset-top, 0px)") ||
  !stylesSource.includes("calc(9px + var(--app-safe-top))")
) {
  throw new Error("Mobile headers must respect native and browser safe-area insets.");
}
if (
  !stylesSource.includes("translateY(calc(-100% - var(--app-safe-top) - 16px))") ||
  !stylesSource.includes("pointer-events: none") ||
  !stylesSource.includes(".skip-link:focus")
) {
  throw new Error("The skip link must remain hidden above every mobile safe area until focused.");
}
if (
  !stylesSource.includes("body::before") ||
  !stylesSource.includes("height: var(--app-safe-top)") ||
  !stylesSource.includes("background: var(--system-bar-bg)")
) {
  throw new Error("The mobile safe-area backdrop must follow theme changes at runtime.");
}
if (
  !stylesSource.includes("select option,") ||
  !stylesSource.includes("color-scheme: dark;") ||
  !stylesSource.includes(':root[data-theme="light"] select')
) {
  throw new Error("Native select menus must follow the active application theme.");
}
if (
  !appSource.includes("function setupThemedSelects()") ||
  !appSource.includes("function openThemedSelect(select)") ||
  !appSource.includes("function viewportMetrics()") ||
  !appSource.includes("viewport.height * 0.72") ||
  !appSource.includes("select.hidden = true") ||
  !stylesSource.includes(".themed-select-dialog") ||
  !stylesSource.includes("select.native-select-control")
) {
  throw new Error("Themed select dialogs must remain centered and bounded on portrait viewports.");
}
if (
  !stylesSource.includes("#historyButton,") ||
  !stylesSource.includes(".settings-button {\n    display: inline-flex;")
) {
  throw new Error("Mobile header actions must be grouped inside the Settings button.");
}
if (
  !appSource.includes('const SETTINGS_CHILD_DIALOG_IDS = ["historyDialog", "languageDialog", "themeDialog"]') ||
  !appSource.includes("function setupInputModality()") ||
  !appSource.includes("function clearPointerFocus()") ||
  !appSource.includes("function lockDialogScroll()") ||
  !appSource.includes("function syncDialogLayers()") ||
  !appSource.includes("function closeSettingsStack()") ||
  !appSource.includes('dialog.addEventListener("close", syncDialogLayers)')
) {
  throw new Error("Settings must retain layered close, touch-focus, and scroll-lock behavior.");
}
if (
  !stylesSource.includes("body.dialog-stack-open") ||
  !stylesSource.includes("html.dialog-scroll-restoring") ||
  !stylesSource.includes(".modal.dialog-covered") ||
  !stylesSource.includes("overscroll-behavior: contain") ||
  !appSource.includes("function restoreDialogScroll()") ||
  !appSource.includes('behavior: "auto"') ||
  !stylesSource.includes(".themed-select-dialog.is-closing")
) {
  throw new Error("Dialog layers must preserve page position and animate smoothly when dismissed.");
}
if (!stylesSource.includes(':root[data-theme="pitch-black"]') || !stylesSource.includes('--bg: #000000')) {
  throw new Error("Pitch Black must use a pure black application background.");
}
if (
  !stylesSource.includes(
    '@media (orientation: landscape) and (min-width: 761px) and (max-width: 1366px)',
  ) ||
  !stylesSource.includes('.input-parameters-stack {\n    grid-column: 1;') ||
  !stylesSource.includes('.input-primary-stack {\n    grid-column: 2;')
) {
  throw new Error("Tablet landscape must place Parameters left and the primary panels right.");
}
if (!appSource.includes('const baseCoin = "COIN"')) {
  throw new Error("Rendered quantity must use the generic COIN label.");
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

const capacitorConfig = JSON.parse(
  fs.readFileSync(path.join(root, "capacitor.config.json"), "utf8"),
);
if (
  capacitorConfig.appId !== "com.ridelrival.cryptofuturestrademathpro" ||
  capacitorConfig.webDir !== "www"
) {
  throw new Error("Capacitor app identity or offline web directory is invalid.");
}
if (
  capacitorConfig.plugins?.SystemBars?.insetsHandling !== "css" ||
  capacitorConfig.plugins?.SystemBars?.style !== "DARK" ||
  !appSource.includes("function syncSystemBars(theme)") ||
  !appSource.includes('registerPlugin?.("SystemBars")')
) {
  throw new Error("Capacitor system bars must follow the active theme and safe areas.");
}
if (!appSource.includes("window.Capacitor?.isNativePlatform?.()")) {
  throw new Error("Native Android builds must not register the browser PWA installer.");
}
for (const file of [
  "scripts/prepare-mobile.mjs",
  "scripts/configure-android.mjs",
  ".github/workflows/build-android-apk.yml",
]) {
  if (!fs.existsSync(path.join(root, file))) {
    throw new Error(`Missing Android build file: ${file}`);
  }
}

console.log("Project structure and GitHub Pages paths are valid.");
