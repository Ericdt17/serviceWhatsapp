"use strict";

let shuttingDown = false;

function isShuttingDown() {
  return shuttingDown;
}

/**
 * @param {{
 *   client: import('whatsapp-web.js').Client,
 *   healthServer?: import('http').Server | null,
 *   clearReconnectTimer?: () => void,
 *   destroyTimeoutMs?: number,
 * }} options
 */
function registerGracefulShutdown(options) {
  const {
    client,
    healthServer = null,
    clearReconnectTimer,
    destroyTimeoutMs = 20000,
  } = options;

  const shutdown = async (signal, exitCode = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(`\n[shutdown] Received ${signal}, shutting down gracefully...`);

    if (typeof clearReconnectTimer === "function") {
      clearReconnectTimer();
    }

    const destroyWithTimeout = () =>
      Promise.race([
        client.destroy().catch((err) => {
          console.error("[shutdown] client.destroy() error:", err.message);
        }),
        new Promise((resolve) => setTimeout(resolve, destroyTimeoutMs)),
      ]);

    await destroyWithTimeout();

    if (healthServer) {
      await new Promise((resolve) => {
        healthServer.close((err) => {
          if (err) {
            console.error("[shutdown] health server close error:", err.message);
          }
          resolve();
        });
      });
    }

    console.log("[shutdown] Done.");
    process.exit(exitCode);
  };

  process.once("SIGTERM", () => {
    shutdown("SIGTERM", 0).catch(() => process.exit(1));
  });

  process.once("SIGINT", () => {
    shutdown("SIGINT", 0).catch(() => process.exit(1));
  });
}

module.exports = {
  isShuttingDown,
  registerGracefulShutdown,
};
