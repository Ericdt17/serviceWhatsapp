"use strict";

const OpenAI = require("openai");
const { normalizeCatalogText } = require("./catalogTextUtils");

const SYSTEM_PROMPT = `You match a WhatsApp order item line to exactly one product from a client's catalog.
Return JSON only: { "matched_package_name": string|null, "quantity": number, "confidence": number 0-1 }
Rules:
- matched_package_name MUST be copied verbatim from the catalog list, or null if no good match.
- Never invent product names not in the catalog.
- confidence >= 0.85 only when you are sure; use lower confidence for fuzzy matches.
- quantity: integer from the item line if present (e.g. "3 robes" → 3), else 1.
- Respond with JSON only, no markdown.`;

/**
 * @param {string} itemText
 * @param {Array<{ package_name: string }>} catalog
 * @param {object} config
 * @returns {Promise<{ matched_package_name: string|null, quantity: number, confidence: number }|null>}
 */
async function matchPackageWithAI(itemText, catalog, config) {
  if (!itemText || !catalog?.length || !config?.OPENAI_API_KEY) {
    return null;
  }

  const catalogNames = catalog.map((p) => p.package_name).filter(Boolean);
  if (catalogNames.length === 0) return null;

  const client = new OpenAI({
    apiKey: config.OPENAI_API_KEY,
    timeout: config.AI_DELIVERY_TIMEOUT_MS || 4000,
  });

  const userContent = JSON.stringify({
    item_line: itemText,
    catalog_package_names: catalogNames,
  });

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    config.AI_DELIVERY_TIMEOUT_MS || 4000
  );

  try {
    const completion = await client.chat.completions.create(
      {
        model: config.AI_DELIVERY_MODEL || "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        max_tokens: config.AI_DELIVERY_MAX_TOKENS || 300,
        temperature: 0,
        response_format: { type: "json_object" },
      },
      { signal: controller.signal }
    );

    const raw = completion.choices?.[0]?.message?.content?.trim();
    if (!raw) return null;

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }

    const name = parsed.matched_package_name;
    if (name == null || name === "") {
      return { matched_package_name: null, quantity: 1, confidence: 0 };
    }

    const verified = catalogNames.find(
      (n) => normalizeCatalogText(n) === normalizeCatalogText(String(name))
    );
    if (!verified) {
      return { matched_package_name: null, quantity: 1, confidence: 0 };
    }

    const qty = parseInt(parsed.quantity, 10);
    const confidence =
      typeof parsed.confidence === "number" && parsed.confidence >= 0
        ? parsed.confidence
        : 0.5;

    return {
      matched_package_name: verified,
      quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
      confidence,
    };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { matchPackageWithAI };
