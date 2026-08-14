"use strict";

const fs = require("fs");
const path = require("path");

/**
 * Resolve LocalAuth session directory for a CLIENT_ID.
 * @param {string} cwd
 * @param {string} clientId
 */
function resolveSessionDir(cwd, clientId) {
  return path.join(cwd, ".wwebjs_auth", `session-${clientId}`);
}

/**
 * Delete a WhatsApp LocalAuth session directory (best-effort).
 * @param {string} sessionDir
 * @param {{ fsModule?: typeof fs }} [options]
 * @returns {{ cleared: boolean, error?: Error }}
 */
function clearSessionDir(sessionDir, { fsModule = fs } = {}) {
  try {
    if (fsModule.existsSync(sessionDir)) {
      fsModule.rmSync(sessionDir, { recursive: true, force: true });
      return { cleared: true };
    }
    return { cleared: false };
  } catch (err) {
    return { cleared: false, error: err };
  }
}

/**
 * @param {{ isClientReady: boolean, isShuttingDown: boolean }} opts
 */
function shouldClearSessionOnReadyTimeout({ isClientReady, isShuttingDown }) {
  return !isClientReady && !isShuttingDown;
}

/**
 * If ready never fired after auth, clear the session so the next process start
 * can show a fresh QR. Caller performs process.exit.
 *
 * @param {object} opts
 * @param {boolean} opts.isClientReady
 * @param {boolean} opts.isShuttingDown
 * @param {string} opts.sessionDir
 * @param {string} [opts.state]
 * @param {number} [opts.timeoutMs]
 * @param {typeof fs} [opts.fsModule]
 * @param {(info: { state: string, timeoutMs?: number }) => void} [opts.onStuck]
 * @returns {{ action: "noop" | "restart", cleared?: boolean, state?: string, error?: Error }}
 */
function handleReadyTimeout({
  isClientReady,
  isShuttingDown,
  sessionDir,
  state = "unknown",
  timeoutMs,
  fsModule = fs,
  onStuck,
}) {
  if (!shouldClearSessionOnReadyTimeout({ isClientReady, isShuttingDown })) {
    return { action: "noop" };
  }
  if (typeof onStuck === "function") {
    onStuck({ state, timeoutMs });
  }
  const cleared = clearSessionDir(sessionDir, { fsModule });
  return { action: "restart", state, ...cleared };
}

module.exports = {
  resolveSessionDir,
  clearSessionDir,
  shouldClearSessionOnReadyTimeout,
  handleReadyTimeout,
};
