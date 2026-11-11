"use strict";

/**
 * WhatsApp bold — strip * so nested markup does not break.
 * @param {string} text
 * @returns {string}
 */
function waBold(text) {
  const cleaned = String(text || "")
    .replace(/\*/g, "")
    .trim();
  if (!cleaned) return "";
  return `*${cleaned}*`;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function trimUrl(value) {
  return String(value || "").trim();
}

/**
 * Build the French `#link` welcome / onboarding reply.
 *
 * Empty store URLs omit that platform line; if both are empty the download
 * section is omitted entirely. A short dashboard paste tip is always included.
 *
 * @param {{
 *   groupName: string,
 *   groupId: string,
 *   androidUrl?: string,
 *   iosUrl?: string,
 * }} opts
 * @returns {string}
 */
function buildLinkWelcomeMessage(opts = {}) {
  const groupName = String(opts.groupName || "").trim() || "—";
  const groupId = String(opts.groupId || "").trim() || "—";
  const androidUrl = trimUrl(opts.androidUrl);
  const iosUrl = trimUrl(opts.iosUrl);

  const lines = [
    "Bienvenue chez LivSight !",
    "",
    "Votre groupe WhatsApp a été configuré avec succès.",
    "",
    `${waBold("Nom du groupe :")} ${groupName}`,
    `${waBold("Identifiant :")} ${groupId}`,
    "",
    "💡 Copiez cet ID et collez-le dans le profil client (dashboard LivSight).",
    "",
    "Pour profiter pleinement de nos services, téléchargez l'application LivSight afin de suivre vos livraisons et consulter vos rapports.",
  ];

  if (androidUrl || iosUrl) {
    lines.push("");
    lines.push(`${waBold("Télécharger l'application :")}`);
    if (androidUrl) lines.push(`Android : ${androidUrl}`);
    if (iosUrl) lines.push(`iPhone : ${iosUrl}`);
  }

  lines.push(
    "",
    "Une fois l'application installée, contactez notre équipe dans ce groupe pour récupérer vos identifiants de connexion.",
    "",
    "Merci de votre confiance !",
    waBold("L'équipe LivSight")
  );

  return lines.join("\n");
}

/**
 * Read store URLs from process.env (empty string when unset).
 * @param {NodeJS.ProcessEnv} [env=process.env]
 * @returns {{ androidUrl: string, iosUrl: string }}
 */
function resolveStoreUrlsFromEnv(env = process.env) {
  return {
    androidUrl: trimUrl(env.LIVSIGHT_ANDROID_STORE_URL),
    iosUrl: trimUrl(env.LIVSIGHT_IOS_STORE_URL),
  };
}

module.exports = {
  buildLinkWelcomeMessage,
  resolveStoreUrlsFromEnv,
  waBold,
};
