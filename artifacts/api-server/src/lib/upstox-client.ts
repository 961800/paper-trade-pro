/**
 * Upstox API v2 client with in-memory caching.
 * Falls back to the simulator when the API is unavailable or returns no data.
 */

import { getMarketStatus, getIndexQuote, getAllIndices as simGetAllIndices, getOptionsChain as simGetOptionsChain, getExpiries as simGetExpiries, getCurrentOptionPrice as simGetCurrentOptionPrice } from "./market-simulator";
import type { IndexData, OptionContract } from "./market-simulator";

const BASE = "https://api.upstox.com/v2";

function token(): string {
  return process.env.UPSTOX_API_KEY ?? "";
}

function headers() {
  return {
    Authorization: `Bearer ${token()}`,
    Accept: "application/json",
  };
}

async function upstoxFetch<T>(path: string): Promise<T | null> {
  if (!token()) return null;
  try {
    const res = await fetch(`${BASE}${path}`, { headers: headers() });
    if (!res.ok) return null;
    const json = (await res.json()) as { status: string; data: T };
    return json.status === "success" ? json.data : null;
  } catch {
    return null;
  }
}

// ── Instrument key mapping ──────────────────────────────────────────────────
const INSTRUMENT_KEY: Record<string, string> = {
  NIFTY:     "NSE_INDEX|Nifty 50",
  BANKNIFTY: "NSE_INDEX|Nifty Bank",
  SENSEX:    "BSE_INDEX|SENSEX",
  FINNIFTY:  "NSE_INDEX|Nifty Fin Service",
};

const FULL_NAME: Record<string, string> = {
  NIFTY:     "NIFTY 50",
  BANKNIFTY: "BANK NIFTY",
  SENSEX:    "SENSEX",
  FINNIFTY:  "FINNIFTY",
};

// Lot sizes (updated per NSE/BSE circular — verified from live Upstox contracts)
const LOT_SIZE: Record<string, number> = {
  NIFTY:     65,
  BANKNIFTY: 30,
  SENSEX:    10,
  FINNIFTY:  65,
};

// ── Cache ───────────────────────────────────────────────────────────────────
interface CacheEntry<T> { data: T; ts: number }

function cached<T>(store: Map<string, CacheEntry<T>>, key: string, ttlMs: number): T | null {
  const entry = store.get(key);
  if (entry && Date.now() - entry.ts < ttlMs) return entry.data;
  return null;
}

function cache<T>(store: Map<string, CacheEntry<T>>, key: string, data: T): T {
  store.set(key, { data, ts: Date.now() });
  return data;
}

const indicesCache  = new Map<string, CacheEntry<IndexData[]>>();
const ohlcCache     = new Map<string, CacheEntry<{ open: number; high: number; low: number; close: number; prevClose: number }>>();
const expiriesCache = new Map<string, CacheEntry<string[]>>();
const chainCache    = new Map<string, CacheEntry<{ symbol: string; expiry: string; underlyingPrice: number; options: OptionContract[] }>>();
const priceCache    = new Map<string, CacheEntry<number>>();

// ── Upstox LTP → IndexData ──────────────────────────────────────────────────
async function fetchOhlc(symbol: string): Promise<{ open: number; high: number; low: number; close: number; prevClose: number } | null> {
  const hit = cached(ohlcCache, symbol, 5000);
  if (hit) return hit;

  const key = encodeURIComponent(INSTRUMENT_KEY[symbol]);
  const data = await upstoxFetch<Record<string, { ohlc: { open: number; high: number; low: number; close: number }; last_price: number }>>(`/market-quote/ohlc?instrument_key=${key}&interval=1d`);
  if (!data) return null;

  const entry = Object.values(data)[0];
  if (!entry) return null;

  const result = {
    open:      entry.ohlc.open,
    high:      entry.ohlc.high,
    low:       entry.ohlc.low,
    close:     entry.ohlc.close,
    prevClose: entry.ohlc.close, // Upstox gives today's close; use it as prevClose reference
  };
  return cache(ohlcCache, symbol, result);
}

export async function getAllIndices(): Promise<IndexData[]> {
  const CACHE_TTL = getMarketStatus().tradingEnabled ? 1500 : 60000;
  const hit = cached(indicesCache, "all", CACHE_TTL);
  if (hit) return hit;

  const symbols = ["NIFTY", "BANKNIFTY", "SENSEX", "FINNIFTY"];
  const keys = symbols.map((s) => encodeURIComponent(INSTRUMENT_KEY[s])).join("%2C");

  type LtpResponse = Record<string, { last_price: number; instrument_token: string }>;
  const ltpData = await upstoxFetch<LtpResponse>(`/market-quote/ltp?instrument_key=${keys}`);

  if (!ltpData) {
    // Fall back to simulator
    return simGetAllIndices();
  }

  const results: IndexData[] = await Promise.all(
    symbols.map(async (symbol) => {
      const ltpKey = Object.keys(ltpData).find((k) => k.includes(INSTRUMENT_KEY[symbol].split("|")[1]) || k.replace(":", "|") === INSTRUMENT_KEY[symbol]);
      const ltp = ltpKey ? ltpData[ltpKey].last_price : getIndexQuote(symbol).ltp;

      const ohlc = await fetchOhlc(symbol);
      const simQuote = getIndexQuote(symbol);

      const open      = ohlc?.open ?? simQuote.open;
      const high      = Math.max(ohlc?.high ?? simQuote.high, ltp);
      const low       = Math.min(ohlc?.low ?? simQuote.low, ltp);
      const prevClose = ohlc?.close ?? simQuote.prevClose;
      const change    = Math.round((ltp - prevClose) * 100) / 100;
      const changePercent = Math.round((change / prevClose) * 10000) / 100;

      return { symbol, name: FULL_NAME[symbol], ltp, change, changePercent, open, high, low, prevClose };
    })
  );

  return cache(indicesCache, "all", results);
}

// ── Expiries ────────────────────────────────────────────────────────────────
export async function getExpiries(symbol: string): Promise<string[]> {
  const hit = cached(expiriesCache, symbol, 60 * 60 * 1000); // 1 hour
  if (hit) return hit;

  const key = encodeURIComponent(INSTRUMENT_KEY[symbol]);
  type ContractEntry = { expiry: string };
  const data = await upstoxFetch<ContractEntry[]>(`/option/contract?instrument_key=${key}`);

  if (!data || data.length === 0) {
    return simGetExpiries(symbol);
  }

  const today = new Date().toISOString().split("T")[0];
  const expiries = [...new Set(data.map((c) => c.expiry))]
    .filter((e) => e >= today)
    .sort()
    .slice(0, 8);

  return cache(expiriesCache, symbol, expiries);
}

// ── Options chain ────────────────────────────────────────────────────────────
export async function getOptionsChain(symbol: string, expiry?: string): Promise<{
  symbol: string; expiry: string; underlyingPrice: number; options: OptionContract[];
}> {
  // Resolve expiry
  const expiries = await getExpiries(symbol);
  const selectedExpiry = expiry && expiries.includes(expiry) ? expiry : expiries[0];
  if (!selectedExpiry) return simGetOptionsChain(symbol, expiry);

  const cacheKey = `${symbol}:${selectedExpiry}`;
  const CACHE_TTL = getMarketStatus().tradingEnabled ? 2000 : 60000;
  const hit = cached(chainCache, cacheKey, CACHE_TTL);
  if (hit) return hit;

  const key = encodeURIComponent(INSTRUMENT_KEY[symbol]);
  const expiryParam = encodeURIComponent(selectedExpiry);

  interface UpstoxOptionLeg {
    instrument_key: string;
    market_data: {
      ltp: number; volume: number; oi: number;
      close_price: number; bid_price: number; ask_price: number;
    };
    option_greeks: { delta: number; iv: number; vega: number; theta: number; gamma: number };
  }

  interface UpstoxChainRow {
    strike_price: number;
    underlying_spot_price: number;
    call_options: UpstoxOptionLeg;
    put_options: UpstoxOptionLeg;
  }

  const data = await upstoxFetch<UpstoxChainRow[]>(`/option/chain?instrument_key=${key}&expiry_date=${expiryParam}`);

  if (!data || data.length === 0) {
    return simGetOptionsChain(symbol, selectedExpiry);
  }

  const underlyingPrice = data[0]?.underlying_spot_price ?? 0;
  const lotSize = LOT_SIZE[symbol] ?? 50;
  const options: OptionContract[] = [];

  for (const row of data) {
    const strike = row.strike_price;

    const ce = row.call_options?.market_data;
    const ceG = row.call_options?.option_greeks;
    if (ce) {
      options.push({
        strikePrice: strike,
        type: "CE",
        premium:  ce.close_price,
        ltp:      ce.ltp,
        bidPrice: ce.bid_price,
        askPrice: ce.ask_price,
        lotSize,
        expiry:   selectedExpiry,
        oi:       ce.oi,
        volume:   ce.volume,
        iv:       ceG?.iv ?? null,
        delta:    ceG?.delta ?? null,
      });
    }

    const pe = row.put_options?.market_data;
    const peG = row.put_options?.option_greeks;
    if (pe) {
      options.push({
        strikePrice: strike,
        type: "PE",
        premium:  pe.close_price,
        ltp:      pe.ltp,
        bidPrice: pe.bid_price,
        askPrice: pe.ask_price,
        lotSize,
        expiry:   selectedExpiry,
        oi:       pe.oi,
        volume:   pe.volume,
        iv:       peG?.iv ?? null,
        delta:    peG?.delta ?? null,
      });
    }
  }

  const result = { symbol, expiry: selectedExpiry, underlyingPrice, options };
  return cache(chainCache, cacheKey, result);
}

// ── Single option price (for order execution) ────────────────────────────────
export async function getCurrentOptionPrice(symbol: string, strikePrice: number, optionType: "CE" | "PE", expiry: string): Promise<number> {
  const cacheKey = `${symbol}:${strikePrice}:${optionType}:${expiry}`;
  const hit = cached(priceCache, cacheKey, 2000);
  if (hit) return hit;

  try {
    const chain = await getOptionsChain(symbol, expiry);
    const opt = chain.options.find((o) => o.strikePrice === strikePrice && o.type === optionType);
    if (opt && opt.ltp > 0) return cache(priceCache, cacheKey, opt.ltp);
  } catch { /* fall through */ }

  return simGetCurrentOptionPrice(symbol, strikePrice, optionType, expiry);
}

// Re-export market status from simulator (it's time-based, no API needed)
export { getMarketStatus } from "./market-simulator";
