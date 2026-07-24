(function () {
  "use strict";

  const Calculator = window.TradeMathCalculator;
  const I18n = window.TradeMathI18n;
  const Exchanges = window.TRADEMATH_EXCHANGES;
  const ContractSpecs = window.TradeMathContractSpecs;
  const HISTORY_KEY = "trademath-history-v1";
  const THEME_KEY = "trademath-theme";
  const ADVANCED_KEY = "trademath-advanced-enabled";

  const $ = (id) => document.getElementById(id);
  const form = $("tradeForm");
  const elements = {
    balance: $("balance"),
    riskValue: $("riskValue"),
    riskUnit: $("riskUnit"),
    leverage: $("leverage"),
    symbol: $("symbol"),
    quoteCurrency: $("quoteCurrency"),
    entryPrice: $("entryPrice"),
    stopLoss: $("stopLoss"),
    stopLimitPrice: $("stopLimitPrice"),
    stopLimitField: $("stopLimitField"),
    exchange: $("exchange"),
    otherExchange: $("otherExchange"),
    otherExchangeField: $("otherExchangeField"),
    feeTier: $("feeTier"),
    customFeeFields: $("customFeeFields"),
    makerFee: $("makerFee"),
    takerFee: $("takerFee"),
    entryExecution: $("entryExecution"),
    stopExecution: $("stopExecution"),
    targetExecution: $("targetExecution"),
    entrySlippage: $("entrySlippage"),
    stopSlippage: $("stopSlippage"),
    targetSlippage: $("targetSlippage"),
    fundingEnabled: $("fundingEnabled"),
    fundingRate: $("fundingRate"),
    fundingIntervals: $("fundingIntervals"),
    specMode: $("specMode"),
    quantityMode: $("quantityMode"),
    contractSize: $("contractSize"),
    maintenanceMargin: $("maintenanceMargin"),
    quantityStep: $("quantityStep"),
    priceTick: $("priceTick"),
    minimumQuantity: $("minimumQuantity"),
    minimumNotional: $("minimumNotional"),
    tp1Price: $("tp1Price"),
    tp1Allocation: $("tp1Allocation"),
    tp2Enabled: $("tp2Enabled"),
    tp2Price: $("tp2Price"),
    tp2Allocation: $("tp2Allocation"),
    tp3Enabled: $("tp3Enabled"),
    tp3Price: $("tp3Price"),
    tp3Allocation: $("tp3Allocation"),
  };

  const metricIds = [
    "marginCostValue",
    "coinSizeValue",
    "positionValue",
    "grossRRValue",
    "netRRValue",
    "netRiskValue",
    "netProfitValue",
    "netROEValue",
    "liquidationValue",
    "grossRiskValue",
    "grossProfitValue",
    "grossROEValue",
    "feesValue",
    "slippageValue",
    "fundingValue",
    "breakEvenValue",
    "winRateValue",
    "effectiveLeverageValue",
    "freeBalanceValue",
    "maxLeverageValue",
    "contractQuantityValue",
  ];

  let side = "";
  let advancedEnabled = localStorage.getItem(ADVANCED_KEY) !== "off";
  let currentSpecs = null;
  let specsRequestId = 0;
  let specsDebounceTimer = null;
  let lastResult = null;
  let deferredInstallPrompt = null;
  let toastTimer = null;

  function locale() {
    const map = { en: "en-US", id: "id-ID", ja: "ja-JP" };
    return map[I18n.getLanguage()] || "en-US";
  }

  function finite(value) {
    return Number.isFinite(Calculator.parseFlexibleNumber(value));
  }

  function numeric(value, fallback = 0) {
    const parsed = Calculator.parseFlexibleNumber(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function formatNumber(value, minimum = 0, maximum = 2) {
    if (!finite(value)) return "—";
    return numeric(value).toLocaleString(locale(), {
      minimumFractionDigits: minimum,
      maximumFractionDigits: maximum,
    });
  }

  function formatMoney(value, signed = false) {
    if (!finite(value)) return "$—";
    const amount = numeric(value);
    const absolute = Math.abs(amount).toLocaleString(locale(), {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    if (signed && amount > 0) return `+$${absolute}`;
    if (amount < 0) return `−$${absolute}`;
    return `$${absolute}`;
  }

  function formatPrice(value) {
    if (!finite(value)) return "$—";
    const price = numeric(value);
    const decimals = price >= 1000 ? 2 : price >= 1 ? 4 : 8;
    return `$${formatNumber(price, 0, decimals)}`;
  }

  function formatRatio(value) {
    if (!finite(value) || numeric(value) <= 0) return "1:—";
    return `1:${formatNumber(value, 2, 2)}`;
  }

  function formatPercent(value, decimals = 1) {
    if (!finite(value)) return "—%";
    return `${formatNumber(value, decimals, decimals)}%`;
  }

  function currentExchangeId() {
    return elements.exchange.value === "other"
      ? elements.otherExchange.value
      : elements.exchange.value;
  }

  function currentExchange() {
    return Exchanges[currentExchangeId()] || Exchanges.custom;
  }

  function currentTier() {
    const exchange = currentExchange();
    return (
      exchange.tiers.find((tier) => tier.id === elements.feeTier.value) ||
      exchange.tiers[0] ||
      Exchanges.custom.tiers[0]
    );
  }

  function fullSymbol() {
    const base = elements.symbol.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    return base ? `${base}${elements.quoteCurrency.value}` : "";
  }

  function formatEditableNumber(value) {
    if (!Number.isFinite(value)) return "";
    let formatted = value.toLocaleString("en-US", {
      useGrouping: Math.abs(value) >= 1000,
      maximumFractionDigits: 12,
    });
    if (/^-?[1-9]\d*\.\d{3}$/.test(formatted)) formatted += "0";
    return formatted;
  }

  function normalizeNumberField(input) {
    if (!input?.value.trim()) return;
    const parsed = Calculator.parseFlexibleNumber(input.value);
    if (!Number.isFinite(parsed)) return;
    input.value = formatEditableNumber(parsed);
    input.title = I18n.t("interpretedNumber", { value: input.value });
  }

  function applyTheme(nextTheme, persist = true) {
    const theme = nextTheme === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
    $("themeIcon").textContent = theme === "light" ? "☀" : "☾";
    $("activeTheme").textContent = I18n.t(theme === "light" ? "lightTheme" : "darkTheme");
    document
      .querySelectorAll("[data-theme-option]")
      .forEach((button) => {
        const active = button.dataset.themeOption === theme;
        button.classList.toggle("active", active);
        button.setAttribute("aria-selected", String(active));
      });
    if (persist) localStorage.setItem(THEME_KEY, theme);
  }

  function contractContext() {
    return {
      exchangeId: currentExchangeId(),
      symbolBase: elements.symbol.value,
      quoteCurrency: elements.quoteCurrency.value,
    };
  }

  function setSpecStatus(state, textKey, variables) {
    const status = $("specStatus");
    status.className = `spec-status ${state}`;
    status.textContent = I18n.t(textKey, variables);
  }

  function clearContractSpecs(keepMaintenance = true) {
    currentSpecs = null;
    elements.quantityMode.value = "base";
    elements.contractSize.value = "";
    elements.quantityStep.value = "";
    elements.priceTick.value = "";
    elements.minimumQuantity.value = "";
    elements.minimumNotional.value = "";
    if (keepMaintenance) {
      elements.maintenanceMargin.value = currentExchange().maintenanceMargin;
    }
    $("specSourceLink").classList.add("is-hidden");
    setSpecStatus(fullSymbol() ? "unverified" : "waiting", fullSymbol() ? "specsUnverifiedShort" : "specsWaiting");
  }

  function applyContractSpecs(specs) {
    currentSpecs = specs;
    elements.quantityMode.value = specs.quantityMode;
    elements.contractSize.value = formatEditableNumber(specs.contractSize);
    elements.quantityStep.value = formatEditableNumber(specs.quantityStep);
    elements.priceTick.value = formatEditableNumber(specs.priceTick);
    elements.minimumQuantity.value = specs.minimumQuantity
      ? formatEditableNumber(specs.minimumQuantity)
      : "";
    elements.minimumNotional.value = specs.minimumNotional
      ? formatEditableNumber(specs.minimumNotional)
      : "";
    elements.maintenanceMargin.value = specs.maintenanceMargin
      ? formatEditableNumber(specs.maintenanceMargin)
      : formatEditableNumber(currentExchange().maintenanceMargin);

    const source = $("specSourceLink");
    source.classList.toggle("is-hidden", !specs.source);
    if (specs.source) source.href = specs.source;
    const fetched = new Date(specs.fetchedAt).toLocaleTimeString(locale(), {
      hour: "2-digit",
      minute: "2-digit",
    });
    setSpecStatus("verified", specs.cached ? "specsCached" : "specsVerified", { time: fetched });
    syncAdvancedControls();
  }

  function manualSpecsVerified() {
    const modeValid =
      elements.quantityMode.value === "base" || numeric(elements.contractSize.value) > 0;
    return (
      modeValid &&
      numeric(elements.quantityStep.value) > 0 &&
      numeric(elements.priceTick.value) > 0
    );
  }

  function specsVerifiedForCalculation() {
    if (!advancedEnabled) return false;
    return elements.specMode.value === "auto"
      ? Boolean(currentSpecs?.verified)
      : manualSpecsVerified();
  }

  function rememberAndForceZero(input, forced, fallback) {
    if (forced) {
      if (input.value !== "0") input.dataset.previousValue = input.value;
      input.value = "0";
      input.disabled = true;
      return;
    }
    input.disabled = false;
    if (
      input.value === "0" &&
      input.dataset.previousValue &&
      numeric(input.dataset.previousValue) >= 0
    ) {
      input.value = input.dataset.previousValue;
    } else if (!input.value) {
      input.value = fallback;
    }
  }

  function syncExecutionControls() {
    const entryPostOnly = elements.entryExecution.value === "maker";
    const targetPostOnly = elements.targetExecution.value === "maker";
    const stopLimit = elements.stopExecution.value === "stop-limit";
    elements.stopLimitField.classList.toggle("is-hidden", !stopLimit);
    rememberAndForceZero(
      elements.entrySlippage,
      !advancedEnabled || entryPostOnly,
      "0.02",
    );
    rememberAndForceZero(
      elements.stopSlippage,
      !advancedEnabled || stopLimit,
      "0.03",
    );
    rememberAndForceZero(
      elements.targetSlippage,
      !advancedEnabled || targetPostOnly,
      "0.01",
    );
  }

  function syncFundingControls() {
    const enabled = advancedEnabled && elements.fundingEnabled.value === "yes";
    document.querySelectorAll(".funding-dependent").forEach((field) => {
      field.classList.toggle("is-hidden", !enabled);
    });
    elements.fundingEnabled.disabled = !advancedEnabled;
    elements.fundingRate.disabled = !enabled;
    elements.fundingIntervals.disabled = !enabled;
    $("fetchFundingButton").disabled = !enabled;
  }

  function syncSpecControls() {
    const auto = elements.specMode.value === "auto";
    elements.specMode.disabled = !advancedEnabled;
    $("loadSpecsButton").disabled = !advancedEnabled || !auto || !fullSymbol();
    [
      elements.quantityMode,
      elements.contractSize,
      elements.maintenanceMargin,
      elements.quantityStep,
      elements.priceTick,
      elements.minimumQuantity,
      elements.minimumNotional,
    ].forEach((input) => {
      input.disabled = !advancedEnabled || auto;
    });
    if (!advancedEnabled) {
      setSpecStatus("off", "advancedOff");
    } else if (auto) {
      if (currentSpecs?.verified) {
        const fetched = new Date(currentSpecs.fetchedAt).toLocaleTimeString(locale(), {
          hour: "2-digit",
          minute: "2-digit",
        });
        setSpecStatus("verified", currentSpecs.cached ? "specsCached" : "specsVerified", {
          time: fetched,
        });
      } else {
        setSpecStatus(
          fullSymbol() ? "unverified" : "waiting",
          fullSymbol() ? "specsUnverifiedShort" : "specsWaiting",
        );
      }
    } else if (!auto) {
      setSpecStatus(
        manualSpecsVerified() ? "verified" : "unverified",
        manualSpecsVerified() ? "manualSpecsReady" : "manualSpecsIncomplete",
      );
      $("specSourceLink").classList.add("is-hidden");
    }
  }

  function syncAdvancedControls(persist = false) {
    const toggle = $("advancedToggle");
    toggle.classList.toggle("active", advancedEnabled);
    toggle.setAttribute("aria-checked", String(advancedEnabled));
    $("advancedToggleText").textContent = advancedEnabled ? "ON" : "OFF";
    $("advancedSummaryStatus").textContent = I18n.t(
      advancedEnabled ? "includedInCalculation" : "excludedFromCalculation",
    );
    $("advancedOffNote").classList.toggle("is-hidden", advancedEnabled);
    const panel = document.querySelector(".details-panel");
    panel?.classList.toggle("advanced-disabled", !advancedEnabled);
    if (!advancedEnabled) panel?.removeAttribute("open");
    if (persist) localStorage.setItem(ADVANCED_KEY, advancedEnabled ? "on" : "off");
    syncExecutionControls();
    syncFundingControls();
    syncSpecControls();
  }

  function scheduleSpecsFetch(force = false) {
    window.clearTimeout(specsDebounceTimer);
    if (
      !advancedEnabled ||
      elements.specMode.value !== "auto" ||
      !fullSymbol() ||
      !ContractSpecs
    ) {
      syncSpecControls();
      return;
    }
    specsDebounceTimer = window.setTimeout(() => fetchContractSpecifications(force), force ? 0 : 650);
  }

  async function fetchContractSpecifications(force = false) {
    if (!ContractSpecs || !fullSymbol() || elements.specMode.value !== "auto") return;
    const requestId = ++specsRequestId;
    const button = $("loadSpecsButton");
    button.disabled = true;
    setSpecStatus("loading", "specsLoading");
    try {
      const specs = await ContractSpecs.fetchSpecs(contractContext(), force);
      if (requestId !== specsRequestId) return;
      applyContractSpecs(specs);
      showToast(I18n.t("specsLoaded"));
    } catch {
      if (requestId !== specsRequestId) return;
      clearContractSpecs(true);
      setSpecStatus("unverified", "specsUnavailable");
    } finally {
      if (requestId === specsRequestId) {
        syncSpecControls();
        calculateAndRender();
      }
    }
  }

  function populateFeeTiers(reset = true) {
    const exchange = currentExchange();
    const previous = elements.feeTier.value;
    elements.feeTier.replaceChildren();
    exchange.tiers.forEach((tier) => {
      const option = document.createElement("option");
      option.value = tier.id;
      option.textContent = tier.label;
      elements.feeTier.append(option);
    });
    const custom = document.createElement("option");
    custom.value = "custom";
    custom.textContent = I18n.t("customRates");
    elements.feeTier.append(custom);
    if (!reset && [...elements.feeTier.options].some((option) => option.value === previous)) {
      elements.feeTier.value = previous;
    } else {
      elements.feeTier.value = exchange.tiers[0]?.id || "custom";
    }
    applyFeeTier();
  }

  function applyFeeTier() {
    const custom = elements.feeTier.value === "custom" || currentExchangeId() === "custom";
    elements.customFeeFields.classList.toggle("is-hidden", !custom);
    if (!custom) {
      const tier = currentTier();
      elements.makerFee.value = tier.maker;
      elements.takerFee.value = tier.taker;
    }
    $("makerFeeDisplay").textContent = `${formatNumber(elements.makerFee.value, 4, 4)}%`;
    $("takerFeeDisplay").textContent = `${formatNumber(elements.takerFee.value, 4, 4)}%`;
    calculateAndRender();
  }

  function applyExchange(resetTier = true) {
    const showOther = elements.exchange.value === "other";
    elements.otherExchangeField.classList.toggle("is-hidden", !showOther);
    const exchange = currentExchange();
    clearContractSpecs(true);
    $("feeVerifiedBadge").textContent = `Verified ${exchange.verifiedOn}`;
    $("feeSourceText").textContent = exchange.sourceLabel;
    $("settlementValue").textContent = elements.quoteCurrency.value;
    const link = $("feeSourceLink");
    link.classList.toggle("is-hidden", !exchange.source);
    if (exchange.source) link.href = exchange.source;
    link.title = I18n.t("feesVary");
    populateFeeTiers(resetTier);
    syncAdvancedControls();
    scheduleSpecsFetch();
  }

  function syncTargetState(targetNumber) {
    const enabled = elements[`tp${targetNumber}Enabled`].checked;
    elements[`tp${targetNumber}Price`].disabled = !enabled;
    elements[`tp${targetNumber}Allocation`].disabled = !enabled;
  }

  function handleTargetToggle(targetNumber) {
    syncTargetState(targetNumber);
    if (targetNumber === 2) {
      if (elements.tp2Enabled.checked && numeric(elements.tp2Allocation.value) === 0) {
        elements.tp1Allocation.value = elements.tp3Enabled.checked ? 50 : 70;
        elements.tp2Allocation.value = 30;
      }
      if (!elements.tp2Enabled.checked) {
        elements.tp1Allocation.value =
          100 - (elements.tp3Enabled.checked ? numeric(elements.tp3Allocation.value) : 0);
        elements.tp2Allocation.value = 0;
      }
    }
    if (targetNumber === 3) {
      if (elements.tp3Enabled.checked && numeric(elements.tp3Allocation.value) === 0) {
        elements.tp1Allocation.value = elements.tp2Enabled.checked ? 50 : 80;
        elements.tp2Allocation.value = elements.tp2Enabled.checked ? 30 : 0;
        elements.tp3Allocation.value = 20;
      }
      if (!elements.tp3Enabled.checked) {
        elements.tp1Allocation.value =
          100 - (elements.tp2Enabled.checked ? numeric(elements.tp2Allocation.value) : 0);
        elements.tp3Allocation.value = 0;
      }
    }
    calculateAndRender();
  }

  function collectInput() {
    const maintenanceMargin =
      advancedEnabled && numeric(elements.maintenanceMargin.value) > 0
        ? numeric(elements.maintenanceMargin.value)
        : numeric(currentExchange().maintenanceMargin);
    return {
      side,
      balance: numeric(elements.balance.value),
      riskMode: elements.riskUnit.value,
      riskValue: numeric(elements.riskValue.value),
      leverage: numeric(elements.leverage.value),
      symbolBase: elements.symbol.value.trim().toUpperCase(),
      quoteCurrency: elements.quoteCurrency.value,
      symbol: fullSymbol(),
      entryPrice: numeric(elements.entryPrice.value),
      stopLoss: numeric(elements.stopLoss.value),
      stopOrderType: elements.stopExecution.value,
      stopLimitPrice: numeric(elements.stopLimitPrice.value),
      advancedEnabled,
      specsVerified: specsVerifiedForCalculation(),
      specMode: elements.specMode.value,
      quantityMode: elements.quantityMode.value,
      contractSize: numeric(elements.contractSize.value, 1),
      makerFee: numeric(elements.makerFee.value),
      takerFee: numeric(elements.takerFee.value),
      entryExecution: elements.entryExecution.value,
      stopExecution: "taker",
      targetExecution: elements.targetExecution.value,
      entrySlippage: numeric(elements.entrySlippage.value),
      stopSlippage: numeric(elements.stopSlippage.value),
      targetSlippage: numeric(elements.targetSlippage.value),
      fundingEnabled: elements.fundingEnabled.value === "yes",
      fundingRate: numeric(elements.fundingRate.value),
      fundingIntervals: numeric(elements.fundingIntervals.value),
      maintenanceMargin,
      quantityStep: numeric(elements.quantityStep.value),
      priceTick: numeric(elements.priceTick.value),
      minimumQuantity: numeric(elements.minimumQuantity.value),
      minimumNotional: numeric(elements.minimumNotional.value),
      exchangeId: currentExchangeId(),
      exchangeName: currentExchange().name,
      marginMode: "isolated",
      feeTier: elements.feeTier.value,
      targets: [
        {
          label: "TP1",
          enabled: true,
          price: numeric(elements.tp1Price.value),
          allocation: numeric(elements.tp1Allocation.value),
        },
        {
          label: "TP2",
          enabled: elements.tp2Enabled.checked,
          price: numeric(elements.tp2Price.value),
          allocation: numeric(elements.tp2Allocation.value),
        },
        {
          label: "TP3",
          enabled: elements.tp3Enabled.checked,
          price: numeric(elements.tp3Price.value),
          allocation: numeric(elements.tp3Allocation.value),
        },
      ],
    };
  }

  function formattedAlertVariables(vars) {
    const output = { ...(vars || {}) };
    ["required", "balance"].forEach((key) => {
      if (key in output) output[key] = formatMoney(output[key]);
    });
    ["liq", "stop"].forEach((key) => {
      if (key in output) output[key] = formatPrice(output[key]);
    });
    ["max", "usage", "leverage", "share", "risk"].forEach((key) => {
      if (key in output) output[key] = formatNumber(output[key], 1, 2);
    });
    ["raw", "qty"].forEach((key) => {
      if (key in output) output[key] = formatNumber(output[key], 0, 8);
    });
    return output;
  }

  function renderAlerts(result) {
    const alerts = $("alerts");
    alerts.replaceChildren();
    const combined = [
      ...result.errors,
      ...result.warnings.slice(0, Math.max(0, 4 - result.errors.length)),
    ];
    if (combined.length < 4 && result.info.length) combined.push(result.info[0]);

    combined.slice(0, 4).forEach((issue) => {
      const article = document.createElement("article");
      article.className = `alert alert-${issue.type}`;

      const icon = document.createElement("span");
      icon.className = "alert-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = issue.type === "error" ? "!" : issue.type === "warning" ? "⚠" : "i";

      const copy = document.createElement("div");
      const title = document.createElement("strong");
      const body = document.createElement("p");
      const vars = formattedAlertVariables(issue.vars);
      title.textContent = I18n.t(issue.titleKey, vars);
      body.textContent = I18n.t(issue.bodyKey, vars);
      copy.append(title, body);
      article.append(icon, copy);
      alerts.append(article);
    });
  }

  function blankMetrics() {
    metricIds.forEach((id) => {
      $(id).textContent = id.includes("Value") ? "—" : "$—";
    });
    $("marginUsageValue").textContent = "—";
    $("rawSizeValue").textContent = "—";
    $("contractQuantityValue").textContent = "—";
    $("riskAccountValue").textContent = "—";
    $("profitAccountValue").textContent = "—";
  }

  function renderMetrics(result) {
    const status = $("calculationStatus");
    status.classList.remove("valid", "invalid");
    status.classList.add(result.valid ? "valid" : "invalid");
    status.textContent = I18n.t(result.valid ? "valid" : "invalid");
    $("saveTradeButton").disabled = !result.valid;

    if (!result.valid || !result.values || !finite(result.values.quantity)) {
      blankMetrics();
      return;
    }

    const value = result.values;
    const quantityDecimals = 10;
    const baseCoin = elements.symbol.value.trim().toUpperCase() || I18n.t("baseCoin");
    $("marginCostValue").textContent = formatMoney(value.initialMargin);
    $("marginUsageValue").textContent = `${formatPercent(value.marginUsage)} ${I18n.t("ofAccount")}`;
    $("coinSizeValue").textContent =
      `${formatNumber(value.executableCoinQuantity, 0, quantityDecimals)} ${baseCoin}`;
    $("rawSizeValue").textContent =
      `${I18n.t("rawCoin")}: ${formatNumber(value.rawCoinQuantity, 0, 10)} ${baseCoin}`;
    $("contractQuantityValue").textContent = finite(value.contractQuantity)
      ? `${formatNumber(value.contractQuantity, 0, 8)} ${I18n.t("contracts")}`
      : I18n.t("baseCoinOrder");
    $("positionValue").textContent = formatMoney(value.notional);
    $("grossRRValue").textContent = formatRatio(value.grossRR);
    $("netRRValue").textContent = formatRatio(value.netRR);
    $("netRiskValue").textContent = formatMoney(-value.netRisk);
    $("riskAccountValue").textContent =
      `${formatPercent(value.netRiskAccountPercent)} ${I18n.t("ofAccount")}`;
    $("netProfitValue").textContent = formatMoney(value.netProfit, true);
    $("profitAccountValue").textContent =
      `${formatPercent(value.netProfitAccountPercent)} ${I18n.t("ofAccount")}`;
    $("netROEValue").textContent = formatPercent(value.netROE);
    $("liquidationValue").textContent = formatPrice(value.liquidationPrice);
    $("grossRiskValue").textContent = formatMoney(-value.grossRisk);
    $("grossProfitValue").textContent = formatMoney(value.grossProfit, true);
    $("grossROEValue").textContent = formatPercent(value.grossROE);
    $("feesValue").textContent = formatMoney(value.feesAtTargets);
    $("slippageValue").textContent = formatMoney(value.slippageAtTargets);
    $("fundingValue").textContent =
      value.fundingSigned > 0
        ? formatMoney(-value.fundingSigned)
        : formatMoney(Math.abs(value.fundingSigned), true);
    $("breakEvenValue").textContent = formatPrice(value.breakEvenPrice);
    $("winRateValue").textContent = formatPercent(value.breakEvenWinRate);
    $("effectiveLeverageValue").textContent = `${formatNumber(value.effectiveLeverage, 2, 2)}×`;
    $("freeBalanceValue").textContent = formatMoney(value.freeBalance);
    $("maxLeverageValue").textContent = finite(value.maximumEstimatedLeverage)
      ? `${formatNumber(value.maximumEstimatedLeverage, 1, 1)}×`
      : "—";
  }

  function updateAllocationBadge() {
    const total =
      numeric(elements.tp1Allocation.value) +
      (elements.tp2Enabled.checked ? numeric(elements.tp2Allocation.value) : 0) +
      (elements.tp3Enabled.checked ? numeric(elements.tp3Allocation.value) : 0);
    const badge = $("allocationTotal");
    badge.textContent = `${formatNumber(total, 0, 2)}%`;
    badge.classList.toggle("valid", Math.abs(total - 100) <= 0.001);
    badge.classList.toggle("invalid", Math.abs(total - 100) > 0.001);
  }

  function calculateAndRender() {
    if (!Calculator || !I18n) return;
    side = Calculator.detectTradeSide(elements.entryPrice.value, elements.stopLoss.value);
    $("longButton").classList.toggle("active", side === "long");
    $("shortButton").classList.toggle("active", side === "short");
    $("autoDirectionHint").textContent = side
      ? `${I18n.t("autoDetected")}: ${I18n.t(side)}`
      : I18n.t("waitingDirection");
    updateAllocationBadge();
    lastResult = Calculator.calculate(collectInput());
    const complete =
      numeric(elements.balance.value) > 0 &&
      numeric(elements.riskValue.value) > 0 &&
      numeric(elements.leverage.value) > 0 &&
      numeric(elements.entryPrice.value) > 0 &&
      numeric(elements.stopLoss.value) > 0 &&
      numeric(elements.tp1Price.value) > 0 &&
      (elements.stopExecution.value !== "stop-limit" ||
        numeric(elements.stopLimitPrice.value) > 0);
    if (!complete) {
      $("alerts").replaceChildren();
      const status = $("calculationStatus");
      status.classList.remove("valid", "invalid");
      status.textContent = I18n.t("ready");
      $("saveTradeButton").disabled = true;
      blankMetrics();
      return;
    }
    renderAlerts(lastResult);
    renderMetrics(lastResult);
  }

  function showToast(message) {
    const toast = $("toast");
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("show"), 3200);
  }

  function readHistory() {
    try {
      const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeHistory(records) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(records.slice(0, 500)));
  }

  function currentRecord(status) {
    const inputs = collectInput();
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return {
      schema: "crypto-futures-trademath/plan",
      version: 1,
      id,
      createdAt: new Date().toISOString(),
      status,
      language: I18n.getLanguage(),
      inputs,
      calculation: {
        valid: Boolean(lastResult?.valid),
        values: lastResult?.values || {},
        errors: lastResult?.errors || [],
        warnings: lastResult?.warnings || [],
      },
    };
  }

  function saveRecord(status) {
    if (status === "planned" && !lastResult?.valid) return;
    const records = readHistory();
    records.unshift(currentRecord(status));
    writeHistory(records);
    renderHistory();
    showToast(I18n.t(status === "draft" ? "draftSavedToast" : "savedToast"));
  }

  function renderHistory() {
    const list = $("historyList");
    list.replaceChildren();
    const records = readHistory();
    if (!records.length) {
      const empty = document.createElement("div");
      empty.className = "history-empty";
      empty.textContent = I18n.t("noHistory");
      list.append(empty);
      return;
    }

    records.forEach((record) => {
      const item = document.createElement("article");
      item.className = "history-item";
      const inputs = record.inputs || {};
      const values = record.calculation?.values || {};

      const symbolCell = document.createElement("div");
      symbolCell.className = "history-symbol";
      const dot = document.createElement("span");
      dot.className = `side-dot ${inputs.side === "short" ? "short" : ""}`;
      const symbolText = document.createElement("span");
      const symbolStrong = document.createElement("strong");
      const symbolSmall = document.createElement("small");
      symbolStrong.textContent = inputs.symbol || "—";
      symbolSmall.textContent = `${String(inputs.side || "").toUpperCase()} · ${
        record.status === "draft" ? I18n.t("draft") : I18n.t("planned")
      }`;
      symbolText.append(symbolStrong, symbolSmall);
      symbolCell.append(dot, symbolText);

      const cells = [
        ["Entry", formatPrice(inputs.entryPrice)],
        [
          "Risk",
          inputs.riskMode === "amount"
            ? formatMoney(inputs.riskValue)
            : `${formatNumber(inputs.riskValue ?? inputs.riskPercent, 0, 2)}%`,
        ],
        ["Net R:R", formatRatio(values.netRR)],
        ["Created", new Date(record.createdAt).toLocaleDateString(locale())],
      ].map(([label, text]) => {
        const cell = document.createElement("div");
        const small = document.createElement("small");
        const strong = document.createElement("strong");
        small.textContent = label;
        strong.textContent = text;
        cell.append(small, strong);
        return cell;
      });

      const remove = document.createElement("button");
      remove.type = "button";
      remove.setAttribute("aria-label", I18n.t("removeRecord"));
      remove.textContent = "×";
      remove.addEventListener("click", () => {
        writeHistory(readHistory().filter((itemRecord) => itemRecord.id !== record.id));
        renderHistory();
        showToast(I18n.t("deletedToast"));
      });

      item.append(symbolCell, ...cells, remove);
      list.append(item);
    });
  }

  function downloadBlob(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportHistoryJson() {
    const payload = {
      schema: "crypto-futures-trademath/history",
      version: 1,
      exportedAt: new Date().toISOString(),
      records: readHistory(),
    };
    downloadBlob(
      `trademath-history-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(payload, null, 2),
      "application/json",
    );
  }

  function csvEscape(value) {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  function exportHistoryCsv() {
    const headers = [
      "created_at",
      "status",
      "symbol",
      "side",
      "exchange",
      "balance",
      "risk_mode",
      "risk_value",
      "effective_risk_percent",
      "leverage",
      "entry",
      "stop",
      "quantity",
      "notional",
      "net_risk",
      "net_profit",
      "net_rr",
    ];
    const rows = readHistory().map((record) => {
      const input = record.inputs || {};
      const value = record.calculation?.values || {};
      return [
        record.createdAt,
        record.status,
        input.symbol,
        input.side,
        input.exchangeName,
        input.balance,
        input.riskMode || "percent",
        input.riskValue ?? input.riskPercent,
        value.effectiveRiskPercent,
        input.leverage,
        input.entryPrice,
        input.stopLoss,
        value.quantity,
        value.notional,
        value.netRisk,
        value.netProfit,
        value.netRR,
      ].map(csvEscape);
    });
    downloadBlob(
      `trademath-history-${new Date().toISOString().slice(0, 10)}.csv`,
      [headers.join(","), ...rows.map((row) => row.join(","))].join("\n"),
      "text/csv;charset=utf-8",
    );
  }

  async function importHistory(file) {
    try {
      const payload = JSON.parse(await file.text());
      if (
        payload?.schema !== "crypto-futures-trademath/history" ||
        !Array.isArray(payload.records)
      ) {
        throw new Error("Invalid schema");
      }
      const existing = readHistory();
      const byId = new Map([...payload.records, ...existing].map((record) => [record.id, record]));
      writeHistory([...byId.values()]);
      renderHistory();
      showToast(I18n.t("importedToast"));
    } catch {
      showToast(I18n.t("invalidImport"));
    } finally {
      $("importJsonInput").value = "";
    }
  }

  function downloadCurrentPlan() {
    const record = currentRecord(lastResult?.valid ? "planned" : "draft");
    const symbol = (record.inputs.symbol || "trade").replace(/[^a-z0-9_-]/gi, "");
    downloadBlob(
      `trademath-${symbol}-${new Date().toISOString().replaceAll(":", "-")}.json`,
      JSON.stringify(record, null, 2),
      "application/json",
    );
  }

  function renderLanguages(query = "") {
    const search = query.trim().toLocaleLowerCase();
    const list = $("languageList");
    list.replaceChildren();
    I18n.languages
      .filter((language) =>
        `${language.name} ${language.native} ${language.code}`.toLocaleLowerCase().includes(search),
      )
      .forEach((language) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "language-option";
        button.classList.toggle("active", language.code === I18n.getLanguage());
        button.setAttribute("role", "option");
        button.setAttribute("aria-selected", String(language.code === I18n.getLanguage()));

        const names = document.createElement("span");
        const native = document.createElement("strong");
        const english = document.createElement("small");
        native.textContent = language.native;
        english.textContent = language.name;
        names.append(native, english);

        const status = document.createElement("strong");
        status.textContent = "✓";
        status.title = I18n.t("fullTranslation");
        button.append(names, status);
        button.addEventListener("click", () => {
          I18n.setLanguage(language.code);
          renderLanguages($("languageSearch").value);
          $("languageDialog").close();
        });
        list.append(button);
      });
  }

  async function fetchFunding() {
    if (!ContractSpecs || !fullSymbol()) return;
    const button = $("fetchFundingButton");
    const previous = button.textContent;
    button.disabled = true;
    button.textContent = "Loading…";
    try {
      const funding = await ContractSpecs.fetchFunding(contractContext());
      if (!finite(funding.ratePercent)) throw new Error("Funding rate missing");
      elements.fundingRate.value = formatEditableNumber(funding.ratePercent);
      if (funding.nextFundingTime) {
        button.title = `${I18n.t("nextFunding")}: ${new Date(
          funding.nextFundingTime,
        ).toLocaleString(locale())}`;
      }
      calculateAndRender();
      showToast(I18n.t("copiedFunding"));
    } catch {
      showToast(I18n.t("fundingUnavailable"));
    } finally {
      button.textContent = previous;
      syncFundingControls();
    }
  }

  function resetForm() {
    form.reset();
    side = "";
    elements.exchange.value = "okx";
    elements.otherExchange.value = "gate";
    syncTargetState(2);
    syncTargetState(3);
    $("longButton").classList.remove("active");
    $("shortButton").classList.remove("active");
    applyExchange(true);
  }

  function setupDialogs() {
    $("historyButton").addEventListener("click", () => {
      renderHistory();
      $("historyDialog").showModal();
    });
    $("languageButton").addEventListener("click", () => {
      $("languageSearch").value = "";
      renderLanguages();
      $("languageDialog").showModal();
      window.setTimeout(() => $("languageSearch").focus(), 30);
    });
    $("themeButton").addEventListener("click", () => {
      applyTheme(document.documentElement.dataset.theme || "dark", false);
      $("themeDialog").showModal();
    });
    document.querySelectorAll("[data-theme-option]").forEach((button) => {
      button.addEventListener("click", () => {
        applyTheme(button.dataset.themeOption);
        $("themeDialog").close();
      });
    });
    document.querySelectorAll("[data-close-dialog]").forEach((button) => {
      button.addEventListener("click", () => $(button.dataset.closeDialog).close());
    });
    document.querySelectorAll("dialog").forEach((dialog) => {
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) dialog.close();
      });
    });
  }

  function setupInstall() {
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
      $("installButton").classList.remove("is-hidden");
      showToast(I18n.t("installedReady"));
    });
    $("installButton").addEventListener("click", async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      $("installButton").classList.add("is-hidden");
    });

    if ("serviceWorker" in navigator) {
      window.addEventListener("load", async () => {
        try {
          const registration = await navigator.serviceWorker.register("./sw.js", { scope: "./" });
          registration.addEventListener("updatefound", () => {
            const worker = registration.installing;
            worker?.addEventListener("statechange", () => {
              if (worker.state === "installed" && navigator.serviceWorker.controller) {
                showToast(I18n.t("updateAvailable"));
              }
            });
          });
        } catch {
          // The calculator remains fully usable without service-worker registration.
        }
      });
    }
  }

  function setupEvents() {
    form.addEventListener("input", (event) => {
      if (event.target === elements.symbol) {
        const cursor = elements.symbol.selectionStart;
        elements.symbol.value = elements.symbol.value.toUpperCase();
        elements.symbol.setSelectionRange(cursor, cursor);
        if (elements.specMode.value === "auto") {
          clearContractSpecs(true);
          scheduleSpecsFetch();
        }
      }
      if (event.target === elements.makerFee || event.target === elements.takerFee) {
        $("makerFeeDisplay").textContent = `${formatNumber(elements.makerFee.value, 4, 4)}%`;
        $("takerFeeDisplay").textContent = `${formatNumber(elements.takerFee.value, 4, 4)}%`;
      }
      if (
        elements.specMode.value === "manual" &&
        [
          elements.quantityMode,
          elements.contractSize,
          elements.maintenanceMargin,
          elements.quantityStep,
          elements.priceTick,
          elements.minimumQuantity,
          elements.minimumNotional,
        ].includes(event.target)
      ) {
        syncSpecControls();
      }
      calculateAndRender();
    });
    form.addEventListener(
      "blur",
      (event) => {
        if (event.target.matches('input[inputmode="decimal"], input[inputmode="numeric"]')) {
          normalizeNumberField(event.target);
          calculateAndRender();
        }
      },
      true,
    );
    form.addEventListener("change", calculateAndRender);
    elements.exchange.addEventListener("change", () => applyExchange(true));
    elements.otherExchange.addEventListener("change", () => applyExchange(true));
    elements.feeTier.addEventListener("change", applyFeeTier);
    elements.quoteCurrency.addEventListener("change", () => {
      $("settlementValue").textContent = elements.quoteCurrency.value;
      clearContractSpecs(true);
      scheduleSpecsFetch();
    });
    elements.entryExecution.addEventListener("change", () => {
      syncExecutionControls();
      calculateAndRender();
    });
    elements.stopExecution.addEventListener("change", () => {
      syncExecutionControls();
      calculateAndRender();
    });
    elements.targetExecution.addEventListener("change", () => {
      syncExecutionControls();
      calculateAndRender();
    });
    elements.fundingEnabled.addEventListener("change", () => {
      syncFundingControls();
      calculateAndRender();
    });
    elements.specMode.addEventListener("change", () => {
      if (elements.specMode.value === "auto") {
        clearContractSpecs(true);
        scheduleSpecsFetch();
      } else {
        currentSpecs = null;
        syncSpecControls();
        calculateAndRender();
      }
    });
    elements.quantityMode.addEventListener("change", () => {
      syncSpecControls();
      calculateAndRender();
    });
    $("loadSpecsButton").addEventListener("click", () => fetchContractSpecifications(true));
    $("advancedToggle").addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      advancedEnabled = !advancedEnabled;
      syncAdvancedControls(true);
      if (advancedEnabled && elements.specMode.value === "auto") scheduleSpecsFetch();
      calculateAndRender();
    });
    elements.tp2Enabled.addEventListener("change", () => handleTargetToggle(2));
    elements.tp3Enabled.addEventListener("change", () => handleTargetToggle(3));
    $("resetButton").addEventListener("click", resetForm);
    $("saveDraftButton").addEventListener("click", () => saveRecord("draft"));
    $("saveTradeButton").addEventListener("click", () => saveRecord("planned"));
    $("downloadPlanButton").addEventListener("click", downloadCurrentPlan);
    $("fetchFundingButton").addEventListener("click", fetchFunding);
    $("exportJsonButton").addEventListener("click", exportHistoryJson);
    $("exportCsvButton").addEventListener("click", exportHistoryCsv);
    $("importJsonInput").addEventListener("change", (event) => {
      const [file] = event.target.files;
      if (file) importHistory(file);
    });
    $("clearHistoryButton").addEventListener("click", () => {
      if (!window.confirm(I18n.t("clearConfirm"))) return;
      writeHistory([]);
      renderHistory();
    });
    $("languageSearch").addEventListener("input", (event) => renderLanguages(event.target.value));
    document.addEventListener("trademath:languagechange", () => {
      populateFeeTiers(false);
      renderHistory();
      renderLanguages($("languageSearch")?.value || "");
      applyTheme(document.documentElement.dataset.theme || "dark", false);
      syncAdvancedControls();
      calculateAndRender();
    });
  }

  function init() {
    I18n.apply();
    applyTheme(localStorage.getItem(THEME_KEY) || "dark", false);
    setupDialogs();
    setupEvents();
    setupInstall();
    syncTargetState(2);
    syncTargetState(3);
    syncAdvancedControls();
    applyExchange(true);
    renderLanguages();
    renderHistory();
    calculateAndRender();
  }

  init();
})();
