(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.TradeMathCalculator = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  "use strict";

  const EPSILON = 1e-9;

  function parseFlexibleNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
    if (value === null || value === undefined) return NaN;

    const cleaned = String(value)
      .trim()
      .replace(/[\s\u00a0\u202f']/g, "")
      .replace(/[^\d.,+-]/g, "");
    if (!cleaned || !/\d/.test(cleaned)) return NaN;

    const negative = cleaned.startsWith("-");
    const unsigned = cleaned.replace(/[+-]/g, "");
    const commaCount = (unsigned.match(/,/g) || []).length;
    const dotCount = (unsigned.match(/\./g) || []).length;

    let normalized = unsigned;
    if (commaCount && dotCount) {
      const decimalSeparator =
        unsigned.lastIndexOf(",") > unsigned.lastIndexOf(".") ? "," : ".";
      const groupingSeparator = decimalSeparator === "," ? "." : ",";
      normalized = unsigned.replaceAll(groupingSeparator, "");
      const decimalIndex = normalized.lastIndexOf(decimalSeparator);
      normalized =
        normalized.slice(0, decimalIndex).replaceAll(decimalSeparator, "") +
        "." +
        normalized.slice(decimalIndex + 1);
    } else if (commaCount || dotCount) {
      const separator = commaCount ? "," : ".";
      const parts = unsigned.split(separator);
      if (parts.length === 2) {
        const [integerPart, fractionPart] = parts;
        const isDecimal = integerPart === "0" || fractionPart.length !== 3;
        normalized = isDecimal ? `${integerPart}.${fractionPart}` : `${integerPart}${fractionPart}`;
      } else {
        const lastPart = parts.at(-1);
        const allThousands = parts.slice(1).every((part) => part.length === 3);
        const groupedIndianStyle =
          lastPart.length === 3 &&
          parts.slice(1, -1).every((part) => part.length === 2 || part.length === 3);
        if (allThousands || groupedIndianStyle) {
          normalized = parts.join("");
        } else {
          normalized = `${parts.slice(0, -1).join("")}.${lastPart}`;
        }
      }
    }

    const parsed = Number(`${negative ? "-" : ""}${normalized}`);
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  function detectTradeSide(entryPrice, stopLoss) {
    const entry = parseFlexibleNumber(entryPrice);
    const stop = parseFlexibleNumber(stopLoss);
    if (!(entry > 0) || !(stop > 0) || Math.abs(entry - stop) < EPSILON) return "";
    return stop < entry ? "long" : "short";
  }

  function number(value, fallback = 0) {
    const parsed = parseFlexibleNumber(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function roundTo(value, decimals = 8) {
    if (!Number.isFinite(value)) return value;
    const factor = 10 ** decimals;
    return Math.round((value + Number.EPSILON) * factor) / factor;
  }

  function decimalPlaces(value) {
    const text = String(value);
    if (text.includes("e-")) return Number(text.split("e-")[1]);
    return (text.split(".")[1] || "").length;
  }

  function floorToStep(value, step) {
    if (!(step > 0) || !(value > 0)) return 0;
    const precision = Math.min(12, decimalPlaces(step) + 2);
    const units = Math.floor((value + EPSILON) / step);
    return roundTo(units * step, precision);
  }

  function alignedToTick(value, tick) {
    if (!(tick > 0)) return false;
    const units = value / tick;
    return Math.abs(units - Math.round(units)) < 1e-7;
  }

  function executionRate(execution, makerFee, takerFee) {
    return (execution === "maker" ? makerFee : takerFee) / 100;
  }

  function blankResult(input, errors) {
    return {
      valid: false,
      side: input.side || "",
      errors,
      warnings: [],
      info: [],
      targets: [],
      values: {},
    };
  }

  function calculate(rawInput) {
    const legacyRisk = rawInput.riskValue ?? rawInput.riskPercent;
    const input = {
      side:
        rawInput.side === "long"
          ? "long"
          : rawInput.side === "short"
            ? "short"
            : detectTradeSide(rawInput.entryPrice, rawInput.stopLoss),
      balance: number(rawInput.balance),
      riskMode: rawInput.riskMode === "amount" ? "amount" : "percent",
      riskValue: number(legacyRisk),
      leverage: number(rawInput.leverage),
      entryPrice: number(rawInput.entryPrice),
      stopLoss: number(rawInput.stopLoss),
      stopOrderType: rawInput.stopOrderType === "stop-limit" ? "stop-limit" : "stop-market",
      stopLimitPrice: number(rawInput.stopLimitPrice),
      advancedEnabled: rawInput.advancedEnabled !== false,
      specsVerified: rawInput.specsVerified !== false,
      quantityMode: rawInput.quantityMode === "contracts" ? "contracts" : "base",
      contractSize: Math.max(0, number(rawInput.contractSize, 1)),
      makerFee: number(rawInput.makerFee),
      takerFee: number(rawInput.takerFee),
      entryExecution: rawInput.entryExecution === "maker" ? "maker" : "taker",
      stopExecution: "taker",
      targetExecution: rawInput.targetExecution === "taker" ? "taker" : "maker",
      entrySlippage: Math.max(0, number(rawInput.entrySlippage)),
      stopSlippage: Math.max(0, number(rawInput.stopSlippage)),
      targetSlippage: Math.max(0, number(rawInput.targetSlippage)),
      fundingEnabled: rawInput.fundingEnabled !== false,
      fundingRate: number(rawInput.fundingRate),
      fundingIntervals: Math.max(0, number(rawInput.fundingIntervals)),
      maintenanceMargin: Math.max(0, number(rawInput.maintenanceMargin)),
      quantityStep: number(rawInput.quantityStep),
      priceTick: number(rawInput.priceTick),
      minimumQuantity: Math.max(0, number(rawInput.minimumQuantity)),
      minimumNotional: Math.max(0, number(rawInput.minimumNotional)),
      targets: Array.isArray(rawInput.targets)
        ? rawInput.targets
            .filter((target) => target && target.enabled !== false)
            .map((target, index) => ({
              label: target.label || `TP${index + 1}`,
              price: number(target.price),
              allocation: number(target.allocation),
            }))
        : [],
    };

    if (!input.advancedEnabled || input.entryExecution === "maker") {
      input.entrySlippage = 0;
    }
    if (
      !input.advancedEnabled ||
      input.stopOrderType === "stop-limit"
    ) {
      input.stopSlippage = 0;
    }
    if (!input.advancedEnabled || input.targetExecution === "maker") {
      input.targetSlippage = 0;
    }
    if (!input.advancedEnabled || !input.fundingEnabled) {
      input.fundingRate = 0;
      input.fundingIntervals = 0;
    }

    const errors = [];
    const warnings = [];
    const info = [];

    const requiredPositive = [
      input.balance,
      input.riskValue,
      input.leverage,
      input.entryPrice,
      input.stopLoss,
    ];
    if (input.stopOrderType === "stop-limit") requiredPositive.push(input.stopLimitPrice);
    if (
      requiredPositive.some((value) => !(value > 0)) ||
      !input.targets.length ||
      input.targets.some((target) => !(target.price > 0) || !(target.allocation >= 0))
    ) {
      errors.push({
        type: "error",
        titleKey: "invalidPlan",
        bodyKey: "requiredNumbers",
      });
      return blankResult(input, errors);
    }

    if (
      input.advancedEnabled &&
      input.specsVerified &&
      (!(input.quantityStep > 0) ||
        !(input.priceTick > 0) ||
        (input.quantityMode === "contracts" && !(input.contractSize > 0)))
    ) {
      errors.push({
        type: "error",
        titleKey: "invalidContractStep",
        bodyKey: "invalidContractStep",
      });
      return blankResult(input, errors);
    }

    const allocationTotal = input.targets.reduce((sum, target) => sum + target.allocation, 0);
    if (Math.abs(allocationTotal - 100) > 0.001) {
      errors.push({
        type: "error",
        titleKey: "allocationTitle",
        bodyKey: "allocationBody",
        vars: { value: roundTo(allocationTotal, 2) },
      });
    }

    if (!input.side) {
      errors.push({
        type: "error",
        titleKey: "directionTitle",
        bodyKey: "autoDirectionBody",
      });
      return blankResult(input, errors);
    }

    const directionValid =
      input.side === "long"
        ? input.stopLoss < input.entryPrice && input.targets.every((target) => target.price > input.entryPrice)
        : input.stopLoss > input.entryPrice && input.targets.every((target) => target.price < input.entryPrice);
    if (!directionValid) {
      errors.push({
        type: "error",
        titleKey: "directionTitle",
        bodyKey: input.side === "long" ? "longDirection" : "shortDirection",
      });
    }

    const stopLimitDirectionValid =
      input.stopOrderType !== "stop-limit" ||
      (input.side === "long"
        ? input.stopLimitPrice <= input.stopLoss && input.stopLimitPrice < input.entryPrice
        : input.stopLimitPrice >= input.stopLoss && input.stopLimitPrice > input.entryPrice);
    if (!stopLimitDirectionValid) {
      errors.push({
        type: "error",
        titleKey: "stopLimitDirectionTitle",
        bodyKey:
          input.side === "long" ? "stopLimitLongDirection" : "stopLimitShortDirection",
      });
    }

    const entryFeeRate = executionRate(input.entryExecution, input.makerFee, input.takerFee);
    const stopFeeRate = executionRate(input.stopExecution, input.makerFee, input.takerFee);
    const targetFeeRate = executionRate(input.targetExecution, input.makerFee, input.takerFee);
    const entrySlippageRate = input.entrySlippage / 100;
    const stopSlippageRate = input.stopSlippage / 100;
    const targetSlippageRate = input.targetSlippage / 100;
    const fundingRateTotal = (input.fundingRate / 100) * input.fundingIntervals;
    const fundingCostDirection = input.side === "long" ? fundingRateTotal : -fundingRateTotal;
    const payableFundingRate = Math.max(0, fundingCostDirection);
    const stopExitPrice =
      input.stopOrderType === "stop-limit" ? input.stopLimitPrice : input.stopLoss;

    const grossRiskPerCoin = Math.abs(input.entryPrice - stopExitPrice);
    const entryFeePerCoin = input.entryPrice * entryFeeRate;
    const stopFeePerCoin = stopExitPrice * stopFeeRate;
    const entrySlippagePerCoin = input.entryPrice * entrySlippageRate;
    const stopSlippagePerCoin = stopExitPrice * stopSlippageRate;
    const fundingPayablePerCoin = input.entryPrice * payableFundingRate;
    const netRiskPerCoin =
      grossRiskPerCoin +
      entryFeePerCoin +
      stopFeePerCoin +
      entrySlippagePerCoin +
      stopSlippagePerCoin +
      fundingPayablePerCoin;

    if (!(netRiskPerCoin > 0)) {
      errors.push({
        type: "error",
        titleKey: "invalidPlan",
        bodyKey: "requiredNumbers",
      });
      return blankResult(input, errors);
    }

    const riskBudget =
      input.riskMode === "amount"
        ? input.riskValue
        : input.balance * (input.riskValue / 100);
    const effectiveRiskPercent =
      input.balance > 0 ? (riskBudget / input.balance) * 100 : NaN;
    const rawQuantity = riskBudget / netRiskPerCoin;
    let rawOrderQuantity = rawQuantity;
    let executableOrderQuantity = rawQuantity;
    let quantity = rawQuantity;
    const applyContractRules = input.advancedEnabled && input.specsVerified;
    if (applyContractRules && input.quantityMode === "contracts") {
      rawOrderQuantity = rawQuantity / input.contractSize;
      executableOrderQuantity = floorToStep(rawOrderQuantity, input.quantityStep);
      quantity = executableOrderQuantity * input.contractSize;
    } else if (applyContractRules) {
      executableOrderQuantity = floorToStep(rawQuantity, input.quantityStep);
      quantity = executableOrderQuantity;
    }
    const notional = quantity * input.entryPrice;
    const initialMargin = notional / input.leverage;
    const entryFee = notional * entryFeeRate;
    const stopFee = quantity * stopExitPrice * stopFeeRate;
    const entrySlippageCost = notional * entrySlippageRate;
    const stopSlippageCost = quantity * stopExitPrice * stopSlippageRate;
    const fundingSigned = notional * fundingCostDirection;
    const fundingPayable = Math.max(0, fundingSigned);
    const grossRisk = quantity * grossRiskPerCoin;
    const netRisk =
      grossRisk + entryFee + stopFee + entrySlippageCost + stopSlippageCost + fundingPayable;

    const normalizedTargets = input.targets.map((target) => ({
      ...target,
      weight: target.allocation / 100,
    }));
    const weightedExitPrice = normalizedTargets.reduce(
      (sum, target) => sum + target.price * target.weight,
      0,
    );
    const grossProfit = normalizedTargets.reduce(
      (sum, target) =>
        sum + quantity * Math.abs(target.price - input.entryPrice) * target.weight,
      0,
    );
    const targetExitNotional = normalizedTargets.reduce(
      (sum, target) => sum + quantity * target.price * target.weight,
      0,
    );
    const targetFee = targetExitNotional * targetFeeRate;
    const targetSlippageCost = targetExitNotional * targetSlippageRate;
    const netProfit =
      grossProfit - entryFee - targetFee - entrySlippageCost - targetSlippageCost - fundingSigned;

    const grossRR = grossRisk > 0 ? grossProfit / grossRisk : NaN;
    const netRR = netRisk > 0 ? netProfit / netRisk : NaN;
    const grossROE = initialMargin > 0 ? (grossProfit / initialMargin) * 100 : NaN;
    const netROE = initialMargin > 0 ? (netProfit / initialMargin) * 100 : NaN;
    const marginUsage = input.balance > 0 ? (initialMargin / input.balance) * 100 : NaN;
    const effectiveLeverage = input.balance > 0 ? notional / input.balance : NaN;
    const freeBalance = input.balance - initialMargin - entryFee;

    const effectiveMaintenanceRate = input.maintenanceMargin / 100 + input.takerFee / 100;
    const liquidationPrice =
      input.side === "long"
        ? (input.entryPrice * (1 - 1 / input.leverage)) / (1 - effectiveMaintenanceRate)
        : (input.entryPrice * (1 + 1 / input.leverage)) / (1 + effectiveMaintenanceRate);

    const maximumLeverageDenominator =
      input.side === "long"
        ? 1 - (input.stopLoss / input.entryPrice) * (1 - effectiveMaintenanceRate)
        : (input.stopLoss / input.entryPrice) * (1 + effectiveMaintenanceRate) - 1;
    const maximumEstimatedLeverage =
      maximumLeverageDenominator > 0 ? 1 / maximumLeverageDenominator : Infinity;

    const liquidationBeforeStop =
      input.side === "long"
        ? liquidationPrice >= input.stopLoss
        : liquidationPrice <= input.stopLoss;

    const entryPathCost = entryFee + entrySlippageCost + fundingSigned;
    const breakEvenPrice =
      quantity > 0
        ? input.side === "long"
          ? (input.entryPrice + entryPathCost / quantity) /
            (1 - targetFeeRate - targetSlippageRate)
          : (input.entryPrice - entryPathCost / quantity) /
            (1 + targetFeeRate + targetSlippageRate)
        : NaN;
    const breakEvenWinRate =
      netProfit > 0 && netRisk > 0 ? (netRisk / (netRisk + netProfit)) * 100 : NaN;

    if (
      applyContractRules &&
      input.minimumQuantity > 0 &&
      !(executableOrderQuantity >= input.minimumQuantity)
    ) {
      errors.push({
        type: "error",
        titleKey: "belowMinimumQuantity",
        bodyKey: "belowMinimumQuantity",
      });
    }
    if (applyContractRules && input.minimumNotional > 0 && !(notional >= input.minimumNotional)) {
      errors.push({
        type: "error",
        titleKey: "belowMinimumNotional",
        bodyKey: "belowMinimumNotional",
      });
    }
    if (initialMargin + entryFee > input.balance + EPSILON) {
      errors.push({
        type: "error",
        titleKey: "insufficientMargin",
        bodyKey: "insufficientMarginBody",
        vars: { required: initialMargin + entryFee, balance: input.balance },
      });
    }
    if (liquidationBeforeStop) {
      errors.push({
        type: "error",
        titleKey: "liquidationRisk",
        bodyKey: "liquidationRiskBody",
        vars: {
          liq: liquidationPrice,
          stop: input.stopLoss,
          max: maximumEstimatedLeverage,
        },
      });
    }

    if (input.stopOrderType === "stop-limit") {
      warnings.push({
        type: "warning",
        titleKey: "stopLimitRisk",
        bodyKey: "stopLimitRiskBody",
      });
    }
    if (input.advancedEnabled && !input.specsVerified) {
      warnings.push({
        type: "warning",
        titleKey: "specsUnverified",
        bodyKey: "specsUnverifiedBody",
      });
    }
    if (!input.advancedEnabled) {
      info.push({
        type: "info",
        titleKey: "advancedExcluded",
        bodyKey: "advancedExcludedBody",
      });
    }

    if (effectiveRiskPercent >= 10) {
      warnings.push({
        type: "warning",
        titleKey: "riskCritical",
        bodyKey: "riskCriticalBody",
        vars: { risk: effectiveRiskPercent },
      });
    } else if (effectiveRiskPercent >= 5) {
      warnings.push({
        type: "warning",
        titleKey: "riskWarning",
        bodyKey: "riskWarningBody",
        vars: { risk: effectiveRiskPercent },
      });
    }

    if (marginUsage >= 80 && marginUsage <= 100) {
      warnings.push({
        type: "warning",
        titleKey: "marginWarning",
        bodyKey: "marginWarningBody",
        vars: { usage: marginUsage },
      });
    }
    if (effectiveLeverage >= 20) {
      warnings.push({
        type: "warning",
        titleKey: "leverageWarning",
        bodyKey: "leverageWarningBody",
        vars: { leverage: effectiveLeverage },
      });
    }

    const costsAtStop = Math.max(0, netRisk - grossRisk);
    const costShare = netRisk > 0 ? (costsAtStop / netRisk) * 100 : 0;
    if (costShare >= 25) {
      warnings.push({
        type: "warning",
        titleKey: "costWarning",
        bodyKey: "costWarningBody",
        vars: { share: costShare },
      });
    }
    if (netRR > 0 && netRR < 1) {
      warnings.push({
        type: "warning",
        titleKey: "rrWarning",
        bodyKey: "rrWarningBody",
      });
    }

    const stopDistancePercent =
      (Math.abs(input.stopLoss - input.entryPrice) / input.entryPrice) * 100;
    if (stopDistancePercent > 25) {
      warnings.push({
        type: "warning",
        titleKey: "typoWarning",
        bodyKey: "typoWarningBody",
      });
    }

    const roundingDifference =
      rawQuantity > 0 ? ((rawQuantity - quantity) / rawQuantity) * 100 : 0;
    if (applyContractRules && quantity > 0 && roundingDifference >= 0.05) {
      info.push({
        type: "info",
        titleKey: "roundedInfo",
        bodyKey: "roundedInfoBody",
        vars: { raw: rawQuantity, qty: quantity },
      });
    }
    if (
      applyContractRules &&
      (!alignedToTick(input.entryPrice, input.priceTick) ||
        !alignedToTick(input.stopLoss, input.priceTick) ||
        input.targets.some((target) => !alignedToTick(target.price, input.priceTick)))
    ) {
      info.push({
        type: "info",
        titleKey: "invalidContractStep",
        bodyKey: "invalidContractStep",
      });
    }

    return {
      valid: errors.length === 0,
      side: input.side,
      errors,
      warnings,
      info,
      targets: normalizedTargets,
      values: {
        allocationTotal,
        riskMode: input.riskMode,
        riskValue: input.riskValue,
        riskBudget,
        effectiveRiskPercent,
        advancedEnabled: input.advancedEnabled,
        specsVerified: input.specsVerified,
        quantityMode: input.quantityMode,
        contractSize: input.contractSize,
        rawCoinQuantity: rawQuantity,
        rawOrderQuantity,
        executableOrderQuantity,
        contractQuantity:
          input.quantityMode === "contracts" ? executableOrderQuantity : NaN,
        executableCoinQuantity: quantity,
        rawQuantity,
        quantity,
        notional,
        initialMargin,
        marginUsage,
        grossRisk,
        netRisk,
        grossProfit,
        netProfit,
        grossRR,
        netRR,
        grossROE,
        netROE,
        entryFee,
        stopFee,
        targetFee,
        feesAtStop: entryFee + stopFee,
        feesAtTargets: entryFee + targetFee,
        entrySlippageCost,
        stopSlippageCost,
        targetSlippageCost,
        slippageAtStop: entrySlippageCost + stopSlippageCost,
        slippageAtTargets: entrySlippageCost + targetSlippageCost,
        fundingSigned,
        fundingPayable,
        stopExitPrice,
        weightedExitPrice,
        liquidationPrice,
        liquidationBeforeStop,
        maximumEstimatedLeverage,
        breakEvenPrice,
        breakEvenWinRate,
        effectiveLeverage,
        freeBalance,
        netRiskAccountPercent: input.balance > 0 ? (netRisk / input.balance) * 100 : NaN,
        netProfitAccountPercent: input.balance > 0 ? (netProfit / input.balance) * 100 : NaN,
        costShare,
        stopDistancePercent,
        roundingDifference,
      },
    };
  }

  return {
    calculate,
    parseFlexibleNumber,
    detectTradeSide,
    floorToStep,
    alignedToTick,
    roundTo,
  };
});
