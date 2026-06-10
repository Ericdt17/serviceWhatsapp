"use strict";

jest.mock("../../lib/botHealthStatus", () => ({
  getBotHealthStatus: jest.fn(),
}));

describe("staffCommands", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function dmMsg(body) {
    return {
      body,
      reply: jest.fn().mockResolvedValue(undefined),
      getChat: jest.fn().mockResolvedValue({
        isGroup: false,
        id: { _serialized: "237612345678@c.us" },
      }),
    };
  }

  function groupMsg(body) {
    return {
      body,
      reply: jest.fn(),
      getChat: jest.fn().mockResolvedValue({
        isGroup: true,
        id: { _serialized: "120363@g.us" },
      }),
    };
  }

  it("isStaffCommand matches #ping and #status", () => {
    const { isStaffCommand } = require("../../handlers/staffCommands");
    expect(isStaffCommand("#ping")).toBe(true);
    expect(isStaffCommand("  #STATUS  ")).toBe(true);
    expect(isStaffCommand("hello")).toBe(false);
  });

  it("handleStaffCommand replies to #ping in DM", async () => {
    const { handleStaffCommand } = require("../../handlers/staffCommands");
    const msg = dmMsg("#ping");
    const client = {};
    const handled = await handleStaffCommand(msg, client);
    expect(handled).toBe(true);
    expect(msg.reply).toHaveBeenCalledWith(expect.stringMatching(/Pong/));
  });

  it("handleStaffCommand ignores #ping in group", async () => {
    const { handleStaffCommand } = require("../../handlers/staffCommands");
    const msg = groupMsg("#ping");
    const handled = await handleStaffCommand(msg, {});
    expect(handled).toBe(false);
    expect(msg.reply).not.toHaveBeenCalled();
  });

  it("handleStaffCommand formats #status from health snapshot", async () => {
    const health = require("../../lib/botHealthStatus");
    health.getBotHealthStatus.mockResolvedValue({
      ready: true,
      state: "CONNECTED",
      clientReady: true,
      coreApiOk: true,
      coreApiSkipped: false,
      circuitOpen: false,
      circuitRemainingMs: 0,
      clientId: "test-bot",
      metrics: {
        ordersOk: 3,
        ordersFailed: 1,
        ordersSkippedIdempotent: 2,
        uptimeSeconds: 120,
      },
    });

    const { handleStaffCommand, formatStatusMessage } = require("../../handlers/staffCommands");
    const text = formatStatusMessage(await health.getBotHealthStatus());
    expect(text).toMatch(/WhatsApp: OK/);
    expect(text).toMatch(/Commandes OK: 3/);

    const msg = dmMsg("#status");
    await handleStaffCommand(msg, {});
    expect(msg.reply).toHaveBeenCalledWith(expect.stringMatching(/LivSight Bot/));
  });
});
