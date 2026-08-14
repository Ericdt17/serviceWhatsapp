"use strict";

const http = require("http");
const botMetrics = require("./botMetrics");
const {
  validateSendDocumentBody,
  verifyInternalToken,
} = require("./botOutboundDocument");

const INTERNAL_SEND_PATH = "/internal/send-document";

function readJsonBody(req, maxBytes = 15 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("payload_too_large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("invalid_json"));
      }
    });

    req.on("error", reject);
  });
}

function jsonResponse(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

/**
 * Minimal HTTP server for Uptime Kuma / load balancers.
 * GET /health or /metrics → JSON with status + counters.
 * POST /internal/send-document → send PDF to WhatsApp group (backend only).
 *
 * @param {{
 *   getStatus: () => Promise<object>,
 *   sendDocument?: (payload: { groupId: string, filename: string, pdfBase64: string, caption: string }) => Promise<void>,
 *   internalToken?: string | null,
 *   outboundEnabled?: boolean,
 * }} options
 * @returns {{ server: import('http').Server, port: number, host: string } | null}
 */
function startBotHealthServer(options) {
  const port = parseInt(process.env.BOT_HEALTH_PORT || "3099", 10);
  if (!Number.isFinite(port) || port <= 0) {
    console.log("[health] BOT_HEALTH_PORT disabled — health server off");
    return null;
  }

  const host = process.env.BOT_HEALTH_BIND || "127.0.0.1";
  const {
    getStatus,
    sendDocument,
    internalToken = null,
    outboundEnabled = true,
  } = options;

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

  async function handleSendDocument(req, res) {
    if (!outboundEnabled) {
      jsonResponse(res, 403, {
        success: false,
        error: "forbidden",
        message: "Outbound WhatsApp sending is disabled",
      });
      return;
    }

    const tokenCheck = verifyInternalToken(
      req.headers["x-bot-internal-token"],
      internalToken
    );
    if (!tokenCheck.ok) {
      const status = tokenCheck.reason === "not_configured" ? 503 : 401;
      jsonResponse(res, status, {
        success: false,
        error: tokenCheck.reason === "not_configured" ? "not_configured" : "unauthorized",
        message:
          tokenCheck.reason === "not_configured"
            ? "Outbound send is not configured on this bot"
            : "Invalid or missing X-Bot-Internal-Token",
      });
      return;
    }

    if (typeof sendDocument !== "function") {
      jsonResponse(res, 503, {
        success: false,
        error: "not_ready",
        message: "WhatsApp send handler is not available",
      });
      return;
    }

    const status = await getStatus();
    if (!status.ready) {
      jsonResponse(res, 503, {
        success: false,
        error: "bot_not_ready",
        message: "WhatsApp client is not ready",
      });
      return;
    }

    let body;
    try {
      body = await readJsonBody(req);
    } catch (err) {
      if (err.message === "payload_too_large") {
        jsonResponse(res, 413, {
          success: false,
          error: "payload_too_large",
          message: "PDF payload exceeds size limit",
        });
        return;
      }
      jsonResponse(res, 400, {
        success: false,
        error: "invalid_json",
        message: "Request body must be valid JSON",
      });
      return;
    }

    const validation = validateSendDocumentBody(body);
    if (!validation.ok) {
      jsonResponse(res, 400, {
        success: false,
        error: "validation_error",
        message: validation.errors.join("; "),
        fields: validation.errors,
      });
      return;
    }

    try {
      await sendDocument(validation.data);
      jsonResponse(res, 200, {
        success: true,
        sent: true,
        whatsapp_group_id: validation.data.groupId,
        filename: validation.data.filename,
      });
    } catch (err) {
      jsonResponse(res, 502, {
        success: false,
        error: "send_failed",
        message: err.message || "Failed to send document via WhatsApp",
      });
    }
  }

  const server = http.createServer(async (req, res) => {
    const path = req.url?.split("?")[0];

    if (req.method === "POST" && path === INTERNAL_SEND_PATH) {
      try {
        await handleSendDocument(req, res);
      } catch (err) {
        jsonResponse(res, 500, {
          success: false,
          error: "internal_error",
          message: err.message,
        });
      }
      return;
    }

    if (path !== "/health" && path !== "/metrics" && path !== "/") {
      jsonResponse(res, 404, { error: "not found" });
      return;
    }

    try {
      const body = await buildBody();
      jsonResponse(res, body.ok ? 200 : 503, body);
    } catch (err) {
      jsonResponse(res, 500, {
        service: "whatsapp-bot-core",
        ok: false,
        error: err.message,
      });
    }
  });

  server.listen(port, host, () => {
    console.log(`[health] Uptime Kuma endpoint http://${host}:${port}/health`);
    if (internalToken && outboundEnabled) {
      console.log(
        `[health] Outbound send endpoint http://${host}:${port}${INTERNAL_SEND_PATH}`
      );
    }
  });

  server.on("error", (err) => {
    console.error("[health] Server error:", err.message);
  });

  return { server, port, host };
}

module.exports = { startBotHealthServer, INTERNAL_SEND_PATH, readJsonBody };
