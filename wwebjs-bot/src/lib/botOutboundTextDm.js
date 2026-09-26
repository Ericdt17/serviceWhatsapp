"use strict";

const {
  phoneToChatId,
  resolveWhatsappChatId,
} = require("./issueReminderSend");

const MAX_TEXT_DM_LENGTH = 4000;

/**
 * @param {object} body
 * @returns {{ ok: true, data: object } | { ok: false, errors: string[] }}
 */
function validateSendTextDmBody(body) {
  const errors = [];

  const recipientPhoneRaw =
    body?.recipient_phone != null ? String(body.recipient_phone).trim() : "";
  const chatId = phoneToChatId(recipientPhoneRaw);
  if (!chatId) {
    errors.push("recipient_phone must contain digits");
  }

  const message =
    body?.message != null ? String(body.message) : "";
  const trimmed = message.trim();
  if (!trimmed) {
    errors.push("message is required");
  } else if (message.length > MAX_TEXT_DM_LENGTH) {
    errors.push(`message must be at most ${MAX_TEXT_DM_LENGTH} characters`);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      recipientPhone: recipientPhoneRaw,
      chatId,
      message: trimmed,
    },
  };
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
async function sendTextDmToWhatsapp(client, payload) {
  const chatId = await resolveWhatsappChatId(client, payload.chatId);
  const sent = await client.sendMessage(chatId, payload.message);
  const serialized = sent?.id?._serialized;
  return typeof serialized === "string" && serialized ? serialized : null;
}

module.exports = {
  MAX_TEXT_DM_LENGTH,
  validateSendTextDmBody,
  sendTextDmToWhatsapp,
};
