(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.TradeMathContractSpecs = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function (root) {
  "use strict";

  const CACHE_KEY = "trademath-contract-specs-v1";
  const CACHE_TTL = 6 * 60 * 60 * 1000;

  function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function positive(value, fallback = 0) {
    const parsed = number(value, fallback);
    return parsed > 0 ? parsed : fallback;
  }

  function cleanAsset(value) {
    return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  function normalizedContext(context) {
    return {
      exchangeId: String(context.exchangeId || "").toLowerCase(),
      base: cleanAsset(context.symbolBase),
      quote: cleanAsset(context.quoteCurrency || "USDT"),
    };
  }

  function readCache() {
    try {
      return JSON.parse(root.localStorage?.getItem(CACHE_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function writeCache(cache) {
    try {
      root.localStorage?.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch {
      // Live data remains usable when local storage is unavailable.
    }
  }

  function cacheId(context) {
    return `${context.exchangeId}:${context.base}:${context.quote}`;
  }

  async function fetchJson(url, options = {}) {
    const controller = new AbortController();
    const timer = root.setTimeout(() => controller.abort(), 9000);
    try {
      const response = await root.fetch(url, {
        ...options,
        cache: "no-store",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          ...(options.headers || {}),
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      root.clearTimeout(timer);
    }
  }

  function finalize(context, values) {
    const contractSize = positive(values.contractSize, values.quantityMode === "base" ? 1 : 0);
    const quantityStep = positive(values.quantityStep);
    const priceTick = positive(values.priceTick);
    if (!quantityStep || !priceTick || (values.quantityMode === "contracts" && !contractSize)) {
      throw new Error("Instrument specifications are incomplete");
    }
    return {
      verified: true,
      exchangeId: context.exchangeId,
      symbol: `${context.base}${context.quote}`,
      fetchedAt: new Date().toISOString(),
      quantityMode: values.quantityMode === "contracts" ? "contracts" : "base",
      contractSize,
      quantityStep,
      priceTick,
      minimumQuantity: positive(values.minimumQuantity),
      minimumNotional: positive(values.minimumNotional),
      maintenanceMargin: positive(values.maintenanceMargin),
      maximumExchangeLeverage: positive(values.maximumExchangeLeverage),
      source: values.source || "",
      sourceLabel: values.sourceLabel || "",
    };
  }

  function parseOkx(context, payload) {
    const instrument = payload?.data?.[0];
    if (!instrument || instrument.state === "suspend") throw new Error("OKX instrument not found");
    const multiplier = positive(instrument.ctMult, 1);
    return finalize(context, {
      quantityMode: "contracts",
      contractSize: positive(instrument.ctVal) * multiplier,
      quantityStep: instrument.lotSz,
      priceTick: instrument.tickSz,
      minimumQuantity: instrument.minSz,
      maximumExchangeLeverage: instrument.lever,
      source: "https://www.okx.com/docs-v5/en/#public-data-rest-api-get-instruments",
      sourceLabel: "OKX public instrument data",
    });
  }

  function parseBinance(context, payload) {
    const wanted = `${context.base}${context.quote}`;
    const instrument = payload?.symbols?.find((item) => item.symbol === wanted);
    if (!instrument || instrument.status !== "TRADING") throw new Error("Binance instrument not found");
    const priceFilter = instrument.filters?.find((item) => item.filterType === "PRICE_FILTER");
    const lotFilter = instrument.filters?.find((item) => item.filterType === "LOT_SIZE");
    const notionalFilter = instrument.filters?.find((item) =>
      ["MIN_NOTIONAL", "NOTIONAL"].includes(item.filterType),
    );
    return finalize(context, {
      quantityMode: "base",
      contractSize: 1,
      quantityStep: lotFilter?.stepSize,
      priceTick: priceFilter?.tickSize,
      minimumQuantity: lotFilter?.minQty,
      minimumNotional: notionalFilter?.notional || notionalFilter?.minNotional,
      source:
        "https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Exchange-Information",
      sourceLabel: "Binance USDⓈ-M exchange information",
    });
  }

  function parseBybit(context, payload) {
    const instrument = payload?.result?.list?.[0];
    if (!instrument || instrument.status !== "Trading") throw new Error("Bybit instrument not found");
    return finalize(context, {
      quantityMode: "base",
      contractSize: 1,
      quantityStep: instrument.lotSizeFilter?.qtyStep,
      priceTick: instrument.priceFilter?.tickSize,
      minimumQuantity: instrument.lotSizeFilter?.minOrderQty,
      minimumNotional: instrument.lotSizeFilter?.minNotionalValue,
      maximumExchangeLeverage: instrument.leverageFilter?.maxLeverage,
      source: "https://bybit-exchange.github.io/docs/v5/market/instrument",
      sourceLabel: "Bybit V5 instrument information",
    });
  }

  function parseGate(context, payload) {
    if (!payload || payload.status !== "trading") throw new Error("Gate.io instrument not found");
    return finalize(context, {
      quantityMode: "contracts",
      contractSize: payload.quanto_multiplier,
      quantityStep: payload.enable_decimal ? payload.order_size_min : 1,
      priceTick: payload.order_price_round,
      minimumQuantity: payload.order_size_min,
      maintenanceMargin: number(payload.maintenance_rate) * 100,
      maximumExchangeLeverage: payload.leverage_max,
      source: "https://www.gate.com/docs/developers/apiv4/en/futures/",
      sourceLabel: "Gate.io futures contract data",
    });
  }

  function parseMexc(context, payload) {
    const instrument = Array.isArray(payload?.data) ? payload.data[0] : payload?.data;
    if (!instrument || Number(instrument.state) !== 0) throw new Error("MEXC instrument not found");
    return finalize(context, {
      quantityMode: "contracts",
      contractSize: instrument.contractSize,
      quantityStep: instrument.volUnit,
      priceTick: instrument.priceUnit,
      minimumQuantity: instrument.minVol,
      maintenanceMargin: number(instrument.maintenanceMarginRate) * 100,
      maximumExchangeLeverage: instrument.maxLeverage,
      source: "https://mexcdevelop.github.io/apidocs/contract_v1_en/#get-the-contract-information",
      sourceLabel: "MEXC public contract information",
    });
  }

  function parseBitget(context, payload) {
    const instrument = payload?.data?.[0];
    if (!instrument || instrument.symbol !== `${context.base}${context.quote}`) {
      throw new Error("Bitget instrument not found");
    }
    const pricePlace = Math.max(0, number(instrument.pricePlace));
    const priceEndStep = positive(instrument.priceEndStep, 1);
    return finalize(context, {
      quantityMode: "base",
      contractSize: 1,
      quantityStep: instrument.sizeMultiplier,
      priceTick: priceEndStep * 10 ** -pricePlace,
      minimumQuantity: instrument.minTradeNum,
      minimumNotional: instrument.minTradeUSDT,
      maximumExchangeLeverage: instrument.maxLever,
      source: "https://www.bitget.com/api-doc/contract/market/Get-All-Symbols-Contracts",
      sourceLabel: "Bitget contract information",
    });
  }

  const parsers = {
    okx: parseOkx,
    binance: parseBinance,
    bybit: parseBybit,
    gate: parseGate,
    mexc: parseMexc,
    bitget: parseBitget,
  };

  async function requestSpecs(context) {
    const symbol = `${context.base}${context.quote}`;
    if (context.exchangeId === "okx") {
      const instId = `${context.base}-${context.quote}-SWAP`;
      return parseOkx(
        context,
        await fetchJson(
          `https://www.okx.com/api/v5/public/instruments?instType=SWAP&instId=${encodeURIComponent(instId)}`,
        ),
      );
    }
    if (context.exchangeId === "binance") {
      return parseBinance(context, await fetchJson("https://fapi.binance.com/fapi/v1/exchangeInfo"));
    }
    if (context.exchangeId === "bybit") {
      return parseBybit(
        context,
        await fetchJson(
          `https://api.bybit.com/v5/market/instruments-info?category=linear&symbol=${encodeURIComponent(symbol)}`,
        ),
      );
    }
    if (context.exchangeId === "gate") {
      const settle = context.quote.toLowerCase();
      const contract = `${context.base}_${context.quote}`;
      return parseGate(
        context,
        await fetchJson(
          `https://api.gateio.ws/api/v4/futures/${encodeURIComponent(settle)}/contracts/${encodeURIComponent(contract)}`,
        ),
      );
    }
    if (context.exchangeId === "mexc") {
      return parseMexc(
        context,
        await fetchJson(
          `https://contract.mexc.com/api/v1/contract/detail?symbol=${encodeURIComponent(`${context.base}_${context.quote}`)}`,
        ),
      );
    }
    if (context.exchangeId === "bitget") {
      const productType = context.quote === "USDC" ? "USDC-FUTURES" : "USDT-FUTURES";
      return parseBitget(
        context,
        await fetchJson(
          `https://api.bitget.com/api/v2/mix/market/contracts?productType=${encodeURIComponent(productType)}&symbol=${encodeURIComponent(symbol)}`,
        ),
      );
    }
    throw new Error("Automatic specifications are not available for this exchange");
  }

  async function fetchSpecs(rawContext, force = false) {
    const context = normalizedContext(rawContext);
    if (!context.base || !context.quote) throw new Error("Enter a symbol first");
    const id = cacheId(context);
    const cache = readCache();
    const cached = cache[id];
    if (!force && cached && Date.now() - Date.parse(cached.fetchedAt) < CACHE_TTL) {
      return { ...cached, cached: true };
    }
    const specs = await requestSpecs(context);
    cache[id] = specs;
    writeCache(cache);
    return specs;
  }

  async function fetchFunding(rawContext) {
    const context = normalizedContext(rawContext);
    if (!context.base || !context.quote) throw new Error("Enter a symbol first");
    const symbol = `${context.base}${context.quote}`;

    if (context.exchangeId === "okx") {
      const instId = `${context.base}-${context.quote}-SWAP`;
      const payload = await fetchJson(
        `https://www.okx.com/api/v5/public/funding-rate?instId=${encodeURIComponent(instId)}`,
      );
      return {
        ratePercent: number(payload?.data?.[0]?.fundingRate) * 100,
        nextFundingTime: number(payload?.data?.[0]?.nextFundingTime),
      };
    }
    if (context.exchangeId === "binance") {
      const payload = await fetchJson(
        `https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${encodeURIComponent(symbol)}`,
      );
      return {
        ratePercent: number(payload?.lastFundingRate) * 100,
        nextFundingTime: number(payload?.nextFundingTime),
      };
    }
    if (context.exchangeId === "bybit") {
      const payload = await fetchJson(
        `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${encodeURIComponent(symbol)}`,
      );
      return {
        ratePercent: number(payload?.result?.list?.[0]?.fundingRate) * 100,
        nextFundingTime: number(payload?.result?.list?.[0]?.nextFundingTime),
      };
    }
    if (context.exchangeId === "gate") {
      const settle = context.quote.toLowerCase();
      const payload = await fetchJson(
        `https://api.gateio.ws/api/v4/futures/${encodeURIComponent(settle)}/contracts/${encodeURIComponent(`${context.base}_${context.quote}`)}`,
      );
      return {
        ratePercent: number(payload?.funding_rate) * 100,
        nextFundingTime: number(payload?.funding_next_apply) * 1000,
      };
    }
    if (context.exchangeId === "mexc") {
      const payload = await fetchJson(
        `https://contract.mexc.com/api/v1/contract/ticker?symbol=${encodeURIComponent(`${context.base}_${context.quote}`)}`,
      );
      return {
        ratePercent: number(payload?.data?.fundingRate) * 100,
        nextFundingTime: 0,
      };
    }
    throw new Error("Automatic funding is not available for this exchange");
  }

  return {
    fetchSpecs,
    fetchFunding,
    parsers,
  };
});
