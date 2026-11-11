"use strict";

/**
 * LIV-37 — fixtures from local WhatsApp repro (2026-11-11).
 * Phase 2+: assert desired gates (no product / chitchat → not a delivery).
 */

const {
  parseDeliveryMessage,
  looksLikeMalformedDelivery,
} = require("../../parser");
const {
  validateAndNormalizeAiDelivery,
} = require("../../lib/aiDeliveryExtract");

const CASUAL_ONE_LINER = "Je viens d'appeler le 699123456";
const PHONE_PLUS_AMOUNT = "Je viens d'appeler le 699123456\n15k";
const PHONE_PLUS_QUARTIER = "Je viens d'appeler le 699123456\nMakepe";
const VALID_STRICT = "699123456\n2 robes\n15000\nMakepe";
const PLACEHOLDER_STRICT = "699123456\nNon spécifié\n15000\nMakepe";
const MESSY_WITH_PRODUCT =
  "Bonjour voici une commande\nTel 699123456\n2 robes pour cliente\n15000\nvers Makepe merci";
const ONE_LINE_WITH_PRODUCT = "Livraison 699123456 2 robes 15k makepe stp";
const PRICE_ONLY_CHAT = "c'est 15k pour toi";

describe("LIV-37 fixtures — product + intent gates", () => {
  describe("casual number share (ignore)", () => {
    it("one-liner phone-in-chat fails strict and is not malformed", () => {
      const parsed = parseDeliveryMessage(CASUAL_ONE_LINER);
      expect(parsed.valid).toBe(false);
      expect(looksLikeMalformedDelivery(CASUAL_ONE_LINER)).toBe(false);
    });

    it("phone + amount chitchat does not open AI/malformed gate", () => {
      const parsed = parseDeliveryMessage(PHONE_PLUS_AMOUNT);
      expect(parsed.valid).toBe(false);
      expect(looksLikeMalformedDelivery(PHONE_PLUS_AMOUNT)).toBe(false);
    });

    it("phone + quartier chitchat does not open AI/malformed gate", () => {
      const parsed = parseDeliveryMessage(PHONE_PLUS_QUARTIER);
      expect(parsed.valid).toBe(false);
      expect(looksLikeMalformedDelivery(PHONE_PLUS_QUARTIER)).toBe(false);
    });
  });

  describe("AI validator rejects placeholder product", () => {
    it("rejects Non spécifié even when phone + amount present (was ref 353)", () => {
      const out = validateAndNormalizeAiDelivery(
        {
          phone: "699123456",
          product: "Non spécifié",
          amount: 15000,
          location: "",
        },
        PHONE_PLUS_AMOUNT
      );
      expect(out).toBeNull();
    });

    it("rejects Non spécifié + model amount 0 (was ref 354)", () => {
      const out = validateAndNormalizeAiDelivery(
        {
          phone: "699123456",
          product: "Non spécifié",
          amount: 0,
          location: "Makepe",
        },
        PHONE_PLUS_QUARTIER
      );
      expect(out).toBeNull();
    });
  });

  describe("legitimate strict order (must keep working)", () => {
    it("4-line order parses valid with real product", () => {
      const parsed = parseDeliveryMessage(VALID_STRICT);
      expect(parsed.valid).toBe(true);
      expect(parsed.phone).toBe("699123456");
      expect(parsed.items).toMatch(/robes/i);
      expect(parsed.amount_due).toBe(15000);
      expect(parsed.quartier).toMatch(/makepe/i);
      expect(looksLikeMalformedDelivery(VALID_STRICT)).toBe(false);
    });

    it("rejects strict 4-line with placeholder product", () => {
      const parsed = parseDeliveryMessage(PLACEHOLDER_STRICT);
      expect(parsed.valid).toBe(false);
    });
  });

  describe("ambiguous orders with product (AI/confirm candidates)", () => {
    it("messy multi-line with product looks malformed", () => {
      expect(parseDeliveryMessage(MESSY_WITH_PRODUCT).valid).toBe(false);
      expect(looksLikeMalformedDelivery(MESSY_WITH_PRODUCT)).toBe(true);
    });

    it("one-line order with product looks malformed", () => {
      expect(parseDeliveryMessage(ONE_LINE_WITH_PRODUCT).valid).toBe(false);
      expect(looksLikeMalformedDelivery(ONE_LINE_WITH_PRODUCT)).toBe(true);
    });

    it("price-only chat is not malformed", () => {
      expect(looksLikeMalformedDelivery(PRICE_ONLY_CHAT)).toBe(false);
    });

    it("AI accepts real product on messy message", () => {
      const out = validateAndNormalizeAiDelivery(
        {
          phone: "699123456",
          product: "2 robes",
          amount: 15000,
          location: "Makepe",
        },
        MESSY_WITH_PRODUCT
      );
      expect(out).not.toBeNull();
      expect(out.phone).toBe("699123456");
      expect(out.items).toMatch(/robe/i);
    });
  });
});
