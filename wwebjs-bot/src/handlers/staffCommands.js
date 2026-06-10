"use strict";

const { getBotHealthStatus } = require("../lib/botHealthStatus");
const botLogger = require("../lib/botLogger");
const botRuntimeState = require("../lib/botRuntimeState");

const STAFF_COMMANDS = new Set(["#ping", "#status", "ping", "status"]);

function isStaffCommand(messageText) {
  const normalized = String(messageText || "").trim().toLowerCase();
  return STAFF_COMMANDS.has(normalized);
}

function formatUptimeMinutes(seconds) {
  const mins = Math.floor(Number(seconds) / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h} h ${m} min` : `${h} h`;
}

function formatStatusMessage(status) {
  const wa =
    status.ready || status.clientReady || status.state === "CONNECTED"
      ? "OK"
      : status.state || "non prêt";
  const api = status.coreApiSkipped
    ? "N/A (legacy)"
    : status.coreApiOk
      ? "OK"
      : "échec";
  const circuit = status.circuitOpen
    ? `ouvert (~${Math.ceil((status.circuitRemainingMs || 0) / 60000)} min)`
    : "fermé";
  const m = status.metrics || {};
  const lines = [
    "LivSight Bot — statut",
    `WhatsApp: ${wa}`,
    `API Core: ${api}`,
    `Circuit: ${circuit}`,
    `Commandes OK: ${m.ordersOk ?? 0} | échecs: ${m.ordersFailed ?? 0} | idempotents: ${m.ordersSkippedIdempotent ?? 0}`,
    `CLIENT_ID: ${status.clientId || "(default)"}`,
    `Uptime: ${formatUptimeMinutes(status.metrics?.uptimeSeconds ?? 0)}`,
  ];
  if (status.coreApiError && !status.coreApiOk) {
    lines.push(`Erreur API: ${String(status.coreApiError).slice(0, 120)}`);
  }
  return lines.join("\n");
}

/**
 * Handle #ping / #status in direct messages only.
 * @returns {boolean} true if handled (caller should return)
 */
async function handleStaffCommand(msg, client) {
  const messageText = msg.body || "";
  if (!isStaffCommand(messageText)) {
    return false;
  }

  const chat = await msg.getChat();
  const chatId = chat.id?._serialized || msg.from || "";
  const isGroupChat =
    chat.isGroup === true || String(chatId).endsWith("@g.us");

  if (isGroupChat) {
    botLogger.staff.debug({ event: "staff_command_ignored_group" }, "staff cmd in group");
    return false;
  }

  const normalized = messageText.trim().toLowerCase();

  if (normalized === "#ping" || normalized === "ping") {
    const uptimeMin = Math.floor(process.uptime() / 60);
    await msg.reply(`Pong — bot en ligne (uptime ${uptimeMin} min)`);
    botLogger.staff.info({ event: "staff_ping" }, "staff ping");
    return true;
  }

  const status = await getBotHealthStatus({
    client,
    clientReady: botRuntimeState.isClientReady(),
  });
  await msg.reply(formatStatusMessage(status));
  botLogger.staff.info({ event: "staff_status", ready: status.ready }, "staff status");
  return true;
}

module.exports = {
  isStaffCommand,
  formatStatusMessage,
  handleStaffCommand,
};
