"use strict";

const {
  validateSendTextDmBody,
  sendTextDmToWhatsapp,
  MAX_TEXT_DM_LENGTH,
} = require("../../lib/botOutboundTextDm");

describe("botOutboundTextDm", () => {
  describe("validateSendTextDmBody", () => {
    it("accepts valid payload and normalizes CM phone", () => {
      const result = validateSendTextDmBody({
        recipient_phone: "693663641",
        message: "Voici votre bulletin",
      });
      expect(result.ok).toBe(true);
      expect(result.data.chatId).toBe("237693663641@c.us");
      expect(result.data.message).toBe("Voici votre bulletin");
    });

    it("rejects missing phone", () => {
      const result = validateSendTextDmBody({ message: "Hi" });
      expect(result.ok).toBe(false);
    });

    it("rejects empty message", () => {
      const result = validateSendTextDmBody({
        recipient_phone: "237690123456",
        message: "   ",
      });
      expect(result.ok).toBe(false);
    });

    it("rejects oversized message", () => {
      const result = validateSendTextDmBody({
        recipient_phone: "237690123456",
        message: "x".repeat(MAX_TEXT_DM_LENGTH + 1),
      });
      expect(result.ok).toBe(false);
    });
  });

  describe("sendTextDmToWhatsapp", () => {
    it("resolves LID then sends text", async () => {
      const sendMessage = jest.fn().mockResolvedValue({
        id: { _serialized: "true_123@lid_1" },
      });
      const getNumberId = jest.fn().mockResolvedValue({
        _serialized: "237693663641@c.us",
      });
      const getContactLidAndPhone = jest.fn().mockResolvedValue([
        { lid: "123@lid", pn: "237693663641@c.us" },
      ]);

      const id = await sendTextDmToWhatsapp(
        { sendMessage, getNumberId, getContactLidAndPhone },
        { chatId: "237693663641@c.us", message: "Hello" }
      );

      expect(sendMessage).toHaveBeenCalledWith("123@lid", "Hello");
      expect(id).toBe("true_123@lid_1");
    });
  });
});
