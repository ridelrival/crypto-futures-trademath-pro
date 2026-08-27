(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.TradeMathExchangeMaxLeverage = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function (root) {
  "use strict";

  function positive(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  function cleanAsset(value) {
    return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  function normalizeContext(context = {}) {
    return {
      exchangeId: String(context.exchangeId || "").toLowerCase(),
      symbolBase: cleanAsset(context.symbolBase),
      quoteCurrency: cleanAsset(context.quoteCurrency || "USDT"),
    };
  }

  async function fetchMaximumLeverage(rawContext, options = {}) {
    const context = normalizeContext(rawContext);
    if (!context.symbolBase) throw new Error("Enter a ticker first");
    if (!context.exchangeId || context.exchangeId === "custom") {
      return {
        available: false,
        reason: "unsupported",
        exchangeId: context.exchangeId,
        symbol: `${context.symbolBase}${context.quoteCurrency}`,
      };
    }

    const contractSpecs = root.TradeMathContractSpecs;
    if (!contractSpecs?.fetchSpecs) {
      throw new Error("Public exchange data adapter is unavailable");
    }

    const specs = await contractSpecs.fetchSpecs(context, options.force !== false);
    const maximumLeverage = positive(specs?.maximumExchangeLeverage);
    return {
      available: maximumLeverage > 0,
      reason: maximumLeverage > 0 ? "available" : "not-public",
      maximumLeverage,
      exchangeId: context.exchangeId,
      symbol: specs?.symbol || `${context.symbolBase}${context.quoteCurrency}`,
      fetchedAt: specs?.fetchedAt || "",
      cached: Boolean(specs?.cached),
      stale: Boolean(specs?.stale),
      offlineFallback: Boolean(specs?.offlineFallback),
      source: specs?.source || "",
      sourceLabel: specs?.sourceLabel || "",
    };
  }

  return {
    fetchMaximumLeverage,
    normalizeContext,
  };
});
