"use strict";

describe("botAlerts", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => "" });
    process.env.BOT_ALERT_WEBHOOK_URL = "https://discord.com/api/webhooks/test/token";
    delete process.env.BOT_ALERT_STARTUP_ENABLED;
    delete process.env.BOT_ALERT_RECONNECT_ENABLED;
    delete process.env.BOT_ALERT_STARTUP_EVERY_READY;
    delete process.env.BOT_ALERT_DISCONNECT_IMMEDIATE;
    delete process.env.BOT_ALERT_HEARTBEAT_ENABLED;
    delete process.env.BOT_ALERT_HEARTBEAT_HOURS;
  });

  afterEach(() => {
    jest.useRealTimers();
    global.fetch = originalFetch;
    delete process.env.BOT_ALERT_WEBHOOK_URL;
    delete process.env.BOT_ALERT_DISCONNECT_IMMEDIATE;
    delete process.env.BOT_ALERT_HEARTBEAT_ENABLED;
    delete process.env.BOT_ALERT_HEARTBEAT_HOURS;
  });

  function lastDiscordBody() {
    const call = global.fetch.mock.calls[global.fetch.mock.calls.length - 1];
    return JSON.parse(call[1].body);
  }

  it("sends reconnect alert after recoverable disconnect then ready", async () => {
    const botAlerts = require("../../lib/botAlerts");
    botAlerts.notifyDisconnected("NAVIGATION");
    botAlerts.notifyWhatsAppReady("120.5");

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(lastDiscordBody().content).toMatch(/Bot reconnecté — WhatsApp OK/);
  });

  it("sends logout-required alert on LOGOUT without reconnect message", () => {
    const botAlerts = require("../../lib/botAlerts");
    botAlerts.notifyDisconnected("LOGOUT");

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(lastDiscordBody().content).toMatch(/Session WhatsApp fermée/);
    expect(lastDiscordBody().content).toMatch(/Rescanner le QR/);
    expect(lastDiscordBody().content).not.toMatch(/Reconnexion en cours/);
  });

  it("sends immediate disconnect alert by default", () => {
    const botAlerts = require("../../lib/botAlerts");
    botAlerts.notifyDisconnected("NAVIGATION");

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(lastDiscordBody().content).toMatch(/WhatsApp déconnecté/);
  });

  it("sends startup alert on first ready without prior disconnect", async () => {
    const botAlerts = require("../../lib/botAlerts");
    botAlerts.notifyWhatsAppReady("22.0");

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(lastDiscordBody().content).toMatch(/Bot en ligne — WhatsApp prêt/);
  });

  it("does not repeat startup alert on second ready without disconnect", async () => {
    const botAlerts = require("../../lib/botAlerts");
    botAlerts.notifyWhatsAppReady("22.0");
    botAlerts.notifyWhatsAppReady("300.0");

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("Core API 3-step alerts: session lost, reconnecting, reconnected", () => {
    const botAlerts = require("../../lib/botAlerts");
    botAlerts.notifyCoreApiSessionLost();
    botAlerts.notifyCoreApiReconnecting();
    botAlerts.notifyCoreApiReconnected();

    expect(global.fetch).toHaveBeenCalledTimes(3);
    const bodies = global.fetch.mock.calls.map((c) => JSON.parse(c[1].body).content);
    expect(bodies[0]).toMatch(/Session API LivSight expirée/);
    expect(bodies[1]).toMatch(/Reconnexion à l'API LivSight/);
    expect(bodies[2]).toMatch(/Bot reconnecté à l'API LivSight/);
    expect(botAlerts.isCoreApiAuthDown()).toBe(false);
  });

  it("notifyCoreApiAuthFailure marks API down", () => {
    const botAlerts = require("../../lib/botAlerts");
    botAlerts.notifyCoreApiAuthFailure(new Error("bad creds"));

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(lastDiscordBody().content).toMatch(/Échec connexion API LivSight/);
    expect(botAlerts.isCoreApiAuthDown()).toBe(true);
  });

  it("notifyCoreApiHealthDown skips duplicate when auth already down", () => {
    const botAlerts = require("../../lib/botAlerts");
    botAlerts.notifyCoreApiSessionLost();
    botAlerts.notifyCoreApiHealthDown();

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("sends daily heartbeat when health reports ready", async () => {
    process.env.BOT_ALERT_HEARTBEAT_HOURS = "24";
    const botAlerts = require("../../lib/botAlerts");
    botAlerts.__resetForTests();
    botAlerts.init({
      getHealth: async () => ({ ready: true }),
    });

    jest.advanceTimersByTime(24 * 60 * 60 * 1000);
    await Promise.resolve();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(lastDiscordBody().content).toMatch(/Bot OK — WhatsApp et API connectés/);
  });

  it("__resetForTests clears module state", () => {
    const botAlerts = require("../../lib/botAlerts");
    botAlerts.notifyCoreApiSessionLost();
    expect(botAlerts.isCoreApiAuthDown()).toBe(true);
    botAlerts.__resetForTests();
    expect(botAlerts.isCoreApiAuthDown()).toBe(false);
  });
});
