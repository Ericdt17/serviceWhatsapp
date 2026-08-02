"use strict";

/**
 * Deduplicate WhatsApp ingress when both `message` and `message_create` fire
 * for the same payload (often with missing/different msg.id).
 *
 * Prefer `message` (processed immediately). `message_create` waits briefly;
 * if `message` already handled the same key(s), create is dropped.
 */

function messageIdKey(msg) {
  const raw = msg?.id;
  if (!raw) return null;
  if (typeof raw === "string") return raw;
  return raw._serialized || raw.id || null;
}

function messageFingerprintKey(msg) {
  const from = msg?.from || "";
  const ts = msg?.timestamp ?? "";
  const body = String(msg?.body || "").slice(0, 200);
  const fromMe = msg?.fromMe ? 1 : 0;
  return `fp:${from}|${ts}|${body}|${fromMe}`;
}

function keysForMessage(msg) {
  const keys = [];
  const id = messageIdKey(msg);
  if (id) keys.push(`id:${id}`);
  keys.push(messageFingerprintKey(msg));
  return keys;
}

function createMessageIngress(options = {}) {
  const delayMs = options.delayMs ?? 400;
  const maxRecent = options.maxRecent ?? 500;
  /** @type {Set<string>} */
  const recent = new Set();
  /** @type {Map<string, { timer: NodeJS.Timeout, keys: string[] }>} */
  const pending = new Map();

  function isRecent(keys) {
    return keys.some((k) => recent.has(k));
  }

  function markRecent(keys) {
    for (const k of keys) recent.add(k);
    if (recent.size > maxRecent) recent.clear();
  }

  function clearPending(keys) {
    const seen = new Set();
    for (const k of keys) {
      const entry = pending.get(k);
      if (!entry || seen.has(entry)) continue;
      seen.add(entry);
      clearTimeout(entry.timer);
      for (const ak of entry.keys) pending.delete(ak);
    }
  }

  /**
   * @param {object} msg
   * @param {"message"|"message_create"} source
   * @param {(msg: object, source: string) => void} processFn
   */
  function handle(msg, source, processFn) {
    const keys = keysForMessage(msg);

    if (source === "message") {
      clearPending(keys);
      if (isRecent(keys)) return;
      markRecent(keys);
      processFn(msg, source);
      return;
    }

    // message_create: wait in case `message` arrives with fuller data
    if (isRecent(keys)) return;
    clearPending(keys);

    const timer = setTimeout(() => {
      for (const k of keys) pending.delete(k);
      if (isRecent(keys)) return;
      markRecent(keys);
      processFn(msg, "message_create");
    }, delayMs);

    const entry = { timer, keys };
    for (const k of keys) pending.set(k, entry);
  }

  function reset() {
    for (const entry of new Set(pending.values())) {
      clearTimeout(entry.timer);
    }
    pending.clear();
    recent.clear();
  }

  return {
    handle,
    reset,
    keysForMessage,
    // test helpers
    _recent: recent,
    _pending: pending,
  };
}

module.exports = {
  createMessageIngress,
  keysForMessage,
  messageIdKey,
  messageFingerprintKey,
};
