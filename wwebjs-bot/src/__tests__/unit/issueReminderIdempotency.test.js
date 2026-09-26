"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

describe("issueReminderIdempotency", () => {
  let tmpDir;
  let tmpFile;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "issue-rem-idem-"));
    tmpFile = path.join(tmpDir, "sent.json");
    process.env.ISSUE_REMINDER_IDEMPOTENCY_FILE = tmpFile;
    jest.resetModules();
  });

  afterEach(() => {
    delete process.env.ISSUE_REMINDER_IDEMPOTENCY_FILE;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("tryAcquire blocks duplicate and pending keys", () => {
    const idem = require("../../lib/issueReminderIdempotency");
    idem.resetForTests();

    expect(idem.tryAcquire("issue:1:created:v1")).toBe(true);
    expect(idem.tryAcquire("issue:1:created:v1")).toBe(false);
    expect(idem.isPending("issue:1:created:v1")).toBe(true);

    idem.markSent("issue:1:created:v1", { messageId: "wa-1", issueId: 1 });
    expect(idem.isSent("issue:1:created:v1")).toBe(true);
    expect(idem.isPending("issue:1:created:v1")).toBe(false);
    expect(idem.tryAcquire("issue:1:created:v1")).toBe(false);
  });

  it("release allows retry after failed send", () => {
    const idem = require("../../lib/issueReminderIdempotency");
    idem.resetForTests();

    expect(idem.tryAcquire("issue:2:due_now:v1")).toBe(true);
    idem.release("issue:2:due_now:v1");
    expect(idem.tryAcquire("issue:2:due_now:v1")).toBe(true);
  });

  it("persists sent keys to disk and reloads", () => {
    const idem = require("../../lib/issueReminderIdempotency");
    idem.resetForTests();
    idem.markSent("issue:3:overdue_2h:v1", { messageId: "wa-3", issueId: 3 });

    jest.resetModules();
    process.env.ISSUE_REMINDER_IDEMPOTENCY_FILE = tmpFile;
    const reloaded = require("../../lib/issueReminderIdempotency");
    expect(reloaded.isSent("issue:3:overdue_2h:v1")).toBe(true);
    expect(reloaded.tryAcquire("issue:3:overdue_2h:v1")).toBe(false);
  });
});
