"use strict";

const http = require("http");
const { startBotHealthServer } = require("../../lib/botHealthServer");

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
});
