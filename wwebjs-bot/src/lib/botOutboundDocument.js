"use strict";

const { MessageMedia } = require("whatsapp-web.js");

const WHATSAPP_GROUP_SUFFIX = /@g\.us$/;
const MAX_TEXT_MESSAGE_LENGTH = 4000;

function normalizeWhatsappGroupId(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed || !WHATSAPP_GROUP_SUFFIX.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function validateSendDocumentBody(body) {
  const errors = [];
  const groupId = normalizeWhatsappGroupId(body?.whatsapp_group_id);

  if (!groupId) {
    errors.push("whatsapp_group_id must end with @g.us");
  }

  const filename = String(body?.filename || "").trim();
  if (!filename) {
    errors.push("filename is required");
  } else if (!filename.toLowerCase().endsWith(".pdf")) {
    errors.push("filename must end with .pdf");
  }

  const pdfBase64 = String(body?.pdf_base64 || "").trim();
  if (!pdfBase64) {
    errors.push("pdf_base64 is required");
  }

  const caption =
    body?.caption != null && String(body.caption).trim() !== ""
      ? String(body.caption).trim()
      : "";

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      groupId,
      filename,
      pdfBase64,
      caption,
    },
  };
}

function verifyInternalToken(headerValue, expectedToken) {
  if (!expectedToken) {
    return { ok: false, reason: "not_configured" };
  }
  const provided = String(headerValue || "").trim();
  if (!provided) {
    return { ok: false, reason: "missing" };
  }
  if (provided !== expectedToken) {
    return { ok: false, reason: "invalid" };
  }
  return { ok: true };
}

async function sendDocumentToWhatsapp(client, payload) {
  const media = new MessageMedia(
    "application/pdf",
    payload.pdfBase64,
    payload.filename
  );
  const options = payload.caption ? { caption: payload.caption } : {};
  await client.sendMessage(payload.groupId, media, options);
}

function validateSendTextBody(body) {
  const errors = [];
  const groupId = normalizeWhatsappGroupId(body?.whatsapp_group_id);

  if (!groupId) {
    errors.push("whatsapp_group_id must end with @g.us");
  }

  const message =
    body?.message != null ? String(body.message) : "";
  const trimmedMessage = message.trim();
  if (!trimmedMessage) {
    errors.push("message is required");
  } else if (message.length > MAX_TEXT_MESSAGE_LENGTH) {
    errors.push(
      `message must be at most ${MAX_TEXT_MESSAGE_LENGTH} characters`
    );
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      groupId,
      message: trimmedMessage,
      dryRun: body?.dry_run === true,
    },
  };
}

/**
 * @returns {Promise<string|null>} WhatsApp message id (_serialized) if available
 */
async function sendTextToWhatsapp(client, payload) {
  const sent = await client.sendMessage(payload.groupId, payload.message);
  const serialized = sent?.id?._serialized;
  return typeof serialized === "string" && serialized ? serialized : null;
}

module.exports = {
  MAX_TEXT_MESSAGE_LENGTH,
  normalizeWhatsappGroupId,
  validateSendDocumentBody,
  validateSendTextBody,
  verifyInternalToken,
  sendDocumentToWhatsapp,
  sendTextToWhatsapp,
};
