"use strict";

const OpenAI = require("openai");
const {
  extractPhone,
  extractAmount,
  hasLabeledOrderFields,
} = require("../parser");
const {
  normalizeItemsAndQuantity,
  sanitizeDeliveryLocation,
} = require("./productNormalize");

const SYSTEM_PROMPT = `You are a delivery-order extractor for LivSight (Cameroon, mainly Douala/Yaoundé).
Vendors paste messy WhatsApp text — extract ONE delivery order as JSON.

OUTPUT (JSON only, no markdown, no commentary):
{
  "phone": "9-digit Cameroon mobile, digits only, no spaces",
  "product": "item description only",
  "amount": integer FCFA (0 if nothing to collect at delivery),
  "location": "neighborhood / quartier / landmark / address line, or empty string"
}

=== PHONE ===
- Cameroon mobile: 9 digits starting with 6, 7, or 2.
- Accept: 690829269, 6 90 82 92 69, +237 694 39 75 46, 237 694397546, 90 82 92 69 (8 digits → prepend 6).
- Labels: Numéro, Numero, Tel, Téléphone, Phone, Contact, Client, WhatsApp.
- Strip +237 / 237. Never return country code in phone.
- If multiple numbers: pick the CUSTOMER / receiver number (not order refs).

=== AMOUNT ===
- Price of GOODS only (what courier may collect). Integer FCFA.
- Labels: Montant, Prix, Total, À payer, A payer, Somme, Coût, Cost.
- Formats: 15000, 15 000, 15.000, 6000fr, 6000 fcfa, 6k, 15K, 18k.
- amount = 0 when: line is "0", "0fr", "déjà payé", "payé", prepaid, nothing to collect.
- IGNORE delivery fees: Livraison, Frais, Transport, Frais de livraison, Course.
- IGNORE product codes and times as amounts: P1718, REF-001, CMD-42, 13h, 08h30.
- Prefer explicit Montant/Prix/Total line over random numbers. Never use phone digits as amount.

=== PRODUCT ===
- Quantity + description when present (e.g. "2 robes", "01 Savon BOASUN", "Pack homme").
- Labels: Produit, Article, Colis, Pack, Commande, Items — text after the label.
- Strip refs/times from product. Join multiple product lines with ", ".
- If no product found, use "Non spécifié".

=== LOCATION ===
- Quartier, landmark, market, street hint for delivery.
- Labels: Lieu, Quartier, Adresse, Destination, Vers, Chez.
- Free text OK: "Carrefour SHO marché central", "Messassi", "Makepe".

=== FORMATS ===
A) Strict 4-line: phone / product / amount / quartier
B) Labeled: Numéro / Lieu / Montant / Produit lines
C) Alternative: quartier / products / amount / phone (last line)
D) One-line paragraph with embedded phone + amount + place

=== EXAMPLES ===

Input:
Numéro : +237 6 94 39 75 46
Lieu : messassi
Montant : 6000fr
Un pack : homme
Output:
{"phone":"694397546","product":"Pack homme","amount":6000,"location":"Messassi"}

Input:
690829269
01 Savon BOASUN
0
Carrefour SHO marché central
Output:
{"phone":"690829269","product":"01 Savon BOASUN","amount":0,"location":"Carrefour SHO marché central"}

Input:
Bessengue
Chaussures Nike taille 42
Ceinture cuir
14k
651073574
Output:
{"phone":"651073574","product":"Chaussures Nike taille 42, Ceinture cuir","amount":14000,"location":"Bessengue"}

Input:
Livraison 612345678 client 15k vers makepe stp 2 sacs riz
Output:
{"phone":"612345678","product":"2 sacs riz","amount":15000,"location":"Makepe"}

Input:
Tel 699000001
2 robes
Livraison 500fr
Prix 12000
Akwa
Output:
{"phone":"699000001","product":"2 robes","amount":12000,"location":"Akwa"}

=== RULES ===
- Extract only what is IN the message. Do not invent fields.
- If phone cannot be determined use "phone": "".
- Respond with JSON only.`;

function buildUserPrompt(messageText) {
  return (
    "Extract ONE delivery order from this WhatsApp message (Cameroon vendor).\n" +
    "Return JSON only.\n\n" +
    "---MESSAGE START---\n" +
    messageText +
    "\n---MESSAGE END---"
  );
}

function hasLabeledAmount(text) {
  return /(?:montant|prix|total|à payer|a payer)\s*[:\s]/i.test(text || "");
}

/**
 * Normalize a model-supplied phone string to 6xxxxxxxx or null.
 */
function normalizePhoneString(raw) {
  if (raw == null || typeof raw !== "string") return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("237") && digits.length > 9) {
    digits = digits.slice(3);
  }
  if (/^[627]\d{7}$/.test(digits)) {
    digits = "6" + digits;
  }
  if (/^[627]\d{8}$/.test(digits)) {
    return digits;
  }
  return null;
}

/**
 * Parse amount from model output (number or string like "15k").
 */
function coerceAmountFromModel(value) {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value === 0 || value >= 100 ? Math.round(value) : null;
  }
  if (typeof value === "string") {
    const s = value.trim().replace(/\s/g, "");
    const kMatch = s.match(/^(\d+(?:\.\d+)?)k$/i);
    if (kMatch) {
      const n = parseFloat(kMatch[1]);
      return Number.isFinite(n) ? Math.round(n * 1000) : null;
    }
    const n = parseInt(s.replace(/[.,]/g, ""), 10);
    return Number.isFinite(n) && (n === 0 || n >= 100) ? n : null;
  }
  return null;
}

/**
 * Reconcile regex-extracted amount with model output.
 * On labeled Montant/Prix lines, trust the model when regex likely picked a wrong number.
 */
function resolveAmountDue(amountFromText, amountFromModel, text) {
  if (amountFromText != null && amountFromModel != null) {
    const diff = Math.abs(amountFromText - amountFromModel);
    const base = Math.max(amountFromText, amountFromModel, 1);
    const tol = Math.max(500, 0.05 * base);
    if (diff <= tol) {
      return Math.round(amountFromText);
    }
    if (hasLabeledAmount(text)) {
      return amountFromModel;
    }
    return null;
  }
  if (amountFromText != null) {
    return Math.round(amountFromText);
  }
  if (amountFromModel != null) {
    return amountFromModel;
  }
  return null;
}

/**
 * Validates AI JSON against the original message. Requires phone + amount.
 * Uses extractPhone/extractAmount from text when present to reduce hallucinations.
 *
 * @param {object|null} modelObj - Parsed JSON from the model
 * @param {string} originalText - Raw WhatsApp message
 * @returns {null|{ phone: string, items: string, amount_due: number, quartier: string|null, carrier: null }}
 */
function validateAndNormalizeAiDelivery(modelObj, originalText) {
  if (!modelObj || typeof modelObj !== "object") return null;

  const text = originalText || "";
  const phoneFromText = extractPhone(text);
  const phoneFromModel = normalizePhoneString(
    typeof modelObj.phone === "string"
      ? modelObj.phone
      : String(modelObj.phone || "")
  );

  let phone = phoneFromText || phoneFromModel;
  if (phoneFromText && phoneFromModel && phoneFromText !== phoneFromModel) {
    phone = hasLabeledOrderFields(text) ? phoneFromModel : phoneFromText;
  }
  if (!phone || !/^[627]\d{7,8}$/.test(phone)) return null;

  const amountFromText = extractAmount(text);
  const amountFromModel = coerceAmountFromModel(modelObj.amount);
  const amount_due = resolveAmountDue(amountFromText, amountFromModel, text);

  if (amount_due == null || (amount_due !== 0 && amount_due < 100)) return null;

  const productRaw =
    modelObj.product != null
      ? String(modelObj.product).trim()
      : modelObj.items != null
        ? String(modelObj.items).trim()
        : "";
  const { displayItems } = normalizeItemsAndQuantity(
    productRaw.length > 0 ? productRaw : "Non spécifié"
  );

  const quartier = sanitizeDeliveryLocation(
    modelObj.location != null ? String(modelObj.location) : null,
    text
  );

  return {
    phone,
    items: displayItems,
    amount_due,
    quartier: quartier || null,
    carrier: null,
  };
}

/**
 * Call OpenAI to extract delivery fields. Does not validate — use validateAndNormalizeAiDelivery.
 *
 * @param {string} messageText
 * @param {object} cfg - config slice: OPENAI_API_KEY, AI_DELIVERY_MODEL, AI_DELIVERY_TIMEOUT_MS, AI_DELIVERY_MAX_TOKENS
 * @returns {Promise<{ ok: true, raw: object } | { ok: false, error: string }>}
 */
async function extractDeliveryWithAI(messageText, cfg) {
  if (!cfg.OPENAI_API_KEY) {
    return { ok: false, error: "no_api_key" };
  }

  const client = new OpenAI({ apiKey: cfg.OPENAI_API_KEY });
  const controller = new AbortController();
  const timeoutMs = cfg.AI_DELIVERY_TIMEOUT_MS || 8000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const completion = await client.chat.completions.create(
      {
        model: cfg.AI_DELIVERY_MODEL || "gpt-4o-mini",
        max_tokens: cfg.AI_DELIVERY_MAX_TOKENS || 500,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(messageText) },
        ],
      },
      { signal: controller.signal }
    );

    const content = completion.choices[0]?.message?.content;
    if (!content || typeof content !== "string") {
      return { ok: false, error: "empty_response" };
    }

    let raw;
    try {
      raw = JSON.parse(content);
    } catch {
      return { ok: false, error: "invalid_json" };
    }

    return { ok: true, raw };
  } catch (err) {
    const name = err?.name || "";
    const message = err?.message || String(err);
    if (name === "AbortError" || message.includes("abort")) {
      return { ok: false, error: "timeout" };
    }
    return { ok: false, error: message };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  SYSTEM_PROMPT,
  buildUserPrompt,
  extractDeliveryWithAI,
  validateAndNormalizeAiDelivery,
  normalizePhoneString,
  coerceAmountFromModel,
  resolveAmountDue,
};
