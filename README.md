# SaaS Delivery (LivSight) — Monorepo Guide

This folder contains the **LivSight** delivery management system:

- A **web dashboard** (React) for agencies and super admins
- A **backend API + WhatsApp bot** (Node/Express + whatsapp-web.js)

If you’re new here, start with the Quickstart below, then use the deeper READMEs for each sub-app.

---

## Architecture (mental model)

```mermaid
flowchart LR
  WhatsAppGroups[WhatsApp_Groups]
  Bot[wwebjs-bot/src/index.js]
  Api[wwebjs-bot/src/api/server.js]
  Db[(SQLite_or_Postgres)]
  Web[client_(React_Dashboard)]

  WhatsAppGroups -->|messages| Bot
  Bot -->|create_update| Db
  Web -->|HTTP_(cookies)| Api
  Api -->|queries| Db
```

Key ideas:
- **UI “Prestataire” = backend `groups`**.
- **Deliveries** are created either via WhatsApp parsing (bot) or via REST API calls (dashboard / vendor routes).
- The API uses **JWT in an HTTP-only cookie** by default; mobile clients can use **Bearer tokens** when enabled (see `API.md`).

---

## Repo structure

Top-level sub-apps:
- `client/`: web dashboard (Vite + React + TypeScript + shadcn/ui + Tailwind)
- `wwebjs-bot/`: WhatsApp bot + REST API + DB layer (Node + Express)

Reference docs (already in this folder):
- `REPO_DOCUMENTATION.md`: full system overview and data model
- `API.md`: HTTP API reference
- `Production Deployment guide.md`: deployment guide
- `PRODUCTION_DEPLOYMENT_CHECKLIST.md`: production checklist
- `PRODUCTION_TROUBLESHOOTING.md`: production troubleshooting
- `DOMAIN_AND_DEPLOYMENT_SETUP.md`: domain/DNS notes

---

## Quickstart (local development)

### 1) Backend (`wwebjs-bot/`)

From `saasDelivery/wwebjs-bot/`:

```bash
npm install

# Choose ONE:
# SQLite (simplest)
cp ENV_LOCAL_EXAMPLE.txt .env

# OR PostgreSQL
cp env.local.postgres.example .env

# Create tables
npm run migrate

# Run API + bot (dev)
npm run dev

# Or run API only (no WhatsApp)
npm run api:dev
```

Notes:
- In production, the API refuses to start without `ALLOWED_ORIGINS` (see `wwebjs-bot/src/api/server.js`).
- **Do not commit** `wwebjs-bot/.env` (it contains secrets). Use the `env.*.example` files as templates.

### 2) Web dashboard (`client/`)

From `saasDelivery/client/`:

```bash
npm install
cp .env.example .env.local

# Recommended: keep VITE_API_BASE_URL empty to use Vite proxy
# (see client/ENV_SETUP.md)

npm run dev
```

By default, the Vite dev server proxies `/api/*` to `http://localhost:3000` (see `client/vite.config.ts`).

---

## Key concepts (glossary)

- **Agency**: an account that logs into the dashboard (role `agency`). Agencies own groups and deliveries.
- **Super admin**: global admin (role `super_admin`) who can manage multiple agencies.
- **Group / Prestataire**: WhatsApp group entity used as a “provider” in the UI. Stored in the `groups` table.
- **Delivery / Livraison**: a delivery record stored in `deliveries`.
- **Vendor**: a vendor user (role `vendor`) used by `/api/v1/vendor/*` routes (mobile app use-case).
- **Stock item (Magasin)**: inventory entries per vendor group, stored in `stock_items`.

---

## Where to start (junior dev path)

1) Read `REPO_DOCUMENTATION.md` for the end-to-end flow.
2) Use `client/README.md` to learn the dashboard structure and conventions.
3) Use `wwebjs-bot/README.md` for backend scripts, env setup, migrations, and production notes.

