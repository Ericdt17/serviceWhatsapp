"use strict";

const { normalizeCatalogText } = require("./catalogTextUtils");

/** @type {{ canonical: string, match: string }[]} longest match first */
const QUARTIER_ENTRIES = [
  { canonical: "carrefour sho marche central", match: "carrefour sho marche central" },
  { canonical: "carrefour sho", match: "carrefour sho" },
  { canonical: "new bell", match: "new bell" },
  { canonical: "new-bell", match: "new-bell" },
  { canonical: "newbell", match: "newbell" },
  { canonical: "ndokotti", match: "ndokotti" },
  { canonical: "bonapriso", match: "bonapriso" },
  { canonical: "messassi", match: "messassi" },
  { canonical: "logbaba", match: "logbaba" },
  { canonical: "bessengue", match: "bessengue" },
  { canonical: "bonanjo", match: "bonanjo" },
  { canonical: "makepe", match: "makepe" },
  { canonical: "logpom", match: "logpom" },
  { canonical: "bastos", match: "bastos" },
  { canonical: "bepanda", match: "bepanda" },
  { canonical: "denver", match: "denver" },
  { canonical: "douala", match: "douala" },
  { canonical: "deido", match: "deido" },
  { canonical: "wouri", match: "wouri" },
  { canonical: "kotto", match: "kotto" },
  { canonical: "akwa", match: "akwa" },
  { canonical: "bali", match: "bali" },
  { canonical: "pk12", match: "pk12" },
  { canonical: "pk8", match: "pk8" },
].sort((a, b) => b.match.length - a.match.length);

const KNOWN_QUARTIERS = QUARTIER_ENTRIES.map((e) => e.canonical);

function extractKnownQuartier(text) {
  const normalized = normalizeCatalogText(text);
  if (!normalized) {
    return null;
  }
  for (const entry of QUARTIER_ENTRIES) {
    if (normalized.includes(entry.match)) {
      return entry.canonical;
    }
  }
  return null;
}

function isKnownQuartier(value) {
  const normalized = normalizeCatalogText(value);
  if (!normalized) {
    return false;
  }
  return QUARTIER_ENTRIES.some((entry) => entry.match === normalized);
}

module.exports = {
  KNOWN_QUARTIERS,
  QUARTIER_ENTRIES,
  extractKnownQuartier,
  isKnownQuartier,
};
