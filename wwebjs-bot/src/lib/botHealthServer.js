"use strict";

const http = require("http");
const botMetrics = require("./botMetrics");
const {
  validateSendDocumentBody,
  validateSendTextBody,
  verifyInternalToken,
} = require("./botOutboundDocument");
const { validateSendDocumentDmBody } = require("./botOutboundDocumentDm");
const { validateSendTextDmBody } = require("./botOutboundTextDm");
const { validateIssueReminderBody } = require("./issueReminderSend");
const issueReminderIdempotency = require("./issueReminderIdempotency");

const INTERNAL_SEND_PATH = "/internal/send-document";
const INTERNAL_SEND_DOCUMENT_DM_PATH = "/internal/send-document-dm";
const INTERNAL_SEND_TEXT_DM_PATH = "/internal/send-text-dm";
const INTERNAL_SEND_TEXT_PATH = "/internal/send-text";
const INTERNAL_REORGANIZE_DELIVERY_PATH = "/internal/reorganize-delivery-message";
const INTERNAL_DRAFT_ISSUE_PATH = "/internal/draft-issue-from-notes";
const INTERNAL_POLISH_ISSUE_REPORT_PATH = "/internal/polish-issue-report";
const INTERNAL_POLISH_ISSUE_REJECTION_PATH = "/internal/polish-issue-rejection-reason";
const INTERNAL_ISSUE_REMINDER_PATH = "/internal/issue-reminders/send";

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
 * Shared auth / ready gates for outbound send endpoints.
 * @returns {boolean} true if the request may continue
 */
function assertOutboundAllowed(req, res, options) {
  const { outboundEnabled, internalToken, sendHandler, handlerMissingMessage } =
    options;

  if (!outboundEnabled) {
    jsonResponse(res, 403, {
      success: false,
      error: "forbidden",
      message: "Outbound WhatsApp sending is disabled",
    });
    return false;
  }

  const tokenCheck = verifyInternalToken(
    req.headers["x-bot-internal-token"],
    internalToken
  );
  if (!tokenCheck.ok) {
    const status = tokenCheck.reason === "not_configured" ? 503 : 401;
    jsonResponse(res, status, {
      success: false,
      error:
        tokenCheck.reason === "not_configured" ? "not_configured" : "unauthorized",
      message:
        tokenCheck.reason === "not_configured"
          ? "Outbound send is not configured on this bot"
          : "Invalid or missing X-Bot-Internal-Token",
    });
    return false;
  }

  if (typeof sendHandler !== "function") {
    jsonResponse(res, 503, {
      success: false,
      error: "not_ready",
      message: handlerMissingMessage,
    });
    return false;
  }

  return true;
}

/**
 * Token-only gate for AI/tools that do not send WhatsApp messages.
 * @returns {boolean} true if the request may continue
 */
function assertInternalToken(req, res, internalToken) {
  const tokenCheck = verifyInternalToken(
    req.headers["x-bot-internal-token"],
    internalToken
  );
  if (!tokenCheck.ok) {
    const status = tokenCheck.reason === "not_configured" ? 503 : 401;
    jsonResponse(res, status, {
      success: false,
      error:
        tokenCheck.reason === "not_configured" ? "not_configured" : "unauthorized",
      message:
        tokenCheck.reason === "not_configured"
          ? "Internal bot token is not configured"
          : "Invalid or missing X-Bot-Internal-Token",
    });
    return false;
  }
  return true;
}

/**
 * Minimal HTTP server for Uptime Kuma / load balancers.
 * GET /health or /metrics → JSON with status + counters.
 * POST /internal/send-document → send PDF to WhatsApp group (backend only).
 * POST /internal/send-document-dm → send PDF DM to phone (backend only).
 * POST /internal/send-text → send plain text to WhatsApp group (backend only).
 * POST /internal/issue-reminders/send → DM Issue reminder to assignee (backend only).
 * POST /internal/reorganize-delivery-message → AI reorganize delivery paste (backend only).
 * POST /internal/draft-issue-from-notes → AI draft issue title+description (backend only).
 * POST /internal/polish-issue-report → AI polish mission report (backend only).
 *
 * @param {{
 *   getStatus: () => Promise<object>,
 *   sendDocument?: (payload: { groupId: string, filename: string, pdfBase64: string, caption: string }) => Promise<void>,
 *   sendDocumentDm?: (payload: { chatId: string, filename: string, pdfBase64: string, caption: string }) => Promise<string|null>,
 *   sendTextDm?: (payload: { chatId: string, message: string }) => Promise<string|null>,
 *   sendText?: (payload: { groupId: string, message: string, dryRun: boolean }) => Promise<string|null>,
 *   sendIssueReminder?: (payload: object) => Promise<string|null>,
 *   reorganizeDeliveryMessage?: (text: string) => Promise<{ ok: boolean, reorganized_text?: string, error?: string, message?: string }>,
 *   draftIssueFromNotes?: (text: string) => Promise<{ ok: boolean, title?: string, description?: string, error?: string, message?: string }>,
 *   polishIssueReport?: (text: string) => Promise<{ ok: boolean, report?: string, error?: string, message?: string }>,
 *   polishIssueRejectionReason?: (text: string) => Promise<{ ok: boolean, reason?: string, error?: string, message?: string }>,
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
    sendDocumentDm,
    sendTextDm,
    sendText,
    sendIssueReminder,
    reorganizeDeliveryMessage,
    draftIssueFromNotes,
    polishIssueReport,
    polishIssueRejectionReason,
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

  async function ensureClientReady(res) {
    const status = await getStatus();
    if (!status.ready) {
      jsonResponse(res, 503, {
        success: false,
        error: "bot_not_ready",
        message: "WhatsApp client is not ready",
      });
      return false;
    }
    return true;
  }

  async function handleSendDocument(req, res) {
    if (
      !assertOutboundAllowed(req, res, {
        outboundEnabled,
        internalToken,
        sendHandler: sendDocument,
        handlerMissingMessage: "WhatsApp send handler is not available",
      })
    ) {
      return;
    }

    if (!(await ensureClientReady(res))) {
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

  async function handleSendDocumentDm(req, res) {
    if (
      !assertOutboundAllowed(req, res, {
        outboundEnabled,
        internalToken,
        sendHandler: sendDocumentDm,
        handlerMissingMessage: "WhatsApp DM document handler is not available",
      })
    ) {
      return;
    }

    if (!(await ensureClientReady(res))) {
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

    const validation = validateSendDocumentDmBody(body);
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
      const messageId = await sendDocumentDm(validation.data);
      jsonResponse(res, 200, {
        success: true,
        sent: true,
        recipient: validation.data.chatId,
        filename: validation.data.filename,
        message_id: messageId || null,
      });
    } catch (err) {
      jsonResponse(res, 502, {
        success: false,
        error: "send_failed",
        message: err.message || "Failed to send document DM via WhatsApp",
      });
    }
  }

  async function handleSendTextDm(req, res) {
    if (
      !assertOutboundAllowed(req, res, {
        outboundEnabled,
        internalToken,
        sendHandler: sendTextDm,
        handlerMissingMessage: "WhatsApp text DM handler is not available",
      })
    ) {
      return;
    }

    if (!(await ensureClientReady(res))) {
      return;
    }

    let body;
    try {
      body = await readJsonBody(req, 64 * 1024);
    } catch (err) {
      if (err.message === "payload_too_large") {
        jsonResponse(res, 413, {
          success: false,
          error: "payload_too_large",
          message: "Text payload exceeds size limit",
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

    const validation = validateSendTextDmBody(body);
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
      const messageId = await sendTextDm(validation.data);
      jsonResponse(res, 200, {
        success: true,
        sent: true,
        recipient: validation.data.chatId,
        message_id: messageId || null,
      });
    } catch (err) {
      jsonResponse(res, 502, {
        success: false,
        error: "send_failed",
        message: err.message || "Failed to send text DM via WhatsApp",
      });
    }
  }

  async function handleSendText(req, res) {
    if (
      !assertOutboundAllowed(req, res, {
        outboundEnabled,
        internalToken,
        sendHandler: sendText,
        handlerMissingMessage: "WhatsApp send handler is not available",
      })
    ) {
      return;
    }

    if (!(await ensureClientReady(res))) {
      return;
    }

    let body;
    try {
      // Text payloads are small; keep a tighter limit than PDF base64.
      body = await readJsonBody(req, 64 * 1024);
    } catch (err) {
      if (err.message === "payload_too_large") {
        jsonResponse(res, 413, {
          success: false,
          error: "payload_too_large",
          message: "Text payload exceeds size limit",
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

    const validation = validateSendTextBody(body);
    if (!validation.ok) {
      jsonResponse(res, 400, {
        success: false,
        error: "validation_error",
        message: validation.errors.join("; "),
        fields: validation.errors,
      });
      return;
    }

    const { groupId, message, dryRun } = validation.data;
    console.log(
      `[health] send-text group=${groupId} messageLength=${message.length} dryRun=${dryRun}`
    );

    if (dryRun) {
      jsonResponse(res, 200, {
        success: true,
        sent: true,
        whatsapp_group_id: groupId,
        message_id: null,
        dry_run: true,
      });
      return;
    }

    try {
      const messageId = await sendText(validation.data);
      jsonResponse(res, 200, {
        success: true,
        sent: true,
        whatsapp_group_id: groupId,
        message_id: messageId ?? null,
      });
    } catch (err) {
      console.log(
        `[health] send-text failed group=${groupId} messageLength=${message.length}: ${err.message}`
      );
      jsonResponse(res, 502, {
        success: false,
        error: "send_failed",
        message: err.message || "Failed to send text via WhatsApp",
      });
    }
  }

  async function handleIssueReminder(req, res) {
    if (
      !assertOutboundAllowed(req, res, {
        outboundEnabled,
        internalToken,
        sendHandler: sendIssueReminder,
        handlerMissingMessage: "WhatsApp issue reminder handler is not available",
      })
    ) {
      return;
    }

    if (!(await ensureClientReady(res))) {
      return;
    }

    let body;
    try {
      body = await readJsonBody(req, 64 * 1024);
    } catch (err) {
      if (err.message === "payload_too_large") {
        jsonResponse(res, 413, {
          success: false,
          error: "payload_too_large",
          message: "Issue reminder payload exceeds size limit",
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

    const validation = validateIssueReminderBody(body);
    if (!validation.ok) {
      jsonResponse(res, 400, {
        success: false,
        error: "validation_error",
        message: validation.errors.join("; "),
        fields: validation.errors,
      });
      return;
    }

    const payload = validation.data;
    console.log(
      `[health] issue-reminder issueId=${payload.issueId} type=${payload.type} recipient=${payload.chatId} dryRun=${payload.dryRun}`
    );

    if (payload.dryRun) {
      jsonResponse(res, 200, {
        success: true,
        sent: true,
        issueId: payload.issueId,
        type: payload.type,
        recipient: payload.chatId,
        message_id: null,
        dry_run: true,
      });
      return;
    }

    if (!issueReminderIdempotency.tryAcquire(payload.idempotencyKey)) {
      jsonResponse(res, 409, {
        success: false,
        error: "duplicate",
        message: "This issue reminder was already sent",
        issueId: payload.issueId,
        type: payload.type,
        idempotencyKey: payload.idempotencyKey,
      });
      return;
    }

    try {
      const messageId = await sendIssueReminder(payload);
      issueReminderIdempotency.markSent(payload.idempotencyKey, {
        messageId: messageId || undefined,
        issueId: payload.issueId,
      });
      console.log(
        `[health] issue-reminder sent issueId=${payload.issueId} type=${payload.type} message_id=${messageId || "null"}`
      );
      jsonResponse(res, 200, {
        success: true,
        sent: true,
        issueId: payload.issueId,
        type: payload.type,
        recipient: payload.chatId,
        message_id: messageId ?? null,
      });
    } catch (err) {
      issueReminderIdempotency.release(payload.idempotencyKey);
      console.log(
        `[health] issue-reminder failed issueId=${payload.issueId} type=${payload.type}: ${err.message}`
      );
      jsonResponse(res, 502, {
        success: false,
        error: "send_failed",
        message: err.message || "Failed to send issue reminder via WhatsApp",
      });
    }
  }

  async function handleReorganizeDeliveryMessage(req, res) {
    if (!assertInternalToken(req, res, internalToken)) {
      return;
    }

    if (typeof reorganizeDeliveryMessage !== "function") {
      jsonResponse(res, 503, {
        success: false,
        error: "not_configured",
        message: "Delivery reorganize handler is not available",
      });
      return;
    }

    let body;
    try {
      body = await readJsonBody(req, 64 * 1024);
    } catch (err) {
      if (err.message === "payload_too_large") {
        jsonResponse(res, 413, {
          success: false,
          error: "payload_too_large",
          message: "Text payload exceeds size limit",
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

    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) {
      jsonResponse(res, 400, {
        success: false,
        error: "validation_error",
        message: "text is required",
      });
      return;
    }

    try {
      const result = await reorganizeDeliveryMessage(text);
      if (!result?.ok) {
        const error = result?.error || "reorganize_failed";
        const status =
          error === "no_api_key"
            ? 503
            : error === "text_too_long" || error === "empty_text"
              ? 400
              : 422;
        jsonResponse(res, status, {
          success: false,
          error,
          message: result?.message || "Failed to reorganize delivery message",
        });
        return;
      }

      jsonResponse(res, 200, {
        success: true,
        reorganized_text: result.reorganized_text,
        via_ai: true,
      });
    } catch (err) {
      jsonResponse(res, 500, {
        success: false,
        error: "internal_error",
        message: err.message || "Failed to reorganize delivery message",
      });
    }
  }

  async function handleTextAiAssist(req, res, handler, options) {
    const {
      notConfiguredMessage,
      successPayload,
      failDefaultMessage,
    } = options;

    if (!assertInternalToken(req, res, internalToken)) {
      return;
    }

    if (typeof handler !== "function") {
      jsonResponse(res, 503, {
        success: false,
        error: "not_configured",
        message: notConfiguredMessage,
      });
      return;
    }

    let body;
    try {
      body = await readJsonBody(req, 64 * 1024);
    } catch (err) {
      if (err.message === "payload_too_large") {
        jsonResponse(res, 413, {
          success: false,
          error: "payload_too_large",
          message: "Text payload exceeds size limit",
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

    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) {
      jsonResponse(res, 400, {
        success: false,
        error: "validation_error",
        message: "text is required",
      });
      return;
    }

    try {
      const result = await handler(text);
      if (!result?.ok) {
        const error = result?.error || "ai_failed";
        const status =
          error === "no_api_key"
            ? 503
            : error === "text_too_long" || error === "empty_text"
              ? 400
              : 422;
        jsonResponse(res, status, {
          success: false,
          error,
          message: result?.message || failDefaultMessage,
        });
        return;
      }

      jsonResponse(res, 200, {
        success: true,
        via_ai: true,
        ...successPayload(result),
      });
    } catch (err) {
      jsonResponse(res, 500, {
        success: false,
        error: "internal_error",
        message: err.message || failDefaultMessage,
      });
    }
  }

  async function handleDraftIssueFromNotes(req, res) {
    await handleTextAiAssist(req, res, draftIssueFromNotes, {
      notConfiguredMessage: "Issue draft handler is not available",
      failDefaultMessage: "Failed to draft issue from notes",
      successPayload: (result) => ({
        title: result.title,
        description: result.description,
      }),
    });
  }

  async function handlePolishIssueReport(req, res) {
    await handleTextAiAssist(req, res, polishIssueReport, {
      notConfiguredMessage: "Issue report polish handler is not available",
      failDefaultMessage: "Failed to polish issue report",
      successPayload: (result) => ({
        report: result.report,
      }),
    });
  }

  async function handlePolishIssueRejectionReason(req, res) {
    await handleTextAiAssist(req, res, polishIssueRejectionReason, {
      notConfiguredMessage: "Issue rejection polish handler is not available",
      failDefaultMessage: "Failed to polish rejection reason",
      successPayload: (result) => ({
        reason: result.reason,
      }),
    });
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

    if (req.method === "POST" && path === INTERNAL_SEND_DOCUMENT_DM_PATH) {
      try {
        await handleSendDocumentDm(req, res);
      } catch (err) {
        jsonResponse(res, 500, {
          success: false,
          error: "internal_error",
          message: err.message,
        });
      }
      return;
    }

    if (req.method === "POST" && path === INTERNAL_SEND_TEXT_DM_PATH) {
      try {
        await handleSendTextDm(req, res);
      } catch (err) {
        jsonResponse(res, 500, {
          success: false,
          error: "internal_error",
          message: err.message,
        });
      }
      return;
    }

    if (req.method === "POST" && path === INTERNAL_SEND_TEXT_PATH) {
      try {
        await handleSendText(req, res);
      } catch (err) {
        jsonResponse(res, 500, {
          success: false,
          error: "internal_error",
          message: err.message,
        });
      }
      return;
    }

    if (req.method === "POST" && path === INTERNAL_ISSUE_REMINDER_PATH) {
      try {
        await handleIssueReminder(req, res);
      } catch (err) {
        jsonResponse(res, 500, {
          success: false,
          error: "internal_error",
          message: err.message,
        });
      }
      return;
    }

    if (req.method === "POST" && path === INTERNAL_REORGANIZE_DELIVERY_PATH) {
      try {
        await handleReorganizeDeliveryMessage(req, res);
      } catch (err) {
        jsonResponse(res, 500, {
          success: false,
          error: "internal_error",
          message: err.message,
        });
      }
      return;
    }

    if (req.method === "POST" && path === INTERNAL_DRAFT_ISSUE_PATH) {
      try {
        await handleDraftIssueFromNotes(req, res);
      } catch (err) {
        jsonResponse(res, 500, {
          success: false,
          error: "internal_error",
          message: err.message,
        });
      }
      return;
    }

    if (req.method === "POST" && path === INTERNAL_POLISH_ISSUE_REPORT_PATH) {
      try {
        await handlePolishIssueReport(req, res);
      } catch (err) {
        jsonResponse(res, 500, {
          success: false,
          error: "internal_error",
          message: err.message,
        });
      }
      return;
    }

    if (req.method === "POST" && path === INTERNAL_POLISH_ISSUE_REJECTION_PATH) {
      try {
        await handlePolishIssueRejectionReason(req, res);
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
        `[health] Outbound send endpoints http://${host}:${port}${INTERNAL_SEND_PATH}, http://${host}:${port}${INTERNAL_SEND_DOCUMENT_DM_PATH} and http://${host}:${port}${INTERNAL_SEND_TEXT_PATH}`
      );
      console.log(
        `[health] Issue reminder endpoint http://${host}:${port}${INTERNAL_ISSUE_REMINDER_PATH}`
      );
      console.log(
        `[health] Delivery reorganize endpoint http://${host}:${port}${INTERNAL_REORGANIZE_DELIVERY_PATH}`
      );
      console.log(
        `[health] Issue AI draft endpoint http://${host}:${port}${INTERNAL_DRAFT_ISSUE_PATH}`
      );
      console.log(
        `[health] Issue AI report polish endpoint http://${host}:${port}${INTERNAL_POLISH_ISSUE_REPORT_PATH}`
      );
      console.log(
        `[health] Issue AI rejection polish endpoint http://${host}:${port}${INTERNAL_POLISH_ISSUE_REJECTION_PATH}`
      );
    }
  });

  server.on("error", (err) => {
    console.error("[health] Server error:", err.message);
  });

  return { server, port, host };
}

module.exports = {
  startBotHealthServer,
  INTERNAL_SEND_PATH,
  INTERNAL_SEND_DOCUMENT_DM_PATH,
  INTERNAL_SEND_TEXT_DM_PATH,
  INTERNAL_SEND_TEXT_PATH,
  INTERNAL_REORGANIZE_DELIVERY_PATH,
  INTERNAL_DRAFT_ISSUE_PATH,
  INTERNAL_POLISH_ISSUE_REPORT_PATH,
  INTERNAL_POLISH_ISSUE_REJECTION_PATH,
  INTERNAL_ISSUE_REMINDER_PATH,
  readJsonBody,
};
