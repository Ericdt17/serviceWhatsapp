"use strict";

const {
  looksLikeDeliveryInstruction,
  sanitizeDeliveryLocation,
} = require("../../lib/productNormalize");

/**
 * Vendors write "appeler le client" where an address goes. Treating that as a place is worse than
 * having no place: Google answers it with a confident rooftop plus code, so the parcel gets a
 * precise-looking coordinate somewhere arbitrary and drags its whole zone's ordering with it.
 */
describe("looksLikeDeliveryInstruction", () => {
  const instructions = [
    "Appeler pour la destination, de la part de Abdel Sadik de maroua",
    "Appler le client il va vous donner son position",
    "Appeler le client il enverra sa position",
    "contactez le client avant de venir",
    "Je suis a l'argent fitness voyage",
    "joindre le client il vous donnera sa localisation",
  ];

  it.each(instructions)("treats %s as an instruction", (text) => {
    expect(looksLikeDeliveryInstruction(text)).toBe(true);
  });

  // Real destinations from production, including the messy ones.
  const places = [
    "Carrefour Youmbi",
    "Messassi",
    "Cité verte",
    "Nkolbisson",
    "Marche des fleurs , carrefour abia",
    "Carrefour SHO marché central",
    "soa tsinga village au rond point Razel",
    "OLEMBE ENTREE ECOLE",
    "Lycée de Mballa 2",
    "Ngoa-Ekellé",
    "Nylon bastos",
  ];

  it.each(places)("leaves %s alone", (text) => {
    expect(looksLikeDeliveryInstruction(text)).toBe(false);
  });

  // A place name can contain a verb by coincidence; only sentences read as instructions.
  it.each(["Call Box", "Position Bastos", ""])(
    "does not mistake the short line %s for an instruction",
    (text) => {
      expect(looksLikeDeliveryInstruction(text)).toBe(false);
    }
  );
});

describe("sanitizeDeliveryLocation with instruction text", () => {
  it("refuses an instruction the model returned as a location", () => {
    // productLines is what the real caller passes; without it the product line looks like a place.
    const result = sanitizeDeliveryLocation(
      "Appeler le client il va vous donner sa position",
      "694397546\n1 montre\n8000\nAppeler le client il va vous donner sa position",
      { productLines: ["1 montre"] }
    );
    expect(result).toBeFalsy();
  });

  it("still finds a real quartier in the same message shape", () => {
    const result = sanitizeDeliveryLocation(
      "Messassi",
      "694397546\n1 montre\n8000\nMessassi",
      { productLines: ["1 montre"] }
    );
    expect(String(result).toLowerCase()).toContain("messassi");
  });
});
