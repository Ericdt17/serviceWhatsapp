"use strict";

const { matchPackageWithAI, extractQuantityWithAI } = require("./aiPackageMatch");
const { normalizeCatalogText } = require("./catalogTextUtils");

const MAX_STOCK_QUANTITY = 99;

/**
 * @param {number} n
 * @returns {number}
 */
function clampQuantity(n) {
  const q = Math.trunc(Number(n));
  if (!Number.isFinite(q) || q < 1) return 1;
  return Math.min(q, MAX_STOCK_QUANTITY);
}

/**
 * True when the line likely mentions a quantity beyond a plain product name.
 * @param {string} text
 * @returns {boolean}
 */
function lineHintsAtQuantity(text) {
  const t = String(text || "");
  return (
    /\d+\s*[x×]\s*\d*|[x×]\s*\d+/i.test(t) ||
    /\b\d+\s+[a-zA-Zàâäéèêëïîôùûüç]/i.test(t) ||
    /\b(qty|qte|qté|quantité|quantite)\b/i.test(t) ||
    /\(\s*\d+\s*\)/.test(t)
  );
}

/**
 * Parse quantity + product from items line (regex only).
 * @param {string} itemsText
 * @returns {{ quantity: number, product: string, quantityAmbiguous: boolean }}
 */
function parseQuantityAndProduct(itemsText) {
  const raw = String(itemsText || "").trim();
  if (!raw) {
    return { quantity: 1, product: "", quantityAmbiguous: false };
  }

  const tryQty = (qtyStr, product) => {
    const qty = parseInt(qtyStr, 10);
    const productTrim = String(product || "").trim();
    if (!Number.isFinite(qty) || qty < 1 || !productTrim) {
      return null;
    }
    return {
      quantity: clampQuantity(qty),
      product: productTrim,
      quantityAmbiguous: false,
    };
  };

  // 2x product, 2 x product
  const leadingX = raw.match(/^(\d+)\s*[x×]\s*(.+)$/i);
  if (leadingX) return tryQty(leadingX[1], leadingX[2]);

  // qty 2 product, qté: 2 product
  const qtyLabel = raw.match(
    /^(?:qty|qte|qté|quantité|quantite)\s*[:.]?\s*(\d+)\s+(.+)$/i
  );
  if (qtyLabel) return tryQty(qtyLabel[1], qtyLabel[2]);

  // 3 product
  const leading = raw.match(/^(\d+)\s+(.+)$/);
  if (leading) {
    const rest = leading[2].trim();
    // Avoid treating phone-like leading digits as quantity when rest looks like amount-only
    if (rest.length > 0 && !/^\d+$/.test(rest)) {
      return tryQty(leading[1], rest);
    }
  }

  // product x2, product x 2, product×2 (no space before x allowed)
  const trailingX = raw.match(/^(.+?)\s*[x×]\s*(\d+)\s*$/i);
  if (trailingX) return tryQty(trailingX[2], trailingX[1]);

  // product (2) or product - 2
  const paren = raw.match(/^(.+?)\s*[\(-]\s*(\d+)\s*\)?\s*$/);
  if (paren) return tryQty(paren[2], paren[1]);

  return {
    quantity: 1,
    product: raw,
    quantityAmbiguous: lineHintsAtQuantity(raw),
  };
}

/**
 * Resolve final quantity for stock orders (regex + optional AI).
 * @param {string} itemsText
 * @param {string} catalogPackageName
 * @param {number} parsedQuantity
 * @param {boolean} quantityAmbiguous
 * @param {object} [config]
 * @returns {Promise<{ quantity: number, quantitySource: string }>}
 */
async function resolveStockQuantity(
  itemsText,
  catalogPackageName,
  parsedQuantity,
  quantityAmbiguous,
  config
) {
  let qty = clampQuantity(parsedQuantity);
  const ambiguous =
    quantityAmbiguous || (qty === 1 && lineHintsAtQuantity(itemsText));

  if (!ambiguous) {
    return { quantity: qty, quantitySource: "parse" };
  }

  if (!config?.AI_DELIVERY_FALLBACK_ENABLED || !config?.OPENAI_API_KEY) {
    return { quantity: qty, quantitySource: "parse" };
  }

  try {
    const aiQty = await extractQuantityWithAI(itemsText, catalogPackageName, config);
    if (aiQty && aiQty.quantity > 0 && aiQty.confidence >= 0.7) {
      return {
        quantity: clampQuantity(aiQty.quantity),
        quantitySource: "ai_quantity",
      };
    }
  } catch (err) {
    console.warn("   ⚠️  AI quantity extraction failed:", err.message);
  }

  return { quantity: qty, quantitySource: "parse" };
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
  quantitySource = null,
}) {
  return {
    source,
    package_name: package_name || "Colis",
    quantity: clampQuantity(quantity),
    matchMethod,
    confidence,
    catalogPackageId,
    quantitySource,
  };
}

/**
 * Apply stock quantity resolution and return final match result.
 */
async function finalizeStockMatch(base, itemsText, parsedQty, quantityAmbiguous, config) {
  const { quantity, quantitySource } = await resolveStockQuantity(
    itemsText,
    base.package_name,
    parsedQty,
    quantityAmbiguous,
    config
  );
  return buildMatchResult({
    ...base,
    quantity,
    quantitySource,
  });
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
  const { config } = options;
  const rawItems = String(itemsText || "").trim() || "Colis";
  const packages = Array.isArray(catalog) ? catalog : [];
  const { quantity, product, quantityAmbiguous } = parseQuantityAndProduct(rawItems);
  const productForMatch = product || rawItems;

  if (packages.length === 0) {
    return buildMatchResult({
      source: "pickup",
      package_name: rawItems.slice(0, 120),
      quantity,
      matchMethod: "none",
      quantitySource: "parse",
    });
  }

  if (packages.length === 1) {
    return finalizeStockMatch(
      {
        source: "stock",
        package_name: packages[0].package_name,
        matchMethod: "single_catalog",
        catalogPackageId: packages[0].id ?? null,
      },
      rawItems,
      quantity,
      quantityAmbiguous,
      config
    );
  }

  const exact = findExactCatalogMatch(productForMatch, packages);
  if (exact) {
    return finalizeStockMatch(
      {
        source: "stock",
        package_name: exact.package_name,
        matchMethod: "exact",
        confidence: 1,
        catalogPackageId: exact.id ?? null,
      },
      rawItems,
      quantity,
      quantityAmbiguous,
      config
    );
  }

  const exactFullLine = findExactCatalogMatch(rawItems, packages);
  if (exactFullLine) {
    return finalizeStockMatch(
      {
        source: "stock",
        package_name: exactFullLine.package_name,
        matchMethod: "exact",
        confidence: 1,
        catalogPackageId: exactFullLine.id ?? null,
      },
      rawItems,
      quantity,
      quantityAmbiguous,
      config
    );
  }

  if (config?.AI_DELIVERY_FALLBACK_ENABLED && config?.OPENAI_API_KEY) {
    try {
      const aiMatch = await matchPackageWithAI(productForMatch, packages, config);
      if (aiMatch?.matched_package_name) {
        const verified = packages.find(
          (pkg) =>
            normalizeCatalogText(pkg.package_name) ===
            normalizeCatalogText(aiMatch.matched_package_name)
        );
        if (verified && (aiMatch.confidence ?? 0) >= 0.6) {
          const aiQty = aiMatch.quantity > 0 ? aiMatch.quantity : quantity;
          const needsQtyAi =
            quantityAmbiguous ||
            (aiQty === 1 && lineHintsAtQuantity(rawItems) && (aiMatch.confidence ?? 0) < 0.9);

          if (needsQtyAi) {
            return finalizeStockMatch(
              {
                source: "stock",
                package_name: verified.package_name,
                matchMethod: "ai",
                confidence: aiMatch.confidence,
                catalogPackageId: verified.id ?? null,
              },
              rawItems,
              aiQty,
              quantityAmbiguous,
              config
            );
          }

          return buildMatchResult({
            source: "stock",
            package_name: verified.package_name,
            quantity: clampQuantity(aiQty),
            matchMethod: "ai",
            confidence: aiMatch.confidence,
            catalogPackageId: verified.id ?? null,
            quantitySource: "ai_package",
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
    quantitySource: "parse",
  });
}

module.exports = {
  normalizeCatalogText,
  parseQuantityAndProduct,
  lineHintsAtQuantity,
  resolveStockQuantity,
  findExactCatalogMatch,
  resolvePackageMatch,
  buildMatchResult,
};
