"use strict";

const TOMORROW_KEYWORDS =
  /\b(demain|lendemain|pour\s+demain|jour\s+suivant)\b/i;
const TODAY_KEYWORDS = /\b(aujourd['']?hui|ce\s+jour|pour\s+aujourd['']?hui)\b/i;
const EXPLICIT_DATE_RE =
  /\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/;

function datePartsInTz(instant, timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const year = Number(parts.find((p) => p.type === "year").value);
  const month = Number(parts.find((p) => p.type === "month").value);
  const day = Number(parts.find((p) => p.type === "day").value);
  return { year, month, day };
}

function formatIsoDate({ year, month, day }) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addDaysToIsoDate(isoDate, days) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day + days));
  return dt.toISOString().slice(0, 10);
}

function getHourInTz(instant, timezone) {
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "numeric",
    hour12: false,
  }).format(instant);
  return Number.parseInt(hour, 10);
}

function parseExplicitDateFromText(messageText, referenceIsoDate, timezone) {
  const match = String(messageText || "").match(EXPLICIT_DATE_RE);
  if (!match) return null;

  const day = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  let year = match[3] ? Number.parseInt(match[3], 10) : null;

  if (!Number.isFinite(day) || !Number.isFinite(month) || day < 1 || month < 1 || month > 12) {
    return null;
  }

  if (year != null) {
    if (year < 100) year += 2000;
    if (!Number.isFinite(year)) return null;
  } else {
    const ref = datePartsInTz(new Date(`${referenceIsoDate}T12:00:00Z`), timezone);
    year = ref.year;
  }

  const candidate = formatIsoDate({ year, month, day });
  if (candidate < referenceIsoDate) {
    // e.g. "05/01" in December likely means next year
    const bumped = formatIsoDate({ year: year + 1, month, day });
    return bumped >= referenceIsoDate ? bumped : null;
  }
  return candidate;
}

/**
 * Resolve planned delivery date for core API (ISO YYYY-MM-DD).
 * Uses WhatsApp message time when available so backlog replay stays correct.
 *
 * Priority:
 * 1. "aujourd'hui" → today
 * 2. "demain" / "lendemain" → tomorrow
 * 3. Explicit DD/MM[/YYYY] in message
 * 4. Message hour >= cutoffHour → tomorrow
 * 5. Default → today
 */
function resolveScheduledDeliveryDate({
  messageText = "",
  messageTimestampSec,
  timezone = "Africa/Douala",
  cutoffHour = 18,
  now = new Date(),
} = {}) {
  const refInstant =
    messageTimestampSec && Number.isFinite(Number(messageTimestampSec))
      ? new Date(Number(messageTimestampSec) * 1000)
      : now;

  const today = formatIsoDate(datePartsInTz(refInstant, timezone));
  const tomorrow = addDaysToIsoDate(today, 1);
  const text = String(messageText || "");

  if (TODAY_KEYWORDS.test(text)) {
    return today;
  }
  if (TOMORROW_KEYWORDS.test(text)) {
    return tomorrow;
  }

  const explicit = parseExplicitDateFromText(text, today, timezone);
  if (explicit) {
    return explicit;
  }

  const hour = getHourInTz(refInstant, timezone);
  if (Number.isFinite(cutoffHour) && hour >= cutoffHour) {
    return tomorrow;
  }

  return today;
}

module.exports = {
  resolveScheduledDeliveryDate,
  /** @internal — exported for unit tests */
  datePartsInTz,
  addDaysToIsoDate,
};
