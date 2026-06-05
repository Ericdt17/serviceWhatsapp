# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LivSight — a multi-tenant SaaS delivery management system with three main components:
- **`wwebjs-bot/`** — Node.js/Express API + WhatsApp bot (whatsapp-web.js)
- **`client/`** — React 18 + TypeScript + Vite frontend dashboard
- **Database** — PostgreSQL (production) or SQLite (development), selectable via env vars

## Development Commands

### Backend (wwebjs-bot/)
```bash
cd wwebjs-bot
npm run dev          # Start bot + API server with nodemon (src/index.js)
npm run api:dev      # Start API server only with nodemon (src/api/server.js)
npm run migrate      # Run pending DB migrations (auto-detects SQLite vs Postgres)
npm run test:db      # Test database connection
```

### Frontend (client/)
```bash
cd client
npm run dev          # Start Vite dev server on port 5173
npm run build        # Production build
npm run lint         # ESLint
```

### Environment Setup
Copy the appropriate env example file for your backend:
- `wwebjs-bot/env.local.sqlite.example` → `wwebjs-bot/.env` (SQLite, simplest for dev)
- `wwebjs-bot/env.local.postgres.example` → `wwebjs-bot/.env` (PostgreSQL)

Frontend: Set `VITE_API_BASE_URL` in `client/.env`, or leave empty to use Vite proxy to `http://localhost:3000`.

## Architecture

### Database Adapter Pattern
The backend auto-selects the database based on environment:
- If `DATABASE_URL` is set → PostgreSQL (`pg` library)
- Otherwise → SQLite (`better-sqlite3`)

`wwebjs-bot/src/db.js` contains all query functions. `wwebjs-bot/db/migrate.js` runs migrations from `wwebjs-bot/db/migrations/` in alphabetical order, tracking executed files in a `schema_migrations` table.

### Multi-Tenant Isolation
- Each agency has its own `agency_id` embedded in the JWT token
- All API routes automatically filter data by `req.user.agencyId`
- Super admins can view all agencies; regular agency accounts see only their data

### Authentication Flow
- JWT stored in HTTP-only cookies (`auth_token`, 15-minute expiry, `sameSite: strict`)
- Frontend `AuthContext` (`client/src/contexts/AuthContext.tsx`) fetches `/api/v1/auth/me` on load to restore sessions
- Backend middleware (`wwebjs-bot/src/api/middleware/auth.js`) validates the cookie on every protected route

### WhatsApp Bot Message Processing
1. Bot only processes messages from groups registered in the `groups` table (format: `{numbers}@g.us`)
2. `wwebjs-bot/src/parser.js` — parses incoming messages into delivery objects (phone, items, amount, quartier)
3. `wwebjs-bot/src/statusParser.js` — detects status keywords (livré, échec, absent, etc.) and maps them to backend statuses
4. Reply-based updates: if a message quotes a previous bot message, the delivery is looked up via `whatsapp_message_id`
5. Tariffs are auto-applied during delivery creation/update if a tariff exists for the quartier + agency combination

### Status Vocabulary (Important)
Backend uses English statuses; frontend displays French labels:

| Backend | Frontend display |
|---------|-----------------|
| `pending` | en cours |
| `delivered` | livré |
| `failed` / `cancelled` | annulé |
| `pickup` | pickup |
| `expedition` | expédition |
| `client_absent` | client absent |

Transformation logic lives in `client/src/lib/data-transform.ts`.

### API Structure
- Base path: `/api/v1/`
- Express 5 app in `wwebjs-bot/src/api/server.js`
- Routes in `wwebjs-bot/src/api/routes/` (auth, agencies, groups, deliveries, tariffs, stats, search, reports)
- CORS: allows all in dev, validates against `ALLOWED_ORIGINS` env var in production (credentials: true required for cookie auth)

### Frontend Service Layer
`client/src/services/api.ts` is the base HTTP client (10s timeout, `credentials: 'include'`). Domain-specific services (`deliveries.ts`, `groups.ts`, etc.) wrap it. State management uses React Query (`@tanstack/react-query`).

## Key Environment Variables

### Backend
| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string (triggers Postgres mode) |
| `DB_TYPE` | `sqlite` or `postgres` |
| `JWT_SECRET` | Token signing secret (required in production) |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins |
| `API_PORT` | Server port (default: 3000) |
| `CLIENT_ID` | WhatsApp LocalAuth session ID (isolates dev/prod sessions) |
| `REPORT_ENABLED` / `REPORT_TIME` | Daily WhatsApp report config |

### Frontend
| Variable | Purpose |
|----------|---------|
| `VITE_API_BASE_URL` | Backend URL; empty = use Vite proxy |

## Deployment
- **Backend**: Render (Node.js service, `npm run start` → `node src/index.js`)
- **Frontend**: Vercel (`npm run build`, output: `client/dist/`)
- Run `npm run migrate` as a pre-deploy step when adding migrations
- Super admin accounts are created via seed scripts, not the signup endpoint (signup only allows `agency` role)
