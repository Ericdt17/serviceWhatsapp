"use strict";

const fs = require("fs");
const path = require("path");

function idempotencyConfig() {
  const file = (
    process.env.ISSUE_REMINDER_IDEMPOTENCY_FILE ||
    "data/issue-reminder-ids.json"
  ).trim();
  const maxEntries = parseInt(
    process.env.ISSUE_REMINDER_IDEMPOTENCY_MAX_ENTRIES || "5000",
    10
  );
  return {
    filePath: path.isAbsolute(file) ? file : path.join(process.cwd(), file),
    maxEntries: Number.isFinite(maxEntries) && maxEntries > 0 ? maxEntries : 5000,
  };
}

/** @type {Map<string, { messageId?: string, issueId?: number, at: string }>} */
let sent = new Map();
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
    const entries = raw?.sent && typeof raw.sent === "object" ? raw.sent : {};
    for (const [key, meta] of Object.entries(entries)) {
      if (key) {
        sent.set(key, meta || { at: new Date().toISOString() });
      }
    }
  } catch (err) {
    console.warn(
      `[issueReminderIdempotency] Could not load ${filePath}: ${err.message}`
    );
  }
}

function persist() {
  const { filePath, maxEntries } = idempotencyConfig();
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  let entries = [...sent.entries()];
  if (entries.length > maxEntries) {
    entries.sort((a, b) =>
      String(a[1]?.at || "").localeCompare(String(b[1]?.at || ""))
    );
    entries = entries.slice(entries.length - maxEntries);
    sent = new Map(entries);
  }

  const payload = {
    sent: Object.fromEntries(sent),
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

/**
 * Returns false if this key was already sent or is in-flight.
 * @param {string} key
 */
function tryAcquire(key) {
  if (!key) return true;
  ensureLoaded();
  if (sent.has(key) || pending.has(key)) {
    return false;
  }
  pending.add(key);
  return true;
}

/**
 * @param {string} key
 * @param {{ messageId?: string, issueId?: number }} [meta]
 */
function markSent(key, meta = {}) {
  if (!key) return;
  ensureLoaded();
  pending.delete(key);
  sent.set(key, {
    messageId: meta.messageId || undefined,
    issueId: meta.issueId,
    at: new Date().toISOString(),
  });
  try {
    persist();
  } catch (err) {
    console.warn(`[issueReminderIdempotency] Persist failed: ${err.message}`);
  }
}

/** Allow retry after a failed send (does not remove a successful send). */
function release(key) {
  if (!key) return;
  pending.delete(key);
}

function isSent(key) {
  if (!key) return false;
  ensureLoaded();
  return sent.has(key);
}

function isPending(key) {
  return pending.has(key);
}

/** @internal — tests only */
function resetForTests() {
  sent = new Map();
  pending.clear();
  loaded = false;
}

module.exports = {
  tryAcquire,
  markSent,
  release,
  isSent,
  isPending,
  resetForTests,
};
