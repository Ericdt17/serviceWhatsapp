"use strict";

const http = require("http");

/**
 * Minimal HTTP server for Uptime Kuma / load balancers.
 * GET /health → 200 when WhatsApp is ready AND Core API auth works (core mode), else 503.
 *
 * @param {{ getStatus: () => Promise<{ ready: boolean, state?: string|null, clientReady?: boolean, coreApiOk?: boolean, coreApiError?: string|null, coreApiSkipped?: boolean }> }} options
 * @returns {{ server: import('http').Server, port: number } | null}
 */
function startBotHealthServer(options) {
  const port = parseInt(process.env.BOT_HEALTH_PORT || "3099", 10);
  if (!Number.isFinite(port) || port <= 0) {
    console.log("[health] BOT_HEALTH_PORT disabled — health server off");
    return null;
  }

  const host = process.env.BOT_HEALTH_BIND || "127.0.0.1";
  const { getStatus } = options;

  const server = http.createServer(async (req, res) => {
    if (req.url !== "/health" && req.url !== "/") {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }

    try {
      const status = await getStatus();
      const body = {
        service: "whatsapp-bot-core",
        ok: Boolean(status.ready),
        ready: Boolean(status.ready),
        whatsappState: status.state ?? null,
        clientReady: Boolean(status.clientReady),
        coreApiOk:
          status.coreApiSkipped === true
            ? null
            : status.coreApiOk !== false,
        coreApiError: status.coreApiError ?? null,
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      };

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
