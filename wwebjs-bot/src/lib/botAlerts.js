/**
 * Optional ops alerts: Discord or Slack incoming webhook.
 * Set BOT_ALERT_WEBHOOK_URL (and optionally BOT_ALERT_WEBHOOK_TYPE).
 */

const msg = require("./botAlertMessages");
const { isFatalDisconnect } = require("./waReconnect");

const processStart = Date.now();

let getQrShown = () => false;
let getHealthFn = null;
let disconnectTimer = null;
let disconnectReminderTimer = null;
let lastDisconnectReason = "";
let qrStaleTimer = null;
let stateWatchTimer = null;
let heartbeatTimer = null;
let firstNotConnectedAt = null;
let startupWebhookSent = false;
let hadDisconnectSinceLastReady = false;
let coreApiAuthDown = false;
let coreApiReconnectInProgress = false;
const lastCooldownSent = new Map();

function config() {
  return {
    webhookUrl: (process.env.BOT_ALERT_WEBHOOK_URL || "").trim(),
    type: inferWebhookType(),
    disconnectImmediate:
      process.env.BOT_ALERT_DISCONNECT_IMMEDIATE !== "false" &&
      process.env.BOT_ALERT_DISCONNECT_IMMEDIATE !== "0",
    disconnectReminderMs:
      Number(process.env.BOT_ALERT_DISCONNECT_REMINDER_MS) || 5 * 60 * 1000,
    stateGraceMs:
      Number(process.env.BOT_ALERT_STATE_GRACE_MS) || 3 * 60 * 1000,
    stateIntervalMs:
      Number(process.env.BOT_ALERT_STATE_INTERVAL_MS) || 2 * 60 * 1000,
    notConnectedMs:
      Number(process.env.BOT_ALERT_NOT_CONNECTED_MS) || 10 * 60 * 1000,
    qrStaleMs:
      Number(process.env.BOT_ALERT_QR_STALE_MS) || 20 * 60 * 1000,
    errorCooldownMs:
      Number(process.env.BOT_ALERT_ERROR_COOLDOWN_MS) || 15 * 60 * 1000,
    heartbeatEnabled:
      process.env.BOT_ALERT_HEARTBEAT_ENABLED !== "false" &&
      process.env.BOT_ALERT_HEARTBEAT_ENABLED !== "0",
    heartbeatHours: Math.max(
      1,
      Number(process.env.BOT_ALERT_HEARTBEAT_HOURS) || 24
    ),
  };
}

function inferWebhookType() {
  const explicit = (process.env.BOT_ALERT_WEBHOOK_TYPE || "").toLowerCase();
  if (explicit === "slack" || explicit === "discord") return explicit;
  const url = process.env.BOT_ALERT_WEBHOOK_URL || "";
  if (url.includes("hooks.slack.com")) return "slack";
  return "discord";
}

async function sendBotAlert(text) {
  const { webhookUrl, type } = config();
  if (!webhookUrl) return;

  const body =
    type === "slack"
      ? JSON.stringify({ text })
      : JSON.stringify({ content: String(text).slice(0, 2000) });

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.error("[botAlerts] Webhook HTTP", res.status, t.slice(0, 200));
    }
  } catch (err) {
    console.error("[botAlerts] Webhook error:", err.message);
  }
}

function alertWithCooldown(key, text, cooldownMs) {
  const now = Date.now();
  const last = lastCooldownSent.get(key) || 0;
  if (now - last < cooldownMs) return;
  lastCooldownSent.set(key, now);
  sendBotAlert(text);
}

function clearDisconnectAlertTimer() {
  if (disconnectTimer) {
    clearTimeout(disconnectTimer);
    disconnectTimer = null;
  }
  if (disconnectReminderTimer) {
    clearTimeout(disconnectReminderTimer);
    disconnectReminderTimer = null;
  }
}

function clearQrStaleTimer() {
  if (qrStaleTimer) {
    clearTimeout(qrStaleTimer);
    qrStaleTimer = null;
  }
}

function clearHeartbeatTimer() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function scheduleQrStaleAlert(qrStaleMs) {
  clearQrStaleTimer();
  qrStaleTimer = setTimeout(() => {
    qrStaleTimer = null;
    alertWithCooldown(
      "qr-stale",
      msg.qrStale(Math.round(qrStaleMs / 60000)),
      qrStaleMs
    );
  }, qrStaleMs);
}

function startDailyHeartbeat() {
  clearHeartbeatTimer();
  const { heartbeatEnabled, heartbeatHours, webhookUrl } = config();
  if (!webhookUrl || !heartbeatEnabled || typeof getHealthFn !== "function") {
    return;
  }

  const intervalMs = heartbeatHours * 60 * 60 * 1000;
  heartbeatTimer = setInterval(async () => {
    try {
      const status = await getHealthFn();
      if (status?.ready) {
        sendBotAlert(msg.heartbeat());
      }
    } catch {
      /* ignore heartbeat errors */
    }
  }, intervalMs);
  heartbeatTimer.unref?.();
}

function init({ getQrShown: qrFn, client, getHealth }) {
  getQrShown = typeof qrFn === "function" ? qrFn : () => false;
  getHealthFn = typeof getHealth === "function" ? getHealth : null;
  if (!config().webhookUrl) {
    console.log(
      "[botAlerts] BOT_ALERT_WEBHOOK_URL not set — deeper alerts disabled"
    );
    return;
  }
  console.log(
    `[botAlerts] Webhook alerts enabled (${config().type}), heartbeat every ${
      config().heartbeatHours
    }h`
  );
  startPeriodicStateCheck(client);
  startDailyHeartbeat();
}

function notifyAuthFailure(_msg) {
  if (!config().webhookUrl) return;
  sendBotAlert(msg.waAuthFailure());
}

function notifyWaLogoutRequired(reason) {
  if (!config().webhookUrl) return;
  hadDisconnectSinceLastReady = true;
  lastDisconnectReason = String(reason || "unknown");
  clearDisconnectAlertTimer();
  alertWithCooldown(
    "wa-logout-required",
    msg.waLogoutRequired(lastDisconnectReason),
    config().errorCooldownMs
  );
}

function notifyDisconnected(reason) {
  if (!config().webhookUrl) return;
  hadDisconnectSinceLastReady = true;
  lastDisconnectReason = String(reason || "unknown");
  clearDisconnectAlertTimer();

  if (isFatalDisconnect(reason)) {
    notifyWaLogoutRequired(reason);
    return;
  }

  if (config().disconnectImmediate) {
    sendBotAlert(msg.waDisconnected());
  }

  const reminderMs = config().disconnectReminderMs;
  if (reminderMs > 0) {
    disconnectReminderTimer = setTimeout(() => {
      disconnectReminderTimer = null;
      alertWithCooldown(
        "wa-disconnect-reminder",
        msg.waDisconnectedReminder(Math.round(reminderMs / 60000), lastDisconnectReason),
        reminderMs
      );
    }, reminderMs);
  }
}

function notifyReady() {
  clearDisconnectAlertTimer();
  clearQrStaleTimer();
  firstNotConnectedAt = null;
}

function onQrShown() {
  if (!config().webhookUrl) return;
  scheduleQrStaleAlert(config().qrStaleMs);
}

function notifyClientError(error) {
  if (!config().webhookUrl) return;
  alertWithCooldown(
    "client-error",
    msg.genericError("WhatsApp", error?.message || String(error)),
    config().errorCooldownMs
  );
}

function notifyDeliverySaveFailed(error) {
  if (!config().webhookUrl) return;
  const cooldown =
    Number(process.env.BOT_ALERT_DELIVERY_DB_COOLDOWN_MS) || 300000;
  const ctx = error?.context || {};
  alertWithCooldown(
    "delivery-save-error",
    msg.orderFailed({
      phone: ctx.receiver_phone,
      amount: ctx.amount,
      quartier: ctx.destination_street,
    }),
    cooldown
  );
}

function notifyClientLookupFailed(error, { groupName, whatsappGroupId } = {}) {
  if (!config().webhookUrl) return;
  const status = error?.status;
  const text =
    status === 404
      ? msg.groupNotLinked(groupName)
      : msg.groupLookupFailed(groupName);
  alertWithCooldown(
    `client-lookup:${whatsappGroupId || "unknown"}`,
    text,
    config().errorCooldownMs
  );
}

function notifyCoreApiSessionLost() {
  if (!config().webhookUrl) return;
  coreApiAuthDown = true;
  alertWithCooldown("core-api-session-lost", msg.apiSessionLost(), config().errorCooldownMs);
}

function notifyCoreApiReconnecting() {
  if (!config().webhookUrl) return;
  if (coreApiReconnectInProgress) return;
  coreApiReconnectInProgress = true;
  alertWithCooldown(
    "core-api-reconnecting",
    msg.apiReconnecting(),
    60 * 1000
  );
}

function notifyCoreApiReconnected() {
  if (!config().webhookUrl) return;
  coreApiReconnectInProgress = false;
  coreApiAuthDown = false;
  alertWithCooldown(
    "core-api-reconnected",
    msg.apiReconnected(),
    60 * 1000
  );
}

function notifyCoreApiAuthFailure(_errorOrMessage) {
  if (!config().webhookUrl) return;
  coreApiReconnectInProgress = false;
  coreApiAuthDown = true;
  alertWithCooldown("core-api-auth-failed", msg.apiAuthFailed(), config().errorCooldownMs);
}

function notifyCoreApiCircuitOpen({ operation, status } = {}) {
  if (!config().webhookUrl) return;
  const minutes = Math.ceil(
    (Number(process.env.CORE_API_CIRCUIT_COOLDOWN_MS) || 900000) / 60000
  );
  const detail =
    operation || status
      ? ` (${[operation, status ? `HTTP ${status}` : null].filter(Boolean).join(", ")})`
      : "";
  alertWithCooldown(
    "core-api-circuit-open",
    msg.apiCircuitOpen(minutes) + detail,
    config().errorCooldownMs
  );
}

function isCoreApiAuthDown() {
  return coreApiAuthDown;
}

function notifyCoreApiHealthDown() {
  if (!coreApiAuthDown && !coreApiReconnectInProgress) {
    notifyCoreApiSessionLost();
  }
}

function notifyCoreApiHealthRecovered() {
  if (coreApiAuthDown) {
    notifyCoreApiReconnected();
  }
}

function notifyRemindersTickFailed(err) {
  if (!config().webhookUrl) return;
  const cooldown =
    Number(process.env.BOT_ALERT_REMINDERS_TICK_COOLDOWN_MS) || 600000;
  alertWithCooldown(
    "reminders-tick",
    msg.genericError("Rappels", err?.message || String(err)),
    cooldown
  );
}

function notifyWhatsAppReady(_durationSeconds) {
  if (!config().webhookUrl) return;
  const disabled =
    process.env.BOT_ALERT_STARTUP_ENABLED === "false" ||
    process.env.BOT_ALERT_STARTUP_ENABLED === "0";
  if (disabled) return;

  const reconnectAlertsEnabled =
    process.env.BOT_ALERT_RECONNECT_ENABLED !== "false" &&
    process.env.BOT_ALERT_RECONNECT_ENABLED !== "0";

  if (hadDisconnectSinceLastReady && reconnectAlertsEnabled) {
    hadDisconnectSinceLastReady = false;
    sendBotAlert(msg.waReconnected());
    return;
  }

  hadDisconnectSinceLastReady = false;
  notifyStartup();
}

function notifyStartup() {
  if (!config().webhookUrl) return;
  const disabled =
    process.env.BOT_ALERT_STARTUP_ENABLED === "false" ||
    process.env.BOT_ALERT_STARTUP_ENABLED === "0";
  if (disabled) return;
  const everyReady =
    process.env.BOT_ALERT_STARTUP_EVERY_READY === "true" ||
    process.env.BOT_ALERT_STARTUP_EVERY_READY === "1";
  if (!everyReady && startupWebhookSent) return;
  startupWebhookSent = true;
  sendBotAlert(msg.startup());
}

function notifyMessageError(error, source) {
  if (!config().webhookUrl) return;
  alertWithCooldown(
    `message-error:${source || "unknown"}`,
    msg.genericError(source || "Message", error?.message || String(error)),
    config().errorCooldownMs
  );
}

function notifyReportFailed(error) {
  if (!config().webhookUrl) return;
  alertWithCooldown(
    "report-failed",
    msg.genericError("Rapport journalier", error?.message || String(error)),
    config().errorCooldownMs
  );
}

function notifyApiError(method, path, error) {
  if (!config().webhookUrl) return;
  alertWithCooldown(
    `api-error:${method}:${path}`,
    msg.genericError(`API ${method} ${path}`, error?.message || String(error)),
    config().errorCooldownMs
  );
}

function notifyProcessError(kind, error) {
  if (!config().webhookUrl) return;
  alertWithCooldown(
    `process-error-${kind}`,
    msg.genericError(`Processus ${kind}`, error?.message || String(error)),
    config().errorCooldownMs
  );
}

function notifyRemindersSendFailures({ count, sample }) {
  if (!config().webhookUrl || !count) return;
  const cooldown =
    Number(process.env.BOT_ALERT_REMINDERS_SEND_COOLDOWN_MS) || 600000;
  alertWithCooldown(
    "reminders-send-batch",
    msg.genericError(
      "Rappels",
      `${count} envoi(s) échoué(s). Ex: ${String(sample || "").slice(0, 200)}`
    ),
    cooldown
  );
}

function startPeriodicStateCheck(client) {
  if (!config().webhookUrl || stateWatchTimer) return;

  const tick = async () => {
    if (getQrShown()) {
      firstNotConnectedAt = null;
      return;
    }
    if (Date.now() - processStart < config().stateGraceMs) return;

    try {
      const state = await client.getState();
      if (state === "CONNECTED") {
        firstNotConnectedAt = null;
        return;
      }
      if (firstNotConnectedAt == null) firstNotConnectedAt = Date.now();
      if (Date.now() - firstNotConnectedAt >= config().notConnectedMs) {
        alertWithCooldown(
          "not-connected",
          msg.waNotConnected(
            Math.round(config().notConnectedMs / 60000),
            state
          ),
          Math.min(config().notConnectedMs, 30 * 60 * 1000)
        );
      }
    } catch {
      /* getState can throw before init */
    }
  };

  stateWatchTimer = setInterval(tick, config().stateIntervalMs);
  stateWatchTimer.unref?.();
}

/** Reset module state between Jest tests. */
function __resetForTests() {
  clearDisconnectAlertTimer();
  clearQrStaleTimer();
  clearHeartbeatTimer();
  if (stateWatchTimer) {
    clearInterval(stateWatchTimer);
    stateWatchTimer = null;
  }
  lastCooldownSent.clear();
  startupWebhookSent = false;
  hadDisconnectSinceLastReady = false;
  coreApiAuthDown = false;
  coreApiReconnectInProgress = false;
  firstNotConnectedAt = null;
  lastDisconnectReason = "";
  getHealthFn = null;
}

module.exports = {
  init,
  notifyAuthFailure,
  notifyDisconnected,
  notifyWaLogoutRequired,
  notifyReady,
  onQrShown,
  notifyClientError,
  notifyDeliverySaveFailed,
  notifyClientLookupFailed,
  notifyCoreApiSessionLost,
  notifyCoreApiReconnecting,
  notifyCoreApiReconnected,
  notifyCoreApiAuthFailure,
  notifyCoreApiCircuitOpen,
  notifyCoreApiHealthDown,
  notifyCoreApiHealthRecovered,
  isCoreApiAuthDown,
  notifyRemindersTickFailed,
  notifyRemindersSendFailures,
  notifyWhatsAppReady,
  notifyStartup,
  notifyMessageError,
  notifyReportFailed,
  notifyProcessError,
  notifyApiError,
  __resetForTests,
};
