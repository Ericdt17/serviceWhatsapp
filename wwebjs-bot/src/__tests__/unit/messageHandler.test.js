"use strict";

jest.mock("../../config", () => ({
  USE_CORE_API: true,
  GROUP_ID: null,
  AI_DELIVERY_FALLBACK_ENABLED: false,
  FORMAT_REMINDER_ENABLED: false,
  SEND_CONFIRMATIONS: "false",
}));

jest.mock("../../db", () => ({
  findDeliveryByMessageId: jest.fn(),
  findDeliveryByPhoneForUpdate: jest.fn(),
}));

jest.mock("../../utils/group-manager", () => ({
  getGroup: jest.fn(),
}));

jest.mock("../../handlers/statusUpdateHandler", () => ({
  handleStatusUpdate: jest.fn(),
}));

jest.mock("../../services/coreApiClient", () => ({
  getClientByWhatsappGroup: jest.fn(),
}));

jest.mock("../../handlers/deliveryHandler", () => ({
  handleDelivery: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../lib/botAlerts", () => ({
  notifyClientLookupFailed: jest.fn(),
  notifyMessageError: jest.fn(),
}));

jest.mock("../../handlers/staffCommands", () => ({
  handleStaffCommand: jest.fn().mockResolvedValue(false),
}));

const config = require("../../config");
const coreApi = require("../../services/coreApiClient");
const { handleDelivery } = require("../../handlers/deliveryHandler");
const botAlerts = require("../../lib/botAlerts");
const { handleStaffCommand } = require("../../handlers/staffCommands");

describe("messageHandler onMessage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    handleStaffCommand.mockResolvedValue(false);
  });

  function groupOrderMsg(overrides = {}) {
    const groupId = "120363424985037911@g.us";
    return {
      body: "670111001\nAcide Glycolique\n5000\nAkwa",
      from: groupId,
      author: "185533997277186@lid",
      fromMe: false,
      reply: jest.fn().mockResolvedValue(undefined),
      getChat: jest.fn().mockRejectedValue(new Error("r")),
      getContact: jest.fn().mockRejectedValue(new Error("r")),
      id: { _serialized: `false_${groupId}_ABC`, remote: groupId },
      ...overrides,
    };
  }

  function clientStub() {
    return {
      sendMessage: jest.fn().mockResolvedValue(undefined),
      pupPage: null,
    };
  }

  it("does not crash when getChat fails and still calls handleDelivery for group order", async () => {
    const { onMessage } = require("../../handlers/messageHandler");
    coreApi.getClientByWhatsappGroup.mockResolvedValue({
      keycloakId: "kc-client-1",
      source: "api",
    });
    const msg = groupOrderMsg();
    const client = clientStub();

    await expect(onMessage(msg, client)).resolves.toBeUndefined();
    expect(handleDelivery).toHaveBeenCalledTimes(1);
    expect(handleDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        messageText: msg.body,
        linkedClient: expect.objectContaining({ keycloakId: "kc-client-1" }),
        whatsappGroupId: "120363424985037911@g.us",
        config,
      })
    );
    expect(botAlerts.notifyMessageError).not.toHaveBeenCalled();
  });

  it("sends group id on #link when getChat fails but from is @g.us", async () => {
    const { onMessage } = require("../../handlers/messageHandler");
    const groupId = "120363424985037911@g.us";
    const msg = groupOrderMsg({ body: "#link", from: groupId });
    const client = clientStub();

    await onMessage(msg, client);

    expect(handleDelivery).not.toHaveBeenCalled();
    expect(client.sendMessage).toHaveBeenCalledWith(
      groupId,
      expect.stringContaining(groupId)
    );
  });

  it("tells user to use the group when #link is sent in DM", async () => {
    const { onMessage } = require("../../handlers/messageHandler");
    const msg = {
      body: "#link",
      from: "27058294014021@lid",
      fromMe: false,
      reply: jest.fn().mockResolvedValue(undefined),
      getChat: jest.fn().mockRejectedValue(new Error("r")),
      id: { _serialized: "dm1" },
    };
    const client = clientStub();

    await onMessage(msg, client);

    expect(msg.reply).toHaveBeenCalledWith(
      expect.stringMatching(/groupe/i)
    );
    expect(client.sendMessage).not.toHaveBeenCalled();
    expect(handleDelivery).not.toHaveBeenCalled();
  });

  it("skips messages from the bot itself", async () => {
    const { onMessage } = require("../../handlers/messageHandler");
    const msg = groupOrderMsg({ fromMe: true });
    await onMessage(msg, clientStub());
    expect(handleDelivery).not.toHaveBeenCalled();
    expect(coreApi.getClientByWhatsappGroup).not.toHaveBeenCalled();
  });

  it("skips delivery and notifies when group is not linked (404)", async () => {
    const { onMessage } = require("../../handlers/messageHandler");
    coreApi.getClientByWhatsappGroup.mockResolvedValue(null);
    const msg = groupOrderMsg();

    await onMessage(msg, clientStub());

    expect(handleDelivery).not.toHaveBeenCalled();
    expect(botAlerts.notifyClientLookupFailed).toHaveBeenCalledWith(
      { status: 404 },
      expect.objectContaining({
        whatsappGroupId: "120363424985037911@g.us",
      })
    );
  });
});
