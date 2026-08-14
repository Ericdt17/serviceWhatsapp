"use strict";

const { MessageMedia } = require("whatsapp-web.js");

const WHATSAPP_GROUP_SUFFIX = /@g\.us$/;

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

module.exports = {
  normalizeWhatsappGroupId,
  validateSendDocumentBody,
  verifyInternalToken,
  sendDocumentToWhatsapp,
};
