"use strict";

const {
  normalizeCatalogText,
  parseQuantityAndProduct,
  findExactCatalogMatch,
  resolvePackageMatch,
} = require("../../lib/packageCatalogMatch");

describe("normalizeCatalogText", () => {
  it("lowercases and strips accents", () => {
    expect(normalizeCatalogText("  Acide Glycolique  ")).toBe("acide glycolique");
    expect(normalizeCatalogText("Café")).toBe("cafe");
  });
});

describe("parseQuantityAndProduct", () => {
  it("parses leading quantity", () => {
    expect(parseQuantityAndProduct("3 Acide Glycolique")).toEqual({
      quantity: 3,
      product: "Acide Glycolique",
      quantityAmbiguous: false,
    });
  });

  it("parses trailing x quantity", () => {
    expect(parseQuantityAndProduct("Robe wax x 2")).toEqual({
      quantity: 2,
      product: "Robe wax",
      quantityAmbiguous: false,
    });
  });

  it("parses compact x2 suffix (no space before x)", () => {
    expect(parseQuantityAndProduct("Acide Glycolique x2")).toEqual({
      quantity: 2,
      product: "Acide Glycolique",
      quantityAmbiguous: false,
    });
  });

  it("parses leading 2x prefix", () => {
    expect(parseQuantityAndProduct("2x Acide Glycolique")).toEqual({
      quantity: 2,
      product: "Acide Glycolique",
      quantityAmbiguous: false,
    });
  });

  it("marks ambiguous when digit hints but no pattern matched", () => {
    const r = parseQuantityAndProduct("pack 2 unités acide");
    expect(r.quantity).toBe(1);
    expect(r.quantityAmbiguous).toBe(true);
  });

  it("defaults quantity to 1", () => {
    expect(parseQuantityAndProduct("Acide Glycolique")).toEqual({
      quantity: 1,
      product: "Acide Glycolique",
      quantityAmbiguous: false,
    });
  });
});

describe("findExactCatalogMatch", () => {
  const catalog = [
    { id: 1, package_name: "Acide Glycolique" },
    { id: 2, package_name: "Robe wax" },
  ];

  it("matches case-insensitively", () => {
    const m = findExactCatalogMatch("acide glycolique", catalog);
    expect(m?.package_name).toBe("Acide Glycolique");
  });

  it("returns null when no match", () => {
    expect(findExactCatalogMatch("2 robes + 1 sac", catalog)).toBeNull();
  });
});

describe("resolvePackageMatch", () => {
  const catalog = [
    { id: 1, package_name: "Acide Glycolique" },
    { id: 2, package_name: "Robe wax" },
  ];

  it("returns pickup when catalog is empty", async () => {
    const r = await resolvePackageMatch("Acide Glycolique", []);
    expect(r.source).toBe("pickup");
    expect(r.matchMethod).toBe("none");
  });

  it("auto-selects single catalog item as stock", async () => {
    const r = await resolvePackageMatch("anything", [{ id: 9, package_name: "Only Product" }]);
    expect(r.source).toBe("stock");
    expect(r.package_name).toBe("Only Product");
    expect(r.matchMethod).toBe("single_catalog");
  });

  it("exact match → stock with catalog name", async () => {
    const r = await resolvePackageMatch("Acide Glycolique", catalog);
    expect(r.source).toBe("stock");
    expect(r.package_name).toBe("Acide Glycolique");
    expect(r.matchMethod).toBe("exact");
    expect(r.catalogPackageId).toBe(1);
  });

  it("quantity from item line", async () => {
    const r = await resolvePackageMatch("3 Acide Glycolique", catalog);
    expect(r.quantity).toBe(3);
    expect(r.source).toBe("stock");
    expect(r.package_name).toBe("Acide Glycolique");
  });

  it("single catalog: x2 suffix sets quantity 2 on package name only", async () => {
    const r = await resolvePackageMatch("Acide Glycolique x2", [
      { id: 1, package_name: "Acide Glycolique" },
    ]);
    expect(r.source).toBe("stock");
    expect(r.package_name).toBe("Acide Glycolique");
    expect(r.quantity).toBe(2);
    expect(r.matchMethod).toBe("single_catalog");
  });

  it("no match → pickup with raw text", async () => {
    const r = await resolvePackageMatch("2 robes + 1 sac", catalog);
    expect(r.source).toBe("pickup");
    expect(r.package_name).toBe("2 robes + 1 sac");
    expect(r.matchMethod).toBe("none");
  });
});
