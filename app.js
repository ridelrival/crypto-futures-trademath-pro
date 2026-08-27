(function () {
  "use strict";

  const Calculator = window.TradeMathCalculator;
  const I18n = window.TradeMathI18n;
  const Exchanges = window.TRADEMATH_EXCHANGES;
  const ContractSpecs = window.TradeMathContractSpecs;
  const ExchangeMaxLeverage = window.TradeMathExchangeMaxLeverage;
  const ExchangeFeeRates = window.TradeMathExchangeFeeRates;
  const HISTORY_KEY = "trademath-history-v1";
  const THEME_KEY = "trademath-theme";
  const ADVANCED_KEY = "trademath-advanced-enabled";
  const INSTRUMENT_KEY = "trademath-last-instrument";
  const EXIT_PLAN_PANEL_KEY = "trademath-exit-plan-panel-open";
  const EXCHANGE_PANEL_KEY = "trademath-exchange-panel-open";
  const ATTENTION_PANEL_KEY = "trademath-attention-panel-open";
  const ADVANCED_RESULTS_PANEL_KEY = "trademath-advanced-results-panel-open";
  const REFRESH_STATE_KEY = "trademath-refresh-state-v1";

  const $ = (id) => document.getElementById(id);
  const form = $("tradeForm");
  const elements = {
    balance: $("balance"),
    riskValue: $("riskValue"),
    riskUnit: $("riskUnit"),
    leverage: $("leverage"),
    symbol: $("symbol"),
    instrumentSymbol: $("instrumentSymbol"),
    quoteCurrency: $("quoteCurrency"),
    entryPrice: $("entryPrice"),
    stopLoss: $("stopLoss"),
    stopLimitPrice: $("stopLimitPrice"),
    stopLimitField: $("stopLimitField"),
    exchange: $("exchange"),
    feeTier: $("feeTier"),
    customFeeFields: $("customFeeFields"),
    makerFee: $("makerFee"),
    takerFee: $("takerFee"),
    entryExecution: $("entryExecution"),
    stopExecution: $("stopExecution"),
    stopTriggerSource: $("stopTriggerSource"),
    targetExecution: $("targetExecution"),
    feeRefreshButton: $("feeRefreshButton"),
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
    maximumExchangeLeverage: $("maximumExchangeLeverage"),
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
    "openingCostValue",
    "amountFromCostValue",
  ];

  let side = "";
  let advancedEnabled = localStorage.getItem(ADVANCED_KEY) !== "off";
  let currentSpecs = null;
  let specsRequestId = 0;
  let specsDebounceTimer = null;
  let exchangeMaxLeverageRequestId = 0;
  let exchangeMaxLeverageDebounceTimer = null;
  let exchangeMaxLeverageView = { state: "waiting" };
  let lastResult = null;
  let deferredInstallPrompt = null;
  let toastTimer = null;
  let dialogScrollY = 0;
  let dialogScrollRestoreFrame = 0;
  let activeSelectControl = null;
  let themedSelectCloseTimer = null;

  const SETTINGS_CHILD_DIALOG_IDS = ["historyDialog", "languageDialog", "themeDialog"];

  function setInputModality(modality) {
    document.documentElement.dataset.inputModality = modality;
  }

  function usesPointerInput() {
    return document.documentElement.dataset.inputModality !== "keyboard";
  }

  function setupInputModality() {
    setInputModality("pointer");
    document.addEventListener("pointerdown", () => setInputModality("pointer"), true);
    document.addEventListener(
      "keydown",
      (event) => {
        if (
          event.key === "Tab" ||
          event.key === "Enter" ||
          event.key === " " ||
          event.key.startsWith("Arrow")
        ) {
          setInputModality("keyboard");
        }
      },
      true,
    );
  }

  function clearPointerFocus() {
    if (!usesPointerInput()) return;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const active = document.activeElement;
        if (active instanceof HTMLElement && active !== document.body) active.blur();
      });
    });
  }

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

  function genericQuantityDecimals(value) {
    const absolute = Math.abs(numeric(value));
    if (absolute >= 0.01) return 4;
    if (absolute >= 0.0001) return 6;
    if (absolute >= 0.000001) return 8;
    return 10;
  }

  function currentExchangeId() {
    return elements.exchange.value;
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
    const base = elements.instrumentSymbol.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    return base ? `${base}${elements.quoteCurrency.value}` : "";
  }

  function instrumentBase() {
    return elements.instrumentSymbol.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  function formatEditableNumber(value) {
    if (!Number.isFinite(value)) return "";
    const formatted = value.toLocaleString("en-US", {
      useGrouping: Math.abs(value) >= 1000,
      maximumFractionDigits: 12,
    });
    return formatted;
  }

  function normalizeNumberField(input) {
    if (!input?.value.trim()) return;
    const parsed = Calculator.parseFlexibleNumber(input.value);
    if (!Number.isFinite(parsed)) return;
    input.value = formatEditableNumber(parsed);
    input.title = I18n.t("interpretedNumber", { value: input.value });
  }

  function syncSystemBars(theme) {
    const canvasColor =
      theme === "light" ? "#f2f5f7" : theme === "pitch-black" ? "#000000" : "#0c0e0f";
    document.documentElement.style.backgroundColor = canvasColor;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", canvasColor);
    document
      .querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
      ?.setAttribute("content", theme === "light" ? "default" : "black-translucent");

    if (!window.Capacitor?.isNativePlatform?.()) return;
    const systemBars =
      window.Capacitor?.Plugins?.SystemBars ||
      window.Capacitor?.registerPlugin?.("SystemBars");
    systemBars
      ?.setStyle?.({ style: theme === "light" ? "LIGHT" : "DARK" })
      .catch(() => {});
  }

  function applyTheme(nextTheme, persist = true) {
    const supportedThemes = ["dark", "light", "pitch-black"];
    const theme = supportedThemes.includes(nextTheme) ? nextTheme : "dark";
    const themeKey = {
      dark: "darkTheme",
      light: "lightTheme",
      "pitch-black": "pitchBlackTheme",
    }[theme];
    const themeIcon = {
      dark: "☾",
      light: "☀",
      "pitch-black": "●",
    }[theme];
    document.documentElement.dataset.theme = theme;
    syncSystemBars(theme);
    $("themeIcon").textContent = themeIcon;
    $("activeTheme").textContent = I18n.t(themeKey);
    if ($("settingsThemeValue")) $("settingsThemeValue").textContent = I18n.t(themeKey);
    document
      .querySelectorAll("[data-theme-option]")
      .forEach((button) => {
        const active = button.dataset.themeOption === theme;
        button.classList.toggle("active", active);
        button.setAttribute("aria-selected", String(active));
      });
    if (persist) localStorage.setItem(THEME_KEY, theme);
  }

  function syncSettingsValues() {
    const languageValue = $("settingsLanguageValue");
    const themeValue = $("settingsThemeValue");
    if (languageValue) languageValue.textContent = I18n.getLanguage().toUpperCase();
    if (themeValue) {
      const theme = document.documentElement.dataset.theme || "dark";
      const themeKey = {
        dark: "darkTheme",
        light: "lightTheme",
        "pitch-black": "pitchBlackTheme",
      }[theme] || "darkTheme";
      themeValue.textContent = I18n.t(themeKey);
    }
  }

  function syncRefreshButtonLabel(refreshing = false) {
    const button = $("refreshButton");
    if (!button) return;
    const label = I18n.t(refreshing ? "refreshingData" : "refreshData");
    button.setAttribute("aria-label", label);
    button.title = label;
  }

  function syncFeeRefreshButtonLabel(refreshing = false) {
    const button = elements.feeRefreshButton;
    if (!button) return;
    const label = I18n.t(refreshing ? "refreshingFees" : "refreshFees");
    const text = button.querySelector("span:last-child");
    if (text) text.textContent = label;
    button.setAttribute("aria-label", label);
    button.title = label;
  }

  function captureRefreshState(reason = "refresh") {
    const controls = {};
    Array.from(form.elements).forEach((control) => {
      if (!control.id || ["button", "submit", "file"].includes(control.type)) return;
      controls[control.id] =
        control.type === "checkbox" || control.type === "radio"
          ? { checked: control.checked }
          : { value: control.value };
    });
    sessionStorage.setItem(
      REFRESH_STATE_KEY,
      JSON.stringify({
        reason,
        controls,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
      }),
    );
  }

  function restoreRefreshState() {
    let snapshot = null;
    try {
      snapshot = JSON.parse(sessionStorage.getItem(REFRESH_STATE_KEY) || "null");
    } catch {
      snapshot = null;
    }
    sessionStorage.removeItem(REFRESH_STATE_KEY);
    if (!snapshot?.controls) return false;

    const exchangeState = snapshot.controls.exchange;
    if (exchangeState?.value && Exchanges[exchangeState.value]) {
      elements.exchange.value = exchangeState.value;
    }
    applyExchange(true);

    Object.entries(snapshot.controls).forEach(([id, state]) => {
      if (id === "exchange") return;
      const control = document.getElementById(id);
      if (!control) return;
      if ("checked" in state && (control.type === "checkbox" || control.type === "radio")) {
        control.checked = Boolean(state.checked);
      } else if ("value" in state) {
        control.value = state.value;
      }
    });

    applyFeeTier();
    syncTargetState(2);
    syncTargetState(3);
    updateAutomaticTp1Allocation();
    syncAdvancedControls();
    syncExecutionControls();
    syncFundingControls();

    if (
      advancedEnabled &&
      elements.specMode.value === "auto" &&
      elements.instrumentSymbol.value
    ) {
      clearContractSpecs(true);
      scheduleSpecsFetch(true);
    }
    scheduleExchangeMaxLeverageFetch();

    window.requestAnimationFrame(() => {
      window.scrollTo(Number(snapshot.scrollX) || 0, Number(snapshot.scrollY) || 0);
    });
    return snapshot.reason || "refresh";
  }

  async function refreshApplicationData() {
    const button = $("refreshButton");
    if (button?.disabled) return;
    captureRefreshState();
    button.disabled = true;
    button.classList.add("refreshing");
    button.setAttribute("aria-busy", "true");
    syncRefreshButtonLabel(true);

    if ("serviceWorker" in navigator) {
      try {
        const registration = await navigator.serviceWorker.getRegistration("./");
        await registration?.update();
      } catch {
        // Reload and public instrument refresh still proceed if the update check fails.
      }
    }
    window.location.reload();
  }

  async function refreshExchangeFees() {
    const button = elements.feeRefreshButton;
    if (!button || button.disabled) return;
    button.disabled = true;
    button.classList.add("refreshing");
    button.setAttribute("aria-busy", "true");
    button.removeAttribute("data-error");
    syncFeeRefreshButtonLabel(true);

    try {
      const result = await ExchangeFeeRates?.fetchPublicFeeRates(contractContext());
      if (!result?.available) {
        const key =
          result?.reason === "ticker-required"
            ? "feesTickerRequired"
            : result?.reason === "custom"
              ? "feesCustomRetained"
              : "feesPublicUnavailable";
        showToast(I18n.t(key));
        return;
      }

      const exchange = currentExchange();
      const baseTier = exchange.tiers[0];
      const baseTierSelected = Boolean(baseTier && elements.feeTier.value === baseTier.id);
      if (!baseTier) throw new Error("Exchange base fee tier is unavailable");

      baseTier.maker = result.makerPercent;
      baseTier.taker = result.takerPercent;
      if (baseTierSelected) applyFeeTier();

      $("feeSourceText").textContent = result.sourceLabel || exchange.sourceLabel;
      const sourceLink = $("feeSourceLink");
      sourceLink.classList.toggle("is-hidden", !result.source);
      if (result.source) sourceLink.href = result.source;

      showToast(
        I18n.t(baseTierSelected ? "feesRefreshed" : "feesBaseRefreshed", {
          maker: formatNumber(result.makerPercent, 4, 4),
          taker: formatNumber(result.takerPercent, 4, 4),
        }),
      );
    } catch (error) {
      showToast(I18n.t("feesRefreshFailed"));
      button.dataset.error = error instanceof Error ? error.message : String(error);
    } finally {
      button.disabled = false;
      button.classList.remove("refreshing");
      button.removeAttribute("aria-busy");
      syncFeeRefreshButtonLabel();
    }
  }

  function contractContext() {
    return {
      exchangeId: currentExchangeId(),
      symbolBase: elements.instrumentSymbol.value,
      quoteCurrency: elements.quoteCurrency.value,
    };
  }

  function renderExchangeMaxLeverage(view = exchangeMaxLeverageView) {
    exchangeMaxLeverageView = view;
    const card = $("exchangeMaxLeverageCard");
    const value = $("exchangeMaxLeverageValue");
    const status = $("exchangeMaxLeverageStatus");
    const source = $("exchangeMaxLeverageSource");
    if (!card || !value || !status || !source) return;

    const state = view.state || "waiting";
    card.className = `exchange-max-leverage-card ${state}`;
    card.title = I18n.t("exchangeMaxLeverageNote");
    card.removeAttribute("data-error");
    source.classList.toggle("is-hidden", !view.source);
    if (view.source) source.href = view.source;
    else source.removeAttribute("href");

    if (state === "loading") {
      value.textContent = "…";
      status.textContent = I18n.t("exchangeMaxLeverageChecking", {
        exchange: currentExchange().name,
      });
      return;
    }

    if (state === "live" || state === "cached") {
      value.textContent = `${formatNumber(view.maximumLeverage, 0, 2)}×`;
      if (state === "live") {
        status.textContent = I18n.t("exchangeMaxLeverageLive", {
          exchange: currentExchange().name,
          symbol: view.symbol || fullSymbol(),
        });
      } else {
        const fetched = view.fetchedAt
          ? new Date(view.fetchedAt).toLocaleString(locale(), {
              year: "numeric",
              month: "short",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "—";
        status.textContent = I18n.t("exchangeMaxLeverageCached", {
          exchange: currentExchange().name,
          symbol: view.symbol || fullSymbol(),
          time: fetched,
        });
      }
      return;
    }

    value.textContent = "—";
    status.textContent = I18n.t(
      state === "custom"
        ? "exchangeMaxLeverageCustom"
        : state === "unavailable"
          ? "exchangeMaxLeverageUnavailable"
          : "exchangeMaxLeverageEnterTicker",
    );
  }

  function scheduleExchangeMaxLeverageFetch() {
    window.clearTimeout(exchangeMaxLeverageDebounceTimer);
    const requestId = ++exchangeMaxLeverageRequestId;
    if (!instrumentBase()) {
      renderExchangeMaxLeverage({ state: "waiting" });
      return;
    }
    if (currentExchangeId() === "custom" || !ExchangeMaxLeverage?.fetchMaximumLeverage) {
      renderExchangeMaxLeverage({ state: "custom" });
      return;
    }

    renderExchangeMaxLeverage({ state: "loading" });
    exchangeMaxLeverageDebounceTimer = window.setTimeout(async () => {
      try {
        const result = await ExchangeMaxLeverage.fetchMaximumLeverage(
          contractContext(),
          { force: true },
        );
        if (requestId !== exchangeMaxLeverageRequestId) return;
        if (!result.available) {
          renderExchangeMaxLeverage({
            state: "unavailable",
            source: result.source,
          });
          return;
        }
        renderExchangeMaxLeverage({
          ...result,
          state:
            result.cached || result.stale || result.offlineFallback
              ? "cached"
              : "live",
        });
      } catch (error) {
        if (requestId !== exchangeMaxLeverageRequestId) return;
        renderExchangeMaxLeverage({ state: "unavailable" });
        $("exchangeMaxLeverageCard").dataset.error =
          error instanceof Error ? error.message : String(error);
      }
    }, 500);
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
    elements.maximumExchangeLeverage.value = "";
    if (keepMaintenance) {
      elements.maintenanceMargin.value = currentExchange().maintenanceMargin;
    }
    $("specSourceLink").classList.add("is-hidden");
    $("specStatus").removeAttribute("title");
    setSpecStatus(
      fullSymbol() ? "unverified" : "waiting",
      fullSymbol() ? "specsUnverifiedShort" : "genericSpecsIdle",
    );
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
    elements.maximumExchangeLeverage.value = specs.maximumExchangeLeverage
      ? formatEditableNumber(specs.maximumExchangeLeverage)
      : "";
    elements.maintenanceMargin.value = specs.maintenanceMargin
      ? formatEditableNumber(specs.maintenanceMargin)
      : formatEditableNumber(currentExchange().maintenanceMargin);

    const source = $("specSourceLink");
    source.classList.toggle("is-hidden", !specs.source);
    if (specs.source) source.href = specs.source;
    const fetched = new Date(specs.fetchedAt).toLocaleString(locale(), {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    const statusKey =
      specs.offlineFallback || specs.stale
        ? "specsCachedStale"
        : specs.cached
          ? "specsCached"
          : "specsVerified";
    setSpecStatus(
      specs.offlineFallback || specs.stale ? "stale" : "verified",
      statusKey,
      { time: fetched },
    );
    $("specStatus").title = `${currentExchange().name} · ${fullSymbol()}`;
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
    $("fetchFundingButton").disabled = !enabled || !fullSymbol();
  }

  function syncSpecControls() {
    const auto = elements.specMode.value === "auto";
    elements.specMode.disabled = !advancedEnabled;
    [
      elements.quantityMode,
      elements.contractSize,
      elements.maintenanceMargin,
      elements.quantityStep,
      elements.priceTick,
      elements.minimumQuantity,
      elements.minimumNotional,
      elements.maximumExchangeLeverage,
    ].forEach((input) => {
      input.disabled = !advancedEnabled || auto;
    });
    if (!advancedEnabled) {
      setSpecStatus("off", "advancedOff");
    } else if (auto) {
      if (currentSpecs?.verified) {
        const fetched = new Date(currentSpecs.fetchedAt).toLocaleString(locale(), {
          year: "numeric",
          month: "short",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });
        const statusKey =
          currentSpecs.offlineFallback || currentSpecs.stale
            ? "specsCachedStale"
            : currentSpecs.cached
              ? "specsCached"
              : "specsVerified";
        setSpecStatus(
          currentSpecs.offlineFallback || currentSpecs.stale ? "stale" : "verified",
          statusKey,
          { time: fetched },
        );
      } else {
        setSpecStatus(
          fullSymbol() ? "unverified" : "waiting",
          fullSymbol() ? "specsUnverifiedShort" : "genericSpecsIdle",
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

  function restoreExchangePanelState() {
    const panel = $("exchangeExecutionPanel");
    if (!panel) return;
    panel.open = localStorage.getItem(EXCHANGE_PANEL_KEY) !== "closed";
  }

  function restoreAttentionPanelState() {
    const panel = $("attentionPanel");
    if (!panel) return;
    panel.open = localStorage.getItem(ATTENTION_PANEL_KEY) !== "closed";
  }

  function arrangeInputPanels() {
    if (document.getElementById("inputPrimaryStack")) return;

    const exchangePanel = $("exchangeExecutionPanel");
    const parametersPanel = $("parametersPanel");
    const exitPlanPanel = $("exitPlanPanel");
    const advancedPanel = form.querySelector(".details-panel");
    if (!exchangePanel || !parametersPanel || !exitPlanPanel || !advancedPanel) return;

    const primaryStack = document.createElement("div");
    primaryStack.id = "inputPrimaryStack";
    primaryStack.className = "input-layout-stack input-primary-stack";

    const parametersStack = document.createElement("div");
    parametersStack.id = "inputParametersStack";
    parametersStack.className = "input-layout-stack input-parameters-stack";

    form.insertBefore(primaryStack, advancedPanel);
    form.insertBefore(parametersStack, advancedPanel);
    primaryStack.append(exchangePanel, exitPlanPanel, advancedPanel);
    parametersStack.append(parametersPanel);
  }

  function restoreExitPlanPanelState() {
    const panel = $("exitPlanPanel");
    if (!panel) return;
    panel.open = localStorage.getItem(EXIT_PLAN_PANEL_KEY) !== "closed";
  }

  function restoreAdvancedResultsPanelState() {
    const panel = $("advancedResultsPanel");
    if (!panel) return;
    panel.open = localStorage.getItem(ADVANCED_RESULTS_PANEL_KEY) !== "closed";
  }

  function persistAdvancedResultsPanelState(open = $("advancedResultsPanel")?.open) {
    if (typeof open !== "boolean") return;
    localStorage.setItem(ADVANCED_RESULTS_PANEL_KEY, open ? "open" : "closed");
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
    setSpecStatus("loading", "specsLoading");
    try {
      const specs = await ContractSpecs.fetchSpecs(contractContext(), force);
      if (requestId !== specsRequestId) return;
      applyContractSpecs(specs);
      showToast(
        I18n.t(
          specs.offlineFallback || specs.stale ? "specsOfflineLoaded" : "specsLoaded",
        ),
      );
    } catch (error) {
      if (requestId !== specsRequestId) return;
      clearContractSpecs(true);
      setSpecStatus("unverified", "specsUnavailable");
      $("specStatus").title = error instanceof Error ? error.message : String(error);
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
    const exchange = currentExchange();
    elements.quoteCurrency.value = exchange.settlement === "USDC" ? "USDC" : "USDT";
    $("settlementDisplay").textContent = elements.quoteCurrency.value;
    $("instrumentSettlement").textContent = elements.quoteCurrency.value;
    clearContractSpecs(true);
    $("feeSourceText").textContent = exchange.sourceLabel;
    const link = $("feeSourceLink");
    link.classList.toggle("is-hidden", !exchange.source);
    if (exchange.source) link.href = exchange.source;
    link.title = I18n.t("feesVary");
    populateFeeTiers(resetTier);
    syncAdvancedControls();
    scheduleSpecsFetch();
    scheduleExchangeMaxLeverageFetch();
  }

  function syncTargetState(targetNumber) {
    const enabled = elements[`tp${targetNumber}Enabled`].checked;
    elements[`tp${targetNumber}Price`].disabled = !enabled;
    elements[`tp${targetNumber}Allocation`].disabled = !enabled;
  }

  function updateAutomaticTp1Allocation() {
    const secondaryAllocation =
      (elements.tp2Enabled.checked ? numeric(elements.tp2Allocation.value) : 0) +
      (elements.tp3Enabled.checked ? numeric(elements.tp3Allocation.value) : 0);
    const tp1Allocation = Math.max(0, 100 - secondaryAllocation);
    elements.tp1Allocation.value = formatEditableNumber(tp1Allocation);
    $("tp1AllocationDisplay").textContent =
      `TP1: ${formatNumber(tp1Allocation, 0, 2)}%`;
  }

  function handleTargetToggle(targetNumber) {
    syncTargetState(targetNumber);
    if (targetNumber === 2) {
      if (elements.tp2Enabled.checked && numeric(elements.tp2Allocation.value) === 0) {
        elements.tp2Allocation.value = 30;
      }
      if (!elements.tp2Enabled.checked) {
        elements.tp2Allocation.value = 0;
      }
    }
    if (targetNumber === 3) {
      if (elements.tp3Enabled.checked && numeric(elements.tp3Allocation.value) === 0) {
        elements.tp3Allocation.value = 20;
      }
      if (!elements.tp3Enabled.checked) {
        elements.tp3Allocation.value = 0;
      }
    }
    updateAutomaticTp1Allocation();
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
      symbolBase: "COIN",
      quoteCurrency: elements.quoteCurrency.value,
      symbol: `COIN${elements.quoteCurrency.value}`,
      instrumentSymbol: fullSymbol(),
      entryPrice: numeric(elements.entryPrice.value),
      stopLoss: numeric(elements.stopLoss.value),
      stopOrderType: elements.stopExecution.value,
      stopTriggerSource: elements.stopTriggerSource.value,
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
      maximumExchangeLeverage:
        elements.specMode.value === "auto" && currentSpecs?.verified
          ? numeric(currentSpecs.maximumExchangeLeverage)
          : numeric(elements.maximumExchangeLeverage.value),
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
    ["entered", "max", "usage", "leverage", "share", "risk"].forEach((key) => {
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
    const enteredLeverage = numeric(elements.leverage.value);
    const maximumEstimatedLeverage = result.values?.maximumEstimatedLeverage;
    const maximumLeverageIssue =
      finite(maximumEstimatedLeverage) &&
      maximumEstimatedLeverage > 0 &&
      enteredLeverage > maximumEstimatedLeverage + 1e-9
        ? {
            type: "warning",
            titleKey: "maxEstimatedLeverageWarning",
            bodyKey: "maxEstimatedLeverageWarningBody",
            vars: { entered: enteredLeverage, max: maximumEstimatedLeverage },
          }
        : null;
    const remainingWarningSlots = Math.max(
      0,
      4 - (maximumLeverageIssue ? 1 : 0) - result.errors.length,
    );
    const combined = [
      ...(maximumLeverageIssue ? [maximumLeverageIssue] : []),
      ...result.errors,
      ...result.warnings.slice(0, remainingWarningSlots),
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
    const baseCoin = "COIN";
    const specsVerified = specsVerifiedForCalculation();
    $("quantityMetricLabel").textContent = I18n.t("executableQuantity");
    $("marginCostValue").textContent = formatMoney(value.initialMargin);
    $("marginUsageValue").textContent = `${formatPercent(value.marginUsage)} ${I18n.t("ofAccount")}`;
    $("coinSizeValue").textContent =
      `${formatNumber(
        specsVerified ? value.executableCoinQuantity : value.rawCoinQuantity,
        0,
        specsVerified ? quantityDecimals : genericQuantityDecimals(value.rawCoinQuantity),
      )} ${baseCoin}`;
    $("rawSizeValue").textContent =
      `${I18n.t("rawCoin")}: ${formatNumber(value.rawCoinQuantity, 0, 10)}`;
    $("contractQuantityValue").textContent = finite(value.contractQuantity)
      ? `${formatNumber(value.contractQuantity, 0, 8)} ${I18n.t("contracts")}`
      : specsVerified && elements.quantityMode.value === "base"
        ? I18n.t("baseCoinOrder")
        : I18n.t("contractQuantityOptional");
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
    $("openingCostValue").textContent = formatMoney(value.openingCost);
    $("amountFromCostValue").textContent = formatMoney(value.amountFromOpeningCost);
    $("maxLeverageValue").textContent = finite(value.maximumEstimatedLeverage)
      ? `${formatNumber(value.maximumEstimatedLeverage, 1, 1)}×`
      : "—";
  }

  function updateAllocationBadge() {
    updateAutomaticTp1Allocation();
  }

  function calculateAndRender() {
    if (!Calculator || !I18n) return;
    refreshThemedSelects();
    $("instrumentSettlement").textContent = elements.quoteCurrency.value;
    $("settlementDisplay").textContent = elements.quoteCurrency.value;
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
          closeDialog("languageDialog");
        });
        list.append(button);
      });
  }

  function selectFieldLabel(select) {
    const explicitLabel = select.getAttribute("aria-label");
    if (explicitLabel) return explicitLabel;
    const field = select.closest(".field");
    const fieldLabel = field?.querySelector(":scope > span:first-child");
    if (fieldLabel?.textContent.trim()) return fieldLabel.textContent.trim();
    const namedLabel = select.id ? document.querySelector(`label[for="${select.id}"]`) : null;
    return namedLabel?.textContent.trim() || select.name || "Select";
  }

  function selectedOptionLabel(select) {
    return select.selectedOptions[0]?.textContent.trim() || "";
  }

  function themedSelectHost(select) {
    return select.closest(".themed-select-shell");
  }

  function viewportMetrics() {
    const viewport = window.visualViewport;
    return {
      width: viewport?.width || window.innerWidth,
      height: viewport?.height || window.innerHeight,
      offsetLeft: viewport?.offsetLeft || 0,
      offsetTop: viewport?.offsetTop || 0,
    };
  }

  function positionThemedSelect(select) {
    const dialog = $("themedSelectDialog");
    const host = themedSelectHost(select);
    const trigger = host?.querySelector(".themed-select-trigger");
    if (!trigger) return;

    const viewport = viewportMetrics();
    const rect = trigger.getBoundingClientRect();
    const portrait = viewport.height >= viewport.width;
    const margin = portrait ? 16 : 8;
    const inline = host.classList.contains("is-inline");
    const riskUnit = host.classList.contains("is-risk-unit");
    const width = Math.min(
      Math.max(rect.width, riskUnit ? 104 : inline ? 132 : 280),
      viewport.width - margin * 2,
    );
    const contentHeight = select.options.length * 56 + 12;
    const maxHeight = portrait
      ? Math.min(viewport.height - margin * 2, viewport.height * 0.72, 620)
      : viewport.height - margin * 2;
    const estimatedHeight = Math.min(contentHeight, maxHeight);
    let left;
    let top;

    if (portrait && !riskUnit) {
      left = viewport.offsetLeft + (viewport.width - width) / 2;
      top = viewport.offsetTop + (viewport.height - estimatedHeight) / 2;
    } else {
      left = Math.max(
        viewport.offsetLeft + margin,
        Math.min(
          inline ? rect.right - width : rect.left,
          viewport.offsetLeft + viewport.width - width - margin,
        ),
      );
      top = rect.bottom + 6;
      if (top + estimatedHeight > viewport.offsetTop + viewport.height - margin) {
        top = rect.top - estimatedHeight - 6;
      }
      top = Math.max(
        viewport.offsetTop + margin,
        Math.min(top, viewport.offsetTop + viewport.height - estimatedHeight - margin),
      );
    }

    dialog.style.setProperty("--themed-select-width", `${width}px`);
    dialog.style.setProperty("--themed-select-left", `${left}px`);
    dialog.style.setProperty("--themed-select-top", `${top}px`);
    dialog.style.setProperty(
      "--themed-select-list-max-height",
      `${Math.max(120, maxHeight)}px`,
    );
  }

  function syncThemedSelect(select) {
    const host = themedSelectHost(select);
    if (!host) return;
    const trigger = host.querySelector(".themed-select-trigger");
    const value = trigger?.querySelector(".themed-select-value");
    if (value) value.textContent = selectedOptionLabel(select);
    if (trigger) {
      trigger.disabled = select.disabled;
      trigger.setAttribute("aria-label", selectFieldLabel(select));
      trigger.setAttribute("aria-disabled", String(select.disabled));
    }
    host.classList.toggle("is-disabled", select.disabled);
  }

  function refreshThemedSelects() {
    document.querySelectorAll("select.native-select-control").forEach(syncThemedSelect);
  }

  function closeActiveSelectDialog() {
    window.clearTimeout(themedSelectCloseTimer);
    themedSelectCloseTimer = null;
    if (activeSelectControl) {
      themedSelectHost(activeSelectControl)
        ?.querySelector(".themed-select-trigger")
        ?.setAttribute("aria-expanded", "false");
    }
    const dialog = $("themedSelectDialog");
    dialog.style.removeProperty("--themed-select-width");
    dialog.style.removeProperty("--themed-select-left");
    dialog.style.removeProperty("--themed-select-top");
    dialog.style.removeProperty("--themed-select-list-max-height");
    dialog.classList.remove("is-closing");
    activeSelectControl = null;
  }

  function renderThemedSelectOptions(select) {
    const list = $("themedSelectList");
    list.replaceChildren();
    Array.from(select.options).forEach((option, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "themed-select-option";
      button.style.setProperty("--option-index", index);
      button.setAttribute("role", "option");
      button.setAttribute("aria-label", option.textContent);
      button.setAttribute("aria-selected", String(option.value === select.value));
      button.disabled = option.disabled;
      button.textContent = option.textContent;
      if (option.value === select.value) button.classList.add("active");
      button.addEventListener("click", () => {
        const previousActive = list.querySelector(".active");
        previousActive?.classList.remove("active");
        previousActive?.setAttribute("aria-selected", "false");
        button.classList.add("active", "is-choosing");
        button.setAttribute("aria-selected", "true");
        if (select.value !== option.value) {
          select.value = option.value;
          syncThemedSelect(select);
          select.dispatchEvent(new Event("change", { bubbles: true }));
        }
        closeDialog("themedSelectDialog");
      });
      list.append(button);
    });
  }

  function openThemedSelect(select) {
    if (select.disabled) return;
    window.clearTimeout(themedSelectCloseTimer);
    themedSelectCloseTimer = null;
    $("themedSelectDialog").classList.remove("is-closing");
    activeSelectControl = select;
    $("themedSelectTitle").textContent = selectFieldLabel(select);
    renderThemedSelectOptions(select);
    positionThemedSelect(select);
    themedSelectHost(select)
      ?.querySelector(".themed-select-trigger")
      ?.setAttribute("aria-expanded", "true");
    openDialog("themedSelectDialog");
    if (!usesPointerInput()) {
      window.requestAnimationFrame(() =>
        $("themedSelectList").querySelector(".active")?.focus({ preventScroll: true }),
      );
    }
  }

  function enhanceSelect(select) {
    if (select.classList.contains("native-select-control")) return;
    const host = document.createElement("span");
    host.className = "themed-select-shell";
    if (select.classList.contains("inline-select")) host.classList.add("is-inline");
    if (select.classList.contains("compact-select")) host.classList.add("is-compact");
    if (select.classList.contains("quote-select")) host.classList.add("is-quote");
    if (select.classList.contains("context-select")) host.classList.add("is-context");
    if (select.id === "riskUnit") host.classList.add("is-risk-unit");

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "themed-select-trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-label", selectFieldLabel(select));

    const value = document.createElement("span");
    value.className = "themed-select-value";
    const arrow = document.createElement("span");
    arrow.className = "themed-select-arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "⌄";
    trigger.append(value, arrow);

    select.before(host);
    host.append(select, trigger);
    select.classList.add("native-select-control");
    select.hidden = true;
    select.tabIndex = -1;
    select.setAttribute("aria-hidden", "true");
    trigger.addEventListener("click", () => openThemedSelect(select));
    new MutationObserver(() => syncThemedSelect(select)).observe(select, {
      attributes: true,
      attributeFilter: ["disabled"],
      childList: true,
      characterData: true,
      subtree: true,
    });
    syncThemedSelect(select);
  }

  function setupThemedSelects() {
    document.querySelectorAll("select").forEach(enhanceSelect);
    document.addEventListener(
      "change",
      (event) => {
        if (event.target instanceof HTMLSelectElement) syncThemedSelect(event.target);
      },
      true,
    );
    $("themedSelectDialog").addEventListener("close", closeActiveSelectDialog);
    window.addEventListener("resize", () => {
      if (activeSelectControl && $("themedSelectDialog").open) {
        positionThemedSelect(activeSelectControl);
      }
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
    elements.symbol.value = "COIN";
    elements.instrumentSymbol.value = "";
    localStorage.removeItem(INSTRUMENT_KEY);
    elements.exchange.value = "okx";
    updateAutomaticTp1Allocation();
    syncTargetState(2);
    syncTargetState(3);
    $("longButton").classList.remove("active");
    $("shortButton").classList.remove("active");
    applyExchange(true);
  }

  function lockDialogScroll() {
    if (document.documentElement.classList.contains("dialog-stack-open")) return;
    dialogScrollY = window.scrollY;
    document.documentElement.classList.add("dialog-stack-open");
    document.body.classList.add("dialog-stack-open");
  }

  function restoreDialogScroll() {
    const root = document.documentElement;
    window.cancelAnimationFrame(dialogScrollRestoreFrame);
    root.classList.add("dialog-scroll-restoring");
    root.classList.remove("dialog-stack-open");
    document.body.classList.remove("dialog-stack-open");
    window.scrollTo({ left: 0, top: dialogScrollY, behavior: "auto" });
    dialogScrollRestoreFrame = window.requestAnimationFrame(() => {
      window.scrollTo({ left: 0, top: dialogScrollY, behavior: "auto" });
      dialogScrollRestoreFrame = window.requestAnimationFrame(() => {
        root.classList.remove("dialog-scroll-restoring");
      });
    });
  }

  function syncDialogLayers() {
    const dialogs = Array.from(document.querySelectorAll("dialog"));
    const openDialogs = dialogs.filter((dialog) => dialog.open);
    const activeDialog = openDialogs[openDialogs.length - 1] || null;

    dialogs.forEach((dialog) => {
      dialog.classList.toggle("dialog-covered", dialog.open && dialog !== activeDialog);
    });

    const pageLocked = document.documentElement.classList.contains("dialog-stack-open");
    if (openDialogs.length && !pageLocked) {
      lockDialogScroll();
      return;
    }

    if (!openDialogs.length && pageLocked) {
      restoreDialogScroll();
    }
  }

  function openDialog(dialogId) {
    const dialog = $(dialogId);
    if (!dialog.open) {
      if (!document.querySelector("dialog[open]")) lockDialogScroll();
      dialog.showModal();
    }
    syncDialogLayers();
    if (usesPointerInput()) {
      dialog.tabIndex = -1;
      window.requestAnimationFrame(() => {
        if (dialog.open) dialog.focus({ preventScroll: true });
      });
    }
  }

  function closeDialog(dialogId) {
    const dialog = $(dialogId);
    if (dialogId === "themedSelectDialog") {
      if (!dialog.open || dialog.classList.contains("is-closing")) return;
      dialog.classList.add("is-closing");
      themedSelectCloseTimer = window.setTimeout(() => {
        themedSelectCloseTimer = null;
        if (dialog.open) dialog.close();
        syncDialogLayers();
        clearPointerFocus();
      }, 125);
      return;
    }
    if (dialog.open) dialog.close();
    syncDialogLayers();
    clearPointerFocus();
  }

  function closeSettingsStack() {
    SETTINGS_CHILD_DIALOG_IDS.forEach((dialogId) => {
      const dialog = $(dialogId);
      if (dialog.open) dialog.close();
    });
    if ($("settingsDialog").open) $("settingsDialog").close();
    syncDialogLayers();
    clearPointerFocus();
  }

  function preventDialogBackgroundScroll(event) {
    const openDialogs = Array.from(document.querySelectorAll("dialog[open]"));
    const activeDialog = openDialogs[openDialogs.length - 1];
    if (!activeDialog) return;

    const scrollSurface =
      activeDialog.id === "themedSelectDialog" ? $("themedSelectList") : activeDialog;
    const point = event.touches?.[0] || event;
    const rect = scrollSurface.getBoundingClientRect();
    const insideSurface =
      point.clientX >= rect.left &&
      point.clientX <= rect.right &&
      point.clientY >= rect.top &&
      point.clientY <= rect.bottom;
    if (!insideSurface) event.preventDefault();
  }

  function setupDialogs() {
    $("settingsButton").addEventListener("click", () => {
      syncSettingsValues();
      openDialog("settingsDialog");
    });
    $("historyButton").addEventListener("click", () => {
      renderHistory();
      openDialog("historyDialog");
    });
    $("languageButton").addEventListener("click", () => {
      $("languageSearch").value = "";
      renderLanguages();
      openDialog("languageDialog");
      if (!usesPointerInput()) {
        window.setTimeout(() => $("languageSearch").focus(), 30);
      }
    });
    $("themeButton").addEventListener("click", () => {
      applyTheme(document.documentElement.dataset.theme || "dark", false);
      openDialog("themeDialog");
    });
    $("settingsHistoryAction").addEventListener("click", () => {
      $("historyButton").click();
    });
    $("settingsLanguageAction").addEventListener("click", () => {
      $("languageButton").click();
    });
    $("settingsThemeAction").addEventListener("click", () => {
      $("themeButton").click();
    });
    $("settingsRefreshAction").addEventListener("click", () => {
      closeSettingsStack();
      refreshApplicationData();
    });
    document.querySelectorAll("[data-theme-option]").forEach((button) => {
      button.addEventListener("click", () => {
        const nextTheme = button.dataset.themeOption;
        applyTheme(nextTheme);
        closeDialog("themeDialog");
      });
    });
    document.querySelectorAll("[data-close-dialog]").forEach((button) => {
      button.addEventListener("click", () => closeDialog(button.dataset.closeDialog));
    });
    document.querySelectorAll("dialog").forEach((dialog) => {
      dialog.addEventListener("close", syncDialogLayers);
      dialog.addEventListener("cancel", (event) => {
        if (dialog.id !== "themedSelectDialog") return;
        event.preventDefault();
        closeDialog(dialog.id);
      });
      dialog.addEventListener("pointerdown", (event) => {
        if (dialog.id !== "themedSelectDialog" || event.target !== dialog) return;
        event.preventDefault();
        event.stopPropagation();
        closeDialog(dialog.id);
      });
      dialog.addEventListener("click", (event) => {
        if (event.target !== dialog) return;
        if (dialog.id === "themedSelectDialog") return;
        if (dialog.id === "settingsDialog" || $("settingsDialog").open) {
          closeSettingsStack();
          return;
        }
        closeDialog(dialog.id);
      });
    });
    document.addEventListener("wheel", preventDialogBackgroundScroll, {
      capture: true,
      passive: false,
    });
    document.addEventListener("touchmove", preventDialogBackgroundScroll, {
      capture: true,
      passive: false,
    });
  }

  function setupInstall() {
    const isNativeApp = Boolean(window.Capacitor?.isNativePlatform?.());
    if (isNativeApp) return;

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
      if (event.target === elements.instrumentSymbol) {
        const cursor = elements.instrumentSymbol.selectionStart;
        elements.instrumentSymbol.value = elements.instrumentSymbol.value
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "");
        elements.instrumentSymbol.setSelectionRange(cursor, cursor);
        if (elements.specMode.value === "auto") {
          clearContractSpecs(true);
          scheduleSpecsFetch();
        }
        scheduleExchangeMaxLeverageFetch();
        syncFundingControls();
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
          elements.maximumExchangeLeverage,
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
    elements.feeTier.addEventListener("change", applyFeeTier);
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
    $("advancedToggle").addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      advancedEnabled = !advancedEnabled;
      syncAdvancedControls(true);
      if (advancedEnabled && elements.specMode.value === "auto") scheduleSpecsFetch();
      calculateAndRender();
    });
    $("exchangeExecutionPanel").addEventListener("toggle", (event) => {
      localStorage.setItem(EXCHANGE_PANEL_KEY, event.currentTarget.open ? "open" : "closed");
    });
    $("attentionPanel").addEventListener("toggle", (event) => {
      localStorage.setItem(ATTENTION_PANEL_KEY, event.currentTarget.open ? "open" : "closed");
    });
    $("exitPlanPanel").addEventListener("toggle", (event) => {
      localStorage.setItem(EXIT_PLAN_PANEL_KEY, event.currentTarget.open ? "open" : "closed");
    });
    const advancedResultsPanel = $("advancedResultsPanel");
    advancedResultsPanel.querySelector("summary")?.addEventListener("click", () => {
      persistAdvancedResultsPanelState(!advancedResultsPanel.open);
    });
    advancedResultsPanel.addEventListener("toggle", () => {
      persistAdvancedResultsPanelState(advancedResultsPanel.open);
    });
    window.addEventListener("pagehide", () => persistAdvancedResultsPanelState());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") persistAdvancedResultsPanelState();
    });
    elements.tp2Enabled.addEventListener("change", () => handleTargetToggle(2));
    elements.tp3Enabled.addEventListener("change", () => handleTargetToggle(3));
    $("resetButton").addEventListener("click", resetForm);
    $("refreshButton").addEventListener("click", refreshApplicationData);
    elements.feeRefreshButton?.addEventListener("click", refreshExchangeFees);
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
      syncSettingsValues();
      syncRefreshButtonLabel();
      syncFeeRefreshButtonLabel();
      syncAdvancedControls();
      renderExchangeMaxLeverage();
      calculateAndRender();
    });
  }

  function init() {
    I18n.apply();
    setupInputModality();
    syncRefreshButtonLabel();
    syncFeeRefreshButtonLabel();
    arrangeInputPanels();
    setupThemedSelects();
    applyTheme(localStorage.getItem(THEME_KEY) || "dark", false);
    syncSettingsValues();
    restoreAttentionPanelState();
    restoreExitPlanPanelState();
    restoreExchangePanelState();
    restoreAdvancedResultsPanelState();
    setupDialogs();
    setupEvents();
    setupInstall();
    syncTargetState(2);
    syncTargetState(3);
    elements.instrumentSymbol.value = "";
    localStorage.removeItem(INSTRUMENT_KEY);
    syncAdvancedControls();
    applyExchange(true);
    const restoredStateReason = restoreRefreshState();
    renderLanguages();
    renderHistory();
    calculateAndRender();
    if (restoredStateReason === "refresh") showToast(I18n.t("refreshComplete"));
  }

  init();
})();
