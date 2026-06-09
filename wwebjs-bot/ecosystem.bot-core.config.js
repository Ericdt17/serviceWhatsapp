/**
 * PM2 — core WhatsApp bot only (staging/prod second folder).
 * Usage: pm2 start ecosystem.bot-core.config.js
 */

module.exports = {
  apps: [
    {
      name: "whatsapp-bot-core",
      script: "src/index.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
      },
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      min_uptime: "30s",
      max_restarts: 10,
      restart_delay: 5000,
      kill_timeout: 30000,
      listen_timeout: 120000,
      error_file: "./logs/bot-core-error.log",
      out_file: "./logs/bot-core-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      env_file: ".env",
    },
  ],
};
