"use strict";

const fs = require("fs");
const path = require("path");

function deadLetterConfig() {
  const dir = (process.env.FAILED_ORDERS_DIR || "failed-orders").trim();
  return {
    dirPath: path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir),
  };
}

function sanitizeForFilename(value) {
  return String(value || "unknown")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 80);
}

/**
 * Persist a failed order payload for manual replay on the VPS.
 * @param {{
 *   whatsappMessageId?: string,
 *   messageText?: string,
 *   parsed?: object,
 *   linkedClient?: object|null,
 *   whatsappGroupId?: string,
 *   viaAi?: boolean,
 *   error?: Error & { formatted?: string, status?: number, context?: object },
 * }} payload
 * @returns {string|null} written file path, or null on failure
 */
function writeFailedOrder(payload) {
  const { dirPath } = deadLetterConfig();
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const msgPart = sanitizeForFilename(payload.whatsappMessageId);
  const fileName = `${ts}-${msgPart}.json`;
  const filePath = path.join(dirPath, fileName);

  const record = {
    failedAt: new Date().toISOString(),
    whatsappMessageId: payload.whatsappMessageId || null,
    whatsappGroupId: payload.whatsappGroupId || null,
    clientKeycloakId: payload.linkedClient?.keycloakId || null,
    viaAi: Boolean(payload.viaAi),
    messageText: payload.messageText || null,
    parsed: payload.parsed || null,
    error: {
      message: payload.error?.message || String(payload.error || "unknown"),
      formatted: payload.error?.formatted || undefined,
      status: payload.error?.status || undefined,
      code: payload.error?.code || undefined,
      context: payload.error?.context || undefined,
    },
  };

  try {
    fs.mkdirSync(dirPath, { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    console.warn(`[failedOrderDeadLetter] Saved ${filePath}`);
    return filePath;
  } catch (err) {
    console.error(`[failedOrderDeadLetter] Write failed: ${err.message}`);
    return null;
  }
}

module.exports = {
  writeFailedOrder,
  sanitizeForFilename,
};
