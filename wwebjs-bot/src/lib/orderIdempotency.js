"use strict";

const fs = require("fs");
const path = require("path");

function idempotencyConfig() {
  const file = (process.env.ORDER_IDEMPOTENCY_FILE || "data/submitted-message-ids.json").trim();
  const maxEntries = parseInt(process.env.ORDER_IDEMPOTENCY_MAX_ENTRIES || "5000", 10);
  return {
    filePath: path.isAbsolute(file) ? file : path.join(process.cwd(), file),
    maxEntries: Number.isFinite(maxEntries) && maxEntries > 0 ? maxEntries : 5000,
  };
}

/** @type {Map<string, { transactionRef?: string, at: string }>} */
let submitted = new Map();
/** @type {Set<string>} */
const pending = new Set();
let loaded = false;

function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  const { filePath } = idempotencyConfig();
  try {
    if (!fs.existsSync(filePath)) return;
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const entries = raw?.submitted && typeof raw.submitted === "object" ? raw.submitted : {};
    for (const [messageId, meta] of Object.entries(entries)) {
      if (messageId) {
        submitted.set(messageId, meta || { at: new Date().toISOString() });
      }
    }
  } catch (err) {
    console.warn(
      `[orderIdempotency] Could not load ${filePath}: ${err.message}`
    );
  }
}

function persist() {
  const { filePath, maxEntries } = idempotencyConfig();
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  let entries = [...submitted.entries()];
  if (entries.length > maxEntries) {
    entries.sort((a, b) => String(a[1]?.at || "").localeCompare(String(b[1]?.at || "")));
    entries = entries.slice(entries.length - maxEntries);
    submitted = new Map(entries);
  }

  const payload = {
    submitted: Object.fromEntries(submitted),
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

/**
 * Returns false if this message id was already submitted or is in-flight.
 * @param {string} whatsappMessageId
 */
function tryAcquire(whatsappMessageId) {
  if (!whatsappMessageId) return true;
  ensureLoaded();
  if (submitted.has(whatsappMessageId) || pending.has(whatsappMessageId)) {
    return false;
  }
  pending.add(whatsappMessageId);
  return true;
}

/**
 * @param {string} whatsappMessageId
 * @param {{ transactionRef?: string }} [meta]
 */
function markSubmitted(whatsappMessageId, meta = {}) {
  if (!whatsappMessageId) return;
  ensureLoaded();
  pending.delete(whatsappMessageId);
  submitted.set(whatsappMessageId, {
    transactionRef: meta.transactionRef || undefined,
    at: new Date().toISOString(),
  });
  try {
    persist();
  } catch (err) {
    console.warn(`[orderIdempotency] Persist failed: ${err.message}`);
  }
}

/** Allow retry after a failed POST (does not remove a successful submission). */
function release(whatsappMessageId) {
  if (!whatsappMessageId) return;
  pending.delete(whatsappMessageId);
}

function isSubmitted(whatsappMessageId) {
  if (!whatsappMessageId) return false;
  ensureLoaded();
  return submitted.has(whatsappMessageId);
}

function isPending(whatsappMessageId) {
  return pending.has(whatsappMessageId);
}

/** @internal — tests only */
function resetForTests() {
  submitted = new Map();
  pending.clear();
  loaded = false;
}

module.exports = {
  tryAcquire,
  markSubmitted,
  release,
  isSubmitted,
  isPending,
  resetForTests,
};
