"use strict";

const { isPlaceholderProduct } = require("./productNormalize");

/**
 * True when an AI-normalized delivery is complete enough to create on Core
 * without a WhatsApp pre-create confirm (LIV-48).
 *
 * Strong: phone + real product + amount >= 0 (0 = rien à encaisser) + non-empty quartier.
 * Catalog / stock match is not required (pickup free-text OK).
 *
 * @param {null|undefined|{
 *   phone?: string|null,
 *   items?: string|null,
 *   amount_due?: number|null,
 *   quartier?: string|null,
 * }} normalized - from validateAndNormalizeAiDelivery
 * @returns {boolean}
 */
function isHighConfidenceAiDelivery(normalized) {
  if (!normalized || typeof normalized !== "object") return false;

  const phone = String(normalized.phone || "").trim();
  if (!phone) return false;

  if (isPlaceholderProduct(normalized.items)) return false;

  // Explicit 0 is valid (nothing to collect); null/NaN/negative are not.
  if (
    normalized.amount_due === null ||
    normalized.amount_due === undefined ||
    normalized.amount_due === ""
  ) {
    return false;
  }
  const amount = Number(normalized.amount_due);
  if (!Number.isFinite(amount) || amount < 0) return false;

  const quartier = String(normalized.quartier || "").trim();
  if (!quartier) return false;

  return true;
}

module.exports = {
  isHighConfidenceAiDelivery,
};
