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
});
