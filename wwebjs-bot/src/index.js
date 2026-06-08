const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const QRCode = require("qrcode");
const fs = require("fs");
const path = require("path");
const config = require("./config");
const { createRemindersWorker } = require("./reminders/worker");
const { generateDailyReport } = require("./lib/daily-report");
const botAlerts = require("./lib/botAlerts");
const { onMessage } = require("./handlers/messageHandler");

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

// Create WhatsApp client with local auth (saves session)
// Using clientId for environment isolation (prod/staging/dev)
const client = new Client({
  authStrategy: new LocalAuth({
    clientId: process.env.CLIENT_ID || "delivery-bot-default",
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
      "--single-process",
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
      // Additional Windows-specific fixes
      "--disable-web-security",
      "--disable-features=VizDisplayCompositor",
    ],
    // Optimize startup
    timeout: 120000, // 120 seconds timeout for browser launch
    // Ignore default args that might cause issues
    ignoreDefaultArgs: ["--disable-extensions"],
  },
  // Add restart on failure
  restartOnAuthFail: true,
  // Add web version cache
  webVersionCache: {
    type: "remote",
    remotePath:
      "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2413.51-beta.html",
  },
});

// Show QR code in terminal when authentication needed
let qrShown = false;
botAlerts.init({ getQrShown: () => qrShown, client });

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
let clientReady = false;

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

client.on("ready", async () => {
  clientReady = true;
  botAlerts.notifyReady();
  const startupDuration = ((Date.now() - startupStartTime) / 1000).toFixed(1);
  botAlerts.notifyStartup(startupDuration);
  console.log("\n" + "=".repeat(60));
  console.log("✅ BOT IS READY!");
  console.log("=".repeat(60));
  console.log(`⏱️  Startup time: ${startupDuration} seconds`);
  console.log("📋 Listening for messages...");

  logListenerDiagnostics("ready");
  await forceChatSync("ready");

  console.log("=".repeat(60) + "\n");
  qrShown = false;

  setupDailyReportScheduler();
  startRemindersWorkerIfEnabled();
});

// Additional check: Sometimes ready event doesn't fire, check state manually
client.on("authenticated", async () => {
  console.log("\n" + "=".repeat(60));
  console.log("✅ AUTHENTICATED SUCCESSFULLY!");
  console.log("✅ Session saved!");
  console.log("💡 You won't need to scan QR code again next time.");
  console.log("=".repeat(60) + "\n");

  // Wait a bit then check if client is ready (in case ready event doesn't fire)
  setTimeout(async () => {
    try {
      const state = await client.getState();
      console.log(
        `\n🔍 DIAGNOSTIC: Checking client state after authentication...`
      );
      console.log(`   State: ${state}`);

      if (state === "CONNECTED") {
        botAlerts.notifyReady();
        console.log("\n" + "=".repeat(60));
        console.log(`✅ CLIENT STATE: CONNECTED${clientReady ? " (ready event fired)" : " (ready event NOT fired yet)"}`);
        console.log("=".repeat(60));
        console.log("📋 Bot should be listening for messages now.");

        logListenerDiagnostics("authenticated");

        if (!clientReady) {
          console.log("   ⚠️  Waiting for full sync — forcing chat load...");
          await forceChatSync("authenticated-fallback");
        }

        if (typeof setupDailyReportScheduler === "function") {
          console.log("📅 Setting up daily report scheduler...");
          setupDailyReportScheduler();
        }

        startRemindersWorkerIfEnabled();

        console.log(
          "\n💡 Test: send #link in a group where THIS phone is a member\n"
        );
        console.log("=".repeat(60) + "\n");
      } else {
        console.log(`\n⚠️  Client state: ${state}`);
        console.log("💡 Waiting for ready event or CONNECTED state...\n");
      }
    } catch (error) {
      console.error("⚠️  Error checking client state:", error.message);
      console.error("   Stack:", error.stack);
    }
  }, 3000); // Check after 3 seconds (reduced from 5)
});

// When authentication fails
client.on("auth_failure", (msg) => {
  botAlerts.notifyAuthFailure(msg);
  console.error("\n" + "=".repeat(60));
  console.error("❌ AUTHENTICATION FAILED!");
  console.error("Error:", msg);
  console.error("=".repeat(60) + "\n");
});

// When client is disconnected
client.on("disconnected", (reason) => {
  botAlerts.notifyDisconnected(reason);
  console.log("\n" + "=".repeat(60));
  console.log("⚠️  CLIENT DISCONNECTED");
  console.log("=".repeat(60));
  console.log("Reason:", reason);
  console.log("\n💡 The session is saved in ./auth folder");
  console.log("🔄 Attempting to reconnect...\n");

  // Auto-reconnect after 5 seconds
  setTimeout(() => {
    console.log("🔄 Reconnecting...");
    client.initialize();
  }, 5000);
});

// Listen to all incoming messages (message_create is required on some whatsapp-web.js builds)
console.log("📋 Registering message event listener...");
console.log("🔍 Listening for 'message' and 'message_create' events");

const recentMessageIds = new Set();
/** @type {Map<string, { timer: NodeJS.Timeout, msg: object }>} */
const pendingMessageCreate = new Map();

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
  const id = msg?.id?._serialized;

  // Prefer `message` over `message_create` — create often fires first with incomplete data.
  if (source === "message") {
    if (id && pendingMessageCreate.has(id)) {
      clearTimeout(pendingMessageCreate.get(id).timer);
      pendingMessageCreate.delete(id);
    }
    if (id) {
      if (recentMessageIds.has(id)) return;
      recentMessageIds.add(id);
      if (recentMessageIds.size > 500) recentMessageIds.clear();
    }
    return processIncomingMessage(msg, source);
  }

  // message_create: wait briefly in case `message` arrives with full body/chat
  if (id && recentMessageIds.has(id)) return;

  if (id && pendingMessageCreate.has(id)) {
    clearTimeout(pendingMessageCreate.get(id).timer);
  }

  const timer = setTimeout(() => {
    pendingMessageCreate.delete(id);
    if (recentMessageIds.has(id)) return;
    recentMessageIds.add(id);
    if (recentMessageIds.size > 500) recentMessageIds.clear();
    processIncomingMessage(msg, "message_create");
  }, 400);

  if (id) {
    pendingMessageCreate.set(id, { timer, msg });
  } else {
    processIncomingMessage(msg, "message_create");
  }
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
