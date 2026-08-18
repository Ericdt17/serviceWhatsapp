// Status parser - detects and parses status update messages

/**
 * Extract phone number from status message
 * Examples: "Livré 6xx123456", "Échec 72158817", "+237 6 98 09 75 33"
 */
function extractPhoneFromStatus(text) {
  const intlSpaced = String(text || "").match(/\+?\s*237[\s.\-]*\d[\d\s.\-]{6,}/);
  if (intlSpaced) {
    let digits = intlSpaced[0].replace(/\D/g, "");
    if (digits.startsWith("237") && digits.length >= 11) {
      digits = digits.slice(3);
    }
    if (/^[627]\d{8}$/.test(digits)) {
      return digits;
    }
    if (/^[627]\d{7}$/.test(digits)) {
      return "6" + digits;
    }
  }

  // Remove all spaces and common separators
  let cleaned = text.replace(/[\s\-\.]/g, "");
  cleaned = cleaned.replace(/\+?237(?=[627])/g, "");

  // Pattern 1: Cameroon mobile starting with 6, 7, or 2 (9 digits)
  const pattern1 = /[627]\d{8}/;
  const match1 = cleaned.match(pattern1);
  if (match1) {
    return match1[0];
  }

  // Pattern 2: 6/7/2 followed by digits with x placeholders (not preceded by another digit)
  const pattern2 = /(?<!\d)[627][x\d]{7,8}/;
  const match2 = cleaned.match(pattern2);
  if (match2) {
    return match2[0].replace(/x/gi, "0");
  }

  return null;
}

/**
 * Extract amount from status message
 * Examples: "Collecté 8.000", "Collecté 8k"
 */
function extractAmountFromStatus(text) {
  // First, extract and remove phone numbers to avoid confusion
  const phonePattern = /[627]\d{8}|[627][x\d]{7,8}/g;
  let textWithoutPhones = text;
  const phones = text.match(phonePattern);
  if (phones) {
    phones.forEach(phone => {
      textWithoutPhones = textWithoutPhones.replace(phone, " ");
    });
  }

  // Remove spaces
  const cleaned = textWithoutPhones.replace(/\s/g, "");

  // Pattern 1: Number followed by k/K
  const pattern1 = /(\d+(?:\.\d+)?)\s*k/gi;
  const match1 = text.match(pattern1);
  if (match1) {
    const num = parseFloat(match1[0].replace(/k/gi, ""));
    return num * 1000;
  }

  // Pattern 2: Numbers with dots or commas as thousands separator
  const pattern2 = /(\d{1,3}(?:[.,]\d{3})+)/g;
  const matches = text.match(pattern2);
  if (matches) {
    const amounts = matches.map((m) =>
      parseFloat(m.replace(/[.,]/g, ""))
    );
    return Math.max(...amounts);
  }

  // Pattern 3: Just plain numbers (but exclude phone numbers - 9 digits starting with 6)
  const numbers = cleaned.match(/\d+/g);
  if (numbers) {
    const amounts = numbers
      .map((n) => parseInt(n))
      .filter((n) => {
        // Exclude phone numbers (9 digits starting with 6, 7, or 2)
        const str = n.toString();
        if (str.length === 9 && /^[627]/.test(str)) {
          return false;
        }
        // Exclude numbers that are part of phone numbers (like 333 from 633333333)
        // If the number is exactly 9 digits or appears right after a 6, exclude it
        if (str.length >= 8) {
          return false; // Likely part of or a phone number
        }
        // Amounts should be > 100 FCFA
        return n > 100;
      });

    if (amounts.length > 0) {
      return Math.max(...amounts);
    }
  }

  return null;
}

/**
 * Detect and parse status update message
 * @param {string} text - Message text to parse
 * @param {boolean} isReply - If true, don't require phone number (for reply-based updates)
 * Returns: { type, phone, amount, details } or null
 */
function parseStatusUpdate(text, isReply = false) {
  const lowerText = text.toLowerCase().trim();

  // 1. PAYMENT - "Livré", "Livre", "Livrée" (now treated as payment)
  // Use word-boundary regex to avoid matching "livreur" which contains "livre" as substring
  if (lowerText.includes("livré") || lowerText.match(/\blivr[ée]e?\b/i)) {
    const phone = extractPhoneFromStatus(text);
    const amount = extractAmountFromStatus(text);
    return {
      type: "payment",
      phone: phone,
      amount: amount, // Will be null if no amount specified, will use remaining amount in handler
      details: text,
    };
  }

  // 2. CLIENT_ABSENT - "Client absent", "Client n'a pas pris", "Le client n'a pas pris"
  // Check this BEFORE "failed" to avoid conflicts
  if (
    lowerText.includes("client absent") ||
    lowerText.includes("client n'a pas pris") ||
    lowerText.includes("client na pas pris") ||
    lowerText.includes("le client n'a pas pris") ||
    lowerText.includes("le client na pas pris") ||
    lowerText.includes("client n'a pas été") ||
    lowerText.includes("client na pas été") ||
    lowerText.match(/client.*absent/i) ||
    lowerText.match(/client.*pas.*pris/i)
  ) {
    const phone = extractPhoneFromStatus(text);
    return {
      type: "client_absent",
      phone: phone,
      amount: null,
      details: text,
    };
  }

  // 3. RETURNED/POSTPONED - "Renvoyé", "Renvoyer", "Retourné" (check before FAILED)
  if (
    lowerText.match(/^renvoy[ée]?/i) ||
    lowerText.includes("renvoyer") ||
    lowerText.includes("renvoyé") ||
    lowerText.match(/^retourn[ée]?/i)
  ) {
    const phone = extractPhoneFromStatus(text);
    return {
      type: "postponed",
      phone: phone,
      amount: null,
      details: text,
    };
  }

  // 4. FAILED - "Échec", "Echec", "Numéro ne passe pas"
  if (
    lowerText.match(/^échec|^echec/i) ||
    lowerText.includes("numéro ne passe pas") ||
    lowerText.includes("numero ne passe pas") ||
    lowerText.includes("num ne passe pas")
  ) {
    const phone = extractPhoneFromStatus(text);
    return {
      type: "failed",
      phone: phone,
      amount: null,
      details: text,
    };
  }

  // 5. NO_ANSWER - "Ne décroche pas", "Décroche pas", "Répond pas"
  if (
    lowerText.includes("ne décroche pas") ||
    lowerText.includes("ne decroche pas") ||
    lowerText.includes("décroche pas") ||
    lowerText.includes("decroche pas") ||
    lowerText.includes("répond pas") ||
    lowerText.includes("repond pas") ||
    lowerText.includes("ne répond pas") ||
    lowerText.includes("ne repond pas")
  ) {
    const phone = extractPhoneFromStatus(text);
    return {
      type: "no_answer",
      phone: phone,
      amount: null,
      details: text,
    };
  }

  // 6. UNREACHABLE - "Injoignable"
  if (
    lowerText.includes("injoignable")
  ) {
    const phone = extractPhoneFromStatus(text);
    return {
      type: "unreachable",
      phone: phone,
      amount: null,
      details: text,
    };
  }

  // 7. PAYMENT COLLECTED - "Collecté", "Collecte", "Payé"
  if (
    lowerText.match(/^collect[ée]?/i) ||
    lowerText.match(/^pay[ée]?/i) ||
    lowerText.includes("collecté") ||
    lowerText.includes("collecte")
  ) {
    const phone = extractPhoneFromStatus(text);
    const amount = extractAmountFromStatus(text);
    return {
      type: "payment",
      phone: phone,
      amount: amount,
      details: text,
    };
  }

  // 5. PICKUP - "Vient chercher", "Pickup", "Ramassage", "Elle passe chercher"
  if (
    lowerText.includes("vient chercher") ||
    lowerText.includes("passe chercher") ||
    lowerText.includes("pickup") ||
    lowerText.includes("ramassage") ||
    lowerText.includes("elle passe") ||
    lowerText.includes("il passe")
  ) {
    const phone = extractPhoneFromStatus(text);
    return {
      type: "pickup",
      phone: phone,
      amount: null,
      details: text,
    };
  }

  // 6. NUMBER CHANGE - "Changer numéro", "Nouveau numéro" (check before modify since "change" matches both)
  if (
    lowerText.includes("changer numéro") ||
    lowerText.includes("nouveau numéro") ||
    lowerText.includes("nouveau numero") ||
    lowerText.includes("change numéro")
  ) {
    // Extract both old and new numbers
    const phones = text.match(/6\d{8}/g) || text.match(/6[x\d]{7,8}/g);
    
    // If it's a reply and only one phone is provided, treat it as the new phone
    if (isReply && phones && phones.length === 1) {
      return {
        type: "number_change",
        phone: null, // Old phone not needed for replies (we have the delivery)
        newPhone: phones[0],
        details: text,
      };
    }
    
    // Otherwise, extract both old and new (for non-reply messages)
    return {
      type: "number_change",
      phone: phones ? phones[0] : null,
      newPhone: phones && phones.length > 1 ? phones[1] : null,
      details: text,
    };
  }

  // 7. MODIFY - "Modifier", "Change", "Modif" (check after number_change)
  if (
    lowerText.match(/^modifier|^modif/i) ||
    lowerText.includes("modifier") ||
    (lowerText.includes("change") && !lowerText.includes("numéro") && !lowerText.includes("numero"))
  ) {
    const phone = extractPhoneFromStatus(text);
    const amount = extractAmountFromStatus(text);
    
    // Try to extract new items/products
    let newItems = null;
    const itemsMatch = text.match(/prend\s+([^,]+)|([0-9]+\s+[a-zéèêëàâäôöùûüç]+)/i);
    if (itemsMatch) {
      newItems = itemsMatch[1] || itemsMatch[2];
    }

    return {
      type: "modify",
      phone: phone,
      amount: amount,
      items: newItems,
      details: text,
    };
  }

  // 8. PENDING/WAIT - "En attente", "Attente"
  if (
    lowerText.includes("en attente") ||
    lowerText.includes("attente") ||
    lowerText.includes("en cours")
  ) {
    const phone = extractPhoneFromStatus(text);
    return {
      type: "pending",
      phone: phone,
      amount: null,
      details: text,
    };
  }

  return null;
}

/**
 * Check if message is a status update
 */
function isStatusUpdate(text) {
  const status = parseStatusUpdate(text);
  return status !== null;
}

module.exports = {
  parseStatusUpdate,
  isStatusUpdate,
  extractPhoneFromStatus,
  extractAmountFromStatus,
};

