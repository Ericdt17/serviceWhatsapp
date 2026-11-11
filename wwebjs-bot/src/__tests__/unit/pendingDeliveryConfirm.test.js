"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

describe("pendingDeliveryConfirm", () => {
  let tmpFile;
  let pending;

  beforeEach(() => {
    tmpFile = path.join(
      os.tmpdir(),
      `pending-confirm-${Date.now()}-${Math.random().toString(16).slice(2)}.json`
    );
    process.env.DELIVERY_CONFIRM_FILE = tmpFile;
    process.env.DELIVERY_CONFIRM_TIMEOUT_MS = "600000";
    jest.resetModules();
    pending = require("../../lib/pendingDeliveryConfirm");
    pending._resetForTests();
  });

  afterEach(() => {
    delete process.env.DELIVERY_CONFIRM_FILE;
    delete process.env.DELIVERY_CONFIRM_TIMEOUT_MS;
    try {
      fs.unlinkSync(tmpFile);
    } catch (_) {
      /* ignore */
    }
  });

  it("detects confirm and reject replies", () => {
    expect(pending.isConfirmReply("oui")).toBe(true);
    expect(pending.isConfirmReply("OK")).toBe(true);
    expect(pending.isConfirmReply("humm")).toBe(false);
    expect(pending.isRejectReply("non")).toBe(true);
    expect(pending.isRejectReply("oui")).toBe(false);
  });

  it("buildConfirmPrompt includes fields and oui instruction", () => {
    const text = pending.buildConfirmPrompt({
      phone: "699123456",
      items: "2 robes",
      amount_due: 15000,
      quartier: "Makepe",
    });
    expect(text).toMatch(/699123456/);
    expect(text).toMatch(/2 robes/);
    expect(text).toMatch(/15000/);
    expect(text).toMatch(/Makepe/);
    expect(text).toMatch(/oui/i);
  });

  it("stores and consumes pending by author within timeout", () => {
    pending.setPending({
      whatsappGroupId: "g1",
      author: "a1",
      sourceMessageId: "msg-1",
      parsed: { phone: "699123456", items: "robes", amount_due: 1000 },
      messageText: "messy",
      linkedClient: { keycloakId: "kc" },
    });
    const got = pending.getPending("g1", "a1");
    expect(got.sourceMessageId).toBe("msg-1");
    const consumed = pending.consumePending("g1", "a1");
    expect(consumed.sourceMessageId).toBe("msg-1");
    expect(pending.getPending("g1", "a1")).toBeNull();
  });

  it("expires pending after timeout", () => {
    pending.setPending({
      whatsappGroupId: "g1",
      author: "a1",
      sourceMessageId: "msg-1",
      parsed: { phone: "699123456", items: "robes", amount_due: 1000 },
      messageText: "messy",
      linkedClient: { keycloakId: "kc" },
      timeoutMs: 1,
    });
    const start = Date.now();
    while (Date.now() - start < 5) {
      /* spin */
    }
    expect(pending.getPending("g1", "a1")).toBeNull();
  });

  it("persists across module reload", () => {
    pending.setPending({
      whatsappGroupId: "g1",
      author: "a1",
      sourceMessageId: "msg-persist",
      parsed: { phone: "699123456", items: "robes", amount_due: 1000 },
      messageText: "messy",
      linkedClient: { keycloakId: "kc" },
    });
    jest.resetModules();
    const pending2 = require("../../lib/pendingDeliveryConfirm");
    pending2._resetForTests();
    // force reload from file
    const again = require("../../lib/pendingDeliveryConfirm");
    // _resetForTests clears memory and loaded flag — call getPending which loads file
    // After _resetForTests, ensureLoaded reads file again
    const got = again.getPending("g1", "a1");
    expect(got?.sourceMessageId).toBe("msg-persist");
  });
});
