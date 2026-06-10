"use strict";

const {
  splitProductParts,
  normalizeItemsAndQuantity,
  isPriceLikeLocation,
  sanitizeDeliveryLocation,
} = require("../../lib/productNormalize");

describe("splitProductParts", () => {
  it("splits on comma", () => {
    expect(splitProductParts("Chaussures Nike, Ceinture cuir")).toEqual([
      "Chaussures Nike",
      "Ceinture cuir",
    ]);
  });

  it("splits on plus", () => {
    expect(splitProductParts("2 robes + 1 sac")).toEqual(["2 robes", "1 sac"]);
  });

  it("respects existing em dash", () => {
    expect(splitProductParts("robes — sac")).toEqual(["robes", "sac"]);
  });
});

describe("normalizeItemsAndQuantity", () => {
  it("strips leading quantity from single product", () => {
    const r = normalizeItemsAndQuantity("2 robes");
    expect(r.displayItems).toBe("robes");
    expect(r.quantity).toBe(2);
  });

  it("joins multi-product with em dash and sums quantity", () => {
    const r = normalizeItemsAndQuantity("Chaussures Nike, Ceinture cuir");
    expect(r.displayItems).toBe("Chaussures Nike — Ceinture cuir");
    expect(r.quantity).toBe(2);
  });

  it("sums quantities from plus-separated parts", () => {
    const r = normalizeItemsAndQuantity("2 robes + 1 sac");
    expect(r.displayItems).toBe("robes — sac");
    expect(r.quantity).toBe(3);
  });
});

describe("isPriceLikeLocation", () => {
  it("detects prix/montant labels", () => {
    expect(isPriceLikeLocation("Prix 12000")).toBe(true);
    expect(isPriceLikeLocation("Montant : 6000fr")).toBe(true);
  });

  it("accepts real quartier names", () => {
    expect(isPriceLikeLocation("Akwa")).toBe(false);
    expect(isPriceLikeLocation("Carrefour SHO marché central")).toBe(false);
  });
});

describe("sanitizeDeliveryLocation", () => {
  it("rejects model prix line and uses Akwa from message", () => {
    const text = "Tel 699000001\n2 robes\nLivraison 500fr\nPrix 12000\nAkwa";
    expect(sanitizeDeliveryLocation("Prix 12000", text)).toBe("akwa");
  });

  it("uses known quartier from text over bad model location", () => {
    const text = "612345678\n2 robes\n15k\nMakepe";
    expect(sanitizeDeliveryLocation("Prix 12000", text)).toBe("makepe");
  });
});
