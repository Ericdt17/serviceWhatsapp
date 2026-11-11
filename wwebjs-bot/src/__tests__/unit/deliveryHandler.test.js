"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

jest.mock("../../db", () => ({
  createDelivery: jest.fn(),
  findDeliveryByMessageId: jest.fn(),
}));

jest.mock("../../services/coreApiClient", () => ({
  createTransaction: jest.fn(),
}));

jest.mock("../../lib/aiDeliveryExtract", () => ({
  extractDeliveryWithAI: jest.fn(),
  validateAndNormalizeAiDelivery: jest.fn(),
}));

jest.mock("../../lib/orderIdempotency", () => ({
  tryAcquire: jest.fn().mockReturnValue(true),
  isSubmitted: jest.fn().mockReturnValue(false),
  markSubmitted: jest.fn(),
  release: jest.fn(),
}));

jest.mock("../../lib/failedOrderDeadLetter", () => ({
  writeFailedOrder: jest.fn(),
}));

jest.mock("../../lib/botAlerts", () => ({
  notifyDeliverySaveFailed: jest.fn(),
  notifyMessageError: jest.fn(),
}));

const coreApi = require("../../services/coreApiClient");
const {
  extractDeliveryWithAI,
  validateAndNormalizeAiDelivery,
} = require("../../lib/aiDeliveryExtract");
const orderIdempotency = require("../../lib/orderIdempotency");
const orderSemanticDedup = require("../../lib/orderSemanticDedup");
const failedOrderDeadLetter = require("../../lib/failedOrderDeadLetter");
const pendingDeliveryConfirm = require("../../lib/pendingDeliveryConfirm");
const { handleDelivery, duplicateOrderReplyText } = require("../../handlers/deliveryHandler");

const LABELED_FR =
  "- nom du destinataire : Aboah Elogo Thania\n" +
  "- numéro de téléphone : +237 6 58 63 56 03\n" +
  "- désignation: 03 savons (2 Mouinda + 1 Nyanga)\n" +
  "- destination : Douala\n" +
  "- montant : 10000";

describe("deliveryHandler handleDelivery (core mode)", () => {
  const linkedClient = { keycloakId: "kc-1", source: "api" };
  const whatsappGroupId = "120363@g.us";
  let tmpDir;

  function baseConfig(overrides = {}) {
    return {
      USE_CORE_API: true,
      AI_DELIVERY_FALLBACK_ENABLED: true,
      OPENAI_API_KEY: "sk-test",
      FORMAT_REMINDER_ENABLED: true,
      FORMAT_REMINDER_COOLDOWN_MS: 0,
      SEND_CONFIRMATIONS: "false",
      GROUP_ID: null,
      ORDER_SEMANTIC_DEDUP_ENABLED: true,
      ORDER_SEMANTIC_DEDUP_WINDOW_MS: 600000,
      DELIVERY_CONFIRM_TIMEOUT_MS: 600000,
      ...overrides,
    };
  }

  function msgStub(body, id = "msg-1") {
    return {
      body,
      id: { _serialized: id },
      timestamp: Math.floor(Date.now() / 1000),
      author: "1855@lid",
      from: whatsappGroupId,
      reply: jest.fn().mockResolvedValue(undefined),
    };
  }

  function clientStub() {
    return {
      sendMessage: jest.fn().mockResolvedValue({}),
      pupPage: {
        evaluate: jest.fn().mockResolvedValue({
          ok: true,
          quoted: true,
          usedId: "quoted-1",
        }),
        isClosed: () => false,
      },
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "order-sem-handler-"));
    process.env.ORDER_SEMANTIC_DEDUP_FILE = path.join(tmpDir, "fp.json");
    process.env.DELIVERY_CONFIRM_FILE = path.join(tmpDir, "pending-confirm.json");
    orderSemanticDedup.resetForTests();
    pendingDeliveryConfirm._resetForTests();
    orderIdempotency.tryAcquire.mockReturnValue(true);
    orderIdempotency.isSubmitted.mockReturnValue(false);
    coreApi.createTransaction.mockResolvedValue({
      transactionReference: "TX-1",
      _transactionRef: "TX-1",
    });
  });

  afterEach(() => {
    delete process.env.ORDER_SEMANTIC_DEDUP_FILE;
    delete process.env.DELIVERY_CONFIRM_FILE;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("strict 4-line valid message calls createTransaction once", async () => {
    const messageText = "670111001\nAcide Glycolique\n5000\nAkwa";
    const msg = msgStub(messageText, "strict-1");

    await handleDelivery({
      messageText,
      msg,
      group: null,
      agencyId: null,
      linkedClient,
      client: {},
      config: baseConfig(),
      whatsappGroupId,
    });

    expect(coreApi.createTransaction).toHaveBeenCalledTimes(1);
    expect(coreApi.createTransaction).toHaveBeenCalledWith(
      "kc-1",
      expect.objectContaining({
        valid: true,
        phone: expect.any(String),
      }),
      messageText,
      "strict-1",
      expect.any(Object)
    );
    expect(orderIdempotency.tryAcquire).toHaveBeenCalledWith("strict-1");
    expect(extractDeliveryWithAI).not.toHaveBeenCalled();
  });

  it("labeled French AI path asks confirm and does not create yet", async () => {
    const msg = msgStub(LABELED_FR, "ai-1");
    extractDeliveryWithAI.mockResolvedValue({
      ok: true,
      raw: { phone: "658635603", items: "savons", amount: 10000, quartier: "douala" },
    });
    validateAndNormalizeAiDelivery.mockReturnValue({
      phone: "658635603",
      items: "savons",
      amount_due: 10000,
      quartier: "douala",
      valid: true,
    });

    await handleDelivery({
      messageText: LABELED_FR,
      msg,
      group: null,
      agencyId: null,
      linkedClient,
      client: {},
      config: baseConfig(),
      whatsappGroupId,
    });

    expect(extractDeliveryWithAI).toHaveBeenCalledWith(LABELED_FR, expect.any(Object));
    expect(coreApi.createTransaction).not.toHaveBeenCalled();
    expect(msg.reply).toHaveBeenCalledWith(
      expect.stringMatching(/Confirmer cette livraison[\s\S]*oui/i)
    );
    expect(
      pendingDeliveryConfirm.getPending(whatsappGroupId, "1855@lid")
    ).not.toBeNull();
  });

  it("oui after AI confirm creates transaction", async () => {
    const orderMsg = msgStub(LABELED_FR, "ai-confirm-1");
    extractDeliveryWithAI.mockResolvedValue({ ok: true, raw: {} });
    validateAndNormalizeAiDelivery.mockReturnValue({
      phone: "658635603",
      items: "savons",
      amount_due: 10000,
      quartier: "douala",
    });

    await handleDelivery({
      messageText: LABELED_FR,
      msg: orderMsg,
      group: null,
      agencyId: null,
      linkedClient,
      client: {},
      config: baseConfig(),
      whatsappGroupId,
    });
    expect(coreApi.createTransaction).not.toHaveBeenCalled();

    const ouiMsg = msgStub("oui", "oui-1");
    await handleDelivery({
      messageText: "oui",
      msg: ouiMsg,
      group: null,
      agencyId: null,
      linkedClient,
      client: {},
      config: baseConfig(),
      whatsappGroupId,
    });

    expect(coreApi.createTransaction).toHaveBeenCalledTimes(1);
    expect(coreApi.createTransaction).toHaveBeenCalledWith(
      "kc-1",
      expect.objectContaining({ phone: "658635603", amount_due: 10000 }),
      LABELED_FR,
      "ai-confirm-1",
      expect.any(Object)
    );
    expect(
      pendingDeliveryConfirm.getPending(whatsappGroupId, "1855@lid")
    ).toBeNull();
  });

  it("non after AI confirm clears pending without create", async () => {
    const orderMsg = msgStub(LABELED_FR, "ai-reject-1");
    extractDeliveryWithAI.mockResolvedValue({ ok: true, raw: {} });
    validateAndNormalizeAiDelivery.mockReturnValue({
      phone: "658635603",
      items: "savons",
      amount_due: 10000,
      quartier: "douala",
    });

    await handleDelivery({
      messageText: LABELED_FR,
      msg: orderMsg,
      group: null,
      agencyId: null,
      linkedClient,
      client: {},
      config: baseConfig(),
      whatsappGroupId,
    });

    const nonMsg = msgStub("non", "non-1");
    await handleDelivery({
      messageText: "non",
      msg: nonMsg,
      group: null,
      agencyId: null,
      linkedClient,
      client: {},
      config: baseConfig(),
      whatsappGroupId,
    });

    expect(coreApi.createTransaction).not.toHaveBeenCalled();
    expect(nonMsg.reply).toHaveBeenCalledWith(
      expect.stringMatching(/non enregistrée/i)
    );
    expect(
      pendingDeliveryConfirm.getPending(whatsappGroupId, "1855@lid")
    ).toBeNull();
  });

  it("oui then Core 400 writes dead letter", async () => {
    const orderMsg = msgStub(LABELED_FR, "ai-fail-1");
    extractDeliveryWithAI.mockResolvedValue({ ok: true, raw: {} });
    validateAndNormalizeAiDelivery.mockReturnValue({
      phone: "658635603",
      items: "savons",
      amount_due: 10000,
      quartier: "douala",
    });

    await handleDelivery({
      messageText: LABELED_FR,
      msg: orderMsg,
      group: null,
      agencyId: null,
      linkedClient,
      client: {},
      config: baseConfig(),
      whatsappGroupId,
    });

    const err = Object.assign(new Error("Create transaction failed (400)"), {
      status: 400,
      message: "packageDescription: size must be between 0 and 160",
    });
    coreApi.createTransaction.mockRejectedValue(err);

    const ouiMsg = msgStub("oui", "oui-fail-1");
    await handleDelivery({
      messageText: "oui",
      msg: ouiMsg,
      group: null,
      agencyId: null,
      linkedClient,
      client: {},
      config: baseConfig(),
      whatsappGroupId,
    });

    expect(failedOrderDeadLetter.writeFailedOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        viaAi: true,
        whatsappMessageId: "ai-fail-1",
        error: err,
      })
    );
  });

  it("idempotent replay skips createTransaction", async () => {
    const messageText = "670111002\nCrème hydratante\n8000\nBonapriso";
    const msg = msgStub(messageText, "idem-1");
    orderIdempotency.tryAcquire.mockReturnValue(false);

    await handleDelivery({
      messageText,
      msg,
      group: null,
      agencyId: null,
      linkedClient,
      client: {},
      config: baseConfig({ AI_DELIVERY_FALLBACK_ENABLED: false }),
      whatsappGroupId,
    });

    expect(coreApi.createTransaction).not.toHaveBeenCalled();
  });

  it("excluded status-like text does not call Core", async () => {
    const messageText = "livré ce matin pour le client";
    const msg = msgStub(messageText, "excl-1");

    await handleDelivery({
      messageText,
      msg,
      group: null,
      agencyId: null,
      linkedClient,
      client: {},
      config: baseConfig(),
      whatsappGroupId,
    });

    expect(coreApi.createTransaction).not.toHaveBeenCalled();
    expect(extractDeliveryWithAI).not.toHaveBeenCalled();
  });

  it("quoted reply with non-order text does not create transaction or call AI", async () => {
    const messageText = "???";
    const msg = { ...msgStub(messageText, "reply-1"), hasQuotedMsg: true };

    await handleDelivery({
      messageText,
      msg,
      group: null,
      agencyId: null,
      linkedClient,
      client: {},
      config: baseConfig(),
      whatsappGroupId,
    });

    expect(coreApi.createTransaction).not.toHaveBeenCalled();
    expect(extractDeliveryWithAI).not.toHaveBeenCalled();
    expect(msg.reply).not.toHaveBeenCalled();
  });

  it("quoted reply with strict 4-line order still creates transaction", async () => {
    const messageText = "670111001\nAcide Glycolique\n5000\nAkwa";
    const msg = { ...msgStub(messageText, "reply-strict-1"), hasQuotedMsg: true };

    await handleDelivery({
      messageText,
      msg,
      group: null,
      agencyId: null,
      linkedClient,
      client: {},
      config: baseConfig({ AI_DELIVERY_FALLBACK_ENABLED: false }),
      whatsappGroupId,
    });

    expect(coreApi.createTransaction).toHaveBeenCalledTimes(1);
  });

  it("second identical 4-line order skips Core and replies déjà enregistrée", async () => {
    const messageText = "670111001\nAcide Glycolique\n5000\nAkwa";
    const first = msgStub(messageText, "sem-1");
    const second = msgStub(messageText, "sem-2");
    const client = clientStub();
    const config = baseConfig({ AI_DELIVERY_FALLBACK_ENABLED: false });

    await handleDelivery({
      messageText,
      msg: first,
      group: null,
      agencyId: null,
      linkedClient,
      client,
      config,
      whatsappGroupId,
    });
    await handleDelivery({
      messageText,
      msg: second,
      group: null,
      agencyId: null,
      linkedClient,
      client,
      config,
      whatsappGroupId,
    });

    expect(coreApi.createTransaction).toHaveBeenCalledTimes(1);
    expect(client.pupPage.evaluate).toHaveBeenCalledWith(
      expect.any(Function),
      whatsappGroupId,
      expect.stringMatching(/déjà sur le dashboard/i),
      expect.arrayContaining(["sem-2"])
    );
    expect(client.pupPage.evaluate.mock.calls[0][2]).toMatch(
      /ne renvoyez pas le même message/i
    );
    expect(client.sendMessage).not.toHaveBeenCalled();
    expect(second.reply).not.toHaveBeenCalled();
    expect(orderIdempotency.markSubmitted).toHaveBeenCalledWith(
      "sem-2",
      expect.objectContaining({ transactionRef: "TX-1" })
    );
  });

  it("same phone and amount with different items still creates two transactions", async () => {
    const config = baseConfig({ AI_DELIVERY_FALLBACK_ENABLED: false });
    await handleDelivery({
      messageText: "670111001\nAcide Glycolique\n5000\nAkwa",
      msg: msgStub("670111001\nAcide Glycolique\n5000\nAkwa", "items-1"),
      group: null,
      agencyId: null,
      linkedClient,
      client: {},
      config,
      whatsappGroupId,
    });
    await handleDelivery({
      messageText: "670111001\nSavon noir\n5000\nAkwa",
      msg: msgStub("670111001\nSavon noir\n5000\nAkwa", "items-2"),
      group: null,
      agencyId: null,
      linkedClient,
      client: {},
      config,
      whatsappGroupId,
    });

    expect(coreApi.createTransaction).toHaveBeenCalledTimes(2);
  });

  it("disabled semantic dedup allows two identical orders", async () => {
    const messageText = "670111001\nAcide Glycolique\n5000\nAkwa";
    const config = baseConfig({
      AI_DELIVERY_FALLBACK_ENABLED: false,
      ORDER_SEMANTIC_DEDUP_ENABLED: false,
    });

    await handleDelivery({
      messageText,
      msg: msgStub(messageText, "off-1"),
      group: null,
      agencyId: null,
      linkedClient,
      client: {},
      config,
      whatsappGroupId,
    });
    await handleDelivery({
      messageText,
      msg: msgStub(messageText, "off-2"),
      group: null,
      agencyId: null,
      linkedClient,
      client: {},
      config,
      whatsappGroupId,
    });

    expect(coreApi.createTransaction).toHaveBeenCalledTimes(2);
  });

  describe("LIV-37 regression paths", () => {
    it("casual phone chitchat does not call AI or create", async () => {
      const messageText = "Je viens d'appeler le 699123456\n15k";
      await handleDelivery({
        messageText,
        msg: msgStub(messageText, "chat-1"),
        group: null,
        agencyId: null,
        linkedClient,
        client: {},
        config: baseConfig(),
        whatsappGroupId,
      });
      expect(extractDeliveryWithAI).not.toHaveBeenCalled();
      expect(coreApi.createTransaction).not.toHaveBeenCalled();
    });

    it("price-only chat does not create", async () => {
      const messageText = "c'est 15k pour toi";
      await handleDelivery({
        messageText,
        msg: msgStub(messageText, "price-1"),
        group: null,
        agencyId: null,
        linkedClient,
        client: {},
        config: baseConfig(),
        whatsappGroupId,
      });
      expect(extractDeliveryWithAI).not.toHaveBeenCalled();
      expect(coreApi.createTransaction).not.toHaveBeenCalled();
    });

    it("expired pending confirm does not create on oui", async () => {
      pendingDeliveryConfirm.setPending({
        whatsappGroupId,
        author: "1855@lid",
        sourceMessageId: "expired-src",
        parsed: {
          phone: "699123456",
          items: "robes",
          amount_due: 15000,
          quartier: "makepe",
        },
        messageText: "messy",
        linkedClient,
        timeoutMs: 1,
      });
      const start = Date.now();
      while (Date.now() - start < 5) {
        /* spin */
      }

      await handleDelivery({
        messageText: "oui",
        msg: msgStub("oui", "oui-expired"),
        group: null,
        agencyId: null,
        linkedClient,
        client: {},
        config: baseConfig(),
        whatsappGroupId,
      });

      expect(coreApi.createTransaction).not.toHaveBeenCalled();
    });

    it("messy AI order asks confirm then creates only after oui", async () => {
      const messy =
        "Bonjour voici une commande\nTel 699000111\n2 robes pour cliente\n12000\nvers Akwa merci";
      extractDeliveryWithAI.mockResolvedValue({ ok: true, raw: {} });
      validateAndNormalizeAiDelivery.mockReturnValue({
        phone: "699000111",
        items: "2 robes",
        amount_due: 12000,
        quartier: "akwa",
      });

      await handleDelivery({
        messageText: messy,
        msg: msgStub(messy, "messy-1"),
        group: null,
        agencyId: null,
        linkedClient,
        client: {},
        config: baseConfig(),
        whatsappGroupId,
      });
      expect(coreApi.createTransaction).not.toHaveBeenCalled();
      expect(extractDeliveryWithAI).toHaveBeenCalled();

      await handleDelivery({
        messageText: "oui",
        msg: msgStub("oui", "messy-oui"),
        group: null,
        agencyId: null,
        linkedClient,
        client: {},
        config: baseConfig(),
        whatsappGroupId,
      });
      expect(coreApi.createTransaction).toHaveBeenCalledTimes(1);
      expect(coreApi.createTransaction).toHaveBeenCalledWith(
        "kc-1",
        expect.objectContaining({ phone: "699000111", amount_due: 12000 }),
        messy,
        "messy-1",
        expect.any(Object)
      );
    });
  });
});

describe("duplicateOrderReplyText", () => {
  it("is short and tells the vendor not to resend", () => {
    expect(duplicateOrderReplyText("145")).toBe(
      "✅ Commande #145 déjà sur le dashboard.\n\nVérifiez-la, ne renvoyez pas le même message."
    );
  });
});
