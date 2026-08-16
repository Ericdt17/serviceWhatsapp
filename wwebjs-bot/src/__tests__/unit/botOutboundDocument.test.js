"use strict";

const {
  validateSendDocumentBody,
  validateSendTextBody,
  verifyInternalToken,
  sendDocumentToWhatsapp,
  sendTextToWhatsapp,
  MAX_TEXT_MESSAGE_LENGTH,
} = require("../../lib/botOutboundDocument");

describe("botOutboundDocument", () => {
  describe("verifyInternalToken", () => {
    it("rejects when server token is not configured", () => {
      expect(verifyInternalToken("abc", null)).toEqual({ ok: false, reason: "not_configured" });
    });

    it("rejects missing header", () => {
      expect(verifyInternalToken(undefined, "secret")).toEqual({ ok: false, reason: "missing" });
    });

    it("rejects invalid token", () => {
      expect(verifyInternalToken("wrong", "secret")).toEqual({ ok: false, reason: "invalid" });
    });

    it("accepts matching token", () => {
      expect(verifyInternalToken("secret", "secret")).toEqual({ ok: true });
    });
  });

  describe("validateSendDocumentBody", () => {
    const validBase64 = Buffer.from("%PDF-1.4").toString("base64");

    it("accepts a valid payload", () => {
      const result = validateSendDocumentBody({
        whatsapp_group_id: "120363123456789012@g.us",
        filename: "rapport.pdf",
        pdf_base64: validBase64,
        caption: "Rapport de règlement",
      });
      expect(result.ok).toBe(true);
      expect(result.data.groupId).toBe("120363123456789012@g.us");
      expect(result.data.filename).toBe("rapport.pdf");
      expect(result.data.caption).toBe("Rapport de règlement");
    });

    it("rejects group id without @g.us", () => {
      const result = validateSendDocumentBody({
        whatsapp_group_id: "120363123456789012",
        filename: "rapport.pdf",
        pdf_base64: validBase64,
      });
      expect(result.ok).toBe(false);
      expect(result.errors).toContain("whatsapp_group_id must end with @g.us");
    });

    it("rejects missing pdf_base64", () => {
      const result = validateSendDocumentBody({
        whatsapp_group_id: "120363123456789012@g.us",
        filename: "rapport.pdf",
      });
      expect(result.ok).toBe(false);
      expect(result.errors).toContain("pdf_base64 is required");
    });

    it("rejects non-pdf filename", () => {
      const result = validateSendDocumentBody({
        whatsapp_group_id: "120363123456789012@g.us",
        filename: "rapport.txt",
        pdf_base64: validBase64,
      });
      expect(result.ok).toBe(false);
      expect(result.errors).toContain("filename must end with .pdf");
    });
  });

  describe("sendDocumentToWhatsapp", () => {
    it("sends MessageMedia with caption when provided", async () => {
      const sendMessage = jest.fn().mockResolvedValue({});
      const client = { sendMessage };

      await sendDocumentToWhatsapp(client, {
        groupId: "120363123456789012@g.us",
        filename: "rapport.pdf",
        pdfBase64: Buffer.from("%PDF-1.4").toString("base64"),
        caption: "Détail des transactions",
      });

      expect(sendMessage).toHaveBeenCalledTimes(1);
      const [chatId, media, options] = sendMessage.mock.calls[0];
      expect(chatId).toBe("120363123456789012@g.us");
      expect(media.mimetype).toBe("application/pdf");
      expect(media.filename).toBe("rapport.pdf");
      expect(options).toEqual({ caption: "Détail des transactions" });
    });

    it("omits caption option when empty", async () => {
      const sendMessage = jest.fn().mockResolvedValue({});
      const client = { sendMessage };

      await sendDocumentToWhatsapp(client, {
        groupId: "120363123456789012@g.us",
        filename: "rapport.pdf",
        pdfBase64: Buffer.from("%PDF-1.4").toString("base64"),
        caption: "",
      });

      const [, , options] = sendMessage.mock.calls[0];
      expect(options).toEqual({});
    });
  });

  describe("validateSendTextBody", () => {
    it("accepts a valid payload", () => {
      const result = validateSendTextBody({
        whatsapp_group_id: "120363123456789012@g.us",
        message: "Annonce LivSight",
      });
      expect(result.ok).toBe(true);
      expect(result.data.groupId).toBe("120363123456789012@g.us");
      expect(result.data.message).toBe("Annonce LivSight");
      expect(result.data.dryRun).toBe(false);
    });

    it("accepts dry_run true", () => {
      const result = validateSendTextBody({
        whatsapp_group_id: "120363123456789012@g.us",
        message: "Test",
        dry_run: true,
      });
      expect(result.ok).toBe(true);
      expect(result.data.dryRun).toBe(true);
    });

    it("rejects group id without @g.us", () => {
      const result = validateSendTextBody({
        whatsapp_group_id: "120363123456789012",
        message: "Hello",
      });
      expect(result.ok).toBe(false);
      expect(result.errors).toContain("whatsapp_group_id must end with @g.us");
    });

    it("rejects empty message", () => {
      const result = validateSendTextBody({
        whatsapp_group_id: "120363123456789012@g.us",
        message: "   ",
      });
      expect(result.ok).toBe(false);
      expect(result.errors).toContain("message is required");
    });

    it("rejects message longer than MAX_TEXT_MESSAGE_LENGTH", () => {
      const result = validateSendTextBody({
        whatsapp_group_id: "120363123456789012@g.us",
        message: "x".repeat(MAX_TEXT_MESSAGE_LENGTH + 1),
      });
      expect(result.ok).toBe(false);
      expect(result.errors).toContain(
        `message must be at most ${MAX_TEXT_MESSAGE_LENGTH} characters`
      );
    });
  });

  describe("sendTextToWhatsapp", () => {
    it("sends plain text and returns serialized message id", async () => {
      const sendMessage = jest.fn().mockResolvedValue({
        id: { _serialized: "true_120363@g.us_ABCDEF" },
      });
      const client = { sendMessage };

      const messageId = await sendTextToWhatsapp(client, {
        groupId: "120363123456789012@g.us",
        message: "Hello group",
      });

      expect(sendMessage).toHaveBeenCalledWith(
        "120363123456789012@g.us",
        "Hello group"
      );
      expect(messageId).toBe("true_120363@g.us_ABCDEF");
    });

    it("returns null when sendMessage has no id", async () => {
      const sendMessage = jest.fn().mockResolvedValue({});
      const messageId = await sendTextToWhatsapp(
        { sendMessage },
        { groupId: "120363123456789012@g.us", message: "Hi" }
      );
      expect(messageId).toBeNull();
    });
  });
});
