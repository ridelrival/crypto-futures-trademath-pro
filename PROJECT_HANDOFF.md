# Crypto TradeMath — Project Handoff

Last updated: **2026-08-10 (Asia/Jayapura)**

This document is the continuity reference for moving Crypto TradeMath to another ChatGPT/Codex account or a new development session. Read it before changing the project.

## 1. Current release

- Product name: **Crypto TradeMath**
- Public PWA: <https://ridelrival.github.io/crypto-futures-trademath-pro/?v=57>
- GitHub repository: <https://github.com/ridelrival/crypto-futures-trademath-pro>
- Current release marker: **v57**
- Current application commit: `f1579bde029158948f490e734461f0711850b57e`
- Commit page: <https://github.com/ridelrival/crypto-futures-trademath-pro/commit/f1579bde029158948f490e734461f0711850b57e>
- Latest successful Android workflow: <https://github.com/ridelrival/crypto-futures-trademath-pro/actions/runs/31321610974>
- Latest verified test result: **26/26 tests passing**

Local working source on the original Windows account:

```text
C:\Users\Axioo Pongo\Documents\Codex\2026-07-23\bag\outputs\crypto-futures-trademath
```

The local folder is the active editable working copy. GitHub `main` is the published source of record and can be cloned when the local folder is unavailable.

## 2. Product scope

Crypto TradeMath is an offline-first trade-planning calculator for **one isolated-margin linear perpetual position** settled in USDT or USDC.

It is not an exchange, signal service, portfolio-margin engine, or multi-position account simulator.

Supported product constraints:

- isolated margin only;
- one linear perpetual position per calculation;
- LONG or SHORT inferred from Entry and Stop Loss;
- risk entered as a percentage of balance or an exact quote-currency amount;
- multiple take-profit targets;
- exchange fees, execution assumptions, slippage, funding, contract specifications, quantity rounding, liquidation estimates, and leverage safety checks;
- English, Indonesian, and Japanese;
- Dark, Light, and Pitch Black themes;
- PWA on GitHub Pages and Android offline bundle through Capacitor.

Do not present estimated liquidation as the exchange's authoritative liquidation price. The exchange mark-price liquidation must always be verified before placing a real order.

## 3. Standing user requirements

These are project-level requirements unless the user explicitly replaces them:

1. **Do not change calculation mathematics unless explicitly requested.** UI-only requests must remain UI-only.
2. Preserve the isolated-margin linear-perpetual scope and its visible warning.
3. Keep all numeric trade inputs manually typed without number-spinner arrows.
4. Accept international numeric formats and preserve decimal values below 1,000.
5. Keep the Ticker field free text with no forced suggestion list or ticker whitelist.
6. Infer LONG or SHORT from Entry and Stop Loss rather than requiring a direction input.
7. Keep safety checks active even when Advanced execution costs are OFF.
8. Preserve the user's expanded/collapsed panel choices across restarts where persistence is already implemented.
9. Keep mobile text inside its cards without clipping or overflowing.
10. Test smartphone, tablet/iPad, and desktop layouts. Tablet landscape follows the desktop workspace; tablet portrait keeps Parameters left and the three planning panels right where the two-column layout fits.
11. Portrait choice dialogs must remain centered and height-bounded. Short lists must not stretch downward, and long lists must scroll internally.
12. Closing Funding Plan, Specification Mode, or another themed choice dialog must preserve the exact page scroll position.
13. After an approved published change, update the PWA and allow GitHub Actions to build a fresh APK artifact.
14. Do **not** download, install, or sideload the APK unless the user explicitly requests it.
15. When the user asks for confirmation before execution, explain the exact scope and wait for confirmation before editing.

## 4. Calculation and safety invariants

The calculation implementation lives primarily in `calculator.js`. Preserve the existing tested behavior.

Core model:

```text
Risk budget =
  account balance × risk percentage
  OR exact quote-currency risk

Net loss per coin at stop =
  absolute(entry − modeled stop exit)
  + entry fee per coin
  + stop fee per coin
  + enabled entry/stop slippage
  + enabled payable funding

Raw coin quantity = risk budget ÷ net loss per coin at stop
Executable quantity = raw quantity rounded down by verified exchange rules

Opening cost = initial margin + estimated entry fee
Amount cross-check = (opening cost − estimated entry fee) × leverage
```

Valid isolated price ordering:

```text
LONG:  liquidation < Stop Loss < Entry
SHORT: Entry < Stop Loss < liquidation
```

Important behavior:

- Exchange rounding may make displayed net risk slightly lower than the requested risk amount.
- A plan is blocked when estimated liquidation occurs before Stop Loss.
- A plan is blocked when entered leverage exceeds the estimated safe ceiling or verified instrument maximum.
- Advanced OFF excludes optional slippage, funding, and exchange-rounding rules but does not disable liquidation, leverage, margin, direction, risk-threshold, or fee checks.
- Entry defaults to Maker/Post-Only.
- Target defaults to Reduce-Only Limit with a maker estimate.
- Stop defaults to Stop-Market with Mark Price trigger and taker execution.
- Stop-Limit uses its separate limit price and retains the non-fill warning.

## 5. Exchange and instrument behavior

Built-in exchange order:

1. Binance
2. Bybit
3. OKX
4. Hyperliquid
5. Aster
6. Gate.io
7. Bitget
8. MEXC
9. Lighter
10. Custom/Manual

Relevant files:

- `exchange-presets.js` — venue names, fees, settlement, and links;
- `contract-specs.js` — public contract/instrument adapters, normalization, and cache behavior;
- `calculator.js` — financial calculations and validations;
- `app.js` — UI state, fetching, rendering, themed choice dialogs, persistence, and PWA behavior.

Settlement mapping:

- Hyperliquid and Lighter use USDC.
- Other built-in presets use USDT unless their preset is intentionally changed.
- Settlement displayed in Results follows the selected exchange and is not an independent trade input.

Public instrument data never requires an API key. If a venue is unavailable because of CORS, regional restrictions, or connectivity, use a previously verified cached specification when possible; otherwise show an explicit unverified state. Never invent contract size, step size, tick size, or leverage metadata.

## 6. UI and responsive-layout invariants

Current primary layout:

- Exchange & Execution appears before Parameters in reading order.
- Parameters is the main trade-plan input panel.
- Exit Plan and Advanced retain their own collapsible panels.
- Core Trade Analysis Results is permanently open.
- Advanced Results is a separate collapsible panel and remembers its previous state.

Current v57 mobile-dialog behavior:

- all themed select menus are rendered by `#themedSelectDialog`, not by native browser pickers;
- portrait menus are vertically centered using the visual viewport;
- menu height is capped at 72% of portrait viewport height and 620 px;
- long lists scroll internally;
- open/close animations use eased scale, translation, and opacity transitions;
- background page scrolling is locked while a dialog is open;
- scroll restoration temporarily disables smooth page scrolling to prevent the visible jump to the top;
- Funding and Specification menus were verified to return to the exact pre-dialog scroll position.

Do not reintroduce native white select menus, checkmarks, or visible down-arrow decorations inside ordinary fields. Only primary panel expand/collapse arrows should remain visible.

## 7. Persistent state

Panel state keys are defined near the top of `app.js`:

```text
trademath-exchange-panel-open
trademath-exit-plan-panel-open
trademath-advanced-results-panel-open
```

Advanced ON/OFF, theme, language, history, and other user preferences also use browser-local storage. Review existing keys before adding a new one. Do not rename existing keys casually because that resets user preferences.

Trade history is stored locally in the browser. It is not automatically written into the separate journal repository. The user currently copies completed trades into the journal manually.

Journal references:

- <https://github.com/ridelrival/crypto-journal-data>
- <https://crypto-trade-journalzipzip--ridelrival98.replit.app/>

## 8. File map

```text
index.html                       Application structure and metadata
styles.css                      Themes, responsive layout, dialogs, safe areas
app.js                          UI behavior, state, rendering, PWA integration
calculator.js                   Calculation and validation engine
contract-specs.js               Public exchange instrument adapters
exchange-presets.js             Venue and fee presets
i18n.js                         English, Indonesian, Japanese dictionaries
manifest.webmanifest            PWA manifest
sw.js                           Service worker and offline cache
capacitor.config.json           Android/Capacitor configuration
tests/*.test.cjs                Calculation and exchange-parser tests
scripts/check-project.cjs       Structural and regression checks
scripts/prepare-mobile.mjs      Creates the offline `www` bundle
scripts/configure-android.mjs   Android configuration adjustments
.github/workflows/build-android-apk.yml
                                 Tests and builds the debug-signed APK artifact
```

The generated `www` directory is an output of `scripts/prepare-mobile.mjs`; source edits belong in the root files first.

## 9. Local verification

From the project directory:

```text
npm test
npm run check
npm run mobile:prepare
```

Expected baseline:

```text
26 tests
26 passed
0 failed
Project structure and GitHub Pages paths are valid.
Offline web bundle prepared successfully.
```

Serve the project over HTTP for interactive PWA testing. The original local preview used:

```text
http://127.0.0.1:8765/
```

Required visual checks after responsive or dialog changes:

- portrait smartphone;
- portrait tablet/iPad;
- tablet/iPad landscape;
- desktop Windows/macOS width;
- Dark, Light, and Pitch Black;
- Exchange long list;
- short execution lists;
- Funding Plan and Specification Mode dismissal;
- page position before and after closing a popup;
- no horizontal overflow, clipped card text, or input-focus zoom.

## 10. PWA release procedure

Every published runtime change must use a new synchronized cache marker. For example, moving from v57 to v58 requires updating all of these:

```text
index.html  -> styles.css?v=58 and app.js?v=58
app.js      -> iOS theme-reload query marker v=58
sw.js       -> CACHE_NAME crypto-trademath-v58
sw.js       -> styles.css?v=58 and app.js?v=58 in APP_SHELL
```

Then:

1. Run all three local verification commands.
2. Test the changed interaction locally.
3. Commit the complete coherent change to GitHub `main` in one commit when possible.
4. Wait for `pages-build-deployment` to succeed.
5. Wait for `Build Android APK` to succeed.
6. Open the public URL with the new `?v=` marker and verify the loaded CSS and `app.js` versions.
7. Confirm the workflow contains a non-expired `Crypto-Futures-TradeMath-Pro-APK` artifact.
8. Do not install the APK unless explicitly requested.

The GitHub Pages site deploys from `main` root. All application URLs are relative so the project works from the repository subpath.

## 11. Android build behavior

The workflow runs on changes to application, tests, assets, configuration, or relevant scripts. It:

1. checks out the source;
2. installs Node.js and Capacitor;
3. runs `npm test` and `npm run check`;
4. generates the Android project and offline web bundle;
5. builds a debug-signed APK;
6. stores the APK as a GitHub Actions artifact for 30 days.

The current artifact is for private sideload testing, not Play Store distribution. A Play Store release would require a separate release-signing, application-versioning, bundle, privacy, and store-listing workflow.

## 12. Security and data rules

- Never request or store exchange API keys, wallet seed phrases, private keys, passwords, or GitHub tokens in this project.
- Public exchange metadata requests must remain unauthenticated.
- Do not commit credentials, browser session data, or local ChatGPT account data.
- Treat the calculator as a planning aid, not financial advice or an exchange liquidation engine.

## 13. Known limitations

- Fee schedules can differ by tier, region, promotion, token discount, pair, and execution outcome. Presets are estimates and must link users to verification sources.
- Post-Only and Reduce-Only Limit orders are modeled as maker where configured, but real execution behavior remains exchange-dependent.
- Public browser requests can fail because of venue CORS or network rules.
- Liquidation calculations cannot reproduce every exchange risk tier, added margin, portfolio margin, account equity interaction, or rapidly changing maintenance rule.
- PWA service-worker caches may require opening the newest `?v=` URL once after deployment.
- iOS standalone PWA status-bar theme changes may require the existing controlled reload path; preserve saved plan state when that path runs.

## 14. Start-of-session checklist for another account

1. Open this file completely.
2. Confirm that the local folder or cloned repository is on the latest GitHub `main` commit.
3. Open `package.json`, `calculator.js`, `app.js`, `styles.css`, and `scripts/check-project.cjs` as relevant to the requested change.
4. Run the baseline tests before editing when the requested work affects calculations, dialog behavior, or deployment.
5. Restate whether the request is UI-only or changes mathematics.
6. If the user requested confirmation, wait for approval.
7. Preserve unrelated user changes.
8. After implementation, verify locally before publishing.

## 15. Suggested prompt for a new ChatGPT/Codex account

```text
Continue development of Crypto TradeMath.

First read PROJECT_HANDOFF.md completely, inspect the current repository state,
and report the current release, test baseline, and files relevant to my next
request. Treat GitHub main and the handoff document as the continuity source.

Do not change financial calculations for a UI-only request. Preserve all
isolated-margin safety checks, responsive layouts, persisted panel states,
international number parsing, three languages, and three themes. Run tests,
project checks, mobile bundle preparation, and visual verification before
publishing. Update the PWA cache version consistently. Let GitHub Actions build
the APK after approved published changes, but do not download or sideload it
unless I explicitly ask.
```

