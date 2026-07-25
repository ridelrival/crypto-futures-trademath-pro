# Crypto Futures TradeMath

An offline-first PWA for planning one **linear USDT/USDC perpetual-futures position in isolated margin**. It supports English, Indonesian, and Japanese, plus Dark and Light themes.

## Important scope

- The calculator is **isolated-only**.
- Cross margin, portfolio margin, multiple open positions, manually added margin, and changing account-level risk tiers are not modeled.
- Liquidation and maximum safe leverage are estimates. A plan is blocked when liquidation is estimated to occur before the Stop Loss or when verified exchange leverage is exceeded. Always verify the exchange's mark-price liquidation before placing an order.
- No exchange API key, wallet key, or login is requested.

## Main behavior

- Trade inputs start empty; OKX and USDT are the defaults.
- LONG or SHORT is inferred automatically from Entry and Stop Loss.
- Risk can be entered as a percentage of balance or an exact quote-currency amount.
- International number formats such as `35,723`, `35.723`, `35,723.00`, and `35.723,00` are accepted.
- Gross risk, net risk, fees, potential profit, R:R, ROE, required margin, effective leverage, liquidation, and maximum safe leverage are shown separately.
- Multiple take-profit targets and allocation percentages are supported.
- Risk warnings begin at 5%; 10% and above is critical.
- History is stored locally and can be exported as JSON or CSV.

## Execution Costs & Exchange Rules

The switch beside the expand arrow is enabled by default and is saved in the browser.

### ON

The calculation includes:

- estimated slippage;
- funding when the position is expected to cross a funding time;
- exchange quantity and price rules;
- raw coin quantity, contract quantity when applicable, and rounded executable coin quantity.

Contract specifications can be loaded from an exchange's public API or entered manually. Public data is cached for six hours. If a symbol or exchange cannot be verified, the app does not invent a step size or contract multiplier: it keeps raw quantity and displays an unverified warning.

### OFF

The calculation excludes:

- slippage;
- funding;
- exchange step-size, tick-size, minimum-order, and contract-rounding rules.

Safety is **not** switched off. The calculator still checks:

- isolated liquidation price;
- liquidation before Stop Loss;
- maximum estimated safe leverage;
- verified instrument maximum leverage when public exchange data is available;
- required margin and available balance;
- effective leverage;
- maker/taker fees;
- trade direction and risk thresholds.

In short: **Advanced OFF means simplified execution costs, never disabled liquidation safety.**

## Order behavior

- Entry defaults to **Maker / Post-Only**, the first target defaults to **Maker / Post-Only**, and stop execution defaults to **Stop-Limit**.
- Entry, target, stop trigger, and stop-limit prices remain empty and must be entered manually for each trade plan.
- **Post-Only Maker entry or target:** slippage is forced to 0%.
- **Taker / Market entry or target:** the slippage estimate remains editable.
- **Stop-Market (recommended):** uses taker fee and an editable slippage estimate.
- **Stop-Limit:** reveals a limit-price input, forces stop slippage to 0%, and estimates loss using that limit price. A Stop-Limit order may not fill during a fast move, so the warning remains visible.

## Funding

Funding is disabled by default through the question **Will this position cross a funding time?**

- Choose **No** when the position is expected to close before funding.
- Choose **Yes** to enter the rate and number of intervals or request a public live rate where supported.
- A funding credit is shown in the result but is never used to increase position size.

## Calculation model

For a linear contract:

```text
Risk budget =
  account balance * risk %
  OR the exact quote-currency risk amount

Net loss per coin at stop =
  absolute(entry - modeled stop exit)
  + entry fee per coin
  + stop fee per coin
  + enabled entry/stop slippage
  + enabled payable funding

Raw coin quantity = risk budget / net loss per coin at stop
Executable quantity = raw quantity rounded down by verified exchange rules
```

This makes modeled net risk equal to the selected amount before exchange rounding, or slightly lower after rounding down. With Stop-Market, the modeled stop exit is the trigger price. With Stop-Limit, it is the entered limit price.

For a valid isolated plan, prices must remain strictly ordered:

```text
LONG:  liquidation < Stop Loss < Entry
SHORT: Entry < Stop Loss < liquidation
```

## Exchange presets and public specifications

Fee presets include Binance, Bybit, OKX, Gate.io, Bitget, MEXC, Hyperliquid, Aster, Lighter, and Custom/Manual. Fees vary by pair, tier, region, promotion, token discount, and execution method, so verify the displayed rate in the exchange account.

Automatic public contract-specification adapters are included for OKX, Binance, Bybit, Gate.io, Bitget, and MEXC. Unsupported or unavailable sources fall back to manual, explicitly unverified input.

## GitHub Pages

1. Upload the contents of this folder to the root of a GitHub repository.
2. Open **Settings > Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select the branch containing these files and `/ (root)`.
5. Save.

All application paths are relative, so the PWA works from a GitHub Pages project subfolder. GitHub Pages supplies the HTTPS connection required for installation and service-worker offline mode.

## Local verification

The project has no runtime dependencies. With Node.js installed:

```text
npm test
npm run check
```

Serve the folder over HTTP for a complete local PWA preview. Opening `index.html` directly still allows calculator testing, but browsers do not register service workers from `file://`.

This calculator is a planning aid, not financial advice or an exchange liquidation engine.
