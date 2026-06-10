"use strict";

const config = require("../config");
const { parseStatusUpdate, isStatusUpdate } = require("../statusParser");
const {
  findDeliveryByMessageId,
  findDeliveryByPhoneForUpdate,
} = require("../db");
const { getGroup } = require("../utils/group-manager");
const coreApi = require("../services/coreApiClient");
const botAlerts = require("../lib/botAlerts");
const { logStructuredError } = require("../lib/formatApiError");
const { handleStatusUpdate } = require("./statusUpdateHandler");
const { handleDelivery } = require("./deliveryHandler");
const { handleStaffCommand } = require("./staffCommands");
const botLogger = require("../lib/botLogger");

/**
 * Main entry point for every incoming WhatsApp message.
 * Handles: group filtering, #link command, reply detection, status routing, delivery routing.
 *
 * @param {object} msg    - WhatsApp message object
 * @param {object} client - WhatsApp client
 */
async function onMessage(msg, client) {
  try {
    console.log("🔔 MESSAGE EVENT FIRED - Bot received a message!");

    if (msg.fromMe) {
      console.log("   ⏭️  Skipped: Message from bot itself\n");
      return;
    }

    const chat = await msg.getChat();
    const messageText = msg.body || "";
    const chatId = chat.id?._serialized || msg.from || "";
    const isGroupChat =
      chat.isGroup === true || String(chatId).endsWith("@g.us");

    if (await handleStaffCommand(msg, client)) {
      return;
    }

    botLogger.verboseConsole("\n🔍 DEBUG - Raw message received:");
    botLogger.verboseConsole("   isGroup:", chat.isGroup, "→ treated as group:", isGroupChat);
    botLogger.verboseConsole("   groupId:", chatId || "N/A");
    botLogger.verboseConsole("   msg.from:", msg.from || "N/A");
    botLogger.verboseConsole("   targetGroupId:", config.GROUP_ID);
    botLogger.verboseConsole("   message length:", messageText.length);
    botLogger.verboseConsole("   message preview:", messageText.substring(0, 150));

    if (!isGroupChat) {
      botLogger.verboseConsole("   ⏭️  Skipped: Not a group message\n");
      return;
    }

    const whatsappGroupId = chatId.endsWith("@g.us")
      ? chatId
      : msg.from;
    const groupName = chat.name || "Unnamed Group";
    const targetGroupId = config.GROUP_ID;

    // ── #link command ───────────────────────────────────────────────────
    const normalizedText = messageText.trim().toLowerCase();
    if (normalizedText === "#link" || normalizedText === "link") {
      console.log("   🔗 #link command detected - sending group ID");
      await sendLinkMessage(client, whatsappGroupId, groupName);
      return;
    }

    // ── Group filter ────────────────────────────────────────────────────
    if (targetGroupId && whatsappGroupId !== targetGroupId) {
      console.log("   ⏭️  Skipped: Different group (GROUP_ID is configured)\n");
      return;
    }

    console.log("   ✅ Processing: Group message detected!\n");

    // ── Reply detection (legacy DB only) ────────────────────────────────
    let quotedMessage = null;
    let deliveryFromReply = null;
    if (!config.USE_CORE_API) {
      try {
        if (msg.hasQuotedMsg) {
        quotedMessage = await msg.getQuotedMessage();
        console.log("   💬 This is a REPLY to a previous message");

        const quotedIdSerialized = quotedMessage.id?._serialized;
        const quotedIdRemote = quotedMessage.id?.remote;
        const quotedIdId = quotedMessage.id?.id;

        console.log(`   📎 Quoted message ID (_serialized): ${quotedIdSerialized}`);
        console.log(`   📎 Quoted message ID (remote): ${quotedIdRemote}`);
        console.log(`   📎 Quoted message ID (id): ${quotedIdId}`);

        if (quotedIdSerialized) {
          deliveryFromReply = await findDeliveryByMessageId(quotedIdSerialized);
        }
        if (!deliveryFromReply && quotedIdRemote) {
          deliveryFromReply = await findDeliveryByMessageId(quotedIdRemote);
        }
        if (!deliveryFromReply && quotedIdId) {
          deliveryFromReply = await findDeliveryByMessageId(quotedIdId);
        }
        if (!deliveryFromReply && quotedIdSerialized) {
          const parts = quotedIdSerialized.split("_");
          const lastPart = parts[parts.length - 1];
          deliveryFromReply = await findDeliveryByMessageId(lastPart);
        }

        if (deliveryFromReply) {
          console.log(`   ✅ Found delivery #${deliveryFromReply.id} linked to quoted message`);
        } else {
          console.log(`   ⚠️  No delivery found for quoted message ID`);
        }
      }
    } catch (replyError) {
      console.log("   ℹ️  Not a reply or couldn't get quoted message");
      console.log(`   ⚠️  Error details: ${replyError.message}`);
    }
    }

    // ── Group / client resolution ───────────────────────────────────────
    let group = null;
    let agencyId = null;
    let linkedClient = null;

    if (config.USE_CORE_API) {
      try {
        linkedClient = await coreApi.getClientByWhatsappGroup(whatsappGroupId);
        if (!linkedClient) {
          console.log(`   ⏭️  Skipped: No client linked to WhatsApp group`);
          try {
            await msg.reply(
              "⚠️ Ce groupe WhatsApp n'est pas lié à un client. Un admin doit coller l'ID du groupe (#link) dans le profil client."
            );
          } catch {
            /* ignore send errors */
          }
          return;
        }
        console.log(
          `   📋 Linked client keycloakId: ${linkedClient.keycloakId} (${linkedClient.source})`
        );
      } catch (lookupErr) {
        logStructuredError("Core API client lookup failed", lookupErr);
        if (lookupErr.status !== 401 && lookupErr.status !== 403) {
          botAlerts.notifyClientLookupFailed(lookupErr, {
            groupName,
            whatsappGroupId,
          });
        }
        return;
      }
    } else {
      try {
        group = await getGroup(whatsappGroupId);
        if (!group) {
          console.log(`   ⏭️  Skipped: Group not registered in database`);
          return;
        }
        agencyId = group.agency_id;
        console.log(`   📋 Group: ${group.name} (DB ID: ${group.id}, Agency: ${agencyId})`);
      } catch (groupError) {
        console.error(`   ⚠️  Error checking group: ${groupError.message}`);
        return;
      }
    }

    // ── Contact info ────────────────────────────────────────────────────
    let contactName = "Unknown";
    try {
      const contact = await msg.getContact();
      contactName = contact.pushname || contact.name || msg.from || "Unknown";
    } catch {
      contactName = msg.notifyName || msg.from || "Unknown";
    }

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📨 Message from Target Group:");
    console.log("   Group Name:", chat.name);
    console.log("   From:", contactName);
    console.log("   Full Message:", messageText);
    console.log("   Message Length:", messageText.length);

    // ── Status update path (legacy DB only) ─────────────────────────────
    const isStatus = isStatusUpdate(messageText) || deliveryFromReply;
    if (isStatus) {
      if (config.USE_CORE_API) {
        console.log("   ⏭️  Status updates via WhatsApp not yet wired to core API");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
        return;
      }
      console.log("   🔄 Detected as STATUS UPDATE");

      let delivery = deliveryFromReply;
      let statusData = null;

      if (!delivery) {
        statusData = parseStatusUpdate(messageText);
        console.log("   📊 Status data:", JSON.stringify(statusData, null, 2));
        if (statusData && statusData.phone) {
          delivery = await findDeliveryByPhoneForUpdate(statusData.phone);
        }
      } else {
        statusData = parseStatusUpdate(messageText, true);
        console.log("   📊 Status data from reply:", JSON.stringify(statusData, null, 2));
      }

      await handleStatusUpdate({
        delivery,
        statusData,
        agencyId,
        contactName,
        deliveryFromReply,
        quotedMessage,
      });

      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
      return;
    }

    // ── New delivery path ───────────────────────────────────────────────
    await handleDelivery({
      messageText,
      msg,
      group,
      agencyId,
      linkedClient,
      client,
      config,
      whatsappGroupId,
    });

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  } catch (error) {
    console.error("⚠️  Error processing message:", error.message);
    console.log("   Message from:", msg.from || "Unknown");
    console.log("   Message preview:", (msg.body || "").substring(0, 50) + "\n");
    botAlerts.notifyMessageError(error, msg.from);
  }
}

/**
 * Send the group WhatsApp ID back to the group (3-method fallback chain).
 */
async function sendLinkMessage(client, whatsappGroupId, groupName) {
  const text =
    `📋 ID du groupe WhatsApp:\n\n` +
    `\`${whatsappGroupId}\`\n\n` +
    `💡 Copiez cet ID et collez-le dans le profil client (dashboard LivSight).\n\n` +
    `📝 Nom du groupe: ${groupName}`;

  let messageSent = false;

  // Method 1: Patch sendSeen() temporarily to bypass markedUnread error
  try {
    const page = client.pupPage;
    if (!page || page.isClosed()) throw new Error("Puppeteer page not available");

    await page.evaluate(() => {
      if (window.WWebJS?.sendSeen) {
        window._originalSendSeen = window.WWebJS.sendSeen;
        window.WWebJS.sendSeen = async () => Promise.resolve();
      }
    });
    try {
      await client.sendMessage(whatsappGroupId, text);
      messageSent = true;
      console.log(`   ✅ Group ID sent successfully`);
    } finally {
      await page.evaluate(() => {
        if (window._originalSendSeen) {
          window.WWebJS.sendSeen = window._originalSendSeen;
          delete window._originalSendSeen;
        }
      });
    }
  } catch (err1) {
    console.log(`   ⚠️  Method 1 failed: ${err1.message}`);

    // Method 2: WWebJS.sendMessage via Puppeteer
    try {
      const page = client.pupPage;
      if (!page || page.isClosed()) throw new Error("Puppeteer page not available");

      const result = await page.evaluate(
        async (groupId, msg) => {
          try {
            if (window.WWebJS?.sendMessage) {
              await window.WWebJS.sendMessage(groupId, msg);
              return { success: true };
            }
            throw new Error("WWebJS.sendMessage not available");
          } catch (e) {
            return { success: false, error: e.message };
          }
        },
        whatsappGroupId,
        text
      );

      if (!result.success) throw new Error(result.error);
      messageSent = true;
      console.log(`   ✅ Group ID sent via WWebJS.sendMessage`);
    } catch (err2) {
      console.log(`   ⚠️  Method 2 failed: ${err2.message}`);

      // Method 3: Standard method, ignore markedUnread
      try {
        await client.sendMessage(whatsappGroupId, text);
        messageSent = true;
        console.log(`   ✅ Group ID sent (standard method)`);
      } catch (err3) {
        if (err3.message?.includes("markedUnread")) {
          messageSent = true; // message was likely sent despite the error
          console.log(`   ⚠️  markedUnread error — message likely sent`);
        } else {
          console.error(`   ❌ All send methods failed: ${err3.message}`);
        }
      }
    }
  }

  if (!messageSent) {
    console.error(`   ❌ Failed to send group ID message`);
  }
}

module.exports = { onMessage };
