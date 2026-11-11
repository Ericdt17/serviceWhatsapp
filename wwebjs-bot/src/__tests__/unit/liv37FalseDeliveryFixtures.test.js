"use strict";

/**
 * LIV-37 Phase 1 — documentary fixtures from local WhatsApp repro (2026-11-11).
 * These assert CURRENT behavior (including false positives). Phase 2+ will tighten
 * gates and flip the expectations that encode the bug.
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

describe("LIV-37 fixtures — current create-path gates", () => {
  describe("casual number share (should not open AI today)", () => {
    it("one-liner phone-in-chat fails strict and is not malformed", () => {
      const parsed = parseDeliveryMessage(CASUAL_ONE_LINER);
      expect(parsed.valid).toBe(false);
      expect(looksLikeMalformedDelivery(CASUAL_ONE_LINER)).toBe(false);
    });
  });

  describe("near-miss false positives (open AI today — Phase 2 target)", () => {
    it("phone + amount chitchat fails strict but looks malformed", () => {
      const parsed = parseDeliveryMessage(PHONE_PLUS_AMOUNT);
      expect(parsed.valid).toBe(false);
      expect(looksLikeMalformedDelivery(PHONE_PLUS_AMOUNT)).toBe(true);
    });

    it("phone + quartier chitchat fails strict but looks malformed", () => {
      const parsed = parseDeliveryMessage(PHONE_PLUS_QUARTIER);
      expect(parsed.valid).toBe(false);
      expect(looksLikeMalformedDelivery(PHONE_PLUS_QUARTIER)).toBe(true);
    });

    it("AI validator accepts Non spécifié + amount from text (repro ref 353)", () => {
      const out = validateAndNormalizeAiDelivery(
        {
          phone: "699123456",
          product: "Non spécifié",
          amount: 15000,
          location: "",
        },
        PHONE_PLUS_AMOUNT
      );
      expect(out).not.toBeNull();
      expect(out.phone).toBe("699123456");
      expect(out.amount_due).toBe(15000);
      expect(out.items).toMatch(/non\s*sp[eé]cifi[eé]/i);
    });

    it("AI validator accepts Non spécifié + model amount 0 (repro ref 354)", () => {
      const out = validateAndNormalizeAiDelivery(
        {
          phone: "699123456",
          product: "Non spécifié",
          amount: 0,
          location: "Makepe",
        },
        PHONE_PLUS_QUARTIER
      );
      expect(out).not.toBeNull();
      expect(out.phone).toBe("699123456");
      expect(out.amount_due).toBe(0);
      expect(out.items).toMatch(/non\s*sp[eé]cifi[eé]/i);
      expect(out.quartier).toMatch(/makepe/i);
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
  });
});
