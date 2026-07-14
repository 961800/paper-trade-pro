---
name: Upstox integration
description: Live NSE/BSE market data via Upstox API v2 in PaperTrade Pro
---

## Rule
Use `artifacts/api-server/src/lib/upstox-client.ts` for all market data (indices, option chains, expiries, single-option prices). Never call the Upstox API directly from routes.

**Why:** Centralises caching, fallback logic, and auth token management.

**How to apply:** `upstox-client.ts` wraps `market-simulator.ts` — if Upstox returns null/empty, the simulator is used automatically. Both are always imported from the client, never the simulator directly from routes.

## Instrument keys
- NIFTY: `NSE_INDEX|Nifty 50`
- BANKNIFTY: `NSE_INDEX|Nifty Bank`
- SENSEX: `BSE_INDEX|SENSEX`
- FINNIFTY: `NSE_INDEX|Nifty Fin Service`

## Lot sizes (as of July 2026)
- NIFTY: 75, BANKNIFTY: 30, SENSEX: 10, FINNIFTY: 65

## Cache TTLs
- Indices LTP: 1500ms (market hours) / 60s (closed)
- OHLC: 5s
- Options chain: 2s (market hours) / 60s (closed)
- Expiries: 1 hour

## getCurrentOptionPrice is async
`orders.ts` must `await getCurrentOptionPrice(...)` — it now hits Upstox live before falling back to simulator.
