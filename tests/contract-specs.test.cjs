const test = require("node:test");
const assert = require("node:assert/strict");
const { parsers } = require("../contract-specs.js");

const context = { exchangeId: "okx", base: "BTC", quote: "USDT" };

test("parses OKX contract-denominated instrument specifications", () => {
  const specs = parsers.okx(context, {
    data: [
      {
        state: "live",
        ctVal: "0.01",
        ctMult: "1",
        lotSz: "0.01",
        minSz: "0.01",
        tickSz: "0.1",
        lever: "100",
      },
    ],
  });
  assert.equal(specs.quantityMode, "contracts");
  assert.equal(specs.contractSize, 0.01);
  assert.equal(specs.quantityStep, 0.01);
  assert.equal(specs.minimumQuantity, 0.01);
  assert.equal(specs.priceTick, 0.1);
});

test("parses Binance base-coin quantity filters", () => {
  const specs = parsers.binance(
    { exchangeId: "binance", base: "BTC", quote: "USDT" },
    {
      symbols: [
        {
          symbol: "BTCUSDT",
          status: "TRADING",
          filters: [
            { filterType: "PRICE_FILTER", tickSize: "0.10" },
            { filterType: "LOT_SIZE", stepSize: "0.001", minQty: "0.001" },
            { filterType: "MIN_NOTIONAL", notional: "5" },
          ],
        },
      ],
    },
  );
  assert.equal(specs.quantityMode, "base");
  assert.equal(specs.quantityStep, 0.001);
  assert.equal(specs.minimumNotional, 5);
});

test("parses Gate and MEXC contract multipliers and maintenance rates", () => {
  const gate = parsers.gate(
    { exchangeId: "gate", base: "BTC", quote: "USDT" },
    {
      status: "trading",
      quanto_multiplier: "0.0001",
      enable_decimal: false,
      order_price_round: "0.1",
      order_size_min: "1",
      maintenance_rate: "0.005",
      leverage_max: "100",
    },
  );
  assert.equal(gate.contractSize, 0.0001);
  assert.equal(gate.maintenanceMargin, 0.5);

  const mexc = parsers.mexc(
    { exchangeId: "mexc", base: "BTC", quote: "USDT" },
    {
      data: [
        {
          state: 0,
          contractSize: 0.0001,
          volUnit: 1,
          priceUnit: 0.5,
          minVol: 1,
          maintenanceMarginRate: 0.004,
          maxLeverage: 125,
        },
      ],
    },
  );
  assert.equal(mexc.contractSize, 0.0001);
  assert.equal(mexc.priceTick, 0.5);
  assert.equal(mexc.maintenanceMargin, 0.4);
});

test("parses Aster Binance-style linear quantity filters", () => {
  const specs = parsers.aster(
    { exchangeId: "aster", base: "ETH", quote: "USDT" },
    {
      symbols: [
        {
          symbol: "ETHUSDT",
          status: "TRADING",
          filters: [
            { filterType: "PRICE_FILTER", tickSize: "0.01" },
            { filterType: "LOT_SIZE", stepSize: "0.001", minQty: "0.001" },
            { filterType: "MIN_NOTIONAL", notional: "5" },
          ],
        },
      ],
    },
  );
  assert.equal(specs.quantityMode, "base");
  assert.equal(specs.quantityStep, 0.001);
  assert.equal(specs.priceTick, 0.01);
  assert.equal(specs.minimumNotional, 5);
});

test("parses Hyperliquid size precision and leverage metadata", () => {
  const specs = parsers.hyperliquid(
    { exchangeId: "hyperliquid", base: "BTC", quote: "USDC" },
    {
      universe: [{ name: "BTC", szDecimals: 5, maxLeverage: 50 }],
    },
  );
  assert.equal(specs.quantityMode, "base");
  assert.equal(specs.quantityStep, 0.00001);
  assert.equal(specs.priceTick, 0.1);
  assert.equal(specs.maximumExchangeLeverage, 50);
  assert.equal(specs.maintenanceMargin, 1);
});

test("parses Lighter market precision, minimums, and maximum leverage", () => {
  const specs = parsers.lighter(
    { exchangeId: "lighter", base: "ETH", quote: "USDC" },
    {
      order_books: [
        {
          symbol: "ETH",
          market_type: "perp",
          status: "active",
          supported_size_decimals: 4,
          supported_price_decimals: 2,
          min_base_amount: "0.001",
          min_quote_amount: "10",
          min_initial_margin_fraction: 200,
          maintenance_margin_fraction: 100,
        },
      ],
    },
  );
  assert.equal(specs.quantityMode, "base");
  assert.equal(specs.quantityStep, 0.0001);
  assert.equal(specs.priceTick, 0.01);
  assert.equal(specs.minimumQuantity, 0.001);
  assert.equal(specs.minimumNotional, 10);
  assert.equal(specs.maximumExchangeLeverage, 50);
  assert.equal(specs.maintenanceMargin, 1);
});
