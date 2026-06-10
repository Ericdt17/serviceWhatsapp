"use strict";

const {
  parseQuantityAndProduct,
  splitProductParts,
} = require("./packageCatalogMatch");
const { extractQuartier } = require("../parser");

/**
 * Normalize product line(s): join multi-product with em dash, sum quantities.
 * @param {string} itemsText
 * @returns {{ displayItems: string, quantity: number }}
 */
function normalizeItemsAndQuantity(itemsText) {
  const parts = splitProductParts(itemsText);
  if (parts.length === 0) {
    return { displayItems: "Colis", quantity: 1 };
  }

  const parsedParts = parts.map((part) => ({
    part,
    ...parseQuantityAndProduct(part),
  }));
  const displayNames = parsedParts
    .map((p) => (p.product || p.part).trim())
    .filter(Boolean);

  const quantity = parsedParts.reduce(
    (sum, p) => sum + (p.quantity > 0 ? p.quantity : 1),
    0
  );

  const displayItems =
    displayNames.length > 0
      ? displayNames.join(" — ")
      : String(itemsText).trim().slice(0, 120) || "Colis";

  return {
    displayItems: displayItems.slice(0, 120),
    quantity: Math.max(1, quantity),
  };
}

/** True when a location string is really a price/amount label. */
function isPriceLikeLocation(loc) {
  const s = String(loc || "").trim();
  if (!s) return false;
  if (/^(?:prix|montant|total|à payer|a payer|somme|coût|cost)\b/i.test(s)) {
    return true;
  }
  if (/^\d[\d\s.,]*\s*(?:fcfa|frs|fr|xaf|f)?$/i.test(s)) {
    return true;
  }
  return false;
}

/**
 * Pick a free-text quartier line from message body (last resort).
 * @param {string} text
 * @returns {string|null}
 */
function extractLocationLineFromMessage(text) {
  const lines = String(text || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    const labeled = line.match(
      /^(?:lieu|quartier|adresse|destination)\s*:\s*(.+)$/i
    );
    if (labeled) {
      const cleaned = labeled[1].trim();
      if (cleaned.length >= 2 && !isPriceLikeLocation(cleaned)) {
        return cleaned;
      }
    }
  }

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!/[a-zA-ZÀ-ÿ]/.test(line)) continue;
    if (/^(?:prix|montant|total|livraison|frais|tel|num|produit|article|colis|pack|commande|un pack)/i.test(line)) {
      continue;
    }
    if (/^\d[\d\s]*$/.test(line.replace(/\s/g, ""))) continue;
    if (isPriceLikeLocation(line)) continue;
    if (/^[627]\d{7,8}$/.test(line.replace(/\D/g, ""))) continue;
    if (line.length >= 2) {
      return line;
    }
  }
  return null;
}

/**
 * Sanitize AI/model location — never use Prix/Montant lines as quartier.
 * @param {string|null|undefined} modelLocation
 * @param {string} originalText
 * @returns {string|null}
 */
function sanitizeDeliveryLocation(modelLocation, originalText) {
  const fromKnown = extractQuartier(originalText);
  if (fromKnown) return fromKnown;

  const modelLoc = String(modelLocation || "").trim();
  if (modelLoc && !isPriceLikeLocation(modelLoc)) {
    return modelLoc;
  }

  return extractLocationLineFromMessage(originalText);
}

module.exports = {
  splitProductParts,
  normalizeItemsAndQuantity,
  isPriceLikeLocation,
  sanitizeDeliveryLocation,
  extractLocationLineFromMessage,
};
