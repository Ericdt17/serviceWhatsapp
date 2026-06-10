// Parser functions to extract delivery information from messages

/** WhatsApp / mobile often inserts bidi and zero-width chars around numbers. */
function stripInvisibleFormatting(text) {
  if (!text || typeof text !== "string") return "";
  // Remove bidi / zero-width chars
  text = text.replace(/[\u200B-\u200D\uFEFF\u202A-\u202E\u2066-\u2069]/g, "");
  // Strip WhatsApp copy-paste / forwarded message headers like:
  // "[15:43, 2026/4/5] kb store:" or "[15:43, 04/05/2026] Name:"
  text = text.replace(/^\[[\d]{1,2}:[\d]{2}[^\]]*\][^\n]*$/gm, "");
  return text;
}

/** 0 = nothing to collect at delivery; otherwise minimum 100 FCFA. */
function isValidOrderAmount(amount) {
  return amount === 0 || (amount != null && amount >= 100);
}

/**
 * Extract phone number from text
 * Looks for patterns like: 6xx, 6xxxxx, +237, etc.
 */
function extractPhone(text) {
  text = stripInvisibleFormatting(text || "");

  // First, try to find phone after keywords like "Livraison:", "Numéro:", etc.
  const keywordPatterns = [
    /livraison[:\s]+([6x\d]+)/i,
    /num[ée]ro[:\s]+([6x\d]+)/i,
    /phone[:\s]+([6x\d]+)/i,
    /t[ée]l[ée]phone[:\s]+([6x\d]+)/i,
  ];

  for (const pattern of keywordPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const phone = match[1].replace(/[^\d]/g, "");
      if (phone.startsWith("6") && phone.length >= 7) {
        return phone.padEnd(9, "0"); // Pad to 9 digits if needed
      }
    }
  }

  // Numéro with +237 and spaces (common in copy-paste from WhatsApp)
  const numeroPlus = text.match(
    /num[ée]ro\s*[:\s]+\+?\s*237\s*([^\n]+)/i
  );
  if (numeroPlus && numeroPlus[1]) {
    const digits = numeroPlus[1].replace(/[^\d]/g, "");
    if (digits.startsWith("6") && digits.length >= 8) {
      const nine = digits.slice(0, 9);
      if (nine.length === 9) return nine;
      return nine.padEnd(9, "0");
    }
  }

  // Pattern 3 first: +237 followed by 8-9 digits — run on raw text (before stripping
  // newlines) so adjacent lines like "3 bee venom" don't bleed into the digit match.
  const pattern3 = /\+237(\d{8,9})/;
  const match3 = text.match(pattern3);
  if (match3) {
    const local = match3[1];
    // 9 digits → keep as-is; 8 digits → prepend 6 (replace +237 with 6)
    return local.length === 9 ? local : "6" + local;
  }

  // Remove all spaces and common separators (newlines too) for remaining patterns
  const cleaned = text.replace(/[\s\-\.]/g, "");

  // Pattern 1: Cameroon mobile starting with 6, 7, or 2 (9 digits)
  const pattern1 = /[627]\d{8}/;
  const match1 = cleaned.match(pattern1);
  if (match1) {
    return match1[0];
  }

  // Pattern 2: 6/7/2 followed by digits with x placeholders
  const pattern2 = /[627][x\d]{7,8}/;
  const match2 = cleaned.match(pattern2);
  if (match2) {
    return match2[0].replace(/x/gi, "0");
  }

  // Pattern 4: Just numbers — 9-digit starting with 6, 7, or 2
  const numbers = cleaned.match(/\d+/g);
  if (numbers) {
    for (const num of numbers) {
      if (/^[627]\d{8}$/.test(num)) {
        return num;
      }
    }
  }

  return null;
}

/**
 * Extract amount from text
 * Looks for patterns like: 15k, 15000, 15.000, etc.
 */
function extractAmount(text) {
  text = stripInvisibleFormatting(text || "");

  // Prefer explicit amount labels so we don't pick phone fragments or timestamp noise.
  // Covers: "Montant : 15000", "Prix : 50 000fcfa", "Total : 12k"
  const amountKw = text.match(
    /(?:montant|prix|total)\s*[:\s]+\s*(\d[\d\s.,]*)\s*(k)?(?:\s*(?:fcfa|frs|fr|xaf|f))?\b/i
  );
  if (amountKw) {
    let v = parseFloat(amountKw[1].replace(/[\s,]/g, "").replace(/\./g, ""));
    if (amountKw[2]) {
      v *= 1000;
    }
    if (Number.isFinite(v) && isValidOrderAmount(v)) {
      return v;
    }
  }

  // Explicit zero on its own line (structured format: no cash to collect)
  const zeroLine = text
    .split("\n")
    .map((line) => line.trim())
    .some((line) => /^(?:montant|prix|total)\s*:\s*0\b/i.test(line) || /^0(?:\s*(?:fcfa|frs|fr|xaf|f))?$/i.test(line));
  if (zeroLine) {
    return 0;
  }

  // Remove spaces but preserve newlines so digit sequences on separate lines don't merge
  const cleaned = text.replace(/[^\S\n]/g, "");

  // Pattern 1: Number followed by k/K (e.g., 15k, 20K)
  const pattern1 = /(\d+(?:\.\d+)?)\s*k/gi;
  const match1 = cleaned.match(pattern1);
  if (match1) {
    const num = parseFloat(match1[0].replace(/k/gi, ""));
    return num * 1000;
  }

  // Pattern 2: Numbers with dots or commas as thousands separator (e.g. 15,000 / 15.000)
  // Requires at least one separator group — plain numbers fall through to Pattern 3.
  const pattern2 = /(\d{1,3}(?:[.,]\d{3})+)/g;
  const matches = cleaned.match(pattern2);
  if (matches) {
    // Get the largest number (likely the amount)
    const amounts = matches.map((m) => parseFloat(m.replace(/[.,]/g, "")));
    return Math.max(...amounts);
  }

  // Pattern 3: Just plain numbers
  const numbers = cleaned.match(/\d+/g);
  if (numbers) {
    const amounts = numbers
      .map((n) => parseInt(n))
      // Filter local Cameroon phone numbers (9 digits starting with 6, 7, or 2)
      .filter((n) => !/^[627]\d{8}$/.test(n.toString()))
      // Filter international phone numbers and country-code prefixes (10+ digits)
      .filter((n) => n.toString().length <= 9)
      .filter((n) => n > 100); // Amounts should be > 100 FCFA

    if (amounts.length > 0) {
      return Math.max(...amounts);
    }
  }

  return null;
}

/**
 * Extract quartier (neighborhood) from text
 * Common quartiers in Douala/Cameroon
 */
const COMMON_QUARTIERS = [
  "bonapriso",
  "akwa",
  "douala",
  "makepe",
  "logpom",
  "pk8",
  "pk12",
  "wouri",
  "deido",
  "bessengue",
  "new-bell",
  "newbell",
  "bonanjo",
  "kotto",
  "ndokotti",
  "bepanda",
  "denver",
];

function extractQuartier(text) {
  const lowerText = text.toLowerCase();

  for (const quartier of COMMON_QUARTIERS) {
    if (lowerText.includes(quartier)) {
      return quartier;
    }
  }

  return null;
}

/**
 * Extract carrier/expedition info
 */
function extractCarrier(text) {
  const lowerText = text.toLowerCase();

  if (lowerText.includes("men travel") || lowerText.includes("mentravel")) {
    return "Men Travel";
  }
  if (
    lowerText.includes("general voyage") ||
    lowerText.includes("generalvoyage")
  ) {
    return "General Voyage";
  }
  if (lowerText.includes("expedition") || lowerText.includes("expédition")) {
    return "Expedition";
  }

  return null;
}

/**
 * Extract customer name (if mentioned)
 */
function extractCustomerName(text) {
  // Look for patterns like "Client: Name" or "Nom: Name"
  const patterns = [
    /client[:\s]+([a-zéèêëàâäôöùûüç\s]+)/i,
    /nom[:\s]+([a-zéèêëàâäôöùûüç\s]+)/i,
    /name[:\s]+([a-zéèêëàâäôöùûüç\s]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return null;
}

/**
 * Parse Alternative format: Quartier first, products in middle, amount and phone at end
 * Format:
 *   Line 1: Quartier (Bessengue)
 *   Line 2-N: Items/products (one per line)
 *   Line N-1: Amount (14000 or 14k)
 *   Line N: Phone number (651 07 35 74 or 651073574)
 */
function parseAlternativeFormat(text) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  // Need at least 4 lines (quartier + 1 product + amount + phone)
  if (lines.length < 4) {
    return {
      valid: false,
      error: `Format alternatif invalide: Besoin d'au moins 4 lignes, reçu ${lines.length}`,
    };
  }

  // Line 1: Quartier (usually a location name, not a number)
  const quartierLine = lines[0];
  const quartier = quartierLine.trim();

  // Check if first line looks like a quartier (not a number, not a phone)
  const isQuartier =
    !/^\d+$/.test(quartier) && !/^[627]\d{7,8}$/.test(quartier.replace(/\s/g, ""));
  if (!isQuartier) {
    return {
      valid: false,
      error: `Format alternatif: La première ligne devrait être un quartier, reçu: "${quartierLine}"`,
    };
  }

  // Last line: Phone number
  const phoneLine = lines[lines.length - 1];
  let phone = phoneLine.replace(/[\s\-\.]/g, ""); // Remove spaces and separators

  // Check if it's a valid phone number (6, 7, or 2 start)
  if (!/^[627]/.test(phone) || phone.length < 8) {
    return {
      valid: false,
      error: `Format alternatif: La dernière ligne devrait être un numéro de téléphone, reçu: "${phoneLine}"`,
    };
  }

  // Normalize phone (replace x with 0)
  phone = phone.replace(/x/gi, "0");
  if (phone.length === 8) {
    phone = "6" + phone; // prepend 6 for 8-digit local numbers
  } else if (phone.length !== 9) {
    return {
      valid: false,
      error: `Format alternatif: Numéro invalide: "${phoneLine}" - Doit avoir 8-9 chiffres`,
    };
  }

  // Second to last line: Amount
  const amountLine = lines[lines.length - 2];
  let amount = null;

  // Try to extract amount
  const amountMatch = amountLine.match(/(\d+(?:\.\d+)?)\s*k?/i);
  if (amountMatch) {
    const num = parseFloat(amountMatch[1]);
    if (amountLine.toLowerCase().includes("k")) {
      amount = num * 1000;
    } else {
      amount = num;
    }
  } else {
    // Try to find any number in the line
    const numbers = amountLine.match(/\d+/g);
    if (numbers) {
      const amounts = numbers.map((n) => parseInt(n)).filter((n) => n > 100);
      if (amounts.length > 0) {
        amount = Math.max(...amounts);
      }
    }
  }

  if (amount == null || !isValidOrderAmount(amount)) {
    return {
      valid: false,
      error: `Format alternatif: Montant invalide: "${amountLine}" - Doit être 0 (rien à encaisser) ou un montant valide (ex: 15k, 15000)`,
    };
  }

  // Lines 2 to N-2: Items/products (combine all product lines)
  const productLines = lines.slice(1, lines.length - 2);
  const items = productLines.join(", ").trim();

  if (!items || items.length < 2) {
    return {
      valid: false,
      error: `Format alternatif: Produits invalides - Doit contenir au moins un produit`,
    };
  }

  // Check for carrier in any line (optional)
  const carrier = extractCarrier(text);

  return {
    valid: true,
    phone,
    items,
    amount_due: amount,
    quartier,
    carrier,
    customer_name: null,
    hasPhone: true,
    hasAmount: true,
  };
}

/**
 * Parse Option 3 format: Compact Structured
 * Format:
 *   Line 1: Phone number (6xx123456)
 *   Line 2: Items/products (2 robes + 1 sac)
 *   Line 3: Amount (15k or 15000)
 *   Line 4: Quartier (Bonapriso)
 */
function parseCompactStructuredFormat(text) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0); // Remove empty lines

  // Need at least 4 lines
  if (lines.length < 4) {
    return {
      valid: false,
      error: `Format invalide: Besoin de 4 lignes, reçu ${lines.length}`,
      expectedFormat:
        "Ligne 1: Numéro\nLigne 2: Produits\nLigne 3: Montant\nLigne 4: Quartier",
    };
  }

  // Line 1: Phone number
  const phoneLine = lines[0];
  let phone = phoneLine.replace(/[^\dx+]/gi, ""); // Keep only digits, x, and +
  // Strip +237 country code if present
  if (phone.startsWith("+237") || phone.startsWith("237")) {
    phone = phone.replace(/^\+?237/, "");
  }
  phone = phone.replace(/x/gi, "0");
  if (!/^[627]/.test(phone)) {
    return {
      valid: false,
      error: `Numéro invalide: "${phoneLine}" - Doit commencer par 6, 7 ou 2`,
    };
  }
  if (phone.length === 8) {
    phone = "6" + phone; // prepend 6 for 8-digit local numbers
  } else if (phone.length !== 9) {
    return {
      valid: false,
      error: `Numéro invalide: "${phoneLine}" - Doit avoir 8-9 chiffres`,
    };
  }

  // Line 2: Items
  const items = lines[1];
  if (!items || items.length < 2) {
    return {
      valid: false,
      error: `Produits invalides: "${items}" - Doit contenir la description des produits`,
    };
  }

  // Line 3: Amount
  const amountLine = lines[2];
  let amount = null;

  // Try to extract amount
  const amountMatch = amountLine.match(/(\d+(?:\.\d+)?)\s*k?/i);
  if (amountMatch) {
    const num = parseFloat(amountMatch[1]);
    if (amountLine.toLowerCase().includes("k")) {
      amount = num * 1000;
    } else {
      amount = num;
    }
  } else {
    // Try to find any number in the line
    const numbers = amountLine.match(/\d+/g);
    if (numbers) {
      const amounts = numbers.map((n) => parseInt(n)).filter((n) => n > 100);
      if (amounts.length > 0) {
        amount = Math.max(...amounts);
      }
    }
  }

  if (amount == null || !isValidOrderAmount(amount)) {
    return {
      valid: false,
      error: `Montant invalide: "${amountLine}" - Doit être 0 (rien à encaisser) ou un montant valide (ex: 15k, 15000)`,
    };
  }

  // Line 4: Quartier
  const quartierLine = lines[3];
  const quartier = quartierLine.trim();
  if (!quartier || quartier.length < 2) {
    return {
      valid: false,
      error: `Quartier invalide: "${quartierLine}" - Doit spécifier le quartier`,
    };
  }

  // Check for carrier in any line (optional)
  const carrier = extractCarrier(text);

  return {
    valid: true,
    phone,
    items,
    amount_due: amount,
    quartier,
    carrier,
    customer_name: null, // Not in this format
    hasPhone: true,
    hasAmount: true,
  };
}

/**
 * Main parser function - extracts all delivery info from a message
 * Tries Alternative format first, then Option 3 format, then falls back to flexible parsing
 */
function parseDeliveryMessage(text) {
  text = stripInvisibleFormatting(text || "");
  const lines = text.split("\n").filter((line) => line.trim().length > 0);

  // First, try Alternative format (quartier first, products in middle, amount and phone at end)
  // This format has 4+ lines and the first line is a quartier (not a number)
  if (lines.length >= 4) {
    const firstLine = lines[0].trim();
    const lastLine = lines[lines.length - 1].trim();

    // Check if it looks like alternative format:
    // - First line is not a number and not a phone
    // - Last line looks like a phone number
    const firstLineIsQuartier =
      !/^\d+$/.test(firstLine) &&
      !/^[627]\d{7,8}$/.test(firstLine.replace(/\s/g, ""));
    const lastLineIsPhone = /^[627][\d\sx]{7,10}$/i.test(
      lastLine.replace(/[\s\-\.]/g, "")
    );

    if (firstLineIsQuartier && lastLineIsPhone) {
      const altResult = parseAlternativeFormat(text);
      if (altResult.valid) {
        return altResult;
      }
    }
  }

  // Second, try Option 3: Compact Structured format
  const compactResult = parseCompactStructuredFormat(text);
  if (compactResult.valid) {
    return compactResult;
  }

  // If not valid compact format, check if it's close (has 4+ lines)
  if (lines.length >= 4) {
    // It looks like compact format but has errors
    return {
      ...compactResult,
      error: compactResult.error || "Format invalide",
    };
  }

  // Message does not follow the required structured format (4 lines minimum)
  return {
    valid: false,
    error: "Format invalide: Le message doit suivre le format structuré (4 lignes: numéro, produits, montant, quartier)",
  };
}

/**
 * Status updates, @-first messages, etc. — excluded from both strict delivery
 * detection and format-reminder heuristics (shared with isDeliveryMessage).
 */
function isExcludedFromDeliveryParsing(text) {
  const lowerText = text.toLowerCase();

  // "livré" / "livrée": trailing \b is unreliable after accented letters in JS (\w is ASCII-only).
  const hasLivreStatus =
    /(?:^|[\s,.;:!?])livr[ée]e?(?=[\s,.;:!?]|$)/i.test(lowerText);

  const isStatusUpdate =
    hasLivreStatus ||
    lowerText.includes("échec") ||
    lowerText.includes("echec") ||
    lowerText.includes("collecté") ||
    lowerText.includes("collecte") ||
    /^modifier|^modif/i.test(lowerText.trimStart()) ||
    /^change\b/i.test(lowerText.trimStart()) ||
    lowerText.includes("vient chercher") ||
    lowerText.includes("pickup") ||
    lowerText.includes("ramassage");

  if (isStatusUpdate) {
    return true;
  }

  const firstNonEmpty = text.trimStart();
  if (firstNonEmpty.startsWith("@")) {
    return true;
  }

  return false;
}

const FORMAT_REMINDER_MIN_SIGNALS = 2;

/**
 * True when the text has enough delivery-like signals (phone, amount, known quartier)
 * but strict parse fails — candidate for AI fallback or threaded format reminder.
 * @param {string} text - raw message (will be stripped for checks)
 * @param {{ valid: boolean }} parsed - result of parseDeliveryMessage(text)
 */
function looksLikeMalformedDeliveryWithParsed(text, parsed) {
  if (!text || typeof text !== "string") {
    return false;
  }
  const stripped = stripInvisibleFormatting(text);
  if (isExcludedFromDeliveryParsing(stripped)) {
    return false;
  }
  if (!parsed || parsed.valid) {
    return false;
  }

  const phone = extractPhone(stripped);
  const rawAmount = extractAmount(stripped);

  /** Avoid counting substrings of the phone (e.g. 612 from 612345678) as an amount signal. */
  function amountCountsAsSignal() {
    if (rawAmount == null) return false;
    if (/\d+\s*k\b/i.test(stripped)) return true;
    if (rawAmount === 0) return true;
    if (rawAmount >= 1000) return true;
    if (phone == null) return rawAmount >= 100;
    const phoneDigits = phone.replace(/\D/g, "");
    const amtStr = String(Math.floor(rawAmount));
    if (phoneDigits.includes(amtStr) && amtStr.length >= 3) return false;
    return rawAmount >= 100;
  }

  /**
   * True when at least one line looks like a free-form location:
   * - not empty, not a pure phone number, not a pure amount
   * - contains at least one letter (rules out pure digit lines)
   * Does NOT require a known COMMON_QUARTIERS match.
   */
  function hasLocationSignal() {
    const lines = stripped.split("\n").map((l) => l.trim()).filter(Boolean);
    const phoneDigits = phone ? phone.replace(/\D/g, "") : null;
    for (const line of lines) {
      if (!/[a-zA-ZÀ-ÿ]/.test(line)) continue; // must have letters
      if (/^\+?[\d\s()-]{7,}$/.test(line)) continue; // looks like a phone line
      const lineClean = line.replace(/\s/g, "");
      if (/^\d+k?$/i.test(lineClean)) continue; // looks like a pure amount line
      if (phoneDigits && line.replace(/\D/g, "") === phoneDigits) continue; // is the phone
      // Line has letters and is not phone/amount — treat as a location candidate
      return true;
    }
    return false;
  }

  if (hasLabeledOrderFields(stripped)) {
    return true;
  }

  let signals = 0;
  if (phone != null) signals += 1;
  if (amountCountsAsSignal()) signals += 1;
  if (extractQuartier(stripped) != null || hasLocationSignal()) signals += 1;

  if (signals >= FORMAT_REMINDER_MIN_SIGNALS) {
    return true;
  }

  // Phone + product/location line (no parseable amount) — still try AI
  if (phone != null && hasLocationSignal()) {
    return true;
  }

  return false;
}

/** Labeled vendor format: Numéro / Montant / Lieu / Produit lines. */
function hasLabeledOrderFields(text) {
  if (!text || typeof text !== "string") return false;
  const hasPhone = /(?:num[ée]ro|t[ée]l[ée]phone|phone|contact)\s*[:\s]/i.test(
    text
  );
  const hasAmount = /(?:montant|prix|total|à payer|a payer)\s*[:\s]/i.test(text);
  const hasPlace = /(?:lieu|quartier|adresse|destination)\s*[:\s]/i.test(text);
  const hasProduct = /(?:produit|article|colis|pack|commande)\s*[:\s]/i.test(
    text
  );
  return (
    (hasPhone && hasAmount) ||
    (hasPhone && hasPlace) ||
    (hasAmount && hasPlace) ||
    (hasPhone && hasProduct) ||
    (hasAmount && hasProduct)
  );
}

/**
 * True when the text has enough delivery-like signals (phone, amount, known quartier)
 * but strict parse fails — candidate for a threaded format reminder in the group.
 */
function looksLikeMalformedDelivery(text) {
  if (!text || typeof text !== "string") {
    return false;
  }
  const stripped = stripInvisibleFormatting(text);
  if (isExcludedFromDeliveryParsing(stripped)) {
    return false;
  }
  const parsed = parseDeliveryMessage(text);
  return looksLikeMalformedDeliveryWithParsed(stripped, parsed);
}

/**
 * Short French error-style reminder for WhatsApp reply (threaded to user's message).
 */
function getFormatReminderMessage() {
  return (
    "❌ Commande non enregistrée.\n\n" +
    "4 lignes (1 info par ligne) :\n" +
    "Numéro\n" +
    "Produit\n" +
    "Montant (0 = rien à encaisser)\n" +
    "Quartier\n\n" +
    "Exemple :\n" +
    "694397546\n" +
    "Pack homme\n" +
    "6000\n" +
    "Messassi"
  );
}

/**
 * Check if a message looks like a new delivery
 * Prioritizes Option 3 format (4-line structured)
 */
function isDeliveryMessage(text) {
  text = stripInvisibleFormatting(text || "");
  if (isExcludedFromDeliveryParsing(text)) {
    return false;
  }

  // Check if it follows a structured format (4+ lines)
  const lines = text.split("\n").filter((line) => line.trim().length > 0);

  // If it has 4+ lines, try to parse it (could be Option 3 or Alternative format)
  if (lines.length >= 4) {
    const parsed = parseDeliveryMessage(text);
    return parsed.valid === true; // Return true if valid structured format
  }

  // Messages with fewer than 4 lines don't follow the required structured format
  return false;
}

module.exports = {
  parseDeliveryMessage,
  isDeliveryMessage,
  isExcludedFromDeliveryParsing,
  looksLikeMalformedDelivery,
  looksLikeMalformedDeliveryWithParsed,
  hasLabeledOrderFields,
  getFormatReminderMessage,
  extractPhone,
  extractAmount,
  extractQuartier,
  extractCarrier,
  extractCustomerName,
};
