(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TradeMathExchangeFeeRates = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const PUBLIC_EXCHANGES = new Set(["gate", "bitget", "mexc", "hyperliquid"]);

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  function cleanAsset(value) {
    return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  function normalizeContext(rawContext) {
    return {
      exchangeId: String(rawContext?.exchangeId || "").trim().toLowerCase(),
      base: cleanAsset(rawContext?.symbolBase),
      quote: cleanAsset(rawContext?.quoteCurrency) || "USDT",
    };
  }

  function percentage(decimalRate, label) {
    const value = number(decimalRate) * 100;
    if (!Number.isFinite(value) || value < -5 || value > 5) {
      throw new Error(`Invalid ${label} fee rate`);
    }
    return value;
  }

  async function fetchJson(url, init, fetchImpl) {
    const response = await fetchImpl(url, init);
    if (!response?.ok) throw new Error(`Public fee request failed (${response?.status || "network"})`);
    return response.json();
  }

  async function fetchJsonFromCandidates(urls, fetchImpl) {
    let lastError = null;
    for (const url of urls) {
      try {
        return await fetchJson(url, undefined, fetchImpl);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error("Public fee request failed");
  }

  function result(context, values) {
    return {
      available: true,
      exchangeId: context.exchangeId,
      symbol: context.base ? `${context.base}${context.quote}` : "",
      makerPercent: percentage(values.maker, "maker"),
      takerPercent: percentage(values.taker, "taker"),
      source: values.source,
      sourceLabel: values.sourceLabel,
      fetchedAt: new Date().toISOString(),
      scope: "public-base",
    };
  }

  async function fetchPublicFeeRates(rawContext, options = {}) {
    const context = normalizeContext(rawContext);
    const fetchImpl = options.fetchImpl || (typeof fetch === "function" ? fetch.bind(globalThis) : null);

    if (!context.exchangeId || context.exchangeId === "custom") {
      return { available: false, reason: "custom", exchangeId: context.exchangeId };
    }
    if (!PUBLIC_EXCHANGES.has(context.exchangeId)) {
      return { available: false, reason: "private", exchangeId: context.exchangeId };
    }
    if (!fetchImpl) throw new Error("Fetch is unavailable");

    if (context.exchangeId === "hyperliquid") {
      const payload = await fetchJson(
        "https://api.hyperliquid.xyz/info",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "userFees",
            user: "0x0000000000000000000000000000000000000000",
          }),
        },
        fetchImpl,
      );
      return result(context, {
        maker: payload?.feeSchedule?.add,
        taker: payload?.feeSchedule?.cross,
        source: "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint",
        sourceLabel: "Hyperliquid public base fee schedule",
      });
    }

    if (!context.base) {
      return { available: false, reason: "ticker-required", exchangeId: context.exchangeId };
    }

    if (context.exchangeId === "gate") {
      const settle = context.quote.toLowerCase();
      const contract = `${context.base}_${context.quote}`;
      const payload = await fetchJsonFromCandidates(
        [
          `https://fx-api.gateio.ws/api/v4/futures/${encodeURIComponent(settle)}/contracts/${encodeURIComponent(contract)}`,
          `https://api.gateio.ws/api/v4/futures/${encodeURIComponent(settle)}/contracts/${encodeURIComponent(contract)}`,
        ],
        fetchImpl,
      );
      return result(context, {
        maker: payload?.maker_fee_rate,
        taker: payload?.taker_fee_rate,
        source: "https://www.gate.com/docs/developers/apiv4/en/futures/",
        sourceLabel: "Gate.io public futures contract fees",
      });
    }

    if (context.exchangeId === "bitget") {
      const productType = context.quote === "USDC" ? "USDC-FUTURES" : "USDT-FUTURES";
      const symbol = `${context.base}${context.quote}`;
      const payload = await fetchJson(
        `https://api.bitget.com/api/v2/mix/market/contracts?productType=${encodeURIComponent(productType)}&symbol=${encodeURIComponent(symbol)}`,
        undefined,
        fetchImpl,
      );
      const instrument = payload?.data?.find((item) => item.symbol === symbol) || payload?.data?.[0];
      return result(context, {
        maker: instrument?.makerFeeRate,
        taker: instrument?.takerFeeRate,
        source: "https://www.bitget.com/api-doc/contract/market/Get-All-Symbols-Contracts",
        sourceLabel: "Bitget public futures contract fees",
      });
    }

    const contract = `${context.base}_${context.quote}`;
    const payload = await fetchJsonFromCandidates(
      [
        `https://api.mexc.com/api/v1/contract/detail?symbol=${encodeURIComponent(contract)}`,
        `https://contract.mexc.com/api/v1/contract/detail?symbol=${encodeURIComponent(contract)}`,
      ],
      fetchImpl,
    );
    const instruments = Array.isArray(payload?.data) ? payload.data : [payload?.data];
    const instrument = instruments.find((item) => item?.symbol === contract) || instruments[0];
    return result(context, {
      maker: instrument?.makerFeeRate,
      taker: instrument?.takerFeeRate,
      source: "https://mexcdevelop.github.io/apidocs/contract_v1_en/#get-the-contract-information",
      sourceLabel: "MEXC public contract fees",
    });
  }

  return {
    fetchPublicFeeRates,
    normalizeContext,
  };
});
