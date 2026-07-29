# Crypto TradeMath

An offline-first PWA for planning one **linear USDT/USDC perpetual-futures position in isolated margin**. It supports English, Indonesian, and Japanese, plus Dark and Light themes.

## Important scope

- The calculator is **isolated-only**.
- Cross margin, portfolio margin, multiple open positions, manually added margin, and changing account-level risk tiers are not modeled.
- Liquidation and maximum safe leverage are estimates. A plan is blocked when liquidation is estimated to occur before the Stop Loss or when verified exchange leverage is exceeded. Always verify the exchange's mark-price liquidation before placing an order.
- No exchange API key, wallet key, or login is requested.

## Main behavior

- Trade inputs, including Coin / Instrument, start empty. OKX is the default exchange and automatically uses USDT settlement.
- LONG or SHORT is inferred automatically from Entry and Stop Loss.
- Risk can be entered as a percentage of balance or an exact quote-currency amount.
- A single dot is always decimal: `70.345` means seventy point three-four-five, `0.7234` remains below one, and `1.000` means one. Use `1,000` or `1000` for one thousand. Mixed formats such as `35,723.00` and `35.723,00` are also accepted.
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

The main calculator uses a generic COIN label. Coin / Instrument is a free-text field with no built-in suggestion list or ticker whitelist, so any ticker can be entered directly in Parameters. The calculator automatically combines it with the exchange settlement and requests public contract specifications after typing; there is no manual load button. Coin / Instrument is cleared on every reload and reset. Hyperliquid and Lighter use USDC; the other built-in presets use USDT. The Settlement result is read-only and follows the same automatic mapping. Public data is cached for six hours and a previously verified cache can still be used with a stale/offline warning when the live request fails. If the field is blank or an instrument cannot be verified, the app does not invent a step size or contract multiplier: it keeps raw quantity and displays an unverified notice without blocking the main calculation.

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

- Entry defaults to **Post-Only Limit**, targets default to **Reduce-Only Limit** with a maker-fee estimate, and stop execution defaults to **Stop-Market** triggered by **Mark Price**.
- Entry, target, and Stop Loss prices remain empty and must be entered manually for each trade plan. The stop-limit price appears only when Stop-Limit is selected.
- **Post-Only entry:** slippage is forced to 0% and the order is modeled with maker fee.
- **Reduce-Only Limit target:** modeled with maker fee and 0% slippage; a real limit fill can still be taker if it executes immediately.
- **Taker / Market entry or target:** the slippage estimate remains editable.
- **Stop-Market (recommended):** uses taker fee and an editable slippage estimate. Mark Price is the default trigger source.
- **Stop-Limit:** reveals a limit-price input, forces stop slippage to 0%, and estimates loss using that limit price. A Stop-Limit order may not fill during a fast move, so the warning remains visible.
- **Reduce-Only** prevents a target order from increasing or reversing the position; it does not by itself guarantee maker execution.

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

Opening cost = initial margin + estimated entry fee
Amount cross-check = (opening cost - estimated entry fee) * leverage
```

This makes modeled net risk equal to the selected amount before exchange rounding, or slightly lower after rounding down. With Stop-Market, the modeled stop exit is the trigger price. With Stop-Limit, it is the entered limit price.

For a valid isolated plan, prices must remain strictly ordered:

```text
LONG:  liquidation < Stop Loss < Entry
SHORT: Entry < Stop Loss < liquidation
```

## Exchange presets and public specifications

The single Exchange selector is ordered Binance, Bybit, OKX, Hyperliquid, Aster, Gate.io, Bitget, MEXC, Lighter, and Custom/Manual. The Exchange & Execution panel appears above Parameters and remembers its expanded or collapsed state. Fees vary by pair, tier, region, promotion, token discount, and execution method, so verify the displayed rate in the exchange account.

Automatic public contract-specification adapters are included for OKX, Binance, Bybit, Gate.io, Bitget, MEXC, Hyperliquid, Aster, and Lighter. Gate.io and MEXC each have primary and alternative public endpoints. A venue may still block direct browser requests through CORS or a regional network rule; in that case the calculator uses a verified cached copy when available, otherwise it falls back to manual, explicitly unverified input.

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
