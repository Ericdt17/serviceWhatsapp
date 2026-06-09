"use strict";

const {
  extractTransactionRef,
  isIdempotentReplay,
} = require("../../lib/transactionResponse");

describe("transactionResponse", () => {
  it("extractTransactionRef prefers id then transactionReference", () => {
    expect(extractTransactionRef({ id: 42, transactionReference: "TX-42" })).toBe(
      42
    );
    expect(
      extractTransactionRef({ transactionReference: "TX-99", reference: "R1" })
    ).toBe("TX-99");
    expect(extractTransactionRef({})).toBe("OK");
  });

  it("isIdempotentReplay detects backend replay flags", () => {
    expect(isIdempotentReplay({ existing: true })).toBe(true);
    expect(isIdempotentReplay({ idempotentReplay: true })).toBe(true);
    expect(isIdempotentReplay({ id: 1 })).toBe(false);
  });
});
