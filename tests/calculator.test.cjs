const test = require("node:test");
const assert = require("node:assert/strict");
const { calculate, detectTradeSide, parseFlexibleNumber } = require("../calculator.js");

function baseInput(overrides = {}) {
  return {
    side: "short",
    balance: 1000,
    riskMode: "percent",
    riskValue: 5,
    leverage: 100,
    entryPrice: 65491,
    stopLoss: 65545,
    stopOrderType: "stop-market",
    stopLimitPrice: 0,
    advancedEnabled: true,
    specsVerified: true,
    quantityMode: "base",
    contractSize: 1,
    makerFee: 0,
    takerFee: 0,
    entryExecution: "taker",
    stopExecution: "taker",
    targetExecution: "maker",
    entrySlippage: 0,
    stopSlippage: 0,
    targetSlippage: 0,
    fundingRate: 0,
    fundingIntervals: 0,
    fundingEnabled: true,
    maintenanceMargin: 0.4,
    maximumExchangeLeverage: 0,
    quantityStep: 0.000001,
    priceTick: 0.1,
    minimumQuantity: 0.000001,
    minimumNotional: 5,
    targets: [{ enabled: true, label: "TP1", price: 64771, allocation: 100 }],
    ...overrides,
  };
}

test("matches the original gross-risk position sizing example before costs", () => {
  const result = calculate(baseInput());
  assert.equal(result.valid, true);
  assert.ok(Math.abs(result.values.rawQuantity - 50 / 54) < 1e-10);
  assert.ok(Math.abs(result.values.grossRR - 720 / 54) < 1e-10);
  assert.ok(result.values.netRisk <= 50);
});

test("net-risk sizing includes fees and slippage and therefore reduces quantity", () => {
  const result = calculate(
    baseInput({
      makerFee: 0.02,
      takerFee: 0.05,
      entrySlippage: 0.02,
      stopSlippage: 0.03,
      targetSlippage: 0.01,
      quantityStep: 0.001,
      minimumQuantity: 0.001,
    }),
  );
  assert.equal(result.valid, true);
  assert.ok(result.values.quantity < 0.5);
  assert.ok(result.values.netRisk <= 50);
  assert.ok(result.values.netRisk > result.values.grossRisk);
});

test("50x leverage reproduces insufficient margin when gross-only sizing is used", () => {
  const result = calculate(baseInput({ leverage: 50 }));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.titleKey === "insufficientMargin"));
});

test("rejects a long plan with target below entry and liquidation before distant stop", () => {
  const result = calculate(
    baseInput({
      side: "long",
      stopLoss: 6555,
      targets: [{ enabled: true, label: "TP1", price: 64771, allocation: 100 }],
    }),
  );
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.titleKey === "directionTitle"));
  assert.ok(result.errors.some((error) => error.titleKey === "liquidationRisk"));
});

test("multiple targets use allocation-weighted profit", () => {
  const result = calculate(
    baseInput({
      targets: [
        { enabled: true, label: "TP1", price: 65000, allocation: 50 },
        { enabled: true, label: "TP2", price: 64500, allocation: 30 },
        { enabled: true, label: "TP3", price: 64000, allocation: 20 },
      ],
    }),
  );
  const expectedDistance = (65491 - 65000) * 0.5 + (65491 - 64500) * 0.3 + (65491 - 64000) * 0.2;
  assert.ok(Math.abs(result.values.grossProfit - result.values.quantity * expectedDistance) < 1e-6);
});

test("accepts common international and mixed number formats", () => {
  const thousandFormats = [
    "1000",
    "1,000",
    "1.000",
    "1,000.00",
    "1.000,00",
    "1.000.00",
  ];
  thousandFormats.forEach((value) => assert.equal(parseFlexibleNumber(value), 1000));

  const priceFormats = [
    "35723",
    "35,723",
    "35.723",
    "35,723.00",
    "35.723,00",
    "35.723.00",
  ];
  priceFormats.forEach((value) => assert.equal(parseFlexibleNumber(value), 35723));
  assert.equal(parseFlexibleNumber("0.125"), 0.125);
  assert.equal(parseFlexibleNumber("1.2340"), 1.234);
  assert.equal(parseFlexibleNumber("1,23,456"), 123456);
});

test("risk in quote currency matches the equivalent percentage risk", () => {
  const percentResult = calculate(baseInput());
  const amountResult = calculate(baseInput({ riskMode: "amount", riskValue: 50 }));
  assert.equal(amountResult.valid, true);
  assert.equal(amountResult.values.riskBudget, 50);
  assert.equal(amountResult.values.effectiveRiskPercent, 5);
  assert.equal(amountResult.values.quantity, percentResult.values.quantity);
});

test("trade direction is inferred from entry and stop", () => {
  assert.equal(detectTradeSide(65491, 65545), "short");
  assert.equal(detectTradeSide("65,491", "65,445"), "long");
  assert.equal(detectTradeSide("", 65545), "");
  assert.equal(detectTradeSide(65491, 65491), "");
});

test("advanced off excludes optional costs but keeps isolated liquidation safety active", () => {
  const result = calculate(
    baseInput({
      advancedEnabled: false,
      entrySlippage: 4,
      stopSlippage: 4,
      targetSlippage: 4,
      fundingRate: 1,
      fundingIntervals: 2,
      quantityStep: 1000,
      priceTick: 0,
    }),
  );
  assert.equal(result.valid, true);
  assert.equal(result.values.entrySlippageCost, 0);
  assert.equal(result.values.stopSlippageCost, 0);
  assert.equal(result.values.targetSlippageCost, 0);
  assert.equal(Math.abs(result.values.fundingSigned), 0);
  assert.equal(result.values.quantity, result.values.rawQuantity);
  assert.ok(Number.isFinite(result.values.liquidationPrice));
  assert.ok(Number.isFinite(result.values.maximumEstimatedLeverage));
  assert.ok(result.info.some((item) => item.titleKey === "advancedExcluded"));
});

test("liquidation-before-stop remains a blocking error with advanced off", () => {
  const result = calculate(
    baseInput({
      side: "long",
      advancedEnabled: false,
      entryPrice: 65491,
      stopLoss: 60000,
      targets: [{ enabled: true, label: "TP1", price: 70000, allocation: 100 }],
    }),
  );
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.titleKey === "liquidationRisk"));
});

test("entered leverage is blocked when it exceeds the Entry-SL liquidation ceiling", () => {
  const result = calculate(
    baseInput({
      leverage: 30,
      entryPrice: 100,
      stopLoss: 104,
      targets: [{ enabled: true, label: "TP1", price: 90, allocation: 100 }],
    }),
  );
  const error = result.errors.find((item) => item.titleKey === "liquidationRisk");
  assert.equal(result.valid, false);
  assert.ok(error);
  assert.equal(error.vars.entered, 30);
  assert.ok(error.vars.max < 30);
  assert.equal(result.values.liquidationBeforeStop, true);
});

test("verified exchange maximum leverage is also a blocking ceiling", () => {
  const result = calculate(baseInput({ leverage: 100, maximumExchangeLeverage: 50 }));
  const error = result.errors.find((item) => item.titleKey === "exchangeLeverageExceeded");
  assert.equal(result.valid, false);
  assert.ok(error);
  assert.equal(error.vars.entered, 100);
  assert.equal(error.vars.max, 50);
  assert.equal(result.values.maximumEstimatedLeverage, 50);
});

test("a valid isolated plan keeps stop strictly between entry and liquidation", () => {
  const result = calculate(baseInput({ leverage: 100 }));
  assert.equal(result.valid, true);
  assert.ok(result.values.liquidationPrice > 65545);
  assert.ok(65545 > 65491);
});

test("maker-mode entry and Reduce-Only Limit target force slippage estimates to zero", () => {
  const result = calculate(
    baseInput({
      entryExecution: "maker",
      targetExecution: "maker",
      entrySlippage: 5,
      targetSlippage: 5,
    }),
  );
  assert.equal(result.valid, true);
  assert.equal(result.values.entrySlippageCost, 0);
  assert.equal(result.values.targetSlippageCost, 0);
});

test("stop-limit uses its limit price and warns that the fill is not guaranteed", () => {
  const result = calculate(
    baseInput({
      stopOrderType: "stop-limit",
      stopLimitPrice: 65560,
      stopSlippage: 5,
    }),
  );
  assert.equal(result.valid, true);
  assert.equal(result.values.stopExitPrice, 65560);
  assert.equal(result.values.stopSlippageCost, 0);
  assert.ok(result.warnings.some((warning) => warning.titleKey === "stopLimitRisk"));
});

test("contract-based instruments round contracts before converting back to coin quantity", () => {
  const result = calculate(
    baseInput({
      quantityMode: "contracts",
      contractSize: 0.01,
      quantityStep: 0.01,
      minimumQuantity: 0.01,
    }),
  );
  assert.equal(result.valid, true);
  assert.equal(result.values.contractQuantity, 92.59);
  assert.ok(Math.abs(result.values.executableCoinQuantity - 0.9259) < 1e-12);
});

test("unverified specifications keep the calculation usable but visibly unrounded", () => {
  const result = calculate(baseInput({ specsVerified: false, quantityStep: 0, priceTick: 0 }));
  assert.equal(result.valid, true);
  assert.equal(result.values.quantity, result.values.rawQuantity);
  assert.ok(result.warnings.some((warning) => warning.titleKey === "specsUnverified"));
});
