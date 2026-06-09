"use strict";

const DEFAULT_FATAL_REASONS = ["LOGOUT", "UNPAIRED", "UNPAIRED_IDLE"];

function reconnectConfig() {
  const initial = Number(process.env.BOT_WA_RECONNECT_INITIAL_MS);
  const max = Number(process.env.BOT_WA_RECONNECT_MAX_MS);
  const fatalRaw = (process.env.BOT_WA_FATAL_DISCONNECT_REASONS || "").trim();

  return {
    initialMs:
      Number.isFinite(initial) && initial > 0 ? initial : 5000,
    maxMs:
      Number.isFinite(max) && max > 0 ? max : 300000,
    fatalReasons: fatalRaw
      ? fatalRaw.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
      : DEFAULT_FATAL_REASONS,
  };
}

function normalizeReason(reason) {
  return String(reason || "unknown")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
}

/**
 * True when WhatsApp session cannot recover without scanning QR again.
 * @param {string} reason — disconnected event reason from whatsapp-web.js
 */
function isFatalDisconnect(reason) {
  const normalized = normalizeReason(reason);
  const { fatalReasons } = reconnectConfig();
  return fatalReasons.includes(normalized);
}

/**
 * Exponential backoff delay for reconnect attempt (1-based attempt index).
 * @param {number} attempt
 */
function getBackoffMs(attempt) {
  const { initialMs, maxMs } = reconnectConfig();
  const n = Math.max(1, Math.floor(attempt) || 1);
  const delay = initialMs * Math.pow(2, n - 1);
  return Math.min(delay, maxMs);
}

/**
 * Schedules recoverable WhatsApp reconnects with backoff; skips fatal disconnects.
 * @param {{
 *   client: { initialize: () => void },
 *   isShuttingDown: () => boolean,
 *   onFatal?: (reason: string) => void,
 *   onScheduled?: (reason: string, attempt: number, delayMs: number) => void,
 * }} options
 */
function createReconnectScheduler(options) {
  const {
    client,
    isShuttingDown,
    onFatal,
    onScheduled,
  } = options;

  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null;
  let attempt = 0;

  function clearTimer() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function reset() {
    clearTimer();
    attempt = 0;
  }

  function scheduleReconnect(reason) {
    clearTimer();

    if (isShuttingDown()) {
      console.log("[waReconnect] Shutdown in progress — skipping reconnect.");
      return;
    }

    if (isFatalDisconnect(reason)) {
      console.log(
        `[waReconnect] Fatal disconnect (${reason}) — QR scan required, not reconnecting.`
      );
      if (typeof onFatal === "function") {
        onFatal(String(reason || "unknown"));
      }
      return;
    }

    attempt += 1;
    const delayMs = getBackoffMs(attempt);
    console.log(
      `[waReconnect] Scheduling reconnect attempt ${attempt} in ${Math.round(delayMs / 1000)}s (reason: ${reason})`
    );

    if (typeof onScheduled === "function") {
      onScheduled(String(reason || "unknown"), attempt, delayMs);
    }

    timer = setTimeout(() => {
      timer = null;
      if (isShuttingDown()) return;
      console.log(`[waReconnect] Reconnecting (attempt ${attempt})...`);
      client.initialize();
    }, delayMs);
  }

  return {
    scheduleReconnect,
    reset,
    clearTimer,
    getAttempt: () => attempt,
  };
}

module.exports = {
  reconnectConfig,
  normalizeReason,
  isFatalDisconnect,
  getBackoffMs,
  createReconnectScheduler,
  DEFAULT_FATAL_REASONS,
};
