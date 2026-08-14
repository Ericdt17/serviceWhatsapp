---
name: seed-local-tx
description: Seed 5 stock + 5 pickup transactions for today (local dashboard data)
---

# Seed local transactions

Run this exact command. Do not invent another seed.

Working directory: `wwebjs-bot`

```bash
npm run seed:local-tx
```

Requires local gateway (`:4040`) and `backend_core` (`:8085`), plus `wwebjs-bot/.env` (`USE_CORE_API=true`, `CORE_*`).

See `wwebjs-bot/local-dev/README.md` for fixtures and WhatsApp test messages.

After it finishes, report stdout: how many stock vs pickup succeeded or failed.
