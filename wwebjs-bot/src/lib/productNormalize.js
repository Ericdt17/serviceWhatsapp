"use strict";

const {
  parseQuantityAndProduct,
  splitProductParts,
} = require("./packageCatalogMatch");
const { normalizeCatalogText } = require("./catalogTextUtils");
const {
  extractKnownQuartier,
  isKnownQuartier,
} = require("./deliveryQuartiers");

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
 * Text that tells the courier what to DO, not where to go.
 *
 * <p>Vendors routinely write "appeler le client il va vous donner sa position" in the address
 * slot. That is a delivery instruction, and treating it as a place is worse than having no place
 * at all: Google's address index answers it with a confident rooftop plus code, so the parcel gets
 * a precise-looking coordinate somewhere arbitrary and drags the whole zone's ordering with it.
 * Its place index, asked the same string, correctly returns nothing.
 *
 * <p>Matched on verbs and phrasings rather than a keyword list, because the giveaway is that the
 * line addresses a person ("call him", "he will send it") instead of naming somewhere.
 */
const INSTRUCTION_PATTERNS = [
  /\b(?:appel(?:er|ez|é|e)?|call|contact(?:er|ez)?|joindre|joignez)\b/i,
  /\b(?:il|elle|le client|la cliente|the client)\s+(?:va|vous|te|nous|will)\b/i,
  /\b(?:donner(?:a)?|envoy(?:er|era)|indiquer(?:a)?|pr[ée]cis(?:er|era))\s+(?:sa|la|le|son)\b/i,
  /\b(?:position|localisation|location)\s+(?:exacte|par|via|sur)\b/i,
  /\b(?:je suis|nous sommes|i am|we are)\b/i,
  /\bde la part de\b/i,
  /\bd[èe]s (?:son|leur) arriv[ée]e\b/i,
];

/** True when the line reads as an instruction to the courier rather than a destination. */
function looksLikeDeliveryInstruction(text) {
  const s = String(text || "").trim();
  if (!s) return false;
  // A short line naming a place can contain a verb by coincidence; instructions are sentences.
  const wordCount = s.split(/\s+/).length;
  if (wordCount < 3) return false;
  return INSTRUCTION_PATTERNS.some((re) => re.test(s));
}

function lineLooksLikePhone(line) {
  const digits = String(line || "").replace(/\D/g, "");
  if (/^[627]\d{7,8}$/.test(digits)) {
    return true;
  }
  if (/^237[627]\d{8}$/.test(digits)) {
    return true;
  }
  return false;
}

function lineLooksLikeProduct(line, productLines = []) {
  const normalizedLine = normalizeCatalogText(line);
  if (!normalizedLine) {
    return false;
  }

  for (const product of productLines) {
    const normalizedProduct = normalizeCatalogText(product);
    if (!normalizedProduct) {
      continue;
    }
    if (normalizedLine === normalizedProduct) {
      return true;
    }
    if (
      normalizedProduct.includes(normalizedLine) &&
      normalizedLine.length >= 3
    ) {
      return true;
    }
    if (
      normalizedLine.includes(normalizedProduct) &&
      normalizedProduct.length >= 3
    ) {
      return true;
    }
  }
  return false;
}

function findAmountLineIndex(lines) {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (isPriceLikeLocation(line)) {
      return i;
    }
    if (/^\d[\d\s.,k]+(?:\s*(?:fcfa|frs|fr|xaf|f))?$/i.test(line.trim())) {
      return i;
    }
  }
  return -1;
}

function shouldSkipLocationLine(line) {
  if (!/[a-zA-ZÀ-ÿ]/.test(line)) {
    return true;
  }
  if (
    /^(?:prix|montant|total|livraison|frais|tel|num|produit|article|colis|pack|commande|un pack)/i.test(
      line
    )
  ) {
    return true;
  }
  if (/^\d[\d\s]*$/.test(line.replace(/\s/g, ""))) {
    return true;
  }
  return false;
}

/**
 * @param {string} text
 * @returns {string|null}
 */
function extractLabeledLocation(text) {
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
  return null;
}

/**
 * Pick a free-text quartier line from message body (last resort).
 * @param {string} text
 * @param {{ productLines?: string[] }} [options]
 * @returns {string|null}
 */
function extractLocationLineFromMessage(text, options = {}) {
  const { productLines = [] } = options;
  const lines = String(text || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const amountIdx = findAmountLineIndex(lines);
  const searchOrder = [];

  if (amountIdx >= 0) {
    for (let i = amountIdx + 1; i < lines.length; i++) {
      searchOrder.push(i);
    }
    for (let i = amountIdx - 1; i >= 0; i--) {
      searchOrder.push(i);
    }
  } else {
    for (let i = lines.length - 1; i >= 0; i--) {
      searchOrder.push(i);
    }
  }

  for (const i of searchOrder) {
    const line = lines[i];
    if (shouldSkipLocationLine(line)) {
      continue;
    }
    // Otherwise the fallback picks up the very instruction the model was refused for.
    if (looksLikeDeliveryInstruction(line)) {
      continue;
    }
    if (lineLooksLikePhone(line)) {
      continue;
    }
    if (isPriceLikeLocation(line)) {
      continue;
    }
    if (lineLooksLikeProduct(line, productLines)) {
      continue;
    }
    if (isKnownQuartier(line)) {
      return extractKnownQuartier(line) || line;
    }
    if (line.length >= 2) {
      return line;
    }
  }
  return null;
}

/**
 * Sanitize AI/model location — never use Prix/Montant lines or product names as quartier.
 * @param {string|null|undefined} modelLocation
 * @param {string} originalText
 * @param {{ productLines?: string[] }} [options]
 * @returns {string|null}
 */
function sanitizeDeliveryLocation(modelLocation, originalText, options = {}) {
  const { productLines = [] } = options;

  const fromKnown = extractKnownQuartier(originalText);
  if (fromKnown) {
    return fromKnown;
  }

  const fromLabel = extractLabeledLocation(originalText);
  if (
    fromLabel &&
    !lineLooksLikeProduct(fromLabel, productLines) &&
    !looksLikeDeliveryInstruction(fromLabel)
  ) {
    return isKnownQuartier(fromLabel)
      ? extractKnownQuartier(fromLabel) || fromLabel
      : fromLabel;
  }

  const modelLoc = String(modelLocation || "").trim();
  if (
    modelLoc &&
    !isPriceLikeLocation(modelLoc) &&
    !lineLooksLikeProduct(modelLoc, productLines) &&
    !looksLikeDeliveryInstruction(modelLoc)
  ) {
    if (isKnownQuartier(modelLoc)) {
      return extractKnownQuartier(modelLoc) || modelLoc;
    }
    return modelLoc;
  }

  return extractLocationLineFromMessage(originalText, { productLines });
}

module.exports = {
  splitProductParts,
  normalizeItemsAndQuantity,
  isPriceLikeLocation,
  looksLikeDeliveryInstruction,
  lineLooksLikeProduct,
  sanitizeDeliveryLocation,
  extractLocationLineFromMessage,
  extractLabeledLocation,
};
