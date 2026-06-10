"use strict";

let clientReady = false;

function setClientReady(value) {
  clientReady = Boolean(value);
}

function isClientReady() {
  return clientReady;
}

/** @internal — tests only */
function resetForTests() {
  clientReady = false;
}

module.exports = {
  setClientReady,
  isClientReady,
  resetForTests,
};
