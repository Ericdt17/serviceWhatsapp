"use strict";

const {
  isHighConfidenceAiDelivery,
} = require("../../lib/aiDeliveryConfidence");

function normalized(overrides = {}) {
  return {
    phone: "655272984",
    items: "savons shampoing",
    amount_due: 12000,
    quartier: "Bastos",
    delivery_note: null,
    carrier: null,
    ...overrides,
  };
}

describe("isHighConfidenceAiDelivery", () => {
  it("is true for Yanis-style complete AI normalize (phone+product+amount+quartier)", () => {
    expect(
      isHighConfidenceAiDelivery(
        normalized({
          phone: "655272984",
          items: "savons shampoing",
          amount_due: 12000,
          quartier: "bastos",
        })
      )
    ).toBe(true);
  });

  it("is true for Loic-style labeled order fields after normalize", () => {
    expect(
      isHighConfidenceAiDelivery(
        normalized({
          phone: "670122860",
          items: "shampooing",
          amount_due: 8000,
          quartier: "Etoudi",
        })
      )
    ).toBe(true);
  });

  it("is false when normalized is null or missing", () => {
    expect(isHighConfidenceAiDelivery(null)).toBe(false);
    expect(isHighConfidenceAiDelivery(undefined)).toBe(false);
  });

  it("is false when product is a placeholder", () => {
    expect(
      isHighConfidenceAiDelivery(normalized({ items: "Non spécifié" }))
    ).toBe(false);
    expect(isHighConfidenceAiDelivery(normalized({ items: "" }))).toBe(false);
    expect(isHighConfidenceAiDelivery(normalized({ items: "N/A" }))).toBe(
      false
    );
  });

  it("is true when amount_due is 0 (rien à encaisser) with phone+product+quartier", () => {
    expect(isHighConfidenceAiDelivery(normalized({ amount_due: 0 }))).toBe(
      true
    );
  });

  it("is false when amount_due is missing or negative", () => {
    expect(
      isHighConfidenceAiDelivery(normalized({ amount_due: null }))
    ).toBe(false);
    expect(
      isHighConfidenceAiDelivery(normalized({ amount_due: undefined }))
    ).toBe(false);
    expect(isHighConfidenceAiDelivery(normalized({ amount_due: -1 }))).toBe(
      false
    );
  });

  it("is false when quartier is empty", () => {
    expect(isHighConfidenceAiDelivery(normalized({ quartier: null }))).toBe(
      false
    );
    expect(isHighConfidenceAiDelivery(normalized({ quartier: "  " }))).toBe(
      false
    );
  });

  it("is false when phone is missing", () => {
    expect(isHighConfidenceAiDelivery(normalized({ phone: "" }))).toBe(false);
    expect(isHighConfidenceAiDelivery(normalized({ phone: null }))).toBe(
      false
    );
  });
});
