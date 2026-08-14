"use strict";

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
const failedOrderDeadLetter = require("../../lib/failedOrderDeadLetter");
const { handleDelivery } = require("../../handlers/deliveryHandler");

const LABELED_FR =
  "- nom du destinataire : Aboah Elogo Thania\n" +
  "- numéro de téléphone : +237 6 58 63 56 03\n" +
  "- désignation: 03 savons (2 Mouinda + 1 Nyanga)\n" +
  "- destination : Douala\n" +
  "- montant : 10000";

describe("deliveryHandler handleDelivery (core mode)", () => {
  const linkedClient = { keycloakId: "kc-1", source: "api" };
  const whatsappGroupId = "120363@g.us";

  function baseConfig(overrides = {}) {
    return {
      USE_CORE_API: true,
      AI_DELIVERY_FALLBACK_ENABLED: true,
      OPENAI_API_KEY: "sk-test",
      FORMAT_REMINDER_ENABLED: true,
      FORMAT_REMINDER_COOLDOWN_MS: 0,
      SEND_CONFIRMATIONS: "false",
      GROUP_ID: null,
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

  beforeEach(() => {
    jest.clearAllMocks();
    orderIdempotency.tryAcquire.mockReturnValue(true);
    orderIdempotency.isSubmitted.mockReturnValue(false);
    coreApi.createTransaction.mockResolvedValue({
      transactionReference: "TX-1",
      _transactionRef: "TX-1",
    });
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

  it("labeled French message uses AI then createTransaction", async () => {
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
    expect(coreApi.createTransaction).toHaveBeenCalledTimes(1);
    expect(coreApi.createTransaction.mock.calls[0][1]).toEqual(
      expect.objectContaining({ phone: "658635603", amount_due: 10000 })
    );
  });

  it("AI ok but Core 400 writes dead letter and sends format reminder", async () => {
    const msg = msgStub(LABELED_FR, "ai-fail-1");
    extractDeliveryWithAI.mockResolvedValue({ ok: true, raw: {} });
    validateAndNormalizeAiDelivery.mockReturnValue({
      phone: "658635603",
      items: "savons",
      amount_due: 10000,
      quartier: "douala",
    });
    const err = Object.assign(new Error("Create transaction failed (400)"), {
      status: 400,
      message: 'packageDescription: size must be between 0 and 160',
    });
    coreApi.createTransaction.mockRejectedValue(err);

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

    expect(failedOrderDeadLetter.writeFailedOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        viaAi: true,
        whatsappMessageId: "ai-fail-1",
        error: err,
      })
    );
    expect(msg.reply).toHaveBeenCalledWith(
      expect.stringMatching(/Commande non enregistrée/)
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
});
