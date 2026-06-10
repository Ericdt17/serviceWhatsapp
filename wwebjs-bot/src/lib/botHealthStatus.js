"use strict";

const config = require("../config");
const coreApi = require("../services/coreApiClient");
const botAlerts = require("./botAlerts");
const { isOpen, remainingOpenMs } = require("./coreApiCircuitBreaker");
const botMetrics = require("./botMetrics");

/**
 * Shared health probe for /health, botAlerts heartbeat, and DM #status.
 * @param {{ client: object, clientReady: boolean }} ctx
 */
async function getBotHealthStatus({ client, clientReady }) {
  let state = null;
  try {
    state = await client.getState();
  } catch {
    /* client not initialized yet */
  }
  const whatsappReady = Boolean(clientReady) || state === "CONNECTED";

  let coreApiOk = true;
  let coreApiError = null;
  let coreApiSkipped = !config.USE_CORE_API;

  if (config.USE_CORE_API && whatsappReady) {
    const coreCheck = await coreApi.checkCoreApiHealth();
    coreApiOk = coreCheck.ok;
    coreApiError = coreCheck.error || null;
    coreApiSkipped = Boolean(coreCheck.skipped);
    if (!coreApiOk) {
      botAlerts.notifyCoreApiHealthDown();
    } else {
      botAlerts.notifyCoreApiHealthRecovered();
    }
  }

  const ready = whatsappReady && coreApiOk;
  return {
    ready,
    state,
    clientReady: Boolean(clientReady),
    coreApiOk,
    coreApiError,
    coreApiSkipped,
    circuitOpen: isOpen(),
    circuitRemainingMs: isOpen() ? remainingOpenMs() : 0,
    metrics: botMetrics.snapshot(),
    clientId: process.env.CLIENT_ID || null,
    useCoreApi: config.USE_CORE_API,
  };
}

module.exports = { getBotHealthStatus };
