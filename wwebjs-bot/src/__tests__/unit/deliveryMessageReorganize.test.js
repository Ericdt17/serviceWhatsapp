"use strict";

const {
  formatParsedDeliveryAsText,
  reorganizeDeliveryMessageWithAI,
} = require("../../lib/deliveryMessageReorganize");

jest.mock("../../lib/aiDeliveryExtract", () => ({
  extractDeliveryWithAI: jest.fn(),
  validateAndNormalizeAiDelivery: jest.fn(),
}));

const {
  extractDeliveryWithAI,
  validateAndNormalizeAiDelivery,
} = require("../../lib/aiDeliveryExtract");

describe("formatParsedDeliveryAsText", () => {
  it("formats phone, quartier, products and amount on separate lines", () => {
    expect(
      formatParsedDeliveryAsText({
        phone: "694397546",
        quartier: "Messassi",
        items: "Pack homme",
        amount_due: 6000,
      })
    ).toBe("694397546\nMessassi\nPack homme\n6000");
  });

  it("splits comma-separated products", () => {
    expect(
      formatParsedDeliveryAsText({
        phone: "651073574",
        quartier: "Bessengue",
        items: "Chaussures Nike, Ceinture cuir",
        amount_due: 14000,
      })
    ).toBe("651073574\nBessengue\nChaussures Nike\nCeinture cuir\n14000");
  });
});

describe("reorganizeDeliveryMessageWithAI", () => {
  const cfg = { OPENAI_API_KEY: "sk-test" };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns validation error for empty text", async () => {
    const result = await reorganizeDeliveryMessageWithAI("  ", cfg);
    expect(result).toEqual({
      ok: false,
      error: "empty_text",
      message: "Le texte est requis",
    });
  });

  it("returns no_api_key when OpenAI is not configured", async () => {
    const result = await reorganizeDeliveryMessageWithAI("hello", {});
    expect(result.ok).toBe(false);
    expect(result.error).toBe("no_api_key");
  });

  it("returns reorganized text when AI extraction succeeds", async () => {
    extractDeliveryWithAI.mockResolvedValue({
      ok: true,
      raw: {
        phone: "694397546",
        product: "Pack homme",
        amount: 6000,
        location: "Messassi",
      },
    });
    validateAndNormalizeAiDelivery.mockReturnValue({
      phone: "694397546",
      items: "Pack homme",
      amount_due: 6000,
      quartier: "Messassi",
      carrier: null,
    });

    const result = await reorganizeDeliveryMessageWithAI("messy text", cfg);

    expect(result).toEqual({
      ok: true,
      reorganized_text: "694397546\nMessassi\nPack homme\n6000",
    });
    expect(extractDeliveryWithAI).toHaveBeenCalledWith("messy text", cfg);
  });

  it("returns validation_failed when AI output cannot be validated", async () => {
    extractDeliveryWithAI.mockResolvedValue({ ok: true, raw: {} });
    validateAndNormalizeAiDelivery.mockReturnValue(null);

    const result = await reorganizeDeliveryMessageWithAI("messy", cfg);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("validation_failed");
  });
});
