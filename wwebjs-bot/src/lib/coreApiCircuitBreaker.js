"use strict";

const botAlerts = require("./botAlerts");
const botMetrics = require("./botMetrics");
const botLogger = require("./botLogger");

function circuitConfig() {
  const threshold = parseInt(
    process.env.CORE_API_CIRCUIT_FAILURE_THRESHOLD || "5",
    10
  );
  const cooldownMs = parseInt(
    process.env.CORE_API_CIRCUIT_COOLDOWN_MS || "900000",
    10
  );
  return {
    threshold:
      Number.isFinite(threshold) && threshold > 0 ? threshold : 5,
    cooldownMs:
      Number.isFinite(cooldownMs) && cooldownMs > 0 ? cooldownMs : 900000,
  };
}

let consecutiveFailures = 0;
/** @type {number} */
let openUntil = 0;
let alertSentForOpen = false;

function isOpen() {
  return Date.now() < openUntil;
}

function remainingOpenMs() {
  return Math.max(0, openUntil - Date.now());
}

function assertAllowRequest(operation) {
  if (!isOpen()) return;
  const minutes = Math.ceil(remainingOpenMs() / 60000);
  const err = new Error(
    `Core API circuit open — ${operation} skipped (~${minutes} min remaining)`
  );
  err.code = "CORE_API_CIRCUIT_OPEN";
  err.circuitOpen = true;
  throw err;
}

function recordFailure(status, operation) {
  consecutiveFailures += 1;
  const { threshold, cooldownMs } = circuitConfig();
  if (consecutiveFailures < threshold || isOpen()) {
    return;
  }

  openUntil = Date.now() + cooldownMs;
  consecutiveFailures = 0;
  if (!alertSentForOpen) {
    alertSentForOpen = true;
    botMetrics.increment("circuitBreakerOpens");
    botLogger.api.warn(
      { event: "circuit_open", operation, status, cooldownMs },
      "Core API circuit opened"
    );
    botAlerts.notifyCoreApiCircuitOpen({ operation, status });
  }
  console.warn(
    `[coreApiCircuitBreaker] Open after ${threshold} consecutive 5xx — pausing Core API calls for ${Math.round(cooldownMs / 60000)} min (last: ${operation}, HTTP ${status || "network"})`
  );
}

function recordSuccess() {
  if (openUntil > 0 || consecutiveFailures > 0) {
    botLogger.api.info({ event: "circuit_closed" }, "Core API circuit closed");
  }
  consecutiveFailures = 0;
  openUntil = 0;
  alertSentForOpen = false;
}

/**
 * Wrap a Core API fetch; trips breaker on 5xx or network errors.
 * @param {string} operation
 * @param {() => Promise<Response>} fn
 */
async function guardCoreApiCall(operation, fn) {
  assertAllowRequest(operation);
  try {
    const res = await fn();
    if (res.status >= 500) {
      recordFailure(res.status, operation);
    } else {
      recordSuccess();
    }
    return res;
  } catch (err) {
    if (!err.circuitOpen) {
      recordFailure(0, operation);
    }
    throw err;
  }
}

/** @internal — tests only */
function resetForTests() {
  consecutiveFailures = 0;
  openUntil = 0;
  alertSentForOpen = false;
}

module.exports = {
  isOpen,
  remainingOpenMs,
  assertAllowRequest,
  recordFailure,
  recordSuccess,
  guardCoreApiCall,
  resetForTests,
};
