const test = require("node:test");
const assert = require("node:assert/strict");

const FeeRates = require("../exchange-fee-rates.js");

function response(payload) {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  };
}

test("reads Gate public contract maker and taker rates as percentages", async () => {
  let requestedUrl = "";
  const result = await FeeRates.fetchPublicFeeRates(
    { exchangeId: "gate", symbolBase: "btc", quoteCurrency: "USDT" },
    {
      fetchImpl: async (url) => {
        requestedUrl = url;
        return response({ maker_fee_rate: "-0.00025", taker_fee_rate: "0.00075" });
      },
    },
  );

  assert.equal(result.available, true);
  assert.equal(result.makerPercent, -0.025);
  assert.equal(result.takerPercent, 0.075);
  assert.match(requestedUrl, /BTC_USDT/);
});

test("reads Bitget public futures contract rates", async () => {
  const result = await FeeRates.fetchPublicFeeRates(
    { exchangeId: "bitget", symbolBase: "BTC", quoteCurrency: "USDT" },
    {
      fetchImpl: async () =>
        response({
          data: [{ symbol: "BTCUSDT", makerFeeRate: "0.0004", takerFeeRate: "0.0006" }],
        }),
    },
  );

  assert.equal(result.makerPercent, 0.04);
  assert.equal(result.takerPercent, 0.06);
});

test("reads MEXC public contract rates", async () => {
  const result = await FeeRates.fetchPublicFeeRates(
    { exchangeId: "mexc", symbolBase: "ETH", quoteCurrency: "USDT" },
    {
      fetchImpl: async () =>
        response({
          data: [{ symbol: "ETH_USDT", makerFeeRate: 0.0002, takerFeeRate: 0.0006 }],
        }),
    },
  );

  assert.equal(result.makerPercent, 0.02);
  assert.equal(result.takerPercent, 0.06);
});

test("reads Hyperliquid public base fee schedule without a ticker", async () => {
  const result = await FeeRates.fetchPublicFeeRates(
    { exchangeId: "hyperliquid", symbolBase: "", quoteCurrency: "USDC" },
    {
      fetchImpl: async (_url, init) => {
        assert.match(init.body, /userFees/);
        return response({ feeSchedule: { add: "0.00015", cross: "0.00045" } });
      },
    },
  );

  assert.equal(result.makerPercent, 0.015);
  assert.equal(result.takerPercent, 0.045);
});

test("does not call private fee endpoints for exchanges without public rates", async () => {
  let called = false;
  const result = await FeeRates.fetchPublicFeeRates(
    { exchangeId: "okx", symbolBase: "BTC", quoteCurrency: "USDT" },
    {
      fetchImpl: async () => {
        called = true;
        return response({});
      },
    },
  );

  assert.equal(result.available, false);
  assert.equal(result.reason, "private");
  assert.equal(called, false);
});

test("requires a ticker for contract-specific public fee rates", async () => {
  const result = await FeeRates.fetchPublicFeeRates(
    { exchangeId: "gate", symbolBase: "", quoteCurrency: "USDT" },
    { fetchImpl: async () => response({}) },
  );

  assert.equal(result.available, false);
  assert.equal(result.reason, "ticker-required");
});
