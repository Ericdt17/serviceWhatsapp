"use strict";

const base = require("../logger");

const order = base.child({ component: "order" });
const api = base.child({ component: "api" });
const wa = base.child({ component: "wa" });
const health = base.child({ component: "health" });
const staff = base.child({ component: "staff" });

function verboseConsole(...args) {
  if (
    process.env.BOT_VERBOSE_LOGS === "true" ||
    process.env.BOT_VERBOSE_LOGS === "1"
  ) {
    console.log(...args);
  }
}

module.exports = {
  order,
  api,
  wa,
  health,
  staff,
  verboseConsole,
};
