"use strict";

/**
 * Extract human-readable detail from Core API / Spring-style error JSON.
 * @param {unknown} body
 * @returns {string}
 */
function extractApiErrorDetail(body) {
  if (body == null) {
    return "(empty response body)";
  }
  if (typeof body !== "object") {
    return String(body).slice(0, 800);
  }

  const parts = [];
  const add = (label, val) => {
    if (val == null || val === "") return;
    if (typeof val === "object") {
      try {
        parts.push(`${label}: ${JSON.stringify(val)}`);
      } catch {
        parts.push(`${label}: [object]`);
      }
    } else {
      parts.push(`${label}: ${String(val)}`);
    }
  };

  add("message", body.message);
  add("error", body.error);
  add("detail", body.detail);
  add("title", body.title);
  add("path", body.path);
  add("status", body.status);
  add("timestamp", body.timestamp);

  if (Array.isArray(body.errors)) {
    body.errors.forEach((e, i) => {
      if (typeof e === "string") {
        parts.push(`validation[${i}]: ${e}`);
      } else if (e && typeof e === "object") {
        const field = e.field || e.property || e.objectName || "?";
        const msg =
          e.defaultMessage || e.message || e.rejectedValue || JSON.stringify(e);
        parts.push(`validation[${i}] ${field}: ${msg}`);
      }
    });
  }

  if (body.fieldErrors && typeof body.fieldErrors === "object") {
    for (const [field, msg] of Object.entries(body.fieldErrors)) {
      parts.push(`fieldErrors.${field}: ${msg}`);
    }
  }

  if (Array.isArray(body.violations)) {
    body.violations.forEach((v, i) => {
      const field = v.field || v.propertyPath || v.property || "?";
      const msg = v.message || v.title || JSON.stringify(v);
      parts.push(`violation[${i}] ${field}: ${msg}`);
    });
  }

  if (typeof body._raw === "string" && body._raw.trim()) {
    add("raw", body._raw.trim().slice(0, 800));
  }

  if (parts.length === 0) {
    try {
      const json = JSON.stringify(body);
      if (json && json !== "{}") {
        parts.push(`body: ${json.slice(0, 800)}`);
      }
    } catch {
      parts.push("(unparseable error body)");
    }
  }

  return parts.length ? parts.join(" | ") : "(no error detail in response)";
}

/**
 * Multi-line error description for logs and alerts.
 * @param {{
 *   operation: string,
 *   method?: string,
 *   url: string,
 *   status: number,
 *   statusText?: string,
 *   body?: unknown,
 *   context?: Record<string, unknown>,
 * }} opts
 */
function formatApiError(opts) {
  const {
    operation,
    method = "GET",
    url,
    status,
    statusText,
    body,
    context,
  } = opts;
  const detail = extractApiErrorDetail(body);
  const lines = [
    `${operation} failed — HTTP ${status}${statusText ? ` ${statusText}` : ""}`,
    `  ${method} ${url}`,
  ];

  if (context && typeof context === "object") {
    for (const [key, value] of Object.entries(context)) {
      if (value !== undefined && value !== null && String(value).length > 0) {
        lines.push(`  ${key}: ${value}`);
      }
    }
  }

  lines.push(`  API response: ${detail}`);
  return lines.join("\n");
}

class CoreApiError extends Error {
  /**
   * @param {string} shortMessage — one-line summary for throw/catch
   * @param {{ formatted?: string, status?: number, operation?: string, url?: string, body?: unknown, context?: Record<string, unknown> }} meta
   */
  constructor(shortMessage, meta = {}) {
    super(shortMessage);
    this.name = "CoreApiError";
    this.formatted = meta.formatted || shortMessage;
    this.status = meta.status;
    this.operation = meta.operation;
    this.url = meta.url;
    this.body = meta.body;
    this.context = meta.context;
  }
}

/**
 * @param {ConstructorParameters<typeof formatApiError>[0]} opts
 */
function throwApiError(opts) {
  const formatted = formatApiError(opts);
  const detail = extractApiErrorDetail(opts.body);
  const firstPart = detail.split(" | ")[0] || opts.statusText || "unknown error";
  const shortMessage = `${opts.operation} failed (${opts.status}): ${firstPart}`;
  throw new CoreApiError(shortMessage, {
    formatted,
    status: opts.status,
    operation: opts.operation,
    url: opts.url,
    body: opts.body,
    context: opts.context,
  });
}

/**
 * Log a CoreApiError or generic Error with indentation for PM2 logs.
 * @param {string} title
 * @param {Error & { formatted?: string }} err
 */
function logStructuredError(title, err) {
  console.error(`   ❌ ${title}`);
  const text = err.formatted || err.message || String(err);
  for (const line of text.split("\n")) {
    console.error(`      ${line}`);
  }
}

const alertMsg = require("./botAlertMessages");

/**
 * Discord alert text — short French (detailed logs use formatApiError / logStructuredError).
 */
function formatBotAlertMessage(alertType, err, extra = {}) {
  const e = normalizeAlertError(err);
  const ctx = e.context || {};
  const status = e.status;

  switch (alertType) {
    case "order_not_saved":
      return alertMsg.orderFailed({
        phone: ctx.receiver_phone,
        amount: ctx.amount,
        quartier: ctx.destination_street,
      });
    case "core_api_auth":
      return alertMsg.apiAuthFailed();
    case "client_lookup":
      if (status === 404) {
        return alertMsg.groupNotLinked(extra.groupName);
      }
      return alertMsg.groupLookupFailed(extra.groupName);
    default:
      return alertMsg.genericError(
        extra.source,
        e.message || e.formatted || String(err)
      );
  }
}

function normalizeAlertError(err) {
  if (err instanceof CoreApiError) {
    return err;
  }
  if (err instanceof Error) {
    return err;
  }
  if (typeof err === "string") {
    return { message: err, formatted: err };
  }
  return { message: String(err) };
}

/**
 * @deprecated Prefer formatBotAlertMessage via botAlerts helpers
 */
function errorTextForAlert(err) {
  return formatBotAlertMessage("generic", err);
}

module.exports = {
  extractApiErrorDetail,
  formatApiError,
  CoreApiError,
  throwApiError,
  logStructuredError,
  errorTextForAlert,
  formatBotAlertMessage,
  normalizeAlertError,
};
