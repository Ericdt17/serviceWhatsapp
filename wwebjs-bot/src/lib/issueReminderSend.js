"use strict";

const { formatIssueReminder, MAX_MESSAGE_LENGTH } = require("./issueReminderFormat");

const ISSUE_REMINDER_TYPES = [
  "created",
  "reassigned",
  "due_24h",
  "due_3h",
  "due_now",
  "overdue_2h",
  "overdue_repeat",
  "resolved_review",
  "report_rejected",
  "closed",
];

const MAX_TITLE_LENGTH = 160;

/**
 * @param {string} phone
 * @returns {string|null}
 */
function phoneToChatId(phone) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return null;
  // Local CM mobile (9 digits, starts with 6/2/7) → E.164 without +
  if (/^[627]\d{8}$/.test(digits)) {
    digits = `237${digits}`;
  }
  return `${digits}@c.us`;
}

/**
 * @param {object} body
 * @returns {{ ok: true, data: object } | { ok: false, errors: string[] }}
 */
function validateIssueReminderBody(body) {
  const errors = [];
  const issueIdRaw = body?.issueId;
  const issueId = Number(issueIdRaw);
  if (!Number.isFinite(issueId) || issueId <= 0) {
    errors.push("issueId must be a positive number");
  }

  const type = String(body?.type || "").trim();
  if (!ISSUE_REMINDER_TYPES.includes(type)) {
    errors.push(
      `type must be one of: ${ISSUE_REMINDER_TYPES.join(", ")}`
    );
  }

  const chatId = phoneToChatId(body?.recipientPhone);
  if (!chatId) {
    errors.push("recipientPhone must contain digits");
  }

  const title = body?.title != null ? String(body.title).trim() : "";
  if (!title) {
    errors.push("title is required");
  } else if (title.length > MAX_TITLE_LENGTH) {
    errors.push(`title must be at most ${MAX_TITLE_LENGTH} characters`);
  }

  const idempotencyKey =
    body?.idempotencyKey != null ? String(body.idempotencyKey).trim() : "";
  if (!idempotencyKey) {
    errors.push("idempotencyKey is required");
  }

  const priority =
    body?.priority != null && String(body.priority).trim() !== ""
      ? String(body.priority).trim().toLowerCase()
      : "medium";

  const description =
    body?.description != null && String(body.description).trim() !== ""
      ? String(body.description)
      : null;

  const dueDate =
    body?.dueDate != null && String(body.dueDate).trim() !== ""
      ? String(body.dueDate).trim()
      : null;

  const assignedBy =
    body?.assignedBy != null && String(body.assignedBy).trim() !== ""
      ? String(body.assignedBy).trim()
      : null;

  const reason =
    body?.reason != null && String(body.reason).trim() !== ""
      ? String(body.reason).trim()
      : null;

  if (type === "report_rejected" && !reason) {
    errors.push("reason is required for report_rejected");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const timezone = process.env.TIME_ZONE || "Africa/Douala";
  let message;
  try {
    message = formatIssueReminder(type, {
      title,
      description,
      priority,
      dueDate,
      assignedBy,
      reason,
      timezone,
    });
  } catch (err) {
    return { ok: false, errors: [err.message || "format failed"] };
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return {
      ok: false,
      errors: [`formatted message must be at most ${MAX_MESSAGE_LENGTH} characters`],
    };
  }

  return {
    ok: true,
    data: {
      issueId,
      type,
      recipientPhone: String(body.recipientPhone).trim(),
      chatId,
      title,
      description,
      priority,
      dueDate,
      assignedBy,
      reason,
      idempotencyKey,
      message,
      dryRun: body?.dry_run === true,
      timezone,
    },
  };
}

/**
 * Resolve a phone / @c.us id to a chat id WhatsApp Web can send to (often @lid).
 * @param {{
 *   getNumberId?: (id: string) => Promise<{ _serialized?: string }|null>,
 *   getContactLidAndPhone?: (ids: string[]) => Promise<Array<{ lid?: string, pn?: string }>>,
 * }} client
 * @param {string} chatIdFallback e.g. 2376…@c.us
 * @returns {Promise<string>}
 */
async function resolveWhatsappChatId(client, chatIdFallback) {
  const fallback = String(chatIdFallback || "").trim();
  if (!fallback) {
    throw new Error("Missing WhatsApp chat id");
  }

  let resolved = fallback;

  if (typeof client.getNumberId === "function") {
    const wid = await client.getNumberId(fallback);
    if (!wid) {
      throw new Error(
        `Phone number is not registered on WhatsApp: ${fallback}`
      );
    }
    if (typeof wid === "string" && wid) {
      resolved = wid;
    } else if (wid._serialized) {
      resolved = String(wid._serialized);
    } else if (wid.user && wid.server) {
      resolved = `${wid.user}@${wid.server}`;
    }
  }

  if (typeof client.getContactLidAndPhone === "function") {
    try {
      const pairs = await client.getContactLidAndPhone([resolved]);
      const pair = Array.isArray(pairs) ? pairs[0] : null;
      if (pair?.lid) {
        return String(pair.lid);
      }
      if (pair?.pn) {
        return String(pair.pn);
      }
    } catch (err) {
      console.warn(
        `[issueReminder] getContactLidAndPhone failed for ${resolved}: ${err.message}`
      );
    }
  }

  return resolved;
}

/**
 * @param {{
 *   sendMessage: Function,
 *   getNumberId?: Function,
 *   getContactLidAndPhone?: Function,
 * }} client
 * @param {{ chatId: string, message: string }} payload
 * @returns {Promise<string|null>}
 */
async function sendIssueReminder(client, payload) {
  const chatId = await resolveWhatsappChatId(client, payload.chatId);
  const sent = await client.sendMessage(chatId, payload.message);
  const serialized = sent?.id?._serialized;
  return typeof serialized === "string" && serialized ? serialized : null;
}

module.exports = {
  ISSUE_REMINDER_TYPES,
  MAX_TITLE_LENGTH,
  phoneToChatId,
  validateIssueReminderBody,
  resolveWhatsappChatId,
  sendIssueReminder,
};
