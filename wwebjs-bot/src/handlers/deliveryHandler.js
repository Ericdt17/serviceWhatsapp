"use strict";

const { createDelivery, findDeliveryByMessageId } = require("../db");
const {
  parseDeliveryMessage,
  isExcludedFromDeliveryParsing,
  looksLikeMalformedDeliveryWithParsed,
  getFormatReminderMessage,
  extractPhone,
  extractAmount,
  extractQuartier,
  hasLabeledOrderFields,
} = require("../parser");
const {
  extractDeliveryWithAI,
  validateAndNormalizeAiDelivery,
} = require("../lib/aiDeliveryExtract");
const coreApi = require("../services/coreApiClient");
const botAlerts = require("../lib/botAlerts");
const { logStructuredError } = require("../lib/formatApiError");
const orderIdempotency = require("../lib/orderIdempotency");
const orderSemanticDedup = require("../lib/orderSemanticDedup");
const failedOrderDeadLetter = require("../lib/failedOrderDeadLetter");
const { extractTransactionRef } = require("../lib/transactionResponse");
const botMetrics = require("../lib/botMetrics");
const botLogger = require("../lib/botLogger");
const { replyInWhatsappGroup } = require("../lib/waGroupReply");
const pendingDeliveryConfirm = require("../lib/pendingDeliveryConfirm");

/** groupId:author → timestamp of last format-reminder sent (ms) */
const formatReminderCooldownByKey = new Map();

/** Temporary LIV-37 local repro logs — remove after investigation. */
function liv37Log(step, detail) {
  const payload =
    detail === undefined
      ? ""
      : typeof detail === "string"
        ? detail
        : JSON.stringify(detail);
  console.log(`[LIV-37-repro] ${step}${payload ? ` ${payload}` : ""}`);
}

function liv37SignalSnapshot(messageText) {
  const phone = extractPhone(messageText);
  const amount = extractAmount(messageText);
  const quartier = extractQuartier(messageText);
  const labeled = hasLabeledOrderFields(messageText);
  const lines = String(messageText || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const letterLines = lines.filter((line) => /[a-zA-ZÀ-ÿ]/.test(line));
  return {
    phone: phone || null,
    amount: amount == null ? null : amount,
    knownQuartier: quartier || null,
    labeledOrderFields: labeled,
    lineCount: lines.length,
    letterLineCount: letterLines.length,
    letterLinePreview: letterLines.slice(0, 3),
  };
}

function duplicateOrderReplyText(refLabel) {
  const ref = refLabel && String(refLabel) !== "N/A" ? String(refLabel) : null;
  const title = ref
    ? `✅ Commande #${ref} déjà sur le dashboard.`
    : "✅ Commande déjà sur le dashboard.";
  return `${title}\n\nVérifiez-la, ne renvoyez pas le même message.`;
}

function persistFailedOrder(ctx, error) {
  botMetrics.increment("ordersFailed");
  botLogger.order.warn(
    {
      event: "order_failed",
      whatsappMessageId: ctx.whatsappMessageId,
      viaAi: ctx.viaAi,
      err: error?.message,
    },
    "Order save failed"
  );
  failedOrderDeadLetter.writeFailedOrder({ ...ctx, error });
  botAlerts.notifyDeliverySaveFailed(error);
}

function semanticDedupEnabled(config) {
  return config.ORDER_SEMANTIC_DEDUP_ENABLED !== false;
}

function orderFingerprint(parsed, whatsappGroupId) {
  return orderSemanticDedup.fingerprint({
    whatsappGroupId,
    phone: parsed.phone,
    amount_due: parsed.amount_due,
    items: parsed.items,
  });
}

/**
 * Handle an incoming message as a potential new delivery.
 * Tries strict parse → AI fallback → format reminder, in that order.
 *
 * @param {{
 *   messageText: string,
 *   msg: object,        WhatsApp message object
 *   group: object,      group row from DB
 *   agencyId: number,
 *   linkedClient: object|null,  { keycloakId } when USE_CORE_API
 *   client: object,     WhatsApp client (for sending confirmations)
 *   config: object,
 *   whatsappGroupId: string,
 * }} ctx
 */
async function saveDelivery({
  parsed,
  messageText,
  whatsappMessageId,
  messageTimestampSec,
  group,
  agencyId,
  linkedClient,
  config,
  client,
  viaAi,
  whatsappGroupId,
  msg,
}) {
  if (config.USE_CORE_API) {
    if (!linkedClient?.keycloakId) {
      throw new Error("No linked client keycloakId for core API submission");
    }
    if (!orderIdempotency.tryAcquire(whatsappMessageId)) {
      botMetrics.increment("ordersSkippedIdempotent");
      botLogger.order.info(
        { event: "order_skipped_idempotent", whatsappMessageId },
        "Transaction already submitted locally"
      );
      console.log(
        `   ⏭️  Transaction already submitted for message ${whatsappMessageId}`
      );
      return { skipped: true, localIdempotent: true };
    }

    if (semanticDedupEnabled(config)) {
      const fp = orderFingerprint(parsed, whatsappGroupId);
      const hit = orderSemanticDedup.findRecent(fp);
      if (hit) {
        botMetrics.increment("ordersSkippedDuplicate");
        orderIdempotency.markSubmitted(whatsappMessageId, {
          transactionRef: hit.transactionRef,
        });
        const refLabel = hit.transactionRef || "N/A";
        botLogger.order.info(
          {
            event: "order_skipped_semantic_duplicate",
            whatsappMessageId,
            transactionRef: hit.transactionRef,
            fingerprint: fp,
            viaAi,
          },
          "Semantic duplicate skipped"
        );
        console.log(`   ⏭️  Semantic duplicate of ${refLabel} — skip create`);
        const replyText = duplicateOrderReplyText(refLabel);
        try {
          await replyInWhatsappGroup({
            client,
            whatsappGroupId,
            msg,
            text: replyText,
          });
        } catch (replyErr) {
          console.log(
            `   ⚠️  Could not send duplicate reply: ${replyErr.message}`
          );
        }
        return { skipped: true, semanticDuplicate: true };
      }
    }

    if (!parsed.quartier) {
      botLogger.order.info(
        {
          event: "order_quartier_missing",
          whatsappMessageId,
          quartier: null,
          destination_street: "N/A",
          viaAi,
        },
        "No quartier detected; Core will use destination_street N/A"
      );
    }

    try {
      liv37Log("saveDelivery_createTransaction", {
        viaAi,
        phone: parsed.phone,
        items: parsed.items,
        amount_due: parsed.amount_due,
        quartier: parsed.quartier || null,
        keycloakId: linkedClient.keycloakId,
      });
      const result = await coreApi.createTransaction(
        linkedClient.keycloakId,
        parsed,
        messageText,
        whatsappMessageId,
        {
          clientUserId: linkedClient.raw?.id ?? linkedClient.raw?.user_id,
          messageTimestampSec,
        }
      );

      const ref =
        result._transactionRef ||
        extractTransactionRef(result);

      orderIdempotency.markSubmitted(whatsappMessageId, { transactionRef: ref });
      if (semanticDedupEnabled(config)) {
        orderSemanticDedup.remember(orderFingerprint(parsed, whatsappGroupId), {
          transactionRef: ref,
        });
      }
      botMetrics.increment("ordersOk");
      botLogger.order.info(
        {
          event: result._idempotentReplay ? "order_idempotent_replay" : "order_saved",
          whatsappMessageId,
          transactionRef: ref,
          viaAi,
          clientKeycloakId: linkedClient.keycloakId,
        },
        result._idempotentReplay ? "Idempotent transaction replay" : "Order saved"
      );

      console.log("\n" + "=".repeat(60));
      if (result._idempotentReplay) {
        console.log(`   ♻️  TRANSACTION CORE API — idempotent replay (${viaAi ? "AI" : "strict"})`);
      } else {
        console.log(`   ✅ TRANSACTION CORE API (${viaAi ? "AI" : "strict"})`);
      }
      console.log("=".repeat(60));
      console.log(`   🔑 Client: ${linkedClient.keycloakId}`);
      console.log(`   📎 Ref: ${ref}`);
      console.log(`   📱 Numéro: ${parsed.phone || "Non trouvé"}`);
      console.log(`   📦 Produits: ${parsed.items}`);
      console.log(`   💰 Montant: ${parsed.amount_due || 0} FCFA`);
      console.log(`   📍 Quartier: ${parsed.quartier || "Non spécifié"}`);
      if (result._packageMatch) {
        console.log(
          `   🏷️  Source: ${result._packageMatch.source} (${result._packageMatch.matchMethod}) → ${result._packageMatch.package_name}`
        );
      }
      if (result.scheduled_delivery_date) {
        console.log(`   📅 Livraison prévue: ${result.scheduled_delivery_date}`);
      }
      console.log("=".repeat(60) + "\n");

      if (
        config.SEND_CONFIRMATIONS === "true" &&
        config.GROUP_ID &&
        !result._idempotentReplay
      ) {
        try {
          const scheduledLine = result.scheduled_delivery_date
            ? `📅 Livraison prévue le ${result.scheduled_delivery_date}\n`
            : "";
          const confirmMsg =
            `✅ Commande enregistrée (${ref})\n` +
            scheduledLine +
            `📱 ${parsed.phone}\n` +
            `📦 ${parsed.items}\n` +
            `💰 ${parsed.amount_due || 0} FCFA`;
          const chat = await client.getChatById(config.GROUP_ID);
          await chat.sendMessage(confirmMsg);
        } catch {
          console.log("   ⚠️  Could not send confirmation message");
        }
      }
      return { id: ref };
    } catch (coreErr) {
      orderIdempotency.release(whatsappMessageId);
      throw coreErr;
    }
  }

  const existingByMsg = await findDeliveryByMessageId(whatsappMessageId);
  if (existingByMsg) {
    console.log(
      `   ⏭️  Delivery already exists for this message ID — skip create (id=${existingByMsg.id})`
    );
    return { skipped: true };
  }

  console.log(`   💾 Storing WhatsApp message ID: ${whatsappMessageId}`);
  const deliveryId = await createDelivery({
    phone: parsed.phone || "unknown",
    customer_name: parsed.customer_name,
    items: parsed.items,
    amount_due: parsed.amount_due || 0,
    quartier: parsed.quartier,
    carrier: parsed.carrier,
    notes: `${viaAi ? "AI fallback | " : ""}Original message: ${messageText.substring(0, 100)}`,
    group_id: group ? group.id : null,
    agency_id: agencyId,
    whatsapp_message_id: whatsappMessageId,
  });

  console.log("\n" + "=".repeat(60));
  console.log(`   ✅ LIVRAISON #${deliveryId} ENREGISTRÉE${viaAi ? " (AI fallback)" : " AVEC SUCCÈS!"}`);
  console.log("=".repeat(60));
  console.log(`   📎 WhatsApp Message ID stored: ${whatsappMessageId}`);
  console.log(`   📱 Numéro: ${parsed.phone || "Non trouvé"}`);
  console.log(`   📦 Produits: ${parsed.items}`);
  console.log(`   💰 Montant: ${parsed.amount_due || 0} FCFA`);
  console.log(`   📍 Quartier: ${parsed.quartier || "Non spécifié"}`);
  if (parsed.carrier) console.log(`   🚚 Transporteur: ${parsed.carrier}`);
  console.log("=".repeat(60) + "\n");

  botMetrics.increment("ordersOk");
  botLogger.order.info(
    { event: "order_saved", deliveryId, whatsappMessageId, viaAi },
    "Legacy delivery saved"
  );

  if (config.SEND_CONFIRMATIONS === "true" && config.GROUP_ID) {
    try {
      const confirmMsg =
        `✅ Livraison #${deliveryId} enregistrée${viaAi ? " (saisie assistée)" : ""}\n` +
        `📱 ${parsed.phone}\n` +
        `📦 ${parsed.items}\n` +
        `💰 ${parsed.amount_due || 0} FCFA`;
      const chat = await client.getChatById(config.GROUP_ID);
      await chat.sendMessage(confirmMsg);
    } catch {
      console.log("   ⚠️  Could not send confirmation message");
    }
  }
  return { id: deliveryId };
}

async function handleDelivery({
  messageText,
  msg,
  group,
  agencyId,
  linkedClient,
  client,
  config,
  whatsappGroupId,
}) {
  const whatsappMessageId = msg.id._serialized;
  const author = msg.author || msg.from || "unknown";

  // ── Pending AI-order confirm / reject (LIV-37 Phase 3) ─────────────────
  if (
    pendingDeliveryConfirm.isConfirmReply(messageText) ||
    pendingDeliveryConfirm.isRejectReply(messageText)
  ) {
    const pending = pendingDeliveryConfirm.getPending(whatsappGroupId, author);
    if (pending) {
      if (pendingDeliveryConfirm.isRejectReply(messageText)) {
        pendingDeliveryConfirm.clearPending(whatsappGroupId, author);
        liv37Log("decision=CONFIRM_REJECTED", {
          sourceMessageId: pending.sourceMessageId,
        });
        try {
          await msg.reply("OK — commande non enregistrée.");
        } catch (_) {
          /* ignore */
        }
        return;
      }

      const consumed = pendingDeliveryConfirm.consumePending(
        whatsappGroupId,
        author
      );
      if (!consumed) {
        liv37Log("decision=IGNORE", { reason: "confirm_expired" });
        return;
      }
      liv37Log("decision=CREATE_AI_CONFIRMED", {
        sourceMessageId: consumed.sourceMessageId,
        phone: consumed.parsed?.phone,
        items: consumed.parsed?.items,
      });
      try {
        await saveDelivery({
          parsed: consumed.parsed,
          messageText: consumed.messageText,
          whatsappMessageId: consumed.sourceMessageId,
          messageTimestampSec: msg.timestamp,
          group,
          agencyId,
          linkedClient: consumed.linkedClient || linkedClient,
          config,
          client,
          viaAi: true,
          whatsappGroupId,
          msg,
        });
      } catch (dbError) {
        logStructuredError("Erreur lors de la sauvegarde (confirm)", dbError);
        persistFailedOrder(
          {
            parsed: consumed.parsed,
            messageText: consumed.messageText,
            whatsappMessageId: consumed.sourceMessageId,
            linkedClient: consumed.linkedClient || linkedClient,
            whatsappGroupId,
            viaAi: true,
          },
          dbError
        );
      }
      return;
    }
  }

  if (isExcludedFromDeliveryParsing(messageText)) {
    console.log(
      "   ⏭️  Excluded from delivery parsing (status / mention / etc.)"
    );
    liv37Log("decision=IGNORE", {
      reason: "excluded_from_parsing",
      preview: String(messageText || "").slice(0, 120),
    });
    return;
  }

  const deliveryData = parseDeliveryMessage(messageText);
  const signals = liv37SignalSnapshot(messageText);
  liv37Log("incoming", {
    preview: String(messageText || "").slice(0, 160),
    signals,
    strictValid: !!deliveryData.valid,
    strictError: deliveryData.error || null,
    strictItems: deliveryData.items || null,
    hasQuotedMsg: !!msg.hasQuotedMsg,
    aiEnabled: !!config.AI_DELIVERY_FALLBACK_ENABLED,
    hasOpenAiKey: !!config.OPENAI_API_KEY,
    formatReminderEnabled: !!config.FORMAT_REMINDER_ENABLED,
  });

  if (msg.hasQuotedMsg) {
    let quotedPreview = null;
    let quotedId = null;
    let quotedStrict = null;
    let quotedLooksMalformed = null;
    let quotedSource = null;
    let quotedParsed = null;

    const applyQuotedBody = (quotedBody, id, source) => {
      quotedSource = source;
      quotedId = id || null;
      quotedPreview = String(quotedBody || "").slice(0, 200);
      quotedParsed = parseDeliveryMessage(quotedBody || "");
      quotedStrict = !!quotedParsed.valid;
      quotedLooksMalformed = looksLikeMalformedDeliveryWithParsed(
        quotedBody || "",
        quotedParsed
      );
    };

    try {
      const quotedMessage = await msg.getQuotedMessage();
      if (quotedMessage) {
        applyQuotedBody(
          quotedMessage.body || quotedMessage.caption || "",
          quotedMessage?.id?._serialized || quotedMessage?.id?.id || null,
          "getQuotedMessage"
        );
      }
    } catch (quoteErr) {
      console.log(
        `   ⚠️  getQuotedMessage failed (${quoteErr.message}) — trying msg._data.quotedMsg`
      );
    }

    // Fallback: WA often embeds the quoted snippet on the reply event itself
    // (getQuotedMessage/getChat both fail with "r" under current Store/LID issues).
    if (!quotedPreview) {
      const rawQuoted = msg._data?.quotedMsg || msg.quotedMsg || null;
      const rawId =
        msg._data?.quotedStanzaID ||
        msg._data?.quotedMsgId ||
        rawQuoted?.id?._serialized ||
        rawQuoted?.id?.id ||
        null;
      if (rawQuoted) {
        applyQuotedBody(
          rawQuoted.body || rawQuoted.caption || rawQuoted.comment || "",
          rawId,
          "_data.quotedMsg"
        );
      } else {
        liv37Log("reply_to_message", {
          replyText: String(messageText || "").slice(0, 120),
          error: "no_quoted_body_available",
          rawKeys: msg._data ? Object.keys(msg._data).slice(0, 40) : [],
        });
      }
    }

    if (quotedPreview != null || quotedSource) {
      console.log("   💬 REPLY detected (quoted previous message)");
      console.log(`   📎 Quoted source: ${quotedSource || "(none)"}`);
      console.log(`   📎 Quoted id: ${quotedId || "(none)"}`);
      console.log(
        `   📎 Quoted body preview: ${quotedPreview || "(empty)"}`
      );
      liv37Log("reply_to_message", {
        replyText: String(messageText || "").slice(0, 120),
        replyLooksLikeConfirm: /^\s*(oui|ok|yes|confirm(e|é)?|✅)\s*$/i.test(
          String(messageText || "").trim()
        ),
        replyLooksLikeReject: /^\s*(non|no|cancel|annul(e|é)?|❌)\s*$/i.test(
          String(messageText || "").trim()
        ),
        quotedSource,
        quotedId,
        quotedPreview,
        quotedIsStrictDelivery: quotedStrict,
        quotedLooksMalformed,
        quotedItems: quotedParsed?.valid ? quotedParsed.items : null,
        quotedPhone: quotedParsed?.valid ? quotedParsed.phone : null,
      });
    }

    if (!deliveryData.valid) {
      console.log(
        "   ⏭️  Skipped: reply to another message (not a strict new order)"
      );
      liv37Log("decision=IGNORE", {
        reason: "quoted_reply_not_strict",
        quotedId,
        quotedIsStrictDelivery: quotedStrict,
        quotedLooksMalformed,
        note: "core mode does not yet treat replies as confirm/status; reply is ignored for create",
      });
      return;
    }

    liv37Log("reply_with_strict_order", {
      note: "quoted reply body is itself a valid strict order — will create",
      quotedId,
    });
  }

  console.log(
    "   🔍 strict delivery parse valid:",
    deliveryData.valid,
    deliveryData.valid ? "" : `( ${deliveryData.error || "invalid"} )`
  );
  console.log("   📊 Parsed data:", JSON.stringify(deliveryData, null, 2));

  // ── Strict parse succeeded ──────────────────────────────────────────────
  if (deliveryData.valid) {
    console.log("   ✅ Detected as DELIVERY message (strict parse)");

    if (!deliveryData.phone && !deliveryData.hasPhone) {
      console.log("   ❌ Numéro de téléphone manquant");
      liv37Log("decision=IGNORE", { reason: "strict_missing_phone" });
      return;
    }
    if (deliveryData.amount_due == null && !deliveryData.hasAmount) {
      console.log("   ❌ Montant manquant");
      liv37Log("decision=IGNORE", { reason: "strict_missing_amount" });
      return;
    }

    liv37Log("decision=CREATE_STRICT", {
      phone: deliveryData.phone,
      items: deliveryData.items,
      amount_due: deliveryData.amount_due,
      quartier: deliveryData.quartier || null,
    });
    try {
      await saveDelivery({
        parsed: deliveryData,
        messageText,
        whatsappMessageId,
        messageTimestampSec: msg.timestamp,
        group,
        agencyId,
        linkedClient,
        config,
        client,
        viaAi: false,
        whatsappGroupId,
        msg,
      });
    } catch (dbError) {
      logStructuredError("Erreur lors de la sauvegarde", dbError);
      persistFailedOrder(
        {
          parsed: deliveryData,
          messageText,
          whatsappMessageId,
          linkedClient,
          whatsappGroupId,
          viaAi: false,
        },
        dbError
      );
    }
    return;
  }

  // ── Strict parse failed ─────────────────────────────────────────────────
  console.log("   ℹ️  Strict parse failed (not a valid structured delivery format)");

  const looksMalformed = looksLikeMalformedDeliveryWithParsed(
    messageText,
    deliveryData
  );
  liv37Log("malformed_gate", {
    looksMalformed,
    signals,
  });
  let savedViaAi = false;

  // ── AI fallback ─────────────────────────────────────────────────────────
  if (looksMalformed && config.AI_DELIVERY_FALLBACK_ENABLED && config.OPENAI_API_KEY) {
    try {
      if (!config.USE_CORE_API) {
        const existingByMsg = await findDeliveryByMessageId(whatsappMessageId);
        if (existingByMsg) {
          console.log(
            `   ⏭️  AI fallback skipped — delivery already exists for message id=${existingByMsg.id}`
          );
          liv37Log("decision=IGNORE", {
            reason: "ai_skipped_existing_legacy_delivery",
          });
        } else {
          await runAiFallback();
        }
      } else if (orderIdempotency.isSubmitted(whatsappMessageId)) {
        console.log(
          `   ⏭️  AI fallback skipped — transaction already submitted for message ${whatsappMessageId}`
        );
        liv37Log("decision=IGNORE", {
          reason: "ai_skipped_idempotent_already_submitted",
        });
      } else {
        await runAiFallback();
      }
    } catch (aiErr) {
      console.error("   ❌ AI fallback error:", aiErr.message);
      liv37Log("decision=AI_ERROR", { error: aiErr.message });
      botAlerts.notifyMessageError(aiErr, "ai-delivery-fallback");
    }

    async function runAiFallback() {
      console.log("   🤖 AI delivery fallback: calling OpenAI…");
      liv37Log("ai_fallback_start");
      const aiResult = await extractDeliveryWithAI(messageText, config);

      if (!aiResult.ok) {
        console.log("   ⚠️  AI extraction failed:", aiResult.error || "unknown");
        liv37Log("decision=AI_FAIL", { error: aiResult.error || "unknown" });
        if (aiResult.error !== "timeout") {
          botAlerts.notifyMessageError(
            new Error(`AI extraction failed: ${aiResult.error}`),
            "ai-delivery-fallback"
          );
        }
        return;
      }

      liv37Log("ai_raw", aiResult.raw);
      const normalized = validateAndNormalizeAiDelivery(aiResult.raw, messageText);
      if (!normalized) {
        console.log(
          "   ⚠️  AI extraction did not pass validation (phone/amount mismatch)"
        );
        liv37Log("decision=AI_REJECTED", {
          reason: "validateAndNormalizeAiDelivery returned null",
        });
        return;
      }

      // Ambiguous / AI path: ask for confirm before Core create (LIV-37)
      pendingDeliveryConfirm.setPending({
        whatsappGroupId,
        author,
        sourceMessageId: whatsappMessageId,
        parsed: normalized,
        messageText,
        linkedClient,
        timeoutMs: config.DELIVERY_CONFIRM_TIMEOUT_MS,
      });
      const confirmText = pendingDeliveryConfirm.buildConfirmPrompt(normalized);
      liv37Log("decision=ASK_CONFIRM_AI", {
        phone: normalized.phone,
        items: normalized.items,
        amount_due: normalized.amount_due,
        quartier: normalized.quartier || null,
      });
      try {
        await msg.reply(confirmText);
        savedViaAi = true; // suppress format reminder; create waits for oui
        console.log("   📤  AI order pending confirm (awaiting oui/non)");
      } catch (confirmErr) {
        console.log(
          "   ⚠️  Could not send confirm prompt:",
          confirmErr.message
        );
        botAlerts.notifyMessageError(confirmErr, "delivery-confirm-prompt");
      }
    }
  } else if (looksMalformed && config.AI_DELIVERY_FALLBACK_ENABLED) {
    console.log("   💡 AI fallback enabled but OPENAI_API_KEY missing — skipping");
    liv37Log("decision=NO_AI_KEY", { looksMalformed: true });
  } else if (!looksMalformed) {
    liv37Log("decision=IGNORE", {
      reason: "strict_fail_and_not_malformed",
      note: "casual chat / number share should land here",
    });
  }

  // ── Format reminder ─────────────────────────────────────────────────────
  if (!savedViaAi && looksMalformed) {
    if (!config.FORMAT_REMINDER_ENABLED) {
      console.log(
        "   💡 Message matches format-reminder heuristics; set FORMAT_REMINDER_ENABLED=true in .env to reply in-thread"
      );
      liv37Log("format_reminder_skipped", { reason: "disabled" });
      return;
    }

    const author = msg.author || msg.from || "unknown";
    const cooldownKey = `${whatsappGroupId}:${author}`;
    const now = Date.now();
    const lastSent = formatReminderCooldownByKey.get(cooldownKey) || 0;

    if (now - lastSent < config.FORMAT_REMINDER_COOLDOWN_MS) {
      console.log("   ⏭️  Format reminder skipped (cooldown)");
      liv37Log("format_reminder_skipped", { reason: "cooldown" });
      return;
    }

    try {
      await msg.reply(getFormatReminderMessage());
      formatReminderCooldownByKey.set(cooldownKey, now);
      console.log("   📤  Format reminder sent (reply)");
      liv37Log("format_reminder_sent");
    } catch (reminderErr) {
      console.log("   ⚠️  Could not send format reminder:", reminderErr.message);
      botAlerts.notifyMessageError(reminderErr, `format-reminder:${author}`);
    }
  }
}

module.exports = { handleDelivery, duplicateOrderReplyText };
