const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const QRCode = require("qrcode");
const path = require("path");
const config = require("./config");
const { createRemindersWorker } = require("./reminders/worker");
const { generateDailyReport } = require("./lib/daily-report");
const botAlerts = require("./lib/botAlerts");
const { startBotHealthServer } = require("./lib/botHealthServer");
const {
  sendDocumentToWhatsapp,
  sendTextToWhatsapp,
} = require("./lib/botOutboundDocument");
const {
  isShuttingDown,
  registerGracefulShutdown,
} = require("./lib/gracefulShutdown");
const { createReconnectScheduler } = require("./lib/waReconnect");
const { onMessage } = require("./handlers/messageHandler");
const coreApi = require("./services/coreApiClient");
const { getBotHealthStatus } = require("./lib/botHealthStatus");
const botRuntimeState = require("./lib/botRuntimeState");
const botMetrics = require("./lib/botMetrics");
const botLogger = require("./lib/botLogger");
const { createMessageIngress } = require("./lib/messageIngress");
const {
  resolveSessionDir,
  handleReadyTimeout,
} = require("./lib/waReadyWatchdog");

// Log startup time
const startupStartTime = Date.now();
console.log("⏳ Initializing bot components...");

// Log environment info for debugging
console.log("\n" + "=".repeat(60));
console.log("🔧 BOT ENVIRONMENT CONFIGURATION");
console.log("=".repeat(60));
console.log(`   NODE_ENV: ${process.env.NODE_ENV || "not set"}`);
console.log(
  `   CLIENT_ID: ${process.env.CLIENT_ID || "delivery-bot-default (default)"}`
);
if (process.env.DATABASE_URL) {
  try {
    const dbUrl = new URL(process.env.DATABASE_URL);
    const maskedUrl = `${dbUrl.protocol}//${dbUrl.username}:***@${dbUrl.hostname}${dbUrl.pathname}`;
    console.log(`   DATABASE_URL: ${maskedUrl}`);
  } catch (e) {
    console.log(`   DATABASE_URL: *** (present but invalid format)`);
  }
} else if (config.USE_CORE_API) {
  console.log(`   DATABASE_URL: not used (core API mode)`);
} else {
  console.log(`   DATABASE_URL: NOT SET (required for legacy mode)`);
}
console.log("=".repeat(60) + "\n");

const SESSION_CLIENT_ID = process.env.CLIENT_ID || "delivery-bot-default";
const SESSION_DIR = resolveSessionDir(process.cwd(), SESSION_CLIENT_ID);

// Create WhatsApp client with local auth (saves session)
// Using clientId for environment isolation (prod/staging/dev)
const client = new Client({
  authStrategy: new LocalAuth({
    clientId: SESSION_CLIENT_ID,
  }),
  puppeteer: {
    headless: true,
    // Use bundled Chromium from puppeteer (whatsapp-web.js dependency) unless you
    // override with PUPPETEER_EXECUTABLE_PATH (e.g. system Chrome on a server).
    ...(process.env.PUPPETEER_EXECUTABLE_PATH
      ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH }
      : {}),
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      // Avoid --single-process: causes Store/getChat failures ("r") on Linux VPS
      "--disable-gpu",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-breakpad",
      "--disable-component-extensions-with-background-pages",
      "--disable-features=TranslateUI",
      "--disable-ipc-flooding-protection",
      "--disable-renderer-backgrounding",
      "--disable-sync",
      "--force-color-profile=srgb",
      "--metrics-recording-only",
      "--mute-audio",
      "--disable-web-security",
      "--disable-features=VizDisplayCompositor",
    ],
    // Optimize startup
    timeout: 120000, // 120 seconds timeout for browser launch
    protocolTimeout: 180000,
    // Ignore default args that might cause issues
    ignoreDefaultArgs: ["--disable-extensions"],
  },
  restartOnAuthFail: true,
  // wwebjs 1.34.7 fixed the session-restore race (hasSynced already-true check).
  // Use local cache to survive wppconnect HTML pruning; first run fetches live
  // WA Web and caches it, subsequent restarts use the cached copy.
  webVersionCache: {
    type: "local",
    path: "./.wwebjs_cache/",
  },
});

// Kill the Chrome subprocess on any process exit (process.exit from watchdog,
// fatal disconnect, or graceful SIGTERM) so it doesn't outlive Node as a zombie.
process.on("exit", () => {
  try {
    const browserProc = client.pupBrowser?.process?.();
    if (browserProc && !browserProc.killed) browserProc.kill("SIGKILL");
  } catch { /* ignore — browser may already be gone */ }
});

// Show QR code in terminal when authentication needed
let qrShown = false;

function exitOnFatalWhatsApp(reason) {
  const enabled = process.env.BOT_EXIT_ON_FATAL_DISCONNECT;
  // default ON unless explicitly "false" / "0"
  if (enabled === "false" || enabled === "0") {
    console.log(
      `[waReconnect] BOT_EXIT_ON_FATAL_DISCONNECT disabled — staying up after fatal (${reason})`
    );
    return;
  }
  const delayMs = Number(process.env.BOT_EXIT_ON_FATAL_DELAY_MS) || 8000;
  console.log(
    `[waReconnect] Fatal WhatsApp (${reason}) — exiting in ${Math.round(delayMs / 1000)}s so PM2 can restart`
  );
  setTimeout(() => {
    process.exit(1);
  }, delayMs).unref();
}

const waReconnect = createReconnectScheduler({
  client,
  isShuttingDown,
  onFatal: (reason) => {
    exitOnFatalWhatsApp(reason);
  },
  onScheduled: (reason, attempt, delayMs) => {
    botMetrics.increment("waReconnects");
    botLogger.wa.info(
      { event: "wa_reconnect_scheduled", reason, attempt, delayMs },
      "WhatsApp reconnect scheduled"
    );
  },
});

if (config.AI_DELIVERY_FALLBACK_ENABLED && !config.OPENAI_API_KEY) {
  console.warn("[config] AI_DELIVERY_FALLBACK_ENABLED=true but OPENAI_API_KEY is missing — AI fallback will be skipped on every malformed message.");
  botAlerts.notifyProcessError("config", new Error("AI_DELIVERY_FALLBACK_ENABLED=true but OPENAI_API_KEY is not set — AI fallback disabled"));
}

client.on("loading_screen", (percent, message) => {
  console.log(`   ⏳ Loading WhatsApp Web: ${percent}% — ${message || ""}`);
});

client.on("qr", async (qr) => {
  if (!qrShown) {
    console.log("\n" + "=".repeat(60));
    console.log("📱 HOW TO SCAN THE QR CODE:");
    console.log("=".repeat(60));
    console.log("1. Open WhatsApp on your PHONE (not computer)");
    console.log("2. Tap the 3 dots menu (☰) → Linked Devices");
    console.log("3. Tap 'Link a Device'");
    console.log("4. Point your phone camera at the QR code below");
    console.log("   OR open the qr-code.png file and scan it");
    console.log("=".repeat(60));
    console.log(
      "⚠️  QR code expires in 20 seconds. If it refreshes, scan the NEWEST one.\n"
    );
    qrShown = true;
    botAlerts.onQrShown();
  } else {
    console.log("\n⚠️  QR code refreshed! Scan the NEWEST QR code below:");
    console.log("   (Open WhatsApp → Linked Devices → Link a Device)\n");
    botAlerts.onQrShown();
  }

  // Show medium-sized QR code in terminal (may be distorted in Render logs)
  qrcode.generate(qr, { small: true });

  // Also save as image file and generate data URL for remote access
  try {
    const qrImagePath = path.join(__dirname, "..", "qr-code.png");
    await QRCode.toFile(qrImagePath, qr, {
      width: 400, // Increased size for better scanning
      margin: 2,
    });
    console.log("\n💡 QR code saved as: qr-code.png");

    // Generate base64 data URL for Render/remote access
    const qrDataUrl = await QRCode.toDataURL(qr, {
      width: 400,
      margin: 2,
    });

    // For Render: Output QR code in multiple formats for easier access
    console.log("\n🌐 QR CODE FOR REMOTE ACCESS (Render/Cloud):");
    console.log("=".repeat(80));
    console.log("\n📋 Option 1: Use online QR code generator");
    console.log("   Visit: https://www.qr-code-generator.com/");
    console.log("   Or: https://qr.io/");
    console.log("   Paste this QR code data:");
    console.log("   " + qr);
    console.log("\n📋 Option 2: Use base64 data URL (long, but works)");
    console.log(
      "   Copy the ENTIRE line below and paste in browser address bar:"
    );
    console.log(
      "   (It's very long - use 'Copy All' from Render logs if possible)"
    );
    console.log(
      qrDataUrl.substring(0, 200) + "... [truncated, see full URL in logs]"
    );
    console.log("\n📋 Option 3: Use the QR code terminal output above");
    console.log(
      "   (May be distorted in Render logs - try options 1 or 2 instead)"
    );
    console.log("=".repeat(80) + "\n");
  } catch (err) {
    console.log(
      "   (Could not save QR code image, but terminal QR code should work)\n"
    );
    console.log("   Raw QR data:", qr);
    console.log(
      "   Use this with an online QR code generator: https://www.qr-code-generator.com/\n"
    );
  }
});

// When client is ready
let remindersWorker = null;

async function fetchHealthStatus() {
  return getBotHealthStatus({
    client,
    clientReady: botRuntimeState.isClientReady(),
  });
}

const healthServerHandle = startBotHealthServer({
  getStatus: fetchHealthStatus,
  internalToken: process.env.BOT_INTERNAL_TOKEN || null,
  outboundEnabled: process.env.BOT_OUTBOUND_ENABLED !== "false",
  sendDocument: async (payload) => {
    await sendDocumentToWhatsapp(client, payload);
  },
  sendText: async (payload) => sendTextToWhatsapp(client, payload),
});

botAlerts.init({
  getQrShown: () => qrShown,
  client,
  getHealth: fetchHealthStatus,
});

registerGracefulShutdown({
  client,
  healthServer: healthServerHandle?.server ?? null,
  clearReconnectTimer: () => waReconnect.clearTimer(),
});

const metricsLogHours = parseFloat(process.env.BOT_METRICS_LOG_HOURS || "0", 10);
if (Number.isFinite(metricsLogHours) && metricsLogHours > 0) {
  const intervalMs = metricsLogHours * 60 * 60 * 1000;
  setInterval(() => {
    botLogger.health.info(
      { event: "metrics_snapshot", ...botMetrics.snapshot() },
      "Bot metrics snapshot"
    );
  }, intervalMs).unref();
}

function logListenerDiagnostics(label) {
  const messageListeners = client.listenerCount("message");
  const messageCreateListeners = client.listenerCount("message_create");
  console.log(`📊 [${label}] message listeners: ${messageListeners}, message_create: ${messageCreateListeners}`);
  if (messageListeners === 0 && messageCreateListeners === 0) {
    console.error("❌ WARNING: No message listeners registered!");
  } else {
    console.log("✅ Message listeners registered");
  }
}

async function forceChatSync(label) {
  try {
    const chats = await client.getChats();
    const groups = chats.filter((c) => c.isGroup);
    console.log(`   🔄 Chat sync (${label}): ${chats.length} chats, ${groups.length} groups`);
    return chats.length;
  } catch (err) {
    console.warn(`   ⚠️  Chat sync failed (${label}): ${err.message}`);
    return 0;
  }
}

function startRemindersWorkerIfEnabled() {
  if (!config.REMINDERS_ENABLED) {
    console.log(
      "📭 Reminders worker disabled (no bot reminder tables / USE_CORE_API mode)"
    );
    return;
  }
  if (remindersWorker) return;
  remindersWorker = createRemindersWorker({
    client,
    pollIntervalMs: Number(process.env.REMINDERS_POLL_MS) || 60000,
    batchSize: Number(process.env.REMINDERS_BATCH_SIZE) || 50,
    logger: console,
  });
  remindersWorker.start();
}

/**
 * One-time startup when WhatsApp is usable (ready event or authenticated fallback).
 * @param {"ready" | "authenticated-fallback"} source
 * @returns {Promise<boolean>} true if this call performed setup
 */
async function finalizeBotReady(source) {
  if (botRuntimeState.isClientReady()) {
    return false;
  }

  botRuntimeState.setClientReady(true);

  if (source === "authenticated-fallback") {
    // LoadUtils injection failed mid-auth (WA page navigated, flushing the
    // injected context). The page has now stabilized — re-inject and wire up
    // the WA→Node event bridge so messages actually flow.
    try {
      const { LoadUtils } = require("whatsapp-web.js/src/util/Injected/Utils");
      await client.pupPage.evaluate(LoadUtils);
      console.log("[fallback] LoadUtils re-injected");
    } catch (err) {
      console.warn("[fallback] LoadUtils re-inject failed:", err.message);
    }
    try {
      await client.attachEventListeners();
      console.log("[fallback] WA event bridge attached — messages will flow");
    } catch (err) {
      console.warn("[fallback] attachEventListeners failed:", err.message);
    }
  }

  waReconnect.reset();
  botAlerts.notifyReady();

  const startupDuration = ((Date.now() - startupStartTime) / 1000).toFixed(1);
  if (source === "ready") {
    botAlerts.notifyWhatsAppReady(startupDuration);
  }

  const viaFallback = source === "authenticated-fallback";
  botLogger.wa.info(
    {
      event: "bot_ready",
      source,
      viaFallback,
      startupSeconds: Number(startupDuration),
    },
    viaFallback ? "Bot ready (authenticated fallback)" : "Bot ready"
  );

  console.log("\n" + "=".repeat(60));
  if (viaFallback) {
    console.log("✅ BOT IS READY! (authenticated fallback — ready event did not fire)");
  } else {
    console.log("✅ BOT IS READY!");
  }
  console.log("=".repeat(60));
  console.log(`⏱️  Startup time: ${startupDuration} seconds`);
  console.log("📋 Listening for messages...");

  logListenerDiagnostics(source);
  await forceChatSync(source);

  console.log("=".repeat(60) + "\n");
  qrShown = false;

  setupDailyReportScheduler();
  startRemindersWorkerIfEnabled();

  console.log(
    "💡 Test: DM #ping / #status to this number, or #link in a group\n"
  );

  return true;
}

client.on("ready", async () => {
  await finalizeBotReady("ready");
});

// Authenticated = session cookies accepted. Does NOT mean Store is injected or
// events are flowing — only the real `ready` event guarantees that.
client.on("authenticated", async () => {
  console.log("\n" + "=".repeat(60));
  console.log("✅ AUTHENTICATED SUCCESSFULLY!");
  console.log("✅ Session saved!");
  console.log("💡 You won't need to scan QR code again next time.");
  console.log("=".repeat(60) + "\n");

  // If ready hasn't fired after BOT_READY_TIMEOUT_MS, the session restore is
  // stuck (known WA Web bug: restored sessions sometimes stall Store injection).
  // Clear the broken session and exit so PM2/nodemon restarts to a fresh QR.
  const READY_TIMEOUT_MS = Number(process.env.BOT_READY_TIMEOUT_MS) || 60000;
  setTimeout(async () => {
    let state = "unknown";
    try {
      state = await client.getState();
    } catch {
      /* ignore */
    }

    // If the bot is already ready (ready event fired in time), nothing to do.
    if (botRuntimeState.isClientReady() || isShuttingDown()) return;

    if (state === "CONNECTED") {
      // WA Web 2.3000+ sometimes skips the ready event but the connection and
      // message flow are fully functional. Activate the bot via the fallback
      // path instead of destroying a working session.
      console.warn(
        `\n⚠️  [watchdog] 'ready' did not fire within ${READY_TIMEOUT_MS / 1000}s but state=${state}.` +
          `\n   Activating via authenticated-fallback (session is healthy).`
      );
      await finalizeBotReady("authenticated-fallback");
      return;
    }

    // Truly stuck (NOT CONNECTED after timeout) — clear session so next start shows fresh QR.
    const result = handleReadyTimeout({
      isClientReady: false,
      isShuttingDown: false,
      sessionDir: SESSION_DIR,
      state,
      timeoutMs: READY_TIMEOUT_MS,
      onStuck: ({ state: st, timeoutMs }) => {
        console.error(
          `\n❌ [watchdog] 'ready' did not fire within ${timeoutMs / 1000}s (state=${st}).` +
            `\n   Session restore failed — clearing session and exiting for fresh QR scan.`
        );
        botAlerts.notifySessionRestoreStuck();
      },
    });

    if (result.action === "restart") {
      if (result.cleared) {
        console.log(`[watchdog] Cleared session: ${SESSION_DIR}`);
      } else if (result.error) {
        console.warn(`[watchdog] Could not clear session: ${result.error.message}`);
      }
      // Exit 1 = crash signal so nodemon (--exitcrash) auto-restarts in dev.
      // PM2 restarts on any exit code, so this is safe for production too.
      process.exit(1);
    }
  }, READY_TIMEOUT_MS);
});

// When authentication fails
client.on("auth_failure", (msg) => {
  botAlerts.notifyAuthFailure(msg);
  console.error("\n" + "=".repeat(60));
  console.error("❌ AUTHENTICATION FAILED!");
  console.error("Error:", msg);
  console.error("=".repeat(60) + "\n");
  exitOnFatalWhatsApp("AUTH_FAILURE");
});

// When client is disconnected
client.on("disconnected", (reason) => {
  botRuntimeState.setClientReady(false);
  botAlerts.notifyDisconnected(reason);
  botLogger.wa.warn({ event: "bot_disconnected", reason }, "WhatsApp disconnected");
  console.log("\n" + "=".repeat(60));
  console.log("⚠️  CLIENT DISCONNECTED");
  console.log("=".repeat(60));
  console.log("Reason:", reason);

  if (isShuttingDown()) {
    console.log("\n💡 Shutdown in progress — skipping auto-reconnect.\n");
    return;
  }

  waReconnect.scheduleReconnect(reason);
});

// Listen to all incoming messages (message_create is required on some whatsapp-web.js builds)
console.log("📋 Registering message event listener...");
console.log("🔍 Listening for 'message' and 'message_create' events");

const messageIngress = createMessageIngress({ delayMs: 400 });

function processIncomingMessage(msg, source) {
  if (source === "message_create") {
    console.log("🔔 MESSAGE_CREATE EVENT FIRED - forwarding to handler");
  }
  onMessage(msg, client).catch((err) => {
    console.error("⚠️  onMessage error:", err.message);
    botAlerts.notifyMessageError(err, msg?.from);
  });
}

function handleIncomingMessage(msg, source) {
  // Dedup by WA id + fingerprint (from|ts|body) — id alone fails when create omits id
  messageIngress.handle(msg, source, processIncomingMessage);
}

client.on("message", (msg) => handleIncomingMessage(msg, "message"));
client.on("message_create", (msg) => handleIncomingMessage(msg, "message_create"));


// Handle errors
client.on("error", (error) => {
  botAlerts.notifyClientError(error);
  console.error("❌ Client Error:", error.message);
  console.error("   Stack:", error.stack);
});

// Prevent uncaught errors from crashing the bot
process.on("uncaughtException", (error) => {
  console.error("⚠️  Uncaught Exception:", error.message);
  console.error("   Bot will continue running...\n");
  botAlerts.notifyProcessError("uncaughtException", error);
});

process.on("unhandledRejection", (reason, promise) => {
  // Filter out common Puppeteer errors that are harmless
  const errorMessage = reason?.message || String(reason);
  const isPuppeteerError =
    errorMessage.includes("Execution context was destroyed") ||
    errorMessage.includes("Protocol error") ||
    errorMessage.includes("Target closed");

  if (isPuppeteerError) {
    // These are common Puppeteer/WhatsApp Web.js errors that don't affect functionality
    console.warn(
      "⚠️  Puppeteer warning (can be ignored):",
      errorMessage.substring(0, 100)
    );
    console.warn("   Bot will continue running normally...\n");
  } else {
    console.error("⚠️  Unhandled Rejection:", reason);
    console.error("   Bot will continue running...\n");
    botAlerts.notifyProcessError("unhandledRejection", reason);
  }
});

// Daily report scheduler
function setupDailyReportScheduler() {
  if (!config.REPORT_ENABLED) {
    console.log("📊 Daily reports are disabled (REPORT_ENABLED=false)");
    return;
  }

  if (config.USE_CORE_API && !process.env.DATABASE_URL) {
    console.log(
      "📊 Daily reports disabled in core API mode without DATABASE_URL (reports read local deliveries table)"
    );
    return;
  }

  // Parse report time (HH:MM format)
  const [hours, minutes] = config.REPORT_TIME.split(":").map(Number);

  function scheduleNextReport() {
    const now = new Date();
    const reportTime = new Date();
    reportTime.setHours(hours, minutes, 0, 0);

    // If report time has passed today, schedule for tomorrow
    if (reportTime <= now) {
      reportTime.setDate(reportTime.getDate() + 1);
    }

    const msUntilReport = reportTime.getTime() - now.getTime();

    console.log(
      `📊 Daily report scheduled for: ${reportTime.toLocaleString("fr-FR")}`
    );
    console.log(`   (in ${Math.round(msUntilReport / 1000 / 60)} minutes)\n`);

    setTimeout(async () => {
      try {
        console.log("\n" + "=".repeat(70));
        console.log("📊 GENERATING DAILY REPORT...");
        console.log("=".repeat(70));

        const { report } = await generateDailyReport();

        // Send report via WhatsApp if configured
        if (config.REPORT_SEND_TO_GROUP && config.GROUP_ID) {
          try {
            const chat = await client.getChatById(config.GROUP_ID);
            await chat.sendMessage(report);
            console.log("✅ Daily report sent to WhatsApp group");
          } catch (error) {
            console.error(
              "❌ Failed to send report to WhatsApp:",
              error.message
            );
          }
        } else if (config.REPORT_RECIPIENT) {
          try {
            const chatId = `${config.REPORT_RECIPIENT}@c.us`;
            await client.sendMessage(chatId, report);
            console.log(`✅ Daily report sent to ${config.REPORT_RECIPIENT}`);
          } catch (error) {
            console.error(
              "❌ Failed to send report via WhatsApp:",
              error.message
            );
          }
        }

        console.log("=".repeat(70) + "\n");
      } catch (error) {
        console.error("❌ Error generating daily report:", error.message);
        botAlerts.notifyReportFailed(error);
      }

      // Schedule next report
      scheduleNextReport();
    }, msUntilReport);
  }

  scheduleNextReport();
}

// Initialize the client
console.log("\n" + "=".repeat(60));
console.log("🚀 Starting WhatsApp bot...");
console.log("=".repeat(60));
console.log("⏳ Initializing WhatsApp client...");
console.log("💡 This may take 30-60 seconds (Puppeteer needs to start)");
console.log("💡 First startup is slower (Chrome download if needed)");
console.log("💡 Please wait for QR code to appear...");
console.log("🔄 Starting Puppeteer browser...");
console.log("=".repeat(60) + "\n");

// Initialize with error handling
try {
  console.log("🔄 Calling client.initialize()...\n");
  client.initialize();
  console.log("✅ client.initialize() called successfully");
  console.log("💡 Waiting for authentication and ready event...\n");
} catch (error) {
  console.error("❌ CRITICAL ERROR: Failed to initialize client!");
  console.error("   Error:", error.message);
  console.error("   Stack:", error.stack);
  process.exit(1);
}
