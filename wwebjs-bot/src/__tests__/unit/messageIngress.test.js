"use strict";

const { createMessageIngress, keysForMessage } = require("../../lib/messageIngress");

describe("messageIngress", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("keys include id and fingerprint", () => {
    const keys = keysForMessage({
      id: { _serialized: "true_120@g.us_ABCDEF" },
      from: "120@g.us",
      timestamp: 100,
      body: "#link",
      fromMe: false,
    });
    expect(keys).toContain("id:true_120@g.us_ABCDEF");
    expect(keys.some((k) => k.startsWith("fp:"))).toBe(true);
  });

  it("dedupes message + message_create with same id", () => {
    const ingress = createMessageIngress({ delayMs: 400 });
    const processFn = jest.fn();
    const msg = {
      id: { _serialized: "true_1@g.us_AAA" },
      from: "1@g.us",
      timestamp: 1,
      body: "#ping",
    };

    ingress.handle(msg, "message_create", processFn);
    ingress.handle(msg, "message", processFn);
    jest.advanceTimersByTime(500);

    expect(processFn).toHaveBeenCalledTimes(1);
    expect(processFn).toHaveBeenCalledWith(msg, "message");
  });

  it("dedupes when message_create has no id but same fingerprint", () => {
    const ingress = createMessageIngress({ delayMs: 400 });
    const processFn = jest.fn();
    const base = {
      from: "120363429871433333@g.us",
      timestamp: 1785677962,
      body: "#link",
      fromMe: false,
    };

    ingress.handle({ ...base }, "message_create", processFn);
    ingress.handle(
      { ...base, id: { _serialized: "true_120@g.us_XYZ" } },
      "message",
      processFn
    );
    jest.advanceTimersByTime(500);

    expect(processFn).toHaveBeenCalledTimes(1);
    expect(processFn.mock.calls[0][1]).toBe("message");
  });

  it("processes message_create only when message never arrives", () => {
    const ingress = createMessageIngress({ delayMs: 400 });
    const processFn = jest.fn();
    const msg = {
      id: { _serialized: "true_1@g.us_BBB" },
      from: "1@g.us",
      timestamp: 2,
      body: "hello",
    };

    ingress.handle(msg, "message_create", processFn);
    expect(processFn).not.toHaveBeenCalled();
    jest.advanceTimersByTime(400);
    expect(processFn).toHaveBeenCalledTimes(1);
    expect(processFn).toHaveBeenCalledWith(msg, "message_create");
  });
});
