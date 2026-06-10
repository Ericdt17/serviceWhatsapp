"use strict";

const {
  SYSTEM_PROMPT,
  buildUserPrompt,
  validateAndNormalizeAiDelivery,
  normalizePhoneString,
  coerceAmountFromModel,
  resolveAmountDue,
  extractDeliveryWithAI,
} = require("../../lib/aiDeliveryExtract");

describe("normalizePhoneString", () => {
  it("normalizes 9-digit Cameroon phone", () => {
    expect(normalizePhoneString("6 12 34 56 78")).toBe("612345678");
  });

  it("returns null for invalid input", () => {
    expect(normalizePhoneString("")).toBe(null);
    expect(normalizePhoneString("12345")).toBe(null);
  });
});

describe("coerceAmountFromModel", () => {
  it("parses k suffix", () => {
    expect(coerceAmountFromModel("15k")).toBe(15000);
    expect(coerceAmountFromModel("18K")).toBe(18000);
  });

  it("accepts plain numbers", () => {
    expect(coerceAmountFromModel(6000)).toBe(6000);
    expect(coerceAmountFromModel("12000")).toBe(12000);
  });

  it("rejects tiny amounts", () => {
    expect(coerceAmountFromModel(50)).toBe(null);
  });

  it("accepts zero as no cash to collect", () => {
    expect(coerceAmountFromModel(0)).toBe(0);
    expect(coerceAmountFromModel("0")).toBe(0);
  });
});

describe("validateAndNormalizeAiDelivery", () => {
  it("accepts model aligned with text (phone + amount from text)", () => {
    const text = "612345678\n2 robes\n15k\nAkwa";
    const out = validateAndNormalizeAiDelivery(
      { phone: "612345678", product: "2 robes", amount: 15000, location: "akwa" },
      text
    );
    expect(out).not.toBeNull();
    expect(out.phone).toBe("612345678");
    expect(out.amount_due).toBe(15000);
    expect(out.items).toMatch(/robe/i);
  });

  it("rejects when model amount disagrees with text beyond tolerance", () => {
    const text = "612345678\nx\n15k\nAkwa";
    const out = validateAndNormalizeAiDelivery(
      { phone: "612345678", product: "x", amount: 99999, location: "" },
      text
    );
    expect(out).toBeNull();
  });

  it("uses model phone and amount when text has no extractable fields", () => {
    const text = "please deliver to customer";
    const out = validateAndNormalizeAiDelivery(
      { phone: "612345678", product: "shoes", amount: 5000, location: "" },
      text
    );
    expect(out).not.toBeNull();
    expect(out.phone).toBe("612345678");
    expect(out.amount_due).toBe(5000);
  });

  it("returns null when neither text nor model yields a valid phone", () => {
    const text = "random chat no digits";
    const out = validateAndNormalizeAiDelivery(
      { phone: "", product: "x", amount: 5000, location: "" },
      text
    );
    expect(out).toBeNull();
  });

  it("accepts model-only phone when text has labeled number", () => {
    const text = "Numéro : 612345678\nMontant : 8000\nMakepe";
    const out = validateAndNormalizeAiDelivery(
      { phone: "612345678", product: "pack", amount: 8000, location: "Makepe" },
      text
    );
    expect(out).not.toBeNull();
    expect(out.amount_due).toBe(8000);
  });

  it("trusts model amount on labeled Montant when regex disagrees", () => {
    const text = [
      "Numéro : 694397546",
      "Lieu : messassi",
      "Montant : 6000fr",
      "Un pack : homme",
    ].join("\n");
    const out = validateAndNormalizeAiDelivery(
      {
        phone: "694397546",
        product: "Pack homme",
        amount: 6000,
        location: "Messassi",
      },
      text
    );
    expect(out).not.toBeNull();
    expect(out.amount_due).toBe(6000);
    expect(out.phone).toBe("694397546");
    expect(out.quartier).toMatch(/messassi/i);
  });

  it("normalizes multi-product with dash and fixes prix-as-location", () => {
    const text = "Tel 699000001\n2 robes\nLivraison 500fr\nPrix 12000\nAkwa";
    const out = validateAndNormalizeAiDelivery(
      {
        phone: "699000001",
        product: "2 robes",
        amount: 12000,
        location: "Prix 12000",
      },
      text
    );
    expect(out).not.toBeNull();
    expect(out.items).toBe("robes");
    expect(out.amount_due).toBe(12000);
    expect(out.quartier).toBe("akwa");
  });

  it("joins comma-separated AI products with em dash", () => {
    const text = "Bessengue\nChaussures Nike\nCeinture\n14k\n651073574";
    const out = validateAndNormalizeAiDelivery(
      {
        phone: "651073574",
        product: "Chaussures Nike, Ceinture cuir",
        amount: 14000,
        location: "Bessengue",
      },
      text
    );
    expect(out).not.toBeNull();
    expect(out.items).toBe("Chaussures Nike — Ceinture cuir");
  });

  it("accepts zero amount when text has explicit 0 line", () => {
    const text = "690829269\n01 Savon BOASUN\n0\nCarrefour SHO";
    const out = validateAndNormalizeAiDelivery(
      {
        phone: "690829269",
        product: "01 Savon BOASUN",
        amount: 0,
        location: "Carrefour SHO",
      },
      text
    );
    expect(out).not.toBeNull();
    expect(out.amount_due).toBe(0);
  });
});

describe("resolveAmountDue", () => {
  it("prefers model on labeled messages when amounts disagree", () => {
    const text = "Montant : 6000fr\n612345678";
    expect(resolveAmountDue(15000, 6000, text)).toBe(6000);
  });

  it("rejects unlabeled mismatch beyond tolerance", () => {
    expect(resolveAmountDue(15000, 99999, "612345678\n15k")).toBe(null);
  });
});

describe("SYSTEM_PROMPT / buildUserPrompt", () => {
  it("includes Cameroon examples and labeled format hints", () => {
    expect(SYSTEM_PROMPT).toMatch(/Numéro/i);
    expect(SYSTEM_PROMPT).toMatch(/6000fr/);
    expect(SYSTEM_PROMPT).toMatch(/690829269/);
  });

  it("wraps user message with delimiters", () => {
    expect(buildUserPrompt("hello")).toMatch(/MESSAGE START/);
    expect(buildUserPrompt("hello")).toContain("hello");
  });
});

describe("extractDeliveryWithAI", () => {
  it("returns no_api_key when key missing", async () => {
    const result = await extractDeliveryWithAI("hello", {
      OPENAI_API_KEY: null,
      AI_DELIVERY_TIMEOUT_MS: 5000,
      AI_DELIVERY_MAX_TOKENS: 300,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("no_api_key");
  });
});
