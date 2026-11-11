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
});
