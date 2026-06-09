"use strict";

describe("waReconnect", () => {
  beforeEach(() => {
    jest.resetModules();
    delete process.env.BOT_WA_RECONNECT_INITIAL_MS;
    delete process.env.BOT_WA_RECONNECT_MAX_MS;
    delete process.env.BOT_WA_FATAL_DISCONNECT_REASONS;
  });

  it("isFatalDisconnect matches LOGOUT and UNPAIRED", () => {
    const { isFatalDisconnect } = require("../../lib/waReconnect");
    expect(isFatalDisconnect("LOGOUT")).toBe(true);
    expect(isFatalDisconnect("logout")).toBe(true);
    expect(isFatalDisconnect("UNPAIRED")).toBe(true);
    expect(isFatalDisconnect("NAVIGATION")).toBe(false);
    expect(isFatalDisconnect("CONFLICT")).toBe(false);
  });

  it("respects BOT_WA_FATAL_DISCONNECT_REASONS override", () => {
    process.env.BOT_WA_FATAL_DISCONNECT_REASONS = "CONFLICT,CUSTOM";
    const { isFatalDisconnect } = require("../../lib/waReconnect");
    expect(isFatalDisconnect("CONFLICT")).toBe(true);
    expect(isFatalDisconnect("LOGOUT")).toBe(false);
  });

  it("getBackoffMs grows exponentially up to max", () => {
    process.env.BOT_WA_RECONNECT_INITIAL_MS = "5000";
    process.env.BOT_WA_RECONNECT_MAX_MS = "60000";
    const { getBackoffMs } = require("../../lib/waReconnect");
    expect(getBackoffMs(1)).toBe(5000);
    expect(getBackoffMs(2)).toBe(10000);
    expect(getBackoffMs(3)).toBe(20000);
    expect(getBackoffMs(10)).toBe(60000);
  });

  it("scheduler does not call initialize on fatal disconnect", () => {
    jest.useFakeTimers();
    const { createReconnectScheduler } = require("../../lib/waReconnect");
    const initialize = jest.fn();
    const onFatal = jest.fn();

    const scheduler = createReconnectScheduler({
      client: { initialize },
      isShuttingDown: () => false,
      onFatal,
    });

    scheduler.scheduleReconnect("LOGOUT");
    jest.runAllTimers();

    expect(initialize).not.toHaveBeenCalled();
    expect(onFatal).toHaveBeenCalledWith("LOGOUT");
    jest.useRealTimers();
  });

  it("scheduler calls initialize after backoff on recoverable disconnect", () => {
    jest.useFakeTimers();
    const { createReconnectScheduler } = require("../../lib/waReconnect");
    const initialize = jest.fn();

    const scheduler = createReconnectScheduler({
      client: { initialize },
      isShuttingDown: () => false,
    });

    scheduler.scheduleReconnect("NAVIGATION");
    expect(initialize).not.toHaveBeenCalled();

    jest.advanceTimersByTime(5000);
    expect(initialize).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it("scheduler skips reconnect when shutting down", () => {
    jest.useFakeTimers();
    const { createReconnectScheduler } = require("../../lib/waReconnect");
    const initialize = jest.fn();

    const scheduler = createReconnectScheduler({
      client: { initialize },
      isShuttingDown: () => true,
    });

    scheduler.scheduleReconnect("NAVIGATION");
    jest.runAllTimers();
    expect(initialize).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it("reset clears attempt count", () => {
    const { createReconnectScheduler } = require("../../lib/waReconnect");
    const scheduler = createReconnectScheduler({
      client: { initialize: jest.fn() },
      isShuttingDown: () => false,
    });
    scheduler.scheduleReconnect("NAVIGATION");
    expect(scheduler.getAttempt()).toBe(1);
    scheduler.reset();
    expect(scheduler.getAttempt()).toBe(0);
  });
});
