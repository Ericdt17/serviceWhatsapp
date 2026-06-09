"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

describe("failedOrderDeadLetter", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "failed-orders-"));
    process.env.FAILED_ORDERS_DIR = tmpDir;
    jest.resetModules();
  });

  afterEach(() => {
    delete process.env.FAILED_ORDERS_DIR;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes JSON payload with order context and error", () => {
    const deadLetter = require("../../lib/failedOrderDeadLetter");
    const filePath = deadLetter.writeFailedOrder({
      whatsappMessageId: "true_120363@g.us_ABC",
      whatsappGroupId: "120363@g.us",
      messageText: "612345678\n2 robes\n15000\nMakepe",
      parsed: { phone: "612345678", items: "2 robes", amount_due: 15000 },
      linkedClient: { keycloakId: "client-1" },
      viaAi: false,
      error: Object.assign(new Error("validation failed"), {
        status: 400,
        formatted: "HTTP 400",
      }),
    });

    expect(filePath).toBeTruthy();
    expect(fs.existsSync(filePath)).toBe(true);
    const saved = JSON.parse(fs.readFileSync(filePath, "utf8"));
    expect(saved.whatsappMessageId).toBe("true_120363@g.us_ABC");
    expect(saved.clientKeycloakId).toBe("client-1");
    expect(saved.error.status).toBe(400);
  });
});
