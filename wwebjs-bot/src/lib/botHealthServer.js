"use strict";

const http = require("http");
const botMetrics = require("./botMetrics");

/**
 * Minimal HTTP server for Uptime Kuma / load balancers.
 * GET /health or /metrics → JSON with status + counters.
 *
 * @param {{ getStatus: () => Promise<object> }} options
 * @returns {{ server: import('http').Server, port: number, host: string } | null}
 */
function startBotHealthServer(options) {
  const port = parseInt(process.env.BOT_HEALTH_PORT || "3099", 10);
  if (!Number.isFinite(port) || port <= 0) {
    console.log("[health] BOT_HEALTH_PORT disabled — health server off");
    return null;
  }

  const host = process.env.BOT_HEALTH_BIND || "127.0.0.1";
  const { getStatus } = options;

  async function buildBody() {
    const status = await getStatus();
    return {
      service: "whatsapp-bot-core",
      ok: Boolean(status.ready),
      ready: Boolean(status.ready),
      whatsappState: status.state ?? null,
      clientReady: Boolean(status.clientReady),
      coreApiOk:
        status.coreApiSkipped === true ? null : status.coreApiOk !== false,
      coreApiError: status.coreApiError ?? null,
      circuitOpen: Boolean(status.circuitOpen),
      circuitRemainingMs: status.circuitRemainingMs ?? 0,
      clientId: status.clientId ?? null,
      metrics: status.metrics || botMetrics.snapshot(),
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  const server = http.createServer(async (req, res) => {
    const path = req.url?.split("?")[0];
    if (path !== "/health" && path !== "/metrics" && path !== "/") {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }

    try {
      const body = await buildBody();
      res.writeHead(body.ok ? 200 : 503, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          service: "whatsapp-bot-core",
          ok: false,
          error: err.message,
        })
      );
    }
  });

  server.listen(port, host, () => {
    console.log(`[health] Uptime Kuma endpoint http://${host}:${port}/health`);
  });

  server.on("error", (err) => {
    console.error("[health] Server error:", err.message);
  });

  return { server, port, host };
}

module.exports = { startBotHealthServer };
