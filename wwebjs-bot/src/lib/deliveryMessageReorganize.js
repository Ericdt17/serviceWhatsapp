"use strict";

const {
  extractDeliveryWithAI,
  validateAndNormalizeAiDelivery,
} = require("./aiDeliveryExtract");

const MAX_INPUT_CHARS = 8000;

/**
 * Classic line layout for admin / strict parsers: phone → quartier → products → amount.
 * @param {{ phone: string, items: string, amount_due: number, quartier: string|null }} parsed
 */
function formatParsedDeliveryAsText(parsed) {
  const lines = [];
  if (parsed.phone) lines.push(parsed.phone);
  if (parsed.quartier) lines.push(parsed.quartier);

  const items = (parsed.items || "").trim();
  if (items) {
    const parts = items.split(/\s*,\s*/).map((p) => p.trim()).filter(Boolean);
    if (parts.length > 1) lines.push(...parts);
    else lines.push(items);
  }

  if (parsed.amount_due != null) lines.push(String(parsed.amount_due));
  return lines.join("\n");
}

/**
 * Reorganize messy WhatsApp delivery text using OpenAI (server-side key).
 *
 * @param {string} messageText
 * @param {object} cfg
 * @returns {Promise<{ ok: true, reorganized_text: string } | { ok: false, error: string, message?: string }>}
 */
async function reorganizeDeliveryMessageWithAI(messageText, cfg) {
  const text = (messageText || "").trim();
  if (!text) {
    return { ok: false, error: "empty_text", message: "Le texte est requis" };
  }
  if (text.length > MAX_INPUT_CHARS) {
    return {
      ok: false,
      error: "text_too_long",
      message: `Le texte dépasse ${MAX_INPUT_CHARS} caractères`,
    };
  }

  if (!cfg?.OPENAI_API_KEY) {
    return {
      ok: false,
      error: "no_api_key",
      message: "OpenAI n'est pas configuré sur le bot",
    };
  }

  const aiResult = await extractDeliveryWithAI(text, cfg);
  if (!aiResult.ok) {
    return {
      ok: false,
      error: aiResult.error || "ai_failed",
      message: "L'extraction IA a échoué",
    };
  }

  const normalized = validateAndNormalizeAiDelivery(aiResult.raw, text);
  if (!normalized) {
    return {
      ok: false,
      error: "validation_failed",
      message: "Impossible de valider le message (téléphone ou montant manquant)",
    };
  }

  return {
    ok: true,
    reorganized_text: formatParsedDeliveryAsText(normalized),
  };
}

module.exports = {
  MAX_INPUT_CHARS,
  formatParsedDeliveryAsText,
  reorganizeDeliveryMessageWithAI,
};
