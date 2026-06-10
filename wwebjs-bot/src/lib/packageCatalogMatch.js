"use strict";

const { matchPackageWithAI, extractQuantityWithAI } = require("./aiPackageMatch");
const { normalizeCatalogText } = require("./catalogTextUtils");

const MAX_STOCK_QUANTITY = 99;
const PRODUCT_SPLIT_RE = /\s*(?:,|\bet\b|\+)\s*/i;
const MIN_FUZZY_LEN = 3;

/**
 * @param {string} itemsText
 * @returns {string[]}
 */
function splitProductParts(itemsText) {
  const raw = String(itemsText || "").trim();
  if (!raw) return [];

  if (raw.includes(" — ")) {
    return raw
      .split(/\s+—\s+/)
      .map((p) => p.trim())
      .filter(Boolean);
  }

  return raw
    .split(PRODUCT_SPLIT_RE)
    .map((p) => p.trim())
    .filter(Boolean);
}

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
 * Single unambiguous fuzzy match (substring either way, normalized).
 * @param {string} productText
 * @param {Array<{ package_name: string, id?: number }>} catalog
 * @returns {object|null}
 */
function findFuzzyCatalogMatch(productText, catalog) {
  const np = normalizeCatalogText(productText);
  if (!np || np.length < MIN_FUZZY_LEN || !Array.isArray(catalog)) {
    return null;
  }

  function matchesName(catalogNorm) {
    if (!catalogNorm || catalogNorm.length < MIN_FUZZY_LEN) return false;
    if (catalogNorm.includes(np) || np.includes(catalogNorm)) return true;
    const tokens = np.split(/\s+/).filter((t) => t.length >= MIN_FUZZY_LEN);
    return tokens.some((tok) => {
      const stem = tok.length > 4 && tok.endsWith("s") ? tok.slice(0, -1) : tok;
      return catalogNorm.includes(tok) || catalogNorm.includes(stem);
    });
  }

  const candidates = catalog.filter((pkg) =>
    matchesName(normalizeCatalogText(pkg.package_name))
  );

  if (candidates.length === 1) {
    return candidates[0];
  }
  return null;
}

/**
 * Match one item line to catalog: exact → fuzzy → optional AI.
 */
async function matchPartToCatalog(partText, packages, config) {
  const raw = String(partText || "").trim();
  if (!raw) return null;

  const { quantity, product, quantityAmbiguous } = parseQuantityAndProduct(raw);
  const productForMatch = product || raw;

  let pkg = findExactCatalogMatch(productForMatch, packages);
  let matchMethod = "exact";

  if (!pkg) {
    pkg = findFuzzyCatalogMatch(productForMatch, packages);
    if (pkg) matchMethod = "fuzzy";
  }

  if (
    !pkg &&
    config?.AI_DELIVERY_FALLBACK_ENABLED &&
    config?.OPENAI_API_KEY
  ) {
    try {
      const aiMatch = await matchPackageWithAI(productForMatch, packages, config);
      if (aiMatch?.matched_package_name && (aiMatch.confidence ?? 0) >= 0.6) {
        pkg = packages.find(
          (p) =>
            normalizeCatalogText(p.package_name) ===
            normalizeCatalogText(aiMatch.matched_package_name)
        );
        if (pkg) {
          matchMethod = "ai";
          const aiQty = aiMatch.quantity > 0 ? aiMatch.quantity : quantity;
          return {
            pkg,
            quantity: clampQuantity(aiQty),
            matchMethod,
            quantityAmbiguous,
            partText: raw,
          };
        }
      }
    } catch (err) {
      console.warn("   ⚠️  AI package match (part) failed:", err.message);
    }
  }

  if (!pkg) return null;

  return {
    pkg,
    quantity: clampQuantity(quantity),
    matchMethod,
    quantityAmbiguous,
    partText: raw,
  };
}

/**
 * Resolve stock for multi-part lines (split on + , et before display join).
 */
async function resolveMultiPartPackageMatch(parts, packages, config) {
  const partResults = [];
  for (const part of parts) {
    partResults.push(await matchPartToCatalog(part, packages, config));
  }

  const matched = partResults.filter(Boolean);
  if (matched.length === 0) {
    return null;
  }

  // Mixed stock + non-stock → pickup (one transaction, one stock SKU max)
  if (matched.length < parts.length) {
    const { displayItems, quantity } = joinPartsForPickup(parts, partResults);
    return buildMatchResult({
      source: "pickup",
      package_name: displayItems,
      quantity,
      matchMethod: "multi_partial",
      quantitySource: "parse",
    });
  }

  const catalogIds = new Set(matched.map((m) => m.pkg.id ?? m.pkg.package_name));

  // All parts match the same catalog SKU → stock, sum quantities
  if (catalogIds.size === 1) {
    const first = matched[0];
    const totalQty = matched.reduce((sum, m) => sum + m.quantity, 0);
    const itemsText = matched.map((m) => m.partText).join(" + ");
    return finalizeStockMatch(
      {
        source: "stock",
        package_name: first.pkg.package_name,
        matchMethod: matched.every((m) => m.matchMethod === "exact")
          ? "exact"
          : matched.some((m) => m.matchMethod === "ai")
            ? "ai"
            : "fuzzy",
        catalogPackageId: first.pkg.id ?? null,
      },
      itemsText,
      totalQty,
      matched.some((m) => m.quantityAmbiguous),
      config
    );
  }

  // Multiple distinct stock SKUs — pickup with catalog names joined
  const displayItems = matched
    .map((m) => m.pkg.package_name)
    .join(" — ")
    .slice(0, 120);
  const quantity = matched.reduce((sum, m) => sum + m.quantity, 0);
  return buildMatchResult({
    source: "pickup",
    package_name: displayItems,
    quantity: clampQuantity(quantity),
    matchMethod: "multi_stock_skus",
    quantitySource: "parse",
  });
}

function joinPartsForPickup(parts, partResults) {
  const names = parts.map((part, i) => {
    const hit = partResults[i];
    if (hit) return hit.pkg.package_name;
    const { product } = parseQuantityAndProduct(part);
    return (product || part).trim();
  });
  const quantity = parts.reduce((sum, part) => {
    const { quantity: q } = parseQuantityAndProduct(part);
    return sum + (q > 0 ? q : 1);
  }, 0);
  return {
    displayItems: names.filter(Boolean).join(" — ").slice(0, 120) || "Colis",
    quantity: Math.max(1, quantity),
  };
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
  const parts = splitProductParts(rawItems);

  if (packages.length === 0) {
    const { displayItems, quantity } = normalizeItemsDisplay(rawItems, parts);
    return buildMatchResult({
      source: "pickup",
      package_name: displayItems,
      quantity,
      matchMethod: "none",
      quantitySource: "parse",
    });
  }

  if (parts.length > 1) {
    const multi = await resolveMultiPartPackageMatch(parts, packages, config);
    if (multi) return multi;
  }

  const { quantity, product, quantityAmbiguous } = parseQuantityAndProduct(rawItems);
  const productForMatch = product || rawItems;

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

  const fuzzy = findFuzzyCatalogMatch(productForMatch, packages);
  if (fuzzy) {
    return finalizeStockMatch(
      {
        source: "stock",
        package_name: fuzzy.package_name,
        matchMethod: "fuzzy",
        confidence: 0.85,
        catalogPackageId: fuzzy.id ?? null,
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

  const { displayItems, quantity: pickupQty } = normalizeItemsDisplay(rawItems, parts);
  return buildMatchResult({
    source: "pickup",
    package_name: displayItems,
    quantity: pickupQty,
    matchMethod: "none",
    quantitySource: "parse",
  });
}

/** Join parts for pickup display (no catalog match). */
function normalizeItemsDisplay(rawItems, parts) {
  const list = parts.length > 0 ? parts : [rawItems];
  const names = list.map((part) => {
    const { product } = parseQuantityAndProduct(part);
    return (product || part).trim();
  });
  const quantity = list.reduce((sum, part) => {
    const { quantity: q } = parseQuantityAndProduct(part);
    return sum + (q > 0 ? q : 1);
  }, 0);
  return {
    displayItems: names.filter(Boolean).join(" — ").slice(0, 120) || "Colis",
    quantity: Math.max(1, quantity),
  };
}

module.exports = {
  normalizeCatalogText,
  splitProductParts,
  parseQuantityAndProduct,
  lineHintsAtQuantity,
  resolveStockQuantity,
  findExactCatalogMatch,
  findFuzzyCatalogMatch,
  matchPartToCatalog,
  resolvePackageMatch,
  buildMatchResult,
};
