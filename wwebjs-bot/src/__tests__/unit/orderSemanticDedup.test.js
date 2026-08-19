"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

describe("orderSemanticDedup", () => {
  let tmpDir;
  let tmpFile;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "order-sem-"));
    tmpFile = path.join(tmpDir, "fingerprints.json");
    process.env.ORDER_SEMANTIC_DEDUP_FILE = tmpFile;
    process.env.ORDER_SEMANTIC_DEDUP_WINDOW_MS = "600000";
    jest.resetModules();
  });

  afterEach(() => {
    delete process.env.ORDER_SEMANTIC_DEDUP_FILE;
    delete process.env.ORDER_SEMANTIC_DEDUP_WINDOW_MS;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function baseOrder(overrides = {}) {
    return {
      whatsappGroupId: "120363@g.us",
      phone: "694397546",
      amount_due: 6000,
      items: "Pack homme",
      ...overrides,
    };
  }

  it("same fingerprint in the window is a hit", () => {
    const dedup = require("../../lib/orderSemanticDedup");
    dedup.resetForTests();

    const fp = dedup.fingerprint(baseOrder());
    dedup.remember(fp, { transactionRef: "TX-1" });

    const hit = dedup.findRecent(fp, Date.now());
    expect(hit).not.toBeNull();
    expect(hit.transactionRef).toBe("TX-1");
  });

  it("same phone and amount with different items is a miss", () => {
    const dedup = require("../../lib/orderSemanticDedup");
    dedup.resetForTests();

    const first = dedup.fingerprint(baseOrder({ items: "Pack homme" }));
    const second = dedup.fingerprint(baseOrder({ items: "Pack femme" }));
    expect(first).not.toBe(second);

    dedup.remember(first, { transactionRef: "TX-1" });
    expect(dedup.findRecent(second, Date.now())).toBeNull();
  });

  it("normalizes accents and spacing in items for the same fingerprint", () => {
    const dedup = require("../../lib/orderSemanticDedup");
    const a = dedup.fingerprint(baseOrder({ items: "Crème  bright" }));
    const b = dedup.fingerprint(baseOrder({ items: "creme bright" }));
    expect(a).toBe(b);
  });

  it("expired fingerprint outside the window is a miss", () => {
    const dedup = require("../../lib/orderSemanticDedup");
    dedup.resetForTests();

    const fp = dedup.fingerprint(baseOrder());
    const now = Date.now();
    dedup.remember(fp, { transactionRef: "TX-old", at: new Date(now - 600001).toISOString() });

    expect(dedup.findRecent(fp, now)).toBeNull();
  });

  it("persists fingerprints to disk and reloads", () => {
    const dedup = require("../../lib/orderSemanticDedup");
    dedup.resetForTests();
    const fp = dedup.fingerprint(baseOrder());
    dedup.remember(fp, { transactionRef: "TX-99" });

    jest.resetModules();
    process.env.ORDER_SEMANTIC_DEDUP_FILE = tmpFile;
    process.env.ORDER_SEMANTIC_DEDUP_WINDOW_MS = "600000";
    const reloaded = require("../../lib/orderSemanticDedup");
    const hit = reloaded.findRecent(fp, Date.now());
    expect(hit).not.toBeNull();
    expect(hit.transactionRef).toBe("TX-99");
  });
});
