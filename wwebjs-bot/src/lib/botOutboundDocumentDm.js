"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { MessageMedia } = require("whatsapp-web.js");
const { phoneToChatId } = require("./issueReminderSend");

const MAX_CAPTION_LENGTH = 1024;

/**
 * @param {object} body
 * @returns {{ ok: true, data: object } | { ok: false, errors: string[] }}
 */
function validateSendDocumentDmBody(body) {
  const errors = [];

  const recipientPhoneRaw =
    body?.recipient_phone != null ? String(body.recipient_phone).trim() : "";
  const chatId = phoneToChatId(recipientPhoneRaw);
  if (!chatId) {
    errors.push("recipient_phone must contain digits");
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

  let caption = "";
  if (body?.caption != null && String(body.caption).trim() !== "") {
    caption = String(body.caption).trim();
    if (caption.length > MAX_CAPTION_LENGTH) {
      errors.push(`caption must be at most ${MAX_CAPTION_LENGTH} characters`);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      recipientPhone: recipientPhoneRaw,
      chatId,
      filename,
      pdfBase64,
      caption,
    },
  };
}

/**
 * Resolve WhatsApp id for DM media.
 * Current WA Web returns @lid from getNumberId; text+media must use that LID
 * (sending media to @c.us fails with "No LID for user").
 *
 * @param {{
 *   getNumberId?: (id: string) => Promise<{ _serialized?: string }|null>,
 * }} client
 * @param {string} chatIdFallback e.g. 2376…@c.us
 * @returns {Promise<string>}
 */
async function resolveDocumentDmChatId(client, chatIdFallback) {
  const fallback = String(chatIdFallback || "").trim();
  if (!fallback) {
    throw new Error("Missing WhatsApp chat id");
  }

  if (typeof client.getNumberId === "function") {
    const wid = await client.getNumberId(fallback);
    if (!wid) {
      throw new Error(
        `Phone number is not registered on WhatsApp: ${fallback}`
      );
    }
    if (typeof wid === "string" && wid) {
      return wid;
    }
    if (wid._serialized) {
      return String(wid._serialized);
    }
    if (wid.user && wid.server) {
      return `${wid.user}@${wid.server}`;
    }
  }

  return fallback;
}

/**
 * Open / warm the 1:1 thread (required before media on LID chats).
 * @param {{ sendMessage: Function }} client
 * @param {string} chatId
 * @param {string} [caption]
 */
async function ensureDirectChat(client, chatId, caption) {
  const opener =
    caption && String(caption).trim()
      ? String(caption).trim()
      : "\u200B";
  await client.sendMessage(chatId, opener);
}

/**
 * Build MessageMedia from a temp file — more reliable than inline base64 on some WA builds.
 * @param {string} pdfBase64
 * @param {string} filename
 * @returns {{ media: import('whatsapp-web.js').MessageMedia, cleanup: () => void }}
 */
function mediaFromTempFile(pdfBase64, filename) {
  const safeName = path.basename(filename).replace(/[^\w.\-]+/g, "_") || "file.pdf";
  const tmpPath = path.join(
    os.tmpdir(),
    `livsight-payslip-${Date.now()}-${Math.random().toString(16).slice(2)}-${safeName}`
  );
  fs.writeFileSync(tmpPath, Buffer.from(pdfBase64, "base64"));
  const media = MessageMedia.fromFilePath(tmpPath);
  media.filename = safeName;
  media.mimetype = "application/pdf";
  return {
    media,
    cleanup: () => {
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        /* ignore */
      }
    },
  };
}

/**
 * Link LID ↔ phone in WA Store (required for media DMs on current Web builds).
 * @param {{ pupPage?: { evaluate: Function } }} client
 * @param {string} userId @c.us or @lid
 */
async function enforceLidPnLink(client, userId) {
  if (!client?.pupPage || typeof client.pupPage.evaluate !== "function") {
    return null;
  }
  try {
    return await client.pupPage.evaluate(async (id) => {
      if (!window.WWebJS || typeof window.WWebJS.enforceLidAndPnRetrieval !== "function") {
        return null;
      }
      const result = await window.WWebJS.enforceLidAndPnRetrieval(id);
      const ser = (w) => {
        if (!w) return null;
        if (typeof w === "string") return w;
        if (w._serialized) return String(w._serialized);
        if (w.user && w.server) return `${w.user}@${w.server}`;
        return null;
      };
      return { lid: ser(result?.lid), phone: ser(result?.phone) };
    }, userId);
  } catch (err) {
    console.warn(
      `[send-document-dm] enforceLidAndPnRetrieval failed for ${userId}: ${err.message}`
    );
    return null;
  }
}

/**
 * @param {{
 *   sendMessage: Function,
 *   getNumberId?: Function,
 *   pupPage?: { evaluate: Function },
 * }} client
 * @param {{ chatId: string, filename: string, pdfBase64: string, caption?: string }} payload
 * @returns {Promise<string|null>}
 */
async function sendDocumentDmToWhatsapp(client, payload) {
  const phoneChatId = String(payload.chatId || "").trim();
  const lidOrWid = await resolveDocumentDmChatId(client, phoneChatId);

  const linked = await enforceLidPnLink(client, phoneChatId);
  if (lidOrWid !== phoneChatId) {
    await enforceLidPnLink(client, lidOrWid);
  }

  // Prefer phone @c.us for media once LID mapping exists; fall back to LID.
  const mediaTargets = [];
  if (linked?.phone) mediaTargets.push(String(linked.phone));
  if (phoneChatId && !mediaTargets.includes(phoneChatId)) {
    mediaTargets.push(phoneChatId);
  }
  if (lidOrWid && !mediaTargets.includes(lidOrWid)) {
    mediaTargets.push(lidOrWid);
  }
  if (linked?.lid && !mediaTargets.includes(String(linked.lid))) {
    mediaTargets.push(String(linked.lid));
  }

  const { media, cleanup } = mediaFromTempFile(
    payload.pdfBase64,
    payload.filename
  );
  const options = {
    sendMediaAsDocument: true,
    sendSeen: false,
    ...(payload.caption ? { caption: payload.caption } : {}),
  };

  try {
    // Warm the thread with a silent opener (caption goes on the PDF itself).
    const textTarget = linked?.lid || lidOrWid;
    try {
      await ensureDirectChat(client, textTarget, null);
    } catch (err) {
      console.warn(
        `[send-document-dm] ensureDirectChat failed for ${textTarget}: ${err.message}`
      );
    }

    let lastErr = null;
    for (const target of mediaTargets) {
      try {
        const sent = await client.sendMessage(target, media, options);
        const serialized = sent?.id?._serialized;
        return typeof serialized === "string" && serialized ? serialized : null;
      } catch (err) {
        lastErr = err;
        console.warn(
          `[send-document-dm] media → ${target} failed: ${String(err.message || err).split("\n")[0]}`
        );
      }
    }
    throw lastErr || new Error("Failed to send document DM via WhatsApp");
  } finally {
    cleanup();
  }
}

module.exports = {
  MAX_CAPTION_LENGTH,
  validateSendDocumentDmBody,
  resolveDocumentDmChatId,
  sendDocumentDmToWhatsapp,
};
