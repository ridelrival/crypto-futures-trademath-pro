const assert = require("node:assert/strict");
const test = require("node:test");

const modulePath = require.resolve("../exchange-max-leverage.js");
delete require.cache[modulePath];
const ExchangeMaxLeverage = require(modulePath);

test("normalizes a free-text ticker without changing its settlement", () => {
  assert.deepEqual(
    ExchangeMaxLeverage.normalizeContext({
      exchangeId: "OKX",
      symbolBase: " btc ",
      quoteCurrency: "USDT",
    }),
    {
      exchangeId: "okx",
      symbolBase: "BTC",
      quoteCurrency: "USDT",
    },
  );
});

test("returns a read-only live maximum from public contract specifications", async () => {
  let receivedForce = null;
  globalThis.TradeMathContractSpecs = {
    async fetchSpecs(context, force) {
      receivedForce = force;
      return {
        maximumExchangeLeverage: 100,
        symbol: "BTCUSDT",
        fetchedAt: "2026-08-26T00:00:00.000Z",
        source: "https://example.exchange/official",
      };
    },
  };

  const result = await ExchangeMaxLeverage.fetchMaximumLeverage({
    exchangeId: "okx",
    symbolBase: "BTC",
    quoteCurrency: "USDT",
  });

  assert.equal(receivedForce, true);
  assert.equal(result.available, true);
  assert.equal(result.maximumLeverage, 100);
  assert.equal(result.symbol, "BTCUSDT");
  assert.equal(result.cached, false);
});

test("does not invent leverage when an exchange has no public maximum", async () => {
  globalThis.TradeMathContractSpecs = {
    async fetchSpecs() {
      return {
        maximumExchangeLeverage: 0,
        symbol: "BTCUSDT",
        fetchedAt: "2026-08-26T00:00:00.000Z",
      };
    },
  };

  const result = await ExchangeMaxLeverage.fetchMaximumLeverage({
    exchangeId: "binance",
    symbolBase: "BTC",
    quoteCurrency: "USDT",
  });

  assert.equal(result.available, false);
  assert.equal(result.reason, "not-public");
  assert.equal(result.maximumLeverage, 0);
});

test("marks Custom / Manual as unsupported without requesting data", async () => {
  globalThis.TradeMathContractSpecs = {
    async fetchSpecs() {
      throw new Error("must not be called");
    },
  };

  const result = await ExchangeMaxLeverage.fetchMaximumLeverage({
    exchangeId: "custom",
    symbolBase: "BTC",
    quoteCurrency: "USDT",
  });

  assert.equal(result.available, false);
  assert.equal(result.reason, "unsupported");
});
