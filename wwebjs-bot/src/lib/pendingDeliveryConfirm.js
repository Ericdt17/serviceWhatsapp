"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULT_TIMEOUT_MS = 12 * 60 * 1000; // 12 minutes

function confirmConfig() {
  const file = (
    process.env.DELIVERY_CONFIRM_FILE || "data/pending-delivery-confirms.json"
  ).trim();
  const timeoutMs = parseInt(
    process.env.DELIVERY_CONFIRM_TIMEOUT_MS || String(DEFAULT_TIMEOUT_MS),
    10
  );
  return {
    filePath: path.isAbsolute(file) ? file : path.join(process.cwd(), file),
    timeoutMs:
      Number.isFinite(timeoutMs) && timeoutMs >= 60_000
        ? timeoutMs
        : DEFAULT_TIMEOUT_MS,
  };
}

/** @type {Map<string, object>} authorKey → pending */
let byAuthor = new Map();
let loaded = false;

function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  const { filePath } = confirmConfig();
  try {
    if (!fs.existsSync(filePath)) return;
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const entries =
      raw?.pending && typeof raw.pending === "object" ? raw.pending : {};
    const now = Date.now();
    for (const [authorKey, entry] of Object.entries(entries)) {
      if (!authorKey || !entry) continue;
      if (entry.expiresAt && entry.expiresAt <= now) continue;
      byAuthor.set(authorKey, entry);
    }
  } catch (err) {
    console.warn(
      `[pendingDeliveryConfirm] Could not load ${filePath}: ${err.message}`
    );
  }
}

function persist() {
  const { filePath } = confirmConfig();
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const now = Date.now();
  const pending = {};
  for (const [key, entry] of byAuthor.entries()) {
    if (entry?.expiresAt && entry.expiresAt <= now) {
      byAuthor.delete(key);
      continue;
    }
    pending[key] = entry;
  }
  fs.writeFileSync(
    filePath,
    `${JSON.stringify({ pending, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8"
  );
}

function authorKey(whatsappGroupId, author) {
  return `${whatsappGroupId || "unknown"}:${author || "unknown"}`;
}

function isConfirmReply(text) {
  return /^\s*(oui|ok|yes|confirm(e|é)?|✅)\s*$/i.test(
    String(text || "").trim()
  );
}

function isRejectReply(text) {
  return /^\s*(non|no|cancel|annul(e|é)?|❌)\s*$/i.test(
    String(text || "").trim()
  );
}

function buildConfirmPrompt(parsed) {
  const phone = parsed?.phone || "?";
  const items = parsed?.items || "?";
  const amount =
    parsed?.amount_due == null ? "?" : String(parsed.amount_due);
  const quartier = parsed?.quartier || "N/A";
  return (
    `Confirmer cette livraison ?\n` +
    `📱 ${phone}\n` +
    `📦 ${items}\n` +
    `💰 ${amount} FCFA\n` +
    `📍 ${quartier}\n\n` +
    `Répondez *oui* pour enregistrer, *non* pour annuler.`
  );
}

/**
 * @param {{
 *   whatsappGroupId: string,
 *   author: string,
 *   sourceMessageId: string,
 *   parsed: object,
 *   messageText: string,
 *   linkedClient: object,
 *   timeoutMs?: number,
 * }} entry
 */
function setPending(entry) {
  ensureLoaded();
  const key = authorKey(entry.whatsappGroupId, entry.author);
  const { timeoutMs } = confirmConfig();
  const ttl = entry.timeoutMs != null ? entry.timeoutMs : timeoutMs;
  const record = {
    sourceMessageId: entry.sourceMessageId,
    parsed: entry.parsed,
    messageText: entry.messageText,
    whatsappGroupId: entry.whatsappGroupId,
    linkedClient: entry.linkedClient,
    author: entry.author,
    createdAt: Date.now(),
    expiresAt: Date.now() + ttl,
  };
  byAuthor.set(key, record);
  try {
    persist();
  } catch (err) {
    console.warn(`[pendingDeliveryConfirm] Persist failed: ${err.message}`);
  }
  return record;
}

function getPending(whatsappGroupId, author) {
  ensureLoaded();
  const key = authorKey(whatsappGroupId, author);
  const entry = byAuthor.get(key);
  if (!entry) return null;
  if (entry.expiresAt && entry.expiresAt <= Date.now()) {
    byAuthor.delete(key);
    try {
      persist();
    } catch (_) {
      /* ignore */
    }
    return null;
  }
  return entry;
}

function clearPending(whatsappGroupId, author) {
  ensureLoaded();
  const key = authorKey(whatsappGroupId, author);
  const existed = byAuthor.delete(key);
  if (existed) {
    try {
      persist();
    } catch (err) {
      console.warn(`[pendingDeliveryConfirm] Persist failed: ${err.message}`);
    }
  }
  return existed;
}

/** Return pending and remove it (only if not expired). */
function consumePending(whatsappGroupId, author) {
  const entry = getPending(whatsappGroupId, author);
  if (!entry) return null;
  clearPending(whatsappGroupId, author);
  return entry;
}

function _resetForTests() {
  byAuthor = new Map();
  loaded = false;
}

module.exports = {
  authorKey,
  isConfirmReply,
  isRejectReply,
  buildConfirmPrompt,
  setPending,
  getPending,
  clearPending,
  consumePending,
  confirmConfig,
  _resetForTests,
};
