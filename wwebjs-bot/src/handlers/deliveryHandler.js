"use strict";

const { createDelivery, findDeliveryByMessageId } = require("../db");
const {
  parseDeliveryMessage,
  isExcludedFromDeliveryParsing,
  looksLikeMalformedDeliveryWithParsed,
  getFormatReminderMessage,
} = require("../parser");
const {
  extractDeliveryWithAI,
  validateAndNormalizeAiDelivery,
} = require("../lib/aiDeliveryExtract");
const coreApi = require("../services/coreApiClient");
const botAlerts = require("../lib/botAlerts");
const { logStructuredError } = require("../lib/formatApiError");
const orderIdempotency = require("../lib/orderIdempotency");
const failedOrderDeadLetter = require("../lib/failedOrderDeadLetter");
const { extractTransactionRef } = require("../lib/transactionResponse");
const botMetrics = require("../lib/botMetrics");
const botLogger = require("../lib/botLogger");

/** groupId:author → timestamp of last format-reminder sent (ms) */
const formatReminderCooldownByKey = new Map();

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
  group,
  agencyId,
  linkedClient,
  config,
  client,
  viaAi,
  whatsappGroupId,
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

    try {
      const result = await coreApi.createTransaction(
        linkedClient.keycloakId,
        parsed,
        messageText,
        whatsappMessageId,
        { clientUserId: linkedClient.raw?.id ?? linkedClient.raw?.user_id }
      );

      const ref =
        result._transactionRef ||
        extractTransactionRef(result);

      orderIdempotency.markSubmitted(whatsappMessageId, { transactionRef: ref });
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
      console.log("=".repeat(60) + "\n");

      if (
        config.SEND_CONFIRMATIONS === "true" &&
        config.GROUP_ID &&
        !result._idempotentReplay
      ) {
        try {
          const confirmMsg =
            `✅ Commande enregistrée (${ref})\n` +
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
  if (isExcludedFromDeliveryParsing(messageText)) {
    console.log(
      "   ⏭️  Excluded from delivery parsing (status / mention / etc.)"
    );
    return;
  }

  const whatsappMessageId = msg.id._serialized;
  const deliveryData = parseDeliveryMessage(messageText);
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
      return;
    }
    if (!deliveryData.amount_due && !deliveryData.hasAmount) {
      console.log("   ❌ Montant manquant");
      return;
    }

    try {
      await saveDelivery({
        parsed: deliveryData,
        messageText,
        whatsappMessageId,
        group,
        agencyId,
        linkedClient,
        config,
        client,
        viaAi: false,
        whatsappGroupId,
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
        } else {
          await runAiFallback();
        }
      } else if (orderIdempotency.isSubmitted(whatsappMessageId)) {
        console.log(
          `   ⏭️  AI fallback skipped — transaction already submitted for message ${whatsappMessageId}`
        );
      } else {
        await runAiFallback();
      }
    } catch (aiErr) {
      console.error("   ❌ AI fallback error:", aiErr.message);
      botAlerts.notifyMessageError(aiErr, "ai-delivery-fallback");
    }

    async function runAiFallback() {
      console.log("   🤖 AI delivery fallback: calling OpenAI…");
      const aiResult = await extractDeliveryWithAI(messageText, config);

      if (!aiResult.ok) {
        console.log("   ⚠️  AI extraction failed:", aiResult.error || "unknown");
        if (aiResult.error !== "timeout") {
          botAlerts.notifyMessageError(
            new Error(`AI extraction failed: ${aiResult.error}`),
            "ai-delivery-fallback"
          );
        }
        return;
      }

      const normalized = validateAndNormalizeAiDelivery(aiResult.raw, messageText);
      if (!normalized) {
        console.log(
          "   ⚠️  AI extraction did not pass validation (phone/amount mismatch)"
        );
        return;
      }

      try {
        await saveDelivery({
          parsed: normalized,
          messageText,
          whatsappMessageId,
          group,
          agencyId,
          linkedClient,
          config,
          client,
          viaAi: true,
          whatsappGroupId,
        });
        savedViaAi = true;
      } catch (dbAiError) {
        logStructuredError("Erreur lors de la sauvegarde (AI)", dbAiError);
        persistFailedOrder(
          {
            parsed: normalized,
            messageText,
            whatsappMessageId,
            linkedClient,
            whatsappGroupId,
            viaAi: true,
          },
          dbAiError
        );
      }
    }
  } else if (looksMalformed && config.AI_DELIVERY_FALLBACK_ENABLED) {
    console.log("   💡 AI fallback enabled but OPENAI_API_KEY missing — skipping");
  }

  // ── Format reminder ─────────────────────────────────────────────────────
  if (!savedViaAi && looksMalformed) {
    if (!config.FORMAT_REMINDER_ENABLED) {
      console.log(
        "   💡 Message matches format-reminder heuristics; set FORMAT_REMINDER_ENABLED=true in .env to reply in-thread"
      );
      return;
    }

    const author = msg.author || msg.from || "unknown";
    const cooldownKey = `${whatsappGroupId}:${author}`;
    const now = Date.now();
    const lastSent = formatReminderCooldownByKey.get(cooldownKey) || 0;

    if (now - lastSent < config.FORMAT_REMINDER_COOLDOWN_MS) {
      console.log("   ⏭️  Format reminder skipped (cooldown)");
      return;
    }

    try {
      await msg.reply(getFormatReminderMessage());
      formatReminderCooldownByKey.set(cooldownKey, now);
      console.log("   📤  Format reminder sent (reply)");
    } catch (reminderErr) {
      console.log("   ⚠️  Could not send format reminder:", reminderErr.message);
      botAlerts.notifyMessageError(reminderErr, `format-reminder:${author}`);
    }
  }
}

module.exports = { handleDelivery };
