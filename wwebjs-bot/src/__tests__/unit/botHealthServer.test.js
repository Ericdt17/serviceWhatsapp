"use strict";

const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { startBotHealthServer } = require("../../lib/botHealthServer");
const issueReminderIdempotency = require("../../lib/issueReminderIdempotency");

describe("botHealthServer", () => {
  let serverInfo;

  afterEach((done) => {
    if (serverInfo?.server) {
      serverInfo.server.close(done);
    } else {
      done();
    }
    delete process.env.BOT_HEALTH_PORT;
    delete process.env.BOT_HEALTH_BIND;
  });

  function get(path, port) {
    return new Promise((resolve, reject) => {
      http
        .get(`http://127.0.0.1:${port}${path}`, (res) => {
          let data = "";
          res.on("data", (chunk) => {
            data += chunk;
          });
          res.on("end", () => {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          });
        })
        .on("error", reject);
    });
  }

  function post(path, port, body, headers = {}) {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify(body);
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
            ...headers,
          },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => {
            data += chunk;
          });
          res.on("end", () => {
            resolve({
              status: res.statusCode,
              body: data ? JSON.parse(data) : {},
            });
          });
        }
      );
      req.on("error", reject);
      req.write(payload);
      req.end();
    });
  }

  it("returns 503 when bot is not ready", async () => {
    process.env.BOT_HEALTH_PORT = "37655";
    process.env.BOT_HEALTH_BIND = "127.0.0.1";
    serverInfo = startBotHealthServer({
      getStatus: async () => ({ ready: false, state: null, clientReady: false }),
    });
    await new Promise((resolve) => serverInfo.server.once("listening", resolve));
    const res = await get("/health", serverInfo.port);
    expect(res.status).toBe(503);
    expect(res.body.ok).toBe(false);
  });

  it("returns 200 when bot is ready", async () => {
    process.env.BOT_HEALTH_PORT = "37656";
    process.env.BOT_HEALTH_BIND = "127.0.0.1";
    serverInfo = startBotHealthServer({
      getStatus: async () => ({
        ready: true,
        state: "CONNECTED",
        clientReady: true,
        coreApiOk: true,
        coreApiError: null,
        coreApiSkipped: false,
      }),
    });
    await new Promise((resolve) => serverInfo.server.once("listening", resolve));
    const res = await get("/health", serverInfo.port);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.whatsappState).toBe("CONNECTED");
    expect(res.body.coreApiOk).toBe(true);
    expect(res.body.metrics).toBeDefined();
    expect(res.body.metrics.ordersOk).toBeDefined();
  });

  it("returns metrics on /metrics path", async () => {
    process.env.BOT_HEALTH_PORT = "37658";
    process.env.BOT_HEALTH_BIND = "127.0.0.1";
    serverInfo = startBotHealthServer({
      getStatus: async () => ({
        ready: true,
        state: "CONNECTED",
        clientReady: true,
        coreApiOk: true,
        metrics: { ordersOk: 5, ordersFailed: 0 },
      }),
    });
    await new Promise((resolve) => serverInfo.server.once("listening", resolve));
    const res = await get("/metrics", serverInfo.port);
    expect(res.status).toBe(200);
    expect(res.body.metrics.ordersOk).toBe(5);
  });

  it("POST /internal/send-document sends PDF when authorized and bot ready", async () => {
    process.env.BOT_HEALTH_PORT = "37659";
    process.env.BOT_HEALTH_BIND = "127.0.0.1";
    const sendDocument = jest.fn().mockResolvedValue(undefined);
    serverInfo = startBotHealthServer({
      getStatus: async () => ({ ready: true, clientReady: true }),
      internalToken: "test-secret",
      outboundEnabled: true,
      sendDocument,
    });
    await new Promise((resolve) => serverInfo.server.once("listening", resolve));

    const res = await post(
      "/internal/send-document",
      serverInfo.port,
      {
        whatsapp_group_id: "120363123456789012@g.us",
        filename: "rapport.pdf",
        pdf_base64: Buffer.from("%PDF-1.4").toString("base64"),
        caption: "Test",
      },
      { "X-Bot-Internal-Token": "test-secret" }
    );

    expect(res.status).toBe(200);
    expect(res.body.sent).toBe(true);
    expect(sendDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: "120363123456789012@g.us",
        filename: "rapport.pdf",
      })
    );
  });

  it("POST /internal/send-document returns 401 without token", async () => {
    process.env.BOT_HEALTH_PORT = "37660";
    process.env.BOT_HEALTH_BIND = "127.0.0.1";
    serverInfo = startBotHealthServer({
      getStatus: async () => ({ ready: true }),
      internalToken: "test-secret",
      sendDocument: jest.fn(),
    });
    await new Promise((resolve) => serverInfo.server.once("listening", resolve));

    const res = await post("/internal/send-document", serverInfo.port, {
      whatsapp_group_id: "120363123456789012@g.us",
      filename: "rapport.pdf",
      pdf_base64: "abc",
    });

    expect(res.status).toBe(401);
  });

  it("POST /internal/send-document returns 503 when bot not ready", async () => {
    process.env.BOT_HEALTH_PORT = "37661";
    process.env.BOT_HEALTH_BIND = "127.0.0.1";
    serverInfo = startBotHealthServer({
      getStatus: async () => ({ ready: false }),
      internalToken: "test-secret",
      sendDocument: jest.fn(),
    });
    await new Promise((resolve) => serverInfo.server.once("listening", resolve));

    const res = await post(
      "/internal/send-document",
      serverInfo.port,
      {
        whatsapp_group_id: "120363123456789012@g.us",
        filename: "rapport.pdf",
        pdf_base64: "abc",
      },
      { "X-Bot-Internal-Token": "test-secret" }
    );

    expect(res.status).toBe(503);
    expect(res.body.error).toBe("bot_not_ready");
  });

  it("POST /internal/send-document-dm sends PDF DM when authorized and bot ready", async () => {
    process.env.BOT_HEALTH_PORT = "37662";
    process.env.BOT_HEALTH_BIND = "127.0.0.1";
    const sendDocumentDm = jest.fn().mockResolvedValue("true_237693663641@c.us_XYZ");
    serverInfo = startBotHealthServer({
      getStatus: async () => ({ ready: true, clientReady: true }),
      internalToken: "test-secret",
      outboundEnabled: true,
      sendDocumentDm,
    });
    await new Promise((resolve) => serverInfo.server.once("listening", resolve));

    const res = await post(
      "/internal/send-document-dm",
      serverInfo.port,
      {
        recipient_phone: "693663641",
        filename: "bulletin.pdf",
        pdf_base64: Buffer.from("%PDF-1.4").toString("base64"),
        caption: "Bulletin de paie",
      },
      { "X-Bot-Internal-Token": "test-secret" }
    );

    expect(res.status).toBe(200);
    expect(res.body.sent).toBe(true);
    expect(res.body.recipient).toBe("237693663641@c.us");
    expect(res.body.message_id).toBe("true_237693663641@c.us_XYZ");
    expect(sendDocumentDm).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: "237693663641@c.us",
        filename: "bulletin.pdf",
      })
    );
  });

  it("POST /internal/send-document-dm returns 401 without token", async () => {
    process.env.BOT_HEALTH_PORT = "37663";
    process.env.BOT_HEALTH_BIND = "127.0.0.1";
    serverInfo = startBotHealthServer({
      getStatus: async () => ({ ready: true }),
      internalToken: "test-secret",
      outboundEnabled: true,
      sendDocumentDm: jest.fn(),
    });
    await new Promise((resolve) => serverInfo.server.once("listening", resolve));

    const res = await post("/internal/send-document-dm", serverInfo.port, {
      recipient_phone: "237690123456",
      filename: "bulletin.pdf",
      pdf_base64: "abc",
    });

    expect(res.status).toBe(401);
  });

  it("POST /internal/send-document-dm returns 400 on validation error", async () => {
    process.env.BOT_HEALTH_PORT = "37664";
    process.env.BOT_HEALTH_BIND = "127.0.0.1";
    serverInfo = startBotHealthServer({
      getStatus: async () => ({ ready: true }),
      internalToken: "test-secret",
      outboundEnabled: true,
      sendDocumentDm: jest.fn(),
    });
    await new Promise((resolve) => serverInfo.server.once("listening", resolve));

    const res = await post(
      "/internal/send-document-dm",
      serverInfo.port,
      {
        recipient_phone: "237690123456",
        filename: "bulletin.txt",
        pdf_base64: "abc",
      },
      { "X-Bot-Internal-Token": "test-secret" }
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation_error");
  });

  it("POST /internal/send-text-dm sends text when authorized", async () => {
    process.env.BOT_HEALTH_PORT = "37665";
    process.env.BOT_HEALTH_BIND = "127.0.0.1";
    const sendTextDm = jest.fn().mockResolvedValue("true_msg");
    serverInfo = startBotHealthServer({
      getStatus: async () => ({ ready: true }),
      internalToken: "test-secret",
      outboundEnabled: true,
      sendTextDm,
    });
    await new Promise((resolve) => serverInfo.server.once("listening", resolve));

    const res = await post(
      "/internal/send-text-dm",
      serverInfo.port,
      {
        recipient_phone: "693663641",
        message: "Voici votre bulletin",
      },
      { "X-Bot-Internal-Token": "test-secret" }
    );

    expect(res.status).toBe(200);
    expect(res.body.sent).toBe(true);
    expect(sendTextDm).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: "237693663641@c.us",
        message: "Voici votre bulletin",
      })
    );
  });

  it("returns 503 when WhatsApp is up but Core API auth failed", async () => {
    process.env.BOT_HEALTH_PORT = "37657";
    process.env.BOT_HEALTH_BIND = "127.0.0.1";
    serverInfo = startBotHealthServer({
      getStatus: async () => ({
        ready: false,
        state: "CONNECTED",
        clientReady: true,
        coreApiOk: false,
        coreApiError: "Core API auth failed (401)",
        coreApiSkipped: false,
      }),
    });
    await new Promise((resolve) => serverInfo.server.once("listening", resolve));
    const res = await get("/health", serverInfo.port);
    expect(res.status).toBe(503);
    expect(res.body.ok).toBe(false);
    expect(res.body.coreApiOk).toBe(false);
    expect(res.body.coreApiError).toMatch(/401/);
  });

  it("POST /internal/send-text sends message when authorized and bot ready", async () => {
    process.env.BOT_HEALTH_PORT = "37662";
    process.env.BOT_HEALTH_BIND = "127.0.0.1";
    const sendText = jest.fn().mockResolvedValue("true_120363@g.us_ABC");
    serverInfo = startBotHealthServer({
      getStatus: async () => ({ ready: true, clientReady: true }),
      internalToken: "test-secret",
      outboundEnabled: true,
      sendText,
    });
    await new Promise((resolve) => serverInfo.server.once("listening", resolve));

    const res = await post(
      "/internal/send-text",
      serverInfo.port,
      {
        whatsapp_group_id: "120363123456789012@g.us",
        message: "Annonce LivSight",
      },
      { "X-Bot-Internal-Token": "test-secret" }
    );

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.sent).toBe(true);
    expect(res.body.whatsapp_group_id).toBe("120363123456789012@g.us");
    expect(res.body.message_id).toBe("true_120363@g.us_ABC");
    expect(sendText).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: "120363123456789012@g.us",
        message: "Annonce LivSight",
      })
    );
  });

  it("POST /internal/send-text returns 401 without token", async () => {
    process.env.BOT_HEALTH_PORT = "37663";
    process.env.BOT_HEALTH_BIND = "127.0.0.1";
    serverInfo = startBotHealthServer({
      getStatus: async () => ({ ready: true }),
      internalToken: "test-secret",
      sendText: jest.fn(),
    });
    await new Promise((resolve) => serverInfo.server.once("listening", resolve));

    const res = await post("/internal/send-text", serverInfo.port, {
      whatsapp_group_id: "120363123456789012@g.us",
      message: "Hello",
    });

    expect(res.status).toBe(401);
  });

  it("POST /internal/send-text returns 400 for empty message", async () => {
    process.env.BOT_HEALTH_PORT = "37664";
    process.env.BOT_HEALTH_BIND = "127.0.0.1";
    serverInfo = startBotHealthServer({
      getStatus: async () => ({ ready: true }),
      internalToken: "test-secret",
      sendText: jest.fn(),
    });
    await new Promise((resolve) => serverInfo.server.once("listening", resolve));

    const res = await post(
      "/internal/send-text",
      serverInfo.port,
      {
        whatsapp_group_id: "120363123456789012@g.us",
        message: "   ",
      },
      { "X-Bot-Internal-Token": "test-secret" }
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation_error");
  });

  it("POST /internal/send-text returns 503 when bot not ready", async () => {
    process.env.BOT_HEALTH_PORT = "37665";
    process.env.BOT_HEALTH_BIND = "127.0.0.1";
    serverInfo = startBotHealthServer({
      getStatus: async () => ({ ready: false }),
      internalToken: "test-secret",
      sendText: jest.fn(),
    });
    await new Promise((resolve) => serverInfo.server.once("listening", resolve));

    const res = await post(
      "/internal/send-text",
      serverInfo.port,
      {
        whatsapp_group_id: "120363123456789012@g.us",
        message: "Hello",
      },
      { "X-Bot-Internal-Token": "test-secret" }
    );

    expect(res.status).toBe(503);
    expect(res.body.error).toBe("bot_not_ready");
    expect(res.body.message).toBe("WhatsApp client is not ready");
  });

  it("POST /internal/send-text returns 502 when send fails", async () => {
    process.env.BOT_HEALTH_PORT = "37666";
    process.env.BOT_HEALTH_BIND = "127.0.0.1";
    const sendText = jest.fn().mockRejectedValue(new Error("group not found"));
    serverInfo = startBotHealthServer({
      getStatus: async () => ({ ready: true }),
      internalToken: "test-secret",
      sendText,
    });
    await new Promise((resolve) => serverInfo.server.once("listening", resolve));

    const res = await post(
      "/internal/send-text",
      serverInfo.port,
      {
        whatsapp_group_id: "120363123456789012@g.us",
        message: "Hello",
      },
      { "X-Bot-Internal-Token": "test-secret" }
    );

    expect(res.status).toBe(502);
    expect(res.body.error).toBe("send_failed");
    expect(res.body.message).toMatch(/group not found/);
  });

  it("POST /internal/send-text dry_run skips sendText", async () => {
    process.env.BOT_HEALTH_PORT = "37667";
    process.env.BOT_HEALTH_BIND = "127.0.0.1";
    const sendText = jest.fn();
    serverInfo = startBotHealthServer({
      getStatus: async () => ({ ready: true }),
      internalToken: "test-secret",
      sendText,
    });
    await new Promise((resolve) => serverInfo.server.once("listening", resolve));

    const res = await post(
      "/internal/send-text",
      serverInfo.port,
      {
        whatsapp_group_id: "120363123456789012@g.us",
        message: "Preview only",
        dry_run: true,
      },
      { "X-Bot-Internal-Token": "test-secret" }
    );

    expect(res.status).toBe(200);
    expect(res.body.sent).toBe(true);
    expect(res.body.message_id).toBeNull();
    expect(sendText).not.toHaveBeenCalled();
  });

  it("POST /internal/reorganize-delivery-message returns reorganized text", async () => {
    process.env.BOT_HEALTH_PORT = "37668";
    process.env.BOT_HEALTH_BIND = "127.0.0.1";
    const reorganizeDeliveryMessage = jest.fn().mockResolvedValue({
      ok: true,
      reorganized_text: "694397546\nMessassi\nPack homme\n6000",
    });
    serverInfo = startBotHealthServer({
      getStatus: async () => ({ ready: false }),
      internalToken: "test-secret",
      reorganizeDeliveryMessage,
    });
    await new Promise((resolve) => serverInfo.server.once("listening", resolve));

    const res = await post(
      "/internal/reorganize-delivery-message",
      serverInfo.port,
      { text: "messy paste" },
      { "X-Bot-Internal-Token": "test-secret" }
    );

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.reorganized_text).toContain("694397546");
    expect(res.body.via_ai).toBe(true);
    expect(reorganizeDeliveryMessage).toHaveBeenCalledWith("messy paste");
  });

  it("POST /internal/reorganize-delivery-message returns 401 without token", async () => {
    process.env.BOT_HEALTH_PORT = "37669";
    process.env.BOT_HEALTH_BIND = "127.0.0.1";
    serverInfo = startBotHealthServer({
      getStatus: async () => ({ ready: true }),
      internalToken: "test-secret",
      reorganizeDeliveryMessage: jest.fn(),
    });
    await new Promise((resolve) => serverInfo.server.once("listening", resolve));

    const res = await post("/internal/reorganize-delivery-message", serverInfo.port, {
      text: "hello",
    });
    expect(res.status).toBe(401);
  });

  describe("POST /internal/issue-reminders/send", () => {
    let tmpDir;
    let tmpFile;

    const reminderBody = {
      issueId: 42,
      type: "created",
      recipientPhone: "+237690123456",
      title: "Faire l inventaire",
      priority: "high",
      dueDate: "2026-09-26T18:00:00+01:00",
      assignedBy: "Eric",
      idempotencyKey: "issue:42:created:v1",
    };

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "issue-rem-health-"));
      tmpFile = path.join(tmpDir, "sent.json");
      process.env.ISSUE_REMINDER_IDEMPOTENCY_FILE = tmpFile;
      issueReminderIdempotency.resetForTests();
    });

    afterEach(() => {
      delete process.env.ISSUE_REMINDER_IDEMPOTENCY_FILE;
      fs.rmSync(tmpDir, { recursive: true, force: true });
      issueReminderIdempotency.resetForTests();
    });

    it("sends when authorized and bot ready", async () => {
      process.env.BOT_HEALTH_PORT = "37670";
      process.env.BOT_HEALTH_BIND = "127.0.0.1";
      const sendIssueReminder = jest.fn().mockResolvedValue("true_237690123456@c.us_XYZ");
      serverInfo = startBotHealthServer({
        getStatus: async () => ({ ready: true, clientReady: true }),
        internalToken: "test-secret",
        outboundEnabled: true,
        sendIssueReminder,
      });
      await new Promise((resolve) => serverInfo.server.once("listening", resolve));

      const res = await post(
        "/internal/issue-reminders/send",
        serverInfo.port,
        reminderBody,
        { "X-Bot-Internal-Token": "test-secret" }
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.issueId).toBe(42);
      expect(res.body.type).toBe("created");
      expect(res.body.recipient).toBe("237690123456@c.us");
      expect(res.body.message_id).toBe("true_237690123456@c.us_XYZ");
      expect(sendIssueReminder).toHaveBeenCalledWith(
        expect.objectContaining({
          chatId: "237690123456@c.us",
          message: expect.stringContaining("Nouvelle mission"),
        })
      );
    });

    it("returns 401 without token", async () => {
      process.env.BOT_HEALTH_PORT = "37671";
      process.env.BOT_HEALTH_BIND = "127.0.0.1";
      serverInfo = startBotHealthServer({
        getStatus: async () => ({ ready: true }),
        internalToken: "test-secret",
        sendIssueReminder: jest.fn(),
      });
      await new Promise((resolve) => serverInfo.server.once("listening", resolve));

      const res = await post(
        "/internal/issue-reminders/send",
        serverInfo.port,
        reminderBody
      );
      expect(res.status).toBe(401);
    });

    it("returns 400 when idempotencyKey missing", async () => {
      process.env.BOT_HEALTH_PORT = "37672";
      process.env.BOT_HEALTH_BIND = "127.0.0.1";
      serverInfo = startBotHealthServer({
        getStatus: async () => ({ ready: true }),
        internalToken: "test-secret",
        sendIssueReminder: jest.fn(),
      });
      await new Promise((resolve) => serverInfo.server.once("listening", resolve));

      const { idempotencyKey, ...rest } = reminderBody;
      const res = await post(
        "/internal/issue-reminders/send",
        serverInfo.port,
        rest,
        { "X-Bot-Internal-Token": "test-secret" }
      );
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("validation_error");
    });

    it("dry_run skips send and does not mark idempotency", async () => {
      process.env.BOT_HEALTH_PORT = "37673";
      process.env.BOT_HEALTH_BIND = "127.0.0.1";
      const sendIssueReminder = jest.fn();
      serverInfo = startBotHealthServer({
        getStatus: async () => ({ ready: true }),
        internalToken: "test-secret",
        sendIssueReminder,
      });
      await new Promise((resolve) => serverInfo.server.once("listening", resolve));

      const res = await post(
        "/internal/issue-reminders/send",
        serverInfo.port,
        { ...reminderBody, dry_run: true },
        { "X-Bot-Internal-Token": "test-secret" }
      );

      expect(res.status).toBe(200);
      expect(res.body.dry_run).toBe(true);
      expect(res.body.message_id).toBeNull();
      expect(sendIssueReminder).not.toHaveBeenCalled();
      expect(issueReminderIdempotency.isSent(reminderBody.idempotencyKey)).toBe(
        false
      );
    });

    it("returns 409 on duplicate idempotencyKey", async () => {
      process.env.BOT_HEALTH_PORT = "37674";
      process.env.BOT_HEALTH_BIND = "127.0.0.1";
      const sendIssueReminder = jest.fn().mockResolvedValue("msg-1");
      serverInfo = startBotHealthServer({
        getStatus: async () => ({ ready: true }),
        internalToken: "test-secret",
        sendIssueReminder,
      });
      await new Promise((resolve) => serverInfo.server.once("listening", resolve));

      const first = await post(
        "/internal/issue-reminders/send",
        serverInfo.port,
        reminderBody,
        { "X-Bot-Internal-Token": "test-secret" }
      );
      expect(first.status).toBe(200);

      const second = await post(
        "/internal/issue-reminders/send",
        serverInfo.port,
        reminderBody,
        { "X-Bot-Internal-Token": "test-secret" }
      );
      expect(second.status).toBe(409);
      expect(second.body.error).toBe("duplicate");
      expect(sendIssueReminder).toHaveBeenCalledTimes(1);
    });

    it("releases idempotency key when send fails so Core can retry", async () => {
      process.env.BOT_HEALTH_PORT = "37675";
      process.env.BOT_HEALTH_BIND = "127.0.0.1";
      const sendIssueReminder = jest
        .fn()
        .mockRejectedValueOnce(new Error("wa down"))
        .mockResolvedValueOnce("msg-ok");
      serverInfo = startBotHealthServer({
        getStatus: async () => ({ ready: true }),
        internalToken: "test-secret",
        sendIssueReminder,
      });
      await new Promise((resolve) => serverInfo.server.once("listening", resolve));

      const fail = await post(
        "/internal/issue-reminders/send",
        serverInfo.port,
        reminderBody,
        { "X-Bot-Internal-Token": "test-secret" }
      );
      expect(fail.status).toBe(502);

      const retry = await post(
        "/internal/issue-reminders/send",
        serverInfo.port,
        reminderBody,
        { "X-Bot-Internal-Token": "test-secret" }
      );
      expect(retry.status).toBe(200);
      expect(retry.body.message_id).toBe("msg-ok");
    });
  });
});
