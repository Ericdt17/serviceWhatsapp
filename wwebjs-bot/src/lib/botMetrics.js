"use strict";

const startedAt = Date.now();

const counters = {
  ordersOk: 0,
  ordersFailed: 0,
  ordersSkippedIdempotent: 0,
  coreApi401: 0,
  waReconnects: 0,
  circuitBreakerOpens: 0,
};

function increment(name, amount = 1) {
  if (!Object.prototype.hasOwnProperty.call(counters, name)) return;
  counters[name] += amount;
}

function snapshot() {
  return {
    ...counters,
    uptimeSeconds: Math.floor(process.uptime()),
    startedAt: new Date(startedAt).toISOString(),
  };
}

/** @internal — tests only */
function resetForTests() {
  for (const key of Object.keys(counters)) {
    counters[key] = 0;
  }
}

module.exports = {
  increment,
  snapshot,
  resetForTests,
};
