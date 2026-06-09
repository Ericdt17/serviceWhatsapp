"use strict";

/**
 * Normalize TransactionResponse (or legacy shapes) from POST /api/transactions.
 * @param {object} body
 */
function extractTransactionRef(body) {
  if (!body || typeof body !== "object") return "OK";
  return (
    body.id ||
    body.transactionId ||
    body.transactionReference ||
    body.reference ||
    "OK"
  );
}

/**
 * Backend may flag idempotent replay; treat 200 + existing as success either way.
 * @param {object} body
 */
function isIdempotentReplay(body) {
  if (!body || typeof body !== "object") return false;
  return (
    body.idempotentReplay === true ||
    body.existing === true ||
    body.duplicate === true
  );
}

module.exports = {
  extractTransactionRef,
  isIdempotentReplay,
};
