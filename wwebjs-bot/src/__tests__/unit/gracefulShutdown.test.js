"use strict";

describe("gracefulShutdown", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("isShuttingDown is false before registerGracefulShutdown", () => {
    const { isShuttingDown } = require("../../lib/gracefulShutdown");
    expect(isShuttingDown()).toBe(false);
  });

  it("clearReconnectTimer is called on SIGTERM", async () => {
    const exitSpy = jest.spyOn(process, "exit").mockImplementation(() => {});
    const { registerGracefulShutdown, isShuttingDown } = require("../../lib/gracefulShutdown");
    const clearReconnectTimer = jest.fn();
    const destroy = jest.fn().mockResolvedValue(undefined);
    const client = { destroy };
    const healthServer = {
      close: jest.fn((cb) => cb()),
    };

    registerGracefulShutdown({
      client,
      healthServer,
      clearReconnectTimer,
      destroyTimeoutMs: 100,
    });

    process.emit("SIGTERM");
    await new Promise((r) => setTimeout(r, 50));

    expect(clearReconnectTimer).toHaveBeenCalled();
    expect(destroy).toHaveBeenCalled();
    expect(isShuttingDown()).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(0);
    exitSpy.mockRestore();
  });
});
