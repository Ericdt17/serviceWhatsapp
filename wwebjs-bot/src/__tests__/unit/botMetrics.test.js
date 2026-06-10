"use strict";

const { increment, snapshot, resetForTests } = require("../../lib/botMetrics");

describe("botMetrics", () => {
  beforeEach(() => {
    resetForTests();
  });

  it("increments known counters", () => {
    increment("ordersOk", 2);
    increment("ordersFailed");
    expect(snapshot().ordersOk).toBe(2);
    expect(snapshot().ordersFailed).toBe(1);
  });

  it("ignores unknown counter names", () => {
    increment("unknownMetric");
    expect(snapshot().unknownMetric).toBeUndefined();
  });
});
