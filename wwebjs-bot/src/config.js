// Load .env file only if not in Docker container or if explicitly enabled
// In Docker, we rely on environment variables passed at runtime
if (!process.env.DOCKER_CONTAINER && process.env.USE_ENV_FILE !== 'false') {
  require("dotenv").config();
}
module.exports = {
  // PostgreSQL connection string (required)
  DATABASE_URL: process.env.DATABASE_URL,
  
  // WhatsApp Group ID to listen to (optional - if not set, listens to all groups)
  GROUP_ID: process.env.GROUP_ID || null,
  
  // Daily report configuration
  REPORT_TIME: process.env.REPORT_TIME || "20:00", // Time to send daily report (HH:MM format)
  REPORT_ENABLED: process.env.REPORT_ENABLED !== "false", // Enable/disable automatic reports
  REPORT_SEND_TO_GROUP: process.env.REPORT_SEND_TO_GROUP === "true", // Send report to WhatsApp group
  REPORT_RECIPIENT: process.env.REPORT_RECIPIENT || null, // WhatsApp number to send report to (if not group)
  
  // Message sending configuration
  SEND_CONFIRMATIONS: process.env.SEND_CONFIRMATIONS || "false", // Send confirmation messages to group when delivery created/updated

  // Reply in thread when message looks like a delivery (phone + amount + quartier signals) but strict format fails
  FORMAT_REMINDER_ENABLED: process.env.FORMAT_REMINDER_ENABLED === "true",
  FORMAT_REMINDER_COOLDOWN_MS: (() => {
    const n = parseInt(process.env.FORMAT_REMINDER_COOLDOWN_MS || "90000", 10);
    return Number.isFinite(n) && n >= 0 ? n : 90000;
  })(),

  // Timezone for date filtering (must match the business timezone — Cameroon = UTC+1)
  TIME_ZONE: process.env.TIME_ZONE || "Africa/Douala",

  // OpenAI fallback when strict parse fails but message looks like a delivery (see looksLikeMalformedDelivery)
  // OPENAI_API_KEY: required when AI_DELIVERY_FALLBACK_ENABLED=true
  AI_DELIVERY_FALLBACK_ENABLED:
    process.env.AI_DELIVERY_FALLBACK_ENABLED === "true",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || null,
  AI_DELIVERY_MODEL: process.env.AI_DELIVERY_MODEL || "gpt-4o-mini",
  AI_DELIVERY_TIMEOUT_MS: (() => {
    const n = parseInt(process.env.AI_DELIVERY_TIMEOUT_MS || "8000", 10);
    return Number.isFinite(n) && n >= 1000 ? n : 8000;
  })(),
  AI_DELIVERY_MAX_TOKENS: (() => {
    const n = parseInt(process.env.AI_DELIVERY_MAX_TOKENS || "500", 10);
    return Number.isFinite(n) && n >= 50 ? n : 500;
  })(),

  // LivSight core API — single gateway/base URL; auth is {base}/auth/login
  ...(() => {
    const base = (process.env.CORE_API_BASE_URL || "").replace(/\/+$/, "");
    return {
      CORE_API_BASE_URL: base,
      CORE_AUTH_URL: base ? `${base}/auth/login` : "",
    };
  })(),
  CORE_BOT_USERNAME: process.env.CORE_BOT_USERNAME || null,
  CORE_BOT_PASSWORD: process.env.CORE_BOT_PASSWORD || null,
  CORE_DEPARTURE_CITY: process.env.CORE_DEPARTURE_CITY || "Douala",
  CORE_DEPARTURE_REGION: process.env.CORE_DEPARTURE_REGION || "Littoral",
  CORE_DEPARTURE_STREET: process.env.CORE_DEPARTURE_STREET || "",
  CORE_DESTINATION_CITY: process.env.CORE_DESTINATION_CITY || "Douala",
  CORE_DESTINATION_REGION: process.env.CORE_DESTINATION_REGION || "Littoral",
  CORE_DESTINATION_STREET: process.env.CORE_DESTINATION_STREET || "N/A",

  // Use LivSight core API (shared livsight DB via API — no bot migrations)
  USE_CORE_API: process.env.USE_CORE_API === "true",
  SKIP_MIGRATIONS: process.env.SKIP_MIGRATIONS === "true",
  // Legacy reminders need bot DB tables (reminder_targets, etc.) — off when USE_CORE_API
  REMINDERS_ENABLED: (() => {
    if (process.env.REMINDERS_ENABLED === "true") return true;
    if (process.env.REMINDERS_ENABLED === "false") return false;
    return process.env.USE_CORE_API !== "true";
  })(),
};

