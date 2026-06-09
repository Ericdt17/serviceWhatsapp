"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

describe("orderIdempotency", () => {
  let tmpDir;
  let tmpFile;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "order-idem-"));
    tmpFile = path.join(tmpDir, "submitted.json");
    process.env.ORDER_IDEMPOTENCY_FILE = tmpFile;
    jest.resetModules();
  });

  afterEach(() => {
    delete process.env.ORDER_IDEMPOTENCY_FILE;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("tryAcquire blocks duplicate and pending message ids", () => {
    const idem = require("../../lib/orderIdempotency");
    idem.resetForTests();

    expect(idem.tryAcquire("msg-1")).toBe(true);
    expect(idem.tryAcquire("msg-1")).toBe(false);
    expect(idem.isPending("msg-1")).toBe(true);

    idem.markSubmitted("msg-1", { transactionRef: "tx-42" });
    expect(idem.isSubmitted("msg-1")).toBe(true);
    expect(idem.isPending("msg-1")).toBe(false);
    expect(idem.tryAcquire("msg-1")).toBe(false);
  });

  it("release allows retry after failed POST", () => {
    const idem = require("../../lib/orderIdempotency");
    idem.resetForTests();

    expect(idem.tryAcquire("msg-2")).toBe(true);
    idem.release("msg-2");
    expect(idem.tryAcquire("msg-2")).toBe(true);
  });

  it("persists submitted ids to disk and reloads", () => {
    const idem = require("../../lib/orderIdempotency");
    idem.resetForTests();
    idem.markSubmitted("msg-3", { transactionRef: "tx-99" });

    jest.resetModules();
    process.env.ORDER_IDEMPOTENCY_FILE = tmpFile;
    const reloaded = require("../../lib/orderIdempotency");
    expect(reloaded.isSubmitted("msg-3")).toBe(true);
    expect(reloaded.tryAcquire("msg-3")).toBe(false);
  });
});
