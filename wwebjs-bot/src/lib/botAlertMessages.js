"use strict";

const PREFIX = "[LivSight Bot]";

function withPrefix(text) {
  return `${PREFIX} ${text}`;
}

function startup() {
  return withPrefix("Bot en ligne — WhatsApp prêt.");
}

function waDisconnected() {
  return withPrefix("WhatsApp déconnecté. Reconnexion en cours...");
}

function waDisconnectedReminder(minutes, reason) {
  return withPrefix(
    `WhatsApp toujours déconnecté (${minutes} min). Raison: ${reason || "inconnue"}.`
  );
}

function waReconnected() {
  return withPrefix("Bot reconnecté — WhatsApp OK.");
}

function apiSessionLost() {
  return withPrefix("Session API LivSight expirée. Commandes bloquées.");
}

function apiReconnecting() {
  return withPrefix("Reconnexion à l'API LivSight...");
}

function apiReconnected() {
  return withPrefix("Bot reconnecté à l'API LivSight. Commandes OK.");
}

function apiAuthFailed() {
  return withPrefix("Échec connexion API LivSight. Vérifier identifiants bot.");
}

function orderFailed({ phone, amount, quartier } = {}) {
  const tel = phone || "?";
  const montant = amount != null && amount !== "" ? amount : "?";
  const q = quartier || "?";
  return withPrefix(
    `Commande non enregistrée — Tel ${tel}, ${montant} FCFA, ${q}.`
  );
}

function groupNotLinked(groupName) {
  const g = groupName ? ` (${groupName})` : "";
  return withPrefix(
    `Groupe non lié${g} — envoyer #link et lier sur le dashboard.`
  );
}

function groupLookupFailed(groupName) {
  const g = groupName ? ` (${groupName})` : "";
  return withPrefix(`Impossible d'identifier le client pour ce groupe${g}.`);
}

function heartbeat() {
  return withPrefix("Bot OK — WhatsApp et API connectés.");
}

function qrStale(minutes) {
  return withPrefix(
    `QR non scanné depuis ${minutes} min — scanner le code sur le VPS.`
  );
}

function waAuthFailure() {
  return withPrefix("Échec connexion WhatsApp — rescanner le QR.");
}

function waLogoutRequired(reason) {
  const r = reason ? String(reason) : "inconnue";
  return withPrefix(
    `Session WhatsApp fermée (${r}). Rescanner le QR sur le VPS.`
  );
}

function waNotConnected(minutes, state) {
  return withPrefix(
    `WhatsApp non prêt depuis ${minutes} min (état: ${state || "?"}).`
  );
}

function genericError(source, message) {
  const src = source ? `${source}: ` : "";
  return withPrefix(`${src}${message || "Erreur inconnue."}`.slice(0, 500));
}

module.exports = {
  PREFIX,
  withPrefix,
  startup,
  waDisconnected,
  waDisconnectedReminder,
  waReconnected,
  apiSessionLost,
  apiReconnecting,
  apiReconnected,
  apiAuthFailed,
  orderFailed,
  groupNotLinked,
  groupLookupFailed,
  heartbeat,
  qrStale,
  waAuthFailure,
  waLogoutRequired,
  waNotConnected,
  genericError,
};
