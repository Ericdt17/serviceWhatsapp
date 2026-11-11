"use strict";

const { isPlaceholderProduct } = require("../../lib/productNormalize");

describe("isPlaceholderProduct", () => {
  it("rejects empty and short values", () => {
    expect(isPlaceholderProduct(null)).toBe(true);
    expect(isPlaceholderProduct("")).toBe(true);
    expect(isPlaceholderProduct("a")).toBe(true);
  });

  it("rejects Non spécifié and common placeholders", () => {
    expect(isPlaceholderProduct("Non spécifié")).toBe(true);
    expect(isPlaceholderProduct("non specifie")).toBe(true);
    expect(isPlaceholderProduct("N/A")).toBe(true);
    expect(isPlaceholderProduct("-")).toBe(true);
  });

  it("rejects digits-only / phone-like product", () => {
    expect(isPlaceholderProduct("699123456")).toBe(true);
    expect(isPlaceholderProduct("15000")).toBe(true);
  });

  it("accepts real product text", () => {
    expect(isPlaceholderProduct("2 robes")).toBe(false);
    expect(isPlaceholderProduct("Pack homme")).toBe(false);
    expect(isPlaceholderProduct("01 Savon BOASUN")).toBe(false);
  });
});
