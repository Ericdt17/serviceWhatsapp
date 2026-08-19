"use strict";

/**
 * Collect possible WhatsApp Store keys for the message being replied to.
 * LID / @g.us serialization often differs from msg.id._serialized.
 * @param {object} msg
 * @param {string} whatsappGroupId
 * @returns {string[]}
 */
function quoteIdCandidates(msg, whatsappGroupId) {
  const ids = [];
  const serialized = msg?.id?._serialized;
  const shortId = msg?.id?.id;
  const remote = msg?.id?.remote;
  if (serialized) ids.push(String(serialized));
  if (shortId) ids.push(String(shortId));
  if (shortId && whatsappGroupId) {
    ids.push(`false_${whatsappGroupId}_${shortId}`);
    ids.push(`true_${whatsappGroupId}_${shortId}`);
  }
  if (shortId && remote) {
    ids.push(`false_${remote}_${shortId}`);
    ids.push(`true_${remote}_${shortId}`);
  }
  return [...new Set(ids.filter(Boolean))];
}

/**
 * Runs inside the WhatsApp Web page. Finds the order message in the group
 * chat collection and sends a quoted reply (native thread).
 *
 * Do not pass quotedMessageId into WWebJS.sendMessage: Msg.get(id) often fails
 * under LID even when the message object is already in chat.msgs. Attach
 * msgContextInfo via extraOptions instead.
 */
async function sendQuotedReplyInPage(groupId, content, quoteIds) {
  try {
    const chat = await window.WWebJS.getChat(groupId, { getAsModel: false });
    if (!chat) {
      return { ok: false, error: "no_chat" };
    }

    const Msg = window.require("WAWebCollections").Msg;

    function matches(m) {
      if (!m) return false;
      const sid = m.id?._serialized;
      const iid = m.id?.id;
      return quoteIds.includes(sid) || quoteIds.includes(iid);
    }

    function modelsOf(col) {
      if (!col) return [];
      if (typeof col.getModelsArray === "function") return col.getModelsArray();
      if (Array.isArray(col.models)) return col.models;
      return [];
    }

    let quoted = null;
    const fromChat = modelsOf(chat.msgs);
    quoted = fromChat.find(matches) || null;

    if (!quoted) {
      for (const qid of quoteIds) {
        quoted = Msg.get(qid);
        if (!quoted && typeof Msg.getMessagesById === "function") {
          const fetched = await Msg.getMessagesById([qid]);
          quoted = fetched?.messages?.[0] || fetched?.[0] || null;
        }
        if (quoted) break;
      }
    }

    if (!quoted) {
      quoted = modelsOf(Msg).find(matches) || null;
    }

    if (!quoted) {
      return { ok: false, error: "quoted_msg_not_in_store" };
    }

    const raw = typeof quoted.unsafe === "function" ? quoted.unsafe() : quoted;
    let quotedMsgOptions = {};
    if (typeof quoted.msgContextInfo === "function") {
      quotedMsgOptions = quoted.msgContextInfo(chat) || {};
    } else if (typeof raw.msgContextInfo === "function") {
      quotedMsgOptions = raw.msgContextInfo(chat) || {};
    }

    if (!quotedMsgOptions || Object.keys(quotedMsgOptions).length === 0) {
      return { ok: false, error: "no_msg_context" };
    }

    await window.WWebJS.sendMessage(chat, content, {
      extraOptions: quotedMsgOptions,
    });
    // WWebJS.sendMessage often returns undefined even when the message was sent.
    return {
      ok: true,
      quoted: true,
      usedId: quoted.id?._serialized || quoteIds[0],
    };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Reply in a WhatsApp group, quoted on the original order message.
 * Prefer Puppeteer + Store lookup: msg.reply() without chatId uses LID and
 * client.sendMessage(..., { quotedMessageId }) silently drops the quote when
 * Store.Msg.get fails (ignoreQuoteErrors defaults true).
 *
 * @param {{
 *   client: { sendMessage?: Function, pupPage?: { evaluate?: Function, isClosed?: Function } },
 *   whatsappGroupId: string,
 *   msg: { id?: object, reply?: Function },
 *   text: string,
 * }} args
 */
async function replyInWhatsappGroup({ client, whatsappGroupId, msg, text }) {
  const groupId = String(whatsappGroupId || "").trim();
  const quoteIds = quoteIdCandidates(msg, groupId);
  const page = client?.pupPage;
  const pageReady =
    page &&
    typeof page.evaluate === "function" &&
    !(typeof page.isClosed === "function" && page.isClosed());

  if (pageReady && groupId) {
    try {
      const result = await page.evaluate(
        sendQuotedReplyInPage,
        groupId,
        text,
        quoteIds
      );
      if (result?.ok || result?.quoted) {
        console.log(
          `   ✅ Quoted reply sent on order message (${result.usedId || "ok"})`
        );
        return;
      }
      console.log(
        `   ⚠️  Store quoted reply failed: ${result?.error || "unknown"}`
      );
    } catch (err) {
      console.log(`   ⚠️  puppeteer quoted reply failed: ${err.message}`);
    }
  }

  if (typeof msg?.reply === "function" && groupId) {
    try {
      await msg.reply(text, groupId, {
        sendSeen: false,
        ignoreQuoteErrors: false,
      });
      return;
    } catch (err) {
      console.log(`   ⚠️  msg.reply(group) failed: ${err.message}`);
    }
  }

  const quotedMessageId = quoteIds[0];
  const canSend =
    typeof client?.sendMessage === "function" && groupId.length > 0;

  if (canSend) {
    const quotedOptions = {
      sendSeen: false,
      ignoreQuoteErrors: false,
    };
    if (quotedMessageId) {
      quotedOptions.quotedMessageId = quotedMessageId;
    }
    try {
      await client.sendMessage(groupId, text, quotedOptions);
      return;
    } catch (err) {
      console.log(`   ⚠️  Quoted group send failed: ${err.message}`);
      try {
        await client.sendMessage(groupId, text, { sendSeen: false });
        return;
      } catch (err2) {
        console.log(`   ⚠️  Group send failed: ${err2.message}`);
      }
    }
  }
}

module.exports = {
  replyInWhatsappGroup,
  quoteIdCandidates,
};
