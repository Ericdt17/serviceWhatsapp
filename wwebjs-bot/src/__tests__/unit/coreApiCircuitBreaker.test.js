"use strict";

jest.mock("../../lib/botAlerts", () => ({
  notifyCoreApiCircuitOpen: jest.fn(),
}));

describe("coreApiCircuitBreaker", () => {
  let botAlerts;

  beforeEach(() => {
    jest.resetModules();
    botAlerts = require("../../lib/botAlerts");
    process.env.CORE_API_CIRCUIT_FAILURE_THRESHOLD = "3";
    process.env.CORE_API_CIRCUIT_COOLDOWN_MS = "60000";
    const breaker = require("../../lib/coreApiCircuitBreaker");
    breaker.resetForTests();
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.CORE_API_CIRCUIT_FAILURE_THRESHOLD;
    delete process.env.CORE_API_CIRCUIT_COOLDOWN_MS;
  });

  it("opens after consecutive 5xx failures", () => {
    const breaker = require("../../lib/coreApiCircuitBreaker");

    breaker.recordFailure(500, "packages");
    breaker.recordFailure(502, "packages");
    expect(breaker.isOpen()).toBe(false);

    breaker.recordFailure(503, "packages");
    expect(breaker.isOpen()).toBe(true);
    expect(botAlerts.notifyCoreApiCircuitOpen).toHaveBeenCalledTimes(1);
    expect(() => breaker.assertAllowRequest("create-transaction")).toThrow(
      /circuit open/i
    );
  });

  it("recordSuccess closes an open circuit", () => {
    const breaker = require("../../lib/coreApiCircuitBreaker");
    breaker.recordFailure(500, "a");
    breaker.recordFailure(500, "a");
    breaker.recordFailure(500, "a");
    expect(breaker.isOpen()).toBe(true);

    breaker.recordSuccess();
    expect(breaker.isOpen()).toBe(false);
    expect(() => breaker.assertAllowRequest("packages")).not.toThrow();
  });

  it("guardCoreApiCall records 5xx without throwing", async () => {
    const breaker = require("../../lib/coreApiCircuitBreaker");
    const res = await breaker.guardCoreApiCall("packages", async () => ({
      status: 500,
    }));
    expect(res.status).toBe(500);
    expect(breaker.isOpen()).toBe(false);
  });
});
