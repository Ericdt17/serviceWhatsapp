"use strict";

const { matchPackageWithAI } = require("./aiPackageMatch");
const { normalizeCatalogText } = require("./catalogTextUtils");

/**
 * Parse leading quantity from item line: "3 Acide Glycolique" → { quantity: 3, product: "Acide Glycolique" }
 * @param {string} itemsText
 * @returns {{ quantity: number, product: string }}
 */
function parseQuantityAndProduct(itemsText) {
  const raw = String(itemsText || "").trim();
  if (!raw) return { quantity: 1, product: "" };

  const leading = raw.match(/^(\d+)\s+(.+)$/);
  if (leading) {
    const qty = parseInt(leading[1], 10);
    return {
      quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
      product: leading[2].trim(),
    };
  }

  const trailing = raw.match(/^(.+?)\s+x\s*(\d+)$/i);
  if (trailing) {
    const qty = parseInt(trailing[2], 10);
    return {
      quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
      product: trailing[1].trim(),
    };
  }

  return { quantity: 1, product: raw };
}

/**
 * Find catalog entry by normalized exact name match.
 * @param {string} productText
 * @param {Array<{ package_name: string, id?: number }>} catalog
 * @returns {object|null}
 */
function findExactCatalogMatch(productText, catalog) {
  const normalizedProduct = normalizeCatalogText(productText);
  if (!normalizedProduct || !Array.isArray(catalog) || catalog.length === 0) {
    return null;
  }

  const matches = catalog.filter(
    (pkg) => normalizeCatalogText(pkg.package_name) === normalizedProduct
  );

  if (matches.length === 1) {
    return matches[0];
  }
  return null;
}

/**
 * Build match result object.
 * @param {object} params
 * @returns {object}
 */
function buildMatchResult({
  source,
  package_name,
  quantity,
  matchMethod,
  confidence = null,
  catalogPackageId = null,
}) {
  return {
    source,
    package_name: package_name || "Colis",
    quantity: quantity > 0 ? quantity : 1,
    matchMethod,
    confidence,
    catalogPackageId,
  };
}

/**
 * Resolve stock vs pickup and catalog package_name (exact match first, optional AI).
 *
 * @param {string} itemsText - parsed.items from delivery parser
 * @param {Array<{ package_name: string, id?: number, description?: string }>} catalog
 * @param {{ config?: object, messageText?: string }} [options]
 * @returns {Promise<object>}
 */
async function resolvePackageMatch(itemsText, catalog, options = {}) {
  const { config, messageText } = options;
  const rawItems = String(itemsText || "").trim() || "Colis";
  const packages = Array.isArray(catalog) ? catalog : [];
  const { quantity, product } = parseQuantityAndProduct(rawItems);
  const productForMatch = product || rawItems;

  if (packages.length === 0) {
    return buildMatchResult({
      source: "pickup",
      package_name: rawItems.slice(0, 120),
      quantity,
      matchMethod: "none",
    });
  }

  if (packages.length === 1) {
    return buildMatchResult({
      source: "stock",
      package_name: packages[0].package_name,
      quantity,
      matchMethod: "single_catalog",
      catalogPackageId: packages[0].id ?? null,
    });
  }

  const exact = findExactCatalogMatch(productForMatch, packages);
  if (exact) {
    return buildMatchResult({
      source: "stock",
      package_name: exact.package_name,
      quantity,
      matchMethod: "exact",
      confidence: 1,
      catalogPackageId: exact.id ?? null,
    });
  }

  // Also try full raw line (without quantity split) against catalog names
  const exactFullLine = findExactCatalogMatch(rawItems, packages);
  if (exactFullLine) {
    return buildMatchResult({
      source: "stock",
      package_name: exactFullLine.package_name,
      quantity,
      matchMethod: "exact",
      confidence: 1,
      catalogPackageId: exactFullLine.id ?? null,
    });
  }

  if (
    config?.AI_DELIVERY_FALLBACK_ENABLED &&
    config?.OPENAI_API_KEY &&
    packages.length > 1
  ) {
    try {
      const aiMatch = await matchPackageWithAI(productForMatch, packages, config);
      if (aiMatch?.matched_package_name) {
        const verified = packages.find(
          (pkg) =>
            normalizeCatalogText(pkg.package_name) ===
            normalizeCatalogText(aiMatch.matched_package_name)
        );
        if (verified && (aiMatch.confidence ?? 0) >= 0.85) {
          return buildMatchResult({
            source: "stock",
            package_name: verified.package_name,
            quantity: aiMatch.quantity > 0 ? aiMatch.quantity : quantity,
            matchMethod: "ai",
            confidence: aiMatch.confidence,
            catalogPackageId: verified.id ?? null,
          });
        }
        if (verified && (aiMatch.confidence ?? 0) >= 0.6) {
          return buildMatchResult({
            source: "stock",
            package_name: verified.package_name,
            quantity: aiMatch.quantity > 0 ? aiMatch.quantity : quantity,
            matchMethod: "ai",
            confidence: aiMatch.confidence,
            catalogPackageId: verified.id ?? null,
          });
        }
      }
    } catch (err) {
      console.warn("   ⚠️  AI package match failed:", err.message);
    }
  }

  return buildMatchResult({
    source: "pickup",
    package_name: rawItems.slice(0, 120),
    quantity,
    matchMethod: "none",
  });
}

module.exports = {
  normalizeCatalogText,
  parseQuantityAndProduct,
  findExactCatalogMatch,
  resolvePackageMatch,
  buildMatchResult,
};
