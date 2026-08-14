"use strict";

const path = require("path");
const {
  resolveSessionDir,
  clearSessionDir,
  shouldClearSessionOnReadyTimeout,
  handleReadyTimeout,
} = require("../../lib/waReadyWatchdog");

describe("waReadyWatchdog", () => {
  it("resolveSessionDir builds LocalAuth session path", () => {
    expect(resolveSessionDir("/app", "livsight-local")).toBe(
      path.join("/app", ".wwebjs_auth", "session-livsight-local")
    );
  });

  it("shouldClearSessionOnReadyTimeout is false when already ready", () => {
    expect(
      shouldClearSessionOnReadyTimeout({
        isClientReady: true,
        isShuttingDown: false,
      })
    ).toBe(false);
  });

  it("shouldClearSessionOnReadyTimeout is false when shutting down", () => {
    expect(
      shouldClearSessionOnReadyTimeout({
        isClientReady: false,
        isShuttingDown: true,
      })
    ).toBe(false);
  });

  it("shouldClearSessionOnReadyTimeout is true when stuck after auth", () => {
    expect(
      shouldClearSessionOnReadyTimeout({
        isClientReady: false,
        isShuttingDown: false,
      })
    ).toBe(true);
  });

  it("clearSessionDir removes existing session directory", () => {
    const rmSync = jest.fn();
    const existsSync = jest.fn().mockReturnValue(true);
    const result = clearSessionDir("/tmp/session-x", {
      fsModule: { existsSync, rmSync },
    });
    expect(result.cleared).toBe(true);
    expect(rmSync).toHaveBeenCalledWith("/tmp/session-x", {
      recursive: true,
      force: true,
    });
  });

  it("handleReadyTimeout clears session and signals restart when stuck", () => {
    const onStuck = jest.fn();
    const rmSync = jest.fn();
    const result = handleReadyTimeout({
      isClientReady: false,
      isShuttingDown: false,
      sessionDir: "/tmp/session-stuck",
      state: "CONNECTED",
      timeoutMs: 60000,
      fsModule: { existsSync: () => true, rmSync },
      onStuck,
    });
    expect(result.action).toBe("restart");
    expect(result.cleared).toBe(true);
    expect(onStuck).toHaveBeenCalledWith({
      state: "CONNECTED",
      timeoutMs: 60000,
    });
    expect(rmSync).toHaveBeenCalled();
  });

  it("handleReadyTimeout is a noop when client already ready", () => {
    const onStuck = jest.fn();
    const rmSync = jest.fn();
    const result = handleReadyTimeout({
      isClientReady: true,
      isShuttingDown: false,
      sessionDir: "/tmp/session-ok",
      fsModule: { existsSync: () => true, rmSync },
      onStuck,
    });
    expect(result.action).toBe("noop");
    expect(onStuck).not.toHaveBeenCalled();
    expect(rmSync).not.toHaveBeenCalled();
  });
});
