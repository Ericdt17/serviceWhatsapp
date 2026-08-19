"use strict";

const {
  replyInWhatsappGroup,
  quoteIdCandidates,
} = require("../../lib/waGroupReply");

describe("quoteIdCandidates", () => {
  it("includes serialized, short id, and group-prefixed keys", () => {
    const ids = quoteIdCandidates(
      { id: { _serialized: "false_120363@g.us_ABC", id: "ABC", remote: "120363@g.us" } },
      "120363@g.us"
    );
    expect(ids).toEqual(
      expect.arrayContaining([
        "false_120363@g.us_ABC",
        "ABC",
        "false_120363@g.us_ABC",
      ])
    );
  });
});

describe("replyInWhatsappGroup", () => {
  it("sends a quoted reply via puppeteer Store lookup first", async () => {
    const evaluate = jest.fn().mockResolvedValue({
      ok: true,
      quoted: true,
      usedId: "false_120363@g.us_ABC",
    });
    const sendMessage = jest.fn();
    const msg = {
      id: { _serialized: "false_120363@g.us_ABC", id: "ABC" },
      reply: jest.fn(),
    };

    await replyInWhatsappGroup({
      client: { sendMessage, pupPage: { evaluate, isClosed: () => false } },
      whatsappGroupId: "120363@g.us",
      msg,
      text: "Commande déjà enregistrée (143)",
    });

    expect(evaluate).toHaveBeenCalledWith(
      expect.any(Function),
      "120363@g.us",
      "Commande déjà enregistrée (143)",
      expect.arrayContaining(["false_120363@g.us_ABC", "ABC"])
    );
    expect(sendMessage).not.toHaveBeenCalled();
    expect(msg.reply).not.toHaveBeenCalled();
  });

  it("does not fall back when puppeteer sent a quote even if ok is false", async () => {
    const evaluate = jest.fn().mockResolvedValue({
      ok: false,
      quoted: true,
      usedId: "false_120363@g.us_ABC",
    });
    const sendMessage = jest.fn();
    const msg = {
      id: { _serialized: "false_120363@g.us_ABC", id: "ABC" },
      reply: jest.fn(),
    };

    await replyInWhatsappGroup({
      client: { sendMessage, pupPage: { evaluate, isClosed: () => false } },
      whatsappGroupId: "120363@g.us",
      msg,
      text: "Commande déjà enregistrée (143)",
    });

    expect(sendMessage).not.toHaveBeenCalled();
    expect(msg.reply).not.toHaveBeenCalled();
  });

  it("falls back to msg.reply with explicit group chatId", async () => {
    const evaluate = jest.fn().mockResolvedValue({
      ok: false,
      error: "quoted_msg_not_in_store",
    });
    const sendMessage = jest.fn();
    const msg = {
      id: { _serialized: "false_120363@g.us_ABC", id: "ABC" },
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await replyInWhatsappGroup({
      client: { sendMessage, pupPage: { evaluate, isClosed: () => false } },
      whatsappGroupId: "120363@g.us",
      msg,
      text: "hello",
    });

    expect(msg.reply).toHaveBeenCalledWith("hello", "120363@g.us", {
      sendSeen: false,
      ignoreQuoteErrors: false,
    });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("sends to the group with quotedMessageId when puppeteer is unavailable", async () => {
    const sendMessage = jest.fn().mockResolvedValue({});
    const msg = { id: { _serialized: "false_120363@g.us_ABC" } };

    await replyInWhatsappGroup({
      client: { sendMessage },
      whatsappGroupId: "120363@g.us",
      msg,
      text: "Commande déjà enregistrée (143)",
    });

    expect(sendMessage).toHaveBeenCalledWith(
      "120363@g.us",
      "Commande déjà enregistrée (143)",
      expect.objectContaining({
        quotedMessageId: "false_120363@g.us_ABC",
        sendSeen: false,
        ignoreQuoteErrors: false,
      })
    );
  });

  it("falls back to unquoted group send if quote fails", async () => {
    const sendMessage = jest
      .fn()
      .mockRejectedValueOnce(new Error("Could not get the quoted message."))
      .mockResolvedValueOnce({});
    const msg = { id: { _serialized: "msg-1" } };

    await replyInWhatsappGroup({
      client: { sendMessage },
      whatsappGroupId: "120363@g.us",
      msg,
      text: "hello",
    });

    expect(sendMessage).toHaveBeenNthCalledWith(2, "120363@g.us", "hello", {
      sendSeen: false,
    });
  });

  it("falls back to msg.reply if group send is unavailable", async () => {
    const msg = {
      id: { _serialized: "msg-1" },
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await replyInWhatsappGroup({
      client: {},
      whatsappGroupId: "120363@g.us",
      msg,
      text: "hello",
    });

    expect(msg.reply).toHaveBeenCalledWith("hello", "120363@g.us", {
      sendSeen: false,
      ignoreQuoteErrors: false,
    });
  });
});
