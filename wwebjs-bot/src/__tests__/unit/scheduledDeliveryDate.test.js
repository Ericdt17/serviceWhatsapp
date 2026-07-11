"use strict";

const { resolveScheduledDeliveryDate } = require("../../lib/scheduledDeliveryDate");

const TZ = "Africa/Douala";

/** Unix seconds for a given UTC instant */
function ts(isoUtc) {
  return Math.floor(new Date(isoUtc).getTime() / 1000);
}

describe("resolveScheduledDeliveryDate", () => {
  it("returns today when message is before cutoff hour", () => {
    const date = resolveScheduledDeliveryDate({
      messageText: "699000001\n2 robes\n12000\nAkwa",
      messageTimestampSec: ts("2026-07-11T16:30:00Z"), // 17:30 Douala
      timezone: TZ,
      cutoffHour: 18,
    });
    expect(date).toBe("2026-07-11");
  });

  it("returns tomorrow when message is at or after cutoff hour", () => {
    const date = resolveScheduledDeliveryDate({
      messageText: "699000001\n2 robes\n12000\nAkwa",
      messageTimestampSec: ts("2026-07-11T17:00:00Z"), // 18:00 Douala
      timezone: TZ,
      cutoffHour: 18,
    });
    expect(date).toBe("2026-07-12");
  });

  it("returns tomorrow when message contains demain even before cutoff", () => {
    const date = resolveScheduledDeliveryDate({
      messageText: "699000001\n2 robes\n12000\nAkwa\npour demain",
      messageTimestampSec: ts("2026-07-11T08:00:00Z"), // 09:00 Douala
      timezone: TZ,
      cutoffHour: 18,
    });
    expect(date).toBe("2026-07-12");
  });

  it("returns today when message contains aujourd'hui even after cutoff", () => {
    const date = resolveScheduledDeliveryDate({
      messageText: "699000001\n2 robes\n12000\nAkwa\npour aujourd'hui",
      messageTimestampSec: ts("2026-07-11T20:00:00Z"), // 21:00 Douala
      timezone: TZ,
      cutoffHour: 18,
    });
    expect(date).toBe("2026-07-11");
  });

  it("uses message timestamp so evening backlog maps to next calendar day", () => {
    const date = resolveScheduledDeliveryDate({
      messageText: "699000001\n2 robes\n12000\nAkwa",
      messageTimestampSec: ts("2026-07-10T19:00:00Z"), // 20:00 Douala on 10th
      timezone: TZ,
      cutoffHour: 18,
      now: new Date("2026-07-11T06:00:00Z"), // processed next morning
    });
    expect(date).toBe("2026-07-11");
  });

  it("parses explicit DD/MM date in message", () => {
    const date = resolveScheduledDeliveryDate({
      messageText: "699000001\n2 robes\n12000\nAkwa\nlivraison 15/07",
      messageTimestampSec: ts("2026-07-11T10:00:00Z"),
      timezone: TZ,
      cutoffHour: 18,
    });
    expect(date).toBe("2026-07-15");
  });
});
