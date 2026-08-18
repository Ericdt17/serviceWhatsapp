"use strict";

const {
  extractKnownQuartier,
  isKnownQuartier,
  KNOWN_QUARTIERS,
} = require("../../lib/deliveryQuartiers");

describe("deliveryQuartiers", () => {
  it("exports a non-empty KNOWN_QUARTIERS list", () => {
    expect(KNOWN_QUARTIERS.length).toBeGreaterThan(10);
  });

  it("detects Messassi and Logbaba in free text", () => {
    expect(extractKnownQuartier("Livraison vers Messassi demain")).toBe("messassi");
    expect(extractKnownQuartier("Quartier Logbaba")).toBe("logbaba");
  });

  it("detects quartier case-insensitively with accents stripped", () => {
    expect(extractKnownQuartier("MESSASSI")).toBe("messassi");
    expect(extractKnownQuartier("Makepe")).toBe("makepe");
  });

  it("prefers longer known names (Carrefour SHO marché central)", () => {
    expect(
      extractKnownQuartier("Carrefour SHO marché central")
    ).toBe("carrefour sho marche central");
  });

  it("isKnownQuartier validates exact normalized names", () => {
    expect(isKnownQuartier("Akwa")).toBe(true);
    expect(isKnownQuartier("Gants")).toBe(false);
    expect(isKnownQuartier("Crème bright")).toBe(false);
  });
});
