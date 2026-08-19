"use strict";

const fs = require("fs");
const path = require("path");
const { normalizeCatalogText } = require("./catalogTextUtils");

function semanticDedupConfig() {
  const file = (
    process.env.ORDER_SEMANTIC_DEDUP_FILE ||
    "data/recent-order-fingerprints.json"
  ).trim();
  const maxEntries = parseInt(
    process.env.ORDER_SEMANTIC_DEDUP_MAX_ENTRIES || "2000",
    10
  );
  const windowMs = parseInt(
    process.env.ORDER_SEMANTIC_DEDUP_WINDOW_MS || "600000",
    10
  );
  return {
    filePath: path.isAbsolute(file) ? file : path.join(process.cwd(), file),
    maxEntries: Number.isFinite(maxEntries) && maxEntries > 0 ? maxEntries : 2000,
    windowMs: Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 600000,
  };
}

/** @type {Map<string, { transactionRef?: string, at: string }>} */
let recent = new Map();
let loaded = false;

function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  const { filePath } = semanticDedupConfig();
  try {
    if (!fs.existsSync(filePath)) return;
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const entries =
      raw?.fingerprints && typeof raw.fingerprints === "object"
        ? raw.fingerprints
        : {};
    for (const [fp, meta] of Object.entries(entries)) {
      if (fp) {
        recent.set(fp, meta || { at: new Date().toISOString() });
      }
    }
  } catch (err) {
    console.warn(
      `[orderSemanticDedup] Could not load ${filePath}: ${err.message}`
    );
  }
}

function persist() {
  const { filePath, maxEntries, windowMs } = semanticDedupConfig();
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  const cutoff = Date.now() - windowMs;
  let entries = [...recent.entries()].filter(([, meta]) => {
    const ts = Date.parse(meta?.at || "");
    return Number.isFinite(ts) && ts >= cutoff;
  });
  if (entries.length > maxEntries) {
    entries.sort((a, b) =>
      String(a[1]?.at || "").localeCompare(String(b[1]?.at || ""))
    );
    entries = entries.slice(entries.length - maxEntries);
  }
  recent = new Map(entries);

  const payload = {
    fingerprints: Object.fromEntries(recent),
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

/**
 * @param {{
 *   whatsappGroupId?: string,
 *   phone?: string,
 *   amount_due?: number|string|null,
 *   items?: string,
 * }} order
 * @returns {string}
 */
function fingerprint(order = {}) {
  const group = normalizeCatalogText(order.whatsappGroupId);
  const phone = String(order.phone || "").replace(/\D/g, "");
  const amount = Number(order.amount_due);
  const amountKey = Number.isFinite(amount) ? String(amount) : "0";
  const items = normalizeCatalogText(order.items);
  return `${group}|${phone}|${amountKey}|${items}`;
}

/**
 * @param {string} fp
 * @param {number} [nowMs]
 * @returns {{ transactionRef?: string, at: string }|null}
 */
function findRecent(fp, nowMs = Date.now()) {
  if (!fp) return null;
  ensureLoaded();
  const meta = recent.get(fp);
  if (!meta) return null;
  const ts = Date.parse(meta.at || "");
  if (!Number.isFinite(ts)) return null;
  const { windowMs } = semanticDedupConfig();
  if (nowMs - ts > windowMs) {
    return null;
  }
  return meta;
}

/**
 * @param {string} fp
 * @param {{ transactionRef?: string, at?: string }} [meta]
 */
function remember(fp, meta = {}) {
  if (!fp) return;
  ensureLoaded();
  recent.set(fp, {
    transactionRef: meta.transactionRef || undefined,
    at: meta.at || new Date().toISOString(),
  });
  try {
    persist();
  } catch (err) {
    console.warn(`[orderSemanticDedup] Persist failed: ${err.message}`);
  }
}

/** @internal — tests only */
function resetForTests() {
  recent = new Map();
  loaded = false;
}

module.exports = {
  fingerprint,
  findRecent,
  remember,
  resetForTests,
};
