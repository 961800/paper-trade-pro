# PaperTrade Pro

A full-featured Indian stock market paper trading web app. Users get ₹1,00,000 virtual capital to trade NIFTY/BANKNIFTY/SENSEX/FINNIFTY options (CE/PE) without real money.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/papertrade-pro run dev` — run the frontend (port 19928)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string, `SESSION_SECRET` — JWT signing secret

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind CSS v4 + shadcn/ui components
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod, drizzle-zod
- API codegen: Orval (from OpenAPI spec → React Query hooks + Zod schemas)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI contract (source of truth for API)
- `lib/api-client-react/src/generated/` — Generated React Query hooks & Zod schemas
- `lib/db/src/schema/` — Drizzle ORM schema (users, orders, positions, trades, watchlist, notifications)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/api-server/src/lib/market-simulator.ts` — Black-Scholes options pricing + Brownian motion
- `artifacts/papertrade-pro/src/` — React frontend (pages, components, hooks)

## Architecture decisions

- **Auth**: Custom JWT-like token (base64 payload + HMAC sig using SESSION_SECRET). Token stored in localStorage, sent via `Authorization: Bearer` header.
- **Options pricing**: Black-Scholes model with Brownian motion for intraday price simulation. Underlying index prices stored per session, updated on each market data request.
- **DB numeric types**: All price/balance columns use `numeric` (not `float`) to avoid floating point errors. Always parse with `parseFloat()` in routes.
- **API contract-first**: OpenAPI spec → Orval codegen → typed React Query hooks used by the frontend. Never call raw fetch in page components.
- **Zod import**: API server uses `zod` (not `zod/v4`) — esbuild can't resolve the `/v4` subpath.

## Product

- **Landing page**: Hero with "Master the Markets. Zero Capital Risk." CTA to register
- **Auth**: Register (gets ₹1,00,000 virtual capital) / Login
- **Dashboard**: Portfolio overview — balance, total P&L, win rate, open positions, recent trades
- **Market**: Live index quotes (NIFTY, BANKNIFTY, SENSEX, FINNIFTY) with options chain
- **Trade**: Place buy/sell orders on CE/PE options with lot size, strike price selection
- **Positions**: Open/closed positions with unrealized P&L
- **Orders**: Order book with PENDING/EXECUTED/REJECTED/CANCELLED status
- **Trades**: Trade history with realized P&L
- **Watchlist**: Add/remove instruments to track
- **Analytics**: Performance charts and statistics
- **Leaderboard**: Public ranking by total P&L
- **Notifications**: System alerts and trade confirmations

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Do not run `pnpm dev` at workspace root — use workflow restart or filter commands.
- After changing the OpenAPI spec, run `pnpm --filter @workspace/api-spec run codegen` before touching frontend code.
- After changing DB schema, run `pnpm --filter @workspace/db run push` (dev only).
- API server uses `zod` not `zod/v4` — keep this consistent.
- `useGetXxx` hooks from generated api require `queryKey` in the `query` options object when passing custom options.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
