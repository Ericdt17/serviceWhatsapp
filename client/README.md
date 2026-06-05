# LivSight — Web Dashboard (`saasDelivery/client`)

React + TypeScript dashboard for agencies and super admins.

This app talks to the backend REST API in `../wwebjs-bot` (base path `/api/v1`).

---

## Tech stack (what you’ll see in code)

- Vite + React 18 + TypeScript
- React Router (`src/App.tsx`)
- TanStack React Query (`@tanstack/react-query`) for server state
- shadcn/ui components under `src/components/ui/*`
- Tailwind CSS for styling

---

## Run locally

From `saasDelivery/client/`:

```bash
npm install
cp .env.example .env.local
npm run dev
```

### API base URL / proxy

- Recommended dev setup: keep `VITE_API_BASE_URL` empty and use the Vite proxy for `/api/*`.
  - See `ENV_SETUP.md` for the full explanation.
  - Proxy is configured in `vite.config.ts` to target `http://localhost:3000` by default.

---

## Folder map (where things live)

- **Routing**: `src/App.tsx`
  - All main routes are declared here (dashboard pages and `/login`).
- **Layout / Sidebar**: `src/components/layout/*`
  - Sidebar nav items are defined in `src/components/layout/Sidebar.tsx`.
  - Note: the sidebar label **“Prestataire”** points to route `/groupes`.
- **Pages (screens)**: `src/pages/*`
  - Example: groups list is `src/pages/operations/Groups.tsx`
  - Example: group details is `src/pages/operations/GroupDetail.tsx`
- **API service layer**: `src/services/*`
  - Files match backend resources: `groups.ts`, `deliveries.ts`, `agencies.ts`, etc.
  - Shared HTTP client lives in `src/services/api.ts` (uses cookies via `credentials: 'include'`).
- **Shared utilities**: `src/lib/*`
  - Dates: `src/lib/date-utils.ts` (local timezone helpers and presets like “today”)

---

## How data fetching works (React Query)

Pattern:
- Pages call functions from `src/services/*`
- Queries have stable `queryKey`s, and mutations call `invalidateQueries` to refresh UI after writes.

Where to look:
- QueryClient defaults are set in `src/App.tsx` (retry rules, stale time, etc.).

---

## Common workflows (for juniors)

### Add a new sidebar item

1) Add a nav item in `src/components/layout/Sidebar.tsx` (`allNavItems` list).
2) Add a matching `<Route>` in `src/App.tsx`.
3) Create the page component under `src/pages/...`.

### Add a new table filter

Typical pattern:
- Create a new `useState(...)` for the filter in the page (example: `Groups.tsx` has `search` + `statusFilter`).
- Apply the filter in a `useMemo(...)` list transformer before sorting/pagination.
- Add UI controls (Popover/Select/Input) near the “Search + filter bar”.

### Trace UI → API endpoint quickly

1) Start from a page under `src/pages/*` (e.g. `operations/Groups.tsx`)
2) Find the service call (e.g. `getGroups` from `src/services/groups.ts`)
3) That service calls `apiGet`/`apiPost` in `src/services/api.ts`
4) Match the endpoint to backend route files under `../wwebjs-bot/src/api/routes/*`

---

## Gotchas

- **Cookies auth**: the frontend relies on `credentials: 'include'` (see `src/services/api.ts`). If you hit auth issues in dev, verify the backend CORS + cookie settings.
- **Dates & “today”**: prefer `src/lib/date-utils.ts` helpers for date ranges in local timezone. Avoid doing date math manually in pages.

