"use strict";

const {
  validateSendDocumentDmBody,
  sendDocumentDmToWhatsapp,
  MAX_CAPTION_LENGTH,
} = require("../../lib/botOutboundDocumentDm");

describe("botOutboundDocumentDm", () => {
  const validBase64 = Buffer.from("%PDF-1.4").toString("base64");

  describe("validateSendDocumentDmBody", () => {
    it("accepts a valid payload and normalizes CM phone", () => {
      const result = validateSendDocumentDmBody({
        recipient_phone: "693663641",
        filename: "bulletin.pdf",
        pdf_base64: validBase64,
        caption: "Bulletin de paie",
      });
      expect(result.ok).toBe(true);
      expect(result.data.chatId).toBe("237693663641@c.us");
      expect(result.data.recipientPhone).toBe("693663641");
      expect(result.data.filename).toBe("bulletin.pdf");
      expect(result.data.caption).toBe("Bulletin de paie");
    });

    it("accepts E.164-style phone", () => {
      const result = validateSendDocumentDmBody({
        recipient_phone: "+237 6 90-12-34-56",
        filename: "bulletin.pdf",
        pdf_base64: validBase64,
      });
      expect(result.ok).toBe(true);
      expect(result.data.chatId).toBe("237690123456@c.us");
    });

    it("rejects missing phone", () => {
      const result = validateSendDocumentDmBody({
        filename: "bulletin.pdf",
        pdf_base64: validBase64,
      });
      expect(result.ok).toBe(false);
      expect(result.errors.join(" ")).toMatch(/recipient_phone/i);
    });

    it("rejects non-pdf filename", () => {
      const result = validateSendDocumentDmBody({
        recipient_phone: "237690123456",
        filename: "bulletin.txt",
        pdf_base64: validBase64,
      });
      expect(result.ok).toBe(false);
      expect(result.errors).toContain("filename must end with .pdf");
    });

    it("rejects missing pdf_base64", () => {
      const result = validateSendDocumentDmBody({
        recipient_phone: "237690123456",
        filename: "bulletin.pdf",
      });
      expect(result.ok).toBe(false);
      expect(result.errors).toContain("pdf_base64 is required");
    });

    it("rejects caption longer than MAX_CAPTION_LENGTH", () => {
      const result = validateSendDocumentDmBody({
        recipient_phone: "237690123456",
        filename: "bulletin.pdf",
        pdf_base64: validBase64,
        caption: "x".repeat(MAX_CAPTION_LENGTH + 1),
      });
      expect(result.ok).toBe(false);
      expect(result.errors.join(" ")).toMatch(/caption/i);
    });
  });

  describe("sendDocumentDmToWhatsapp", () => {
    it("opens chat then tries media targets until one succeeds", async () => {
      const sendMessage = jest
        .fn()
        .mockResolvedValueOnce({ id: { _serialized: "true_lid_text" } })
        .mockRejectedValueOnce(
          new Error("Data passed to getter must include an id property")
        )
        .mockResolvedValueOnce({
          id: { _serialized: "true_1855@lid_PDF" },
        });
      const getNumberId = jest.fn().mockResolvedValue({
        _serialized: "185533997277186@lid",
      });

      const messageId = await sendDocumentDmToWhatsapp(
        { sendMessage, getNumberId },
        {
          chatId: "237693663641@c.us",
          filename: "bulletin.pdf",
          pdfBase64: validBase64,
          caption: "Bulletin",
        }
      );

      expect(getNumberId).toHaveBeenCalledWith("237693663641@c.us");
      // text on LID, media fail on @c.us, media ok on LID
      expect(sendMessage.mock.calls[0][0]).toBe("185533997277186@lid");
      expect(sendMessage.mock.calls[0][1]).toBe("\u200B");
      expect(sendMessage.mock.calls[1][0]).toBe("237693663641@c.us");
      expect(sendMessage.mock.calls[2][0]).toBe("185533997277186@lid");
      expect(sendMessage.mock.calls[2][2]).toEqual(
        expect.objectContaining({
          sendMediaAsDocument: true,
          sendSeen: false,
          caption: "Bulletin",
        })
      );
      expect(messageId).toBe("true_1855@lid_PDF");
    });

    it("throws when getNumberId finds no WhatsApp account", async () => {
      const sendMessage = jest.fn();
      const getNumberId = jest.fn().mockResolvedValue(null);

      await expect(
        sendDocumentDmToWhatsapp(
          { sendMessage, getNumberId },
          {
            chatId: "237690000000@c.us",
            filename: "bulletin.pdf",
            pdfBase64: validBase64,
          }
        )
      ).rejects.toThrow(/not registered on WhatsApp/i);
      expect(sendMessage).not.toHaveBeenCalled();
    });
  });
});
