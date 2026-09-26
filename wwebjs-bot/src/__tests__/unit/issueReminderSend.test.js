"use strict";

const {
  validateIssueReminderBody,
  phoneToChatId,
  sendIssueReminder,
  ISSUE_REMINDER_TYPES,
  MAX_TITLE_LENGTH,
} = require("../../lib/issueReminderSend");

describe("phoneToChatId", () => {
  it("strips non-digits and appends @c.us", () => {
    expect(phoneToChatId("+237 6 90-12-34-56")).toBe("237690123456@c.us");
  });

  it("prefixes 237 for local 9-digit Cameroon mobiles", () => {
    expect(phoneToChatId("693663641")).toBe("237693663641@c.us");
  });

  it("returns null for empty phone", () => {
    expect(phoneToChatId("")).toBeNull();
    expect(phoneToChatId(null)).toBeNull();
  });
});

describe("validateIssueReminderBody", () => {
  const valid = {
    issueId: 123,
    type: "created",
    recipientPhone: "+237690123456",
    title: "Inventaire",
    priority: "high",
    dueDate: "2026-09-26T18:00:00+01:00",
    assignedBy: "Eric",
    idempotencyKey: "issue:123:created:v1",
  };

  it("accepts a valid body", () => {
    const result = validateIssueReminderBody(valid);
    expect(result.ok).toBe(true);
    expect(result.data.issueId).toBe(123);
    expect(result.data.type).toBe("created");
    expect(result.data.chatId).toBe("237690123456@c.us");
    expect(result.data.idempotencyKey).toBe("issue:123:created:v1");
    expect(result.data.dryRun).toBe(false);
  });

  it("requires idempotencyKey", () => {
    const { idempotencyKey, ...rest } = valid;
    const result = validateIssueReminderBody(rest);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/idempotencyKey/i);
  });

  it("rejects unknown type", () => {
    const result = validateIssueReminderBody({ ...valid, type: "nope" });
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/type/i);
  });

  it("rejects title over max length", () => {
    const result = validateIssueReminderBody({
      ...valid,
      title: "x".repeat(MAX_TITLE_LENGTH + 1),
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/title/i);
  });

  it("rejects invalid phone", () => {
    const result = validateIssueReminderBody({
      ...valid,
      recipientPhone: "abc",
    });
    expect(result.ok).toBe(false);
  });

  it("accepts all reminder types", () => {
    for (const type of ISSUE_REMINDER_TYPES) {
      const body =
        type === "report_rejected"
          ? { ...valid, type, reason: "Photos manquantes" }
          : { ...valid, type };
      expect(validateIssueReminderBody(body).ok).toBe(true);
    }
  });

  it("requires reason for report_rejected", () => {
    const result = validateIssueReminderBody({
      ...valid,
      type: "report_rejected",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/reason/i);
  });

  it("accepts dry_run true", () => {
    const result = validateIssueReminderBody({ ...valid, dry_run: true });
    expect(result.ok).toBe(true);
    expect(result.data.dryRun).toBe(true);
  });
});

describe("sendIssueReminder", () => {
  it("resolves via getNumberId then sends to that chat id", async () => {
    const sendMessage = jest.fn().mockResolvedValue({
      id: { _serialized: "true_237690123456@c.us_ABC" },
    });
    const getNumberId = jest.fn().mockResolvedValue({
      _serialized: "237690123456@c.us",
    });
    const payload = validateIssueReminderBody({
      issueId: 1,
      type: "due_now",
      recipientPhone: "237690123456",
      title: "Stock",
      priority: "medium",
      idempotencyKey: "k1",
    }).data;

    const messageId = await sendIssueReminder(
      { sendMessage, getNumberId },
      payload
    );
    expect(getNumberId).toHaveBeenCalledWith("237690123456@c.us");
    expect(sendMessage).toHaveBeenCalledWith(
      "237690123456@c.us",
      expect.stringContaining("C’est l’heure")
    );
    expect(messageId).toBe("true_237690123456@c.us_ABC");
  });

  it("prefers LID from getContactLidAndPhone when available", async () => {
    const sendMessage = jest.fn().mockResolvedValue({
      id: { _serialized: "true_123@lid_ABC" },
    });
    const getNumberId = jest.fn().mockResolvedValue({
      _serialized: "237693663641@c.us",
    });
    const getContactLidAndPhone = jest.fn().mockResolvedValue([
      { lid: "123456789@lid", pn: "237693663641@c.us" },
    ]);
    const payload = validateIssueReminderBody({
      issueId: 1,
      type: "created",
      recipientPhone: "+237693663641",
      title: "Stock",
      idempotencyKey: "k2",
    }).data;

    await sendIssueReminder(
      { sendMessage, getNumberId, getContactLidAndPhone },
      payload
    );
    expect(sendMessage).toHaveBeenCalledWith(
      "123456789@lid",
      expect.stringContaining("Nouvelle mission")
    );
  });

  it("throws when number is not registered on WhatsApp", async () => {
    const sendMessage = jest.fn();
    const getNumberId = jest.fn().mockResolvedValue(null);
    const payload = validateIssueReminderBody({
      issueId: 1,
      type: "created",
      recipientPhone: "+237693663641",
      title: "Stock",
      idempotencyKey: "k3",
    }).data;

    await expect(
      sendIssueReminder({ sendMessage, getNumberId }, payload)
    ).rejects.toThrow(/not registered/i);
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
