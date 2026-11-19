/**
 * Upstox API v2 client with in-memory caching.
 * Falls back to the simulator when the API is unavailable or returns no data.
 */

import {
  getMarketStatus,
  getIndexQuote,
  getAllIndices as simGetAllIndices,
  getOptionsChain as simGetOptionsChain,
  getExpiries as simGetExpiries,
  getCurrentOptionPrice as simGetCurrentOptionPrice,
} from "./market-simulator";
import type { IndexData, OptionContract, OptionsChainResult } from "./market-simulator";
import { db, systemSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const BASE = "https://api.upstox.com/v2";

const lastUpstoxStatus = {
  configured: false,
  connected: false,
  lastError: null as string | null,
};

let cachedDbToken: string | null = null;
let lastDbTokenFetch = 0;

export async function fetchToken(): Promise<string> {
  const now = Date.now();
  if (cachedDbToken && (now - lastDbTokenFetch < 60000)) {
    return cachedDbToken;
  }
  try {
    const [row] = await db.select().from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, "upstox_access_token")).limit(1);
    if (row && row.value) {
      cachedDbToken = row.value.trim();
      lastDbTokenFetch = now;
      lastUpstoxStatus.configured = true;
      return cachedDbToken;
    }
  } catch (err) {
    // If table not available yet, fall through
  }
  const envTok = (process.env.UPSTOX_ACCESS_TOKEN || process.env.UPSTOX_API_KEY || process.env.UPSTOX_TOKEN || "").trim();
  cachedDbToken = envTok;
  lastDbTokenFetch = now;
  lastUpstoxStatus.configured = Boolean(envTok);
  return envTok;
}

export function token(): string {
  if (cachedDbToken) return cachedDbToken;
  const envTok = (process.env.UPSTOX_ACCESS_TOKEN || process.env.UPSTOX_API_KEY || process.env.UPSTOX_TOKEN || "").trim();
  lastUpstoxStatus.configured = Boolean(envTok);
  return envTok;
}

export async function setUpstoxTokenInDb(newToken: string): Promise<void> {
  const trimmed = newToken.trim();
  cachedDbToken = trimmed;
  lastDbTokenFetch = Date.now();
  lastUpstoxStatus.configured = Boolean(trimmed);
  await db.insert(systemSettingsTable).values({
    key: "upstox_access_token",
    value: trimmed,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: systemSettingsTable.key,
    set: { value: trimmed, updatedAt: new Date() },
  });
}

async function headers() {
  const tok = await fetchToken();
  return {
    Authorization: `Bearer ${tok}`,
    Accept: "application/json",
  };
}

async function upstoxFetch<T>(path: string): Promise<T | null> {
  const tok = await fetchToken();
  if (!tok) {
    lastUpstoxStatus.connected = false;
    lastUpstoxStatus.lastError = "No UPSTOX_ACCESS_TOKEN configured in environment or database.";
    return null;
  }
  try {
    const h = await headers();
    const res = await fetch(`${BASE}${path}`, { headers: h });
    if (!res.ok) {
      const errText = await res.text();
      lastUpstoxStatus.connected = false;
      if (res.status === 401) {
        lastUpstoxStatus.lastError = "401 Unauthorized: Upstox rejected token. Upstox API requires an active OAuth Access Token (JWT starting with eyJ...), not an API Key.";
        logger.warn({ status: res.status, path, body: errText.slice(0, 300) }, "[Upstox] 401 Unauthorized: Access Token invalid or expired.");
      } else {
        lastUpstoxStatus.lastError = `HTTP ${res.status}: ${errText.slice(0, 150)}`;
        logger.warn({ status: res.status, path, body: errText.slice(0, 300) }, "[Upstox API Error]");
      }
      return null;
    }
    const json = (await res.json()) as { status: string; data: T };
    if (json.status === "success") {
      lastUpstoxStatus.connected = true;
      lastUpstoxStatus.lastError = null;
      return json.data;
    } else {
      lastUpstoxStatus.connected = false;
      return null;
    }
  } catch (err: any) {
    lastUpstoxStatus.connected = false;
    lastUpstoxStatus.lastError = `Network error: ${err.message}`;
    logger.warn({ err: err.message, path }, "[Upstox Network Error]");
    return null;
  }
}

export async function getUpstoxConnectionStatus() {
  const tok = await fetchToken();
  const isJwt = tok.startsWith("eyJ");
  return {
    configured: Boolean(tok),
    tokenType: isJwt ? "access_token" : (tok.length > 0 ? "api_key_or_invalid" : "none"),
    connected: lastUpstoxStatus.connected,
    mode: lastUpstoxStatus.connected ? "live_upstox" : "simulated_black_scholes",
    lastError: lastUpstoxStatus.lastError,
    hint: !tok
      ? "Set UPSTOX_ACCESS_TOKEN in your environment or database to enable live data."
      : !isJwt
      ? "Warning: Your token is an API Key, not an Access Token. Upstox API v2 requires an active OAuth Access Token (starts with eyJ...). Generate it in your Upstox Developer Console."
      : lastUpstoxStatus.connected
      ? "Connected to live Upstox v2 Market Feeds."
      : "Access token may be expired (Upstox tokens expire daily at 3:30 AM IST). Generate a fresh token in Upstox Developer Console.",
  };
}

// ── Instrument key mapping ──────────────────────────────────────────────────
const INSTRUMENT_KEY: Record<string, string> = {
  NIFTY: "NSE_INDEX|Nifty 50",
  BANKNIFTY: "NSE_INDEX|Nifty Bank",
  SENSEX: "BSE_INDEX|SENSEX",
  FINNIFTY: "NSE_INDEX|Nifty Fin Service",
};

const FULL_NAME: Record<string, string> = {
  NIFTY: "NIFTY 50",
  BANKNIFTY: "BANK NIFTY",
  SENSEX: "SENSEX",
  FINNIFTY: "FINNIFTY",
};

// Lot sizes (updated per NSE/BSE circular — verified from live Upstox contracts)
const LOT_SIZE: Record<string, number> = {
  NIFTY: 65,
  BANKNIFTY: 30,
  SENSEX: 20,
  FINNIFTY: 60,
};

// ── Cache ───────────────────────────────────────────────────────────────────
interface CacheEntry<T> {
  data: T;
  ts: number;
}

function cached<T>(
  store: Map<string, CacheEntry<T>>,
  key: string,
  ttlMs: number,
): T | null {
  const entry = store.get(key);
  if (entry && Date.now() - entry.ts < ttlMs) return entry.data;
  return null;
}

function cache<T>(store: Map<string, CacheEntry<T>>, key: string, data: T): T {
  store.set(key, { data, ts: Date.now() });
  return data;
}

const indicesCache = new Map<string, CacheEntry<IndexData[]>>();
const ohlcCache = new Map<
  string,
  CacheEntry<{
    open: number;
    high: number;
    low: number;
    close: number;
    prevClose: number;
  }>
>();
const expiriesCache = new Map<string, CacheEntry<string[]>>();
const chainCache = new Map<string, CacheEntry<OptionsChainResult>>();
const priceCache = new Map<string, CacheEntry<number>>();

// ── Upstox Quotes → IndexData ───────────────────────────────────────────────
export async function getAllIndices(): Promise<IndexData[]> {
  const CACHE_TTL = 1500;
  const hit = cached(indicesCache, "all", CACHE_TTL);
  if (hit) return hit;

  const symbols = ["NIFTY", "BANKNIFTY", "SENSEX", "FINNIFTY"];
  const keys = symbols
    .map((s) => encodeURIComponent(INSTRUMENT_KEY[s]))
    .join("%2C");

  interface UpstoxQuoteEntry {
    last_price: number;
    net_change?: number;
    ohlc?: { open: number; high: number; low: number; close: number };
  }

  const quotesData = await upstoxFetch<Record<string, UpstoxQuoteEntry>>(
    `/market-quote/quotes?instrument_key=${keys}`,
  );

  if (!quotesData) {
    // Fall back to simulator
    return simGetAllIndices();
  }

  const results: IndexData[] = symbols.map((symbol) => {
    const rawKey = INSTRUMENT_KEY[symbol];
    const match = Object.entries(quotesData).find(
      ([k]) => k.replace(":", "|") === rawKey || k.includes(rawKey.split("|")[1]),
    );
    const item = match?.[1];
    const simQuote = getIndexQuote(symbol);

    if (!item || item.last_price == null) {
      return simQuote;
    }

    const ltp = item.last_price;
    const netChange = typeof item.net_change === "number" ? item.net_change : 0;
    // Real-time calculation: prevClose = last_price - net_change
    const prevClose = netChange !== 0 ? Math.round((ltp - netChange) * 100) / 100 : (item.ohlc?.close ?? simQuote.prevClose);
    const change = Math.round(netChange * 100) / 100;
    const changePercent = prevClose > 0 ? Math.round((change / prevClose) * 10000) / 100 : 0;
    const open = item.ohlc?.open ?? simQuote.open;
    const high = Math.max(item.ohlc?.high ?? simQuote.high, ltp);
    const low = Math.min(item.ohlc?.low ?? simQuote.low, ltp);

    return {
      symbol,
      name: FULL_NAME[symbol] ?? symbol,
      ltp,
      change,
      changePercent,
      open,
      high,
      low,
      prevClose,
    };
  });

  return cache(indicesCache, "all", results);
}

// ── Expiries ────────────────────────────────────────────────────────────────
export async function getExpiries(symbol: string): Promise<string[]> {
  const hit = cached(expiriesCache, symbol, 60 * 60 * 1000); // 1 hour
  if (hit) return hit;

  const key = encodeURIComponent(INSTRUMENT_KEY[symbol]);
  type ContractEntry = { expiry: string };
  const data = await upstoxFetch<ContractEntry[]>(
    `/option/contract?instrument_key=${key}`,
  );

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
export async function getOptionsChain(
  symbol: string,
  expiry?: string,
): Promise<OptionsChainResult> {
  // Resolve expiry
  const expiries = await getExpiries(symbol);
  const selectedExpiry =
    expiry && expiries.includes(expiry) ? expiry : expiries[0];
  if (!selectedExpiry) return simGetOptionsChain(symbol, expiry);

  const cacheKey = `${symbol}:${selectedExpiry}`;
  const CACHE_TTL = 2000;
  const hit = cached(chainCache, cacheKey, CACHE_TTL);
  if (hit) return hit;

  const key = encodeURIComponent(INSTRUMENT_KEY[symbol]);
  const expiryParam = encodeURIComponent(selectedExpiry);

  interface UpstoxOptionLeg {
    instrument_key: string;
    market_data: {
      ltp: number;
      volume: number;
      oi: number;
      close_price: number;
      bid_price: number;
      ask_price: number;
      prev_oi?: number;
    };
    option_greeks: {
      delta: number;
      iv: number;
      vega: number;
      theta: number;
      gamma: number;
    };
  }

  interface UpstoxChainRow {
    strike_price: number;
    underlying_spot_price: number;
    call_options: UpstoxOptionLeg;
    put_options: UpstoxOptionLeg;
  }

  const data = await upstoxFetch<UpstoxChainRow[]>(
    `/option/chain?instrument_key=${key}&expiry_date=${expiryParam}`,
  );

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
      const ceLtp = (ce.ltp > 0 ? ce.ltp : ce.close_price) || 0;
      const ceClose = ce.close_price || ceLtp;
      const ceChange = Math.round((ceLtp - ceClose) * 100) / 100;
      const ceChangePercent = ceClose > 0 ? Math.round((ceChange / ceClose) * 10000) / 100 : 0;
      const cePrevOi = ce.prev_oi ?? ce.oi;
      const ceOiChange = ce.oi - cePrevOi;
      const ceOiChangePercent = cePrevOi > 0 ? Math.round((ceOiChange / cePrevOi) * 10000) / 100 : 0;

      options.push({
        strikePrice: strike,
        type: "CE",
        premium: ce.close_price,
        ltp: ceLtp,
        change: ceChange,
        changePercent: ceChangePercent,
        bidPrice: ce.bid_price,
        askPrice: ce.ask_price,
        lotSize,
        expiry: selectedExpiry,
        oi: ce.oi,
        oiLots: Math.round(ce.oi / lotSize),
        prevOi: cePrevOi,
        oiChange: ceOiChange,
        oiChangePercent: ceOiChangePercent,
        volume: ce.volume,
        iv: ceG?.iv ?? null,
        delta: ceG?.delta ?? null,
        gamma: ceG?.gamma ?? null,
        theta: ceG?.theta ?? null,
        vega: ceG?.vega ?? null,
      });
    }

    const pe = row.put_options?.market_data;
    const peG = row.put_options?.option_greeks;
    if (pe) {
      const peLtp = (pe.ltp > 0 ? pe.ltp : pe.close_price) || 0;
      const peClose = pe.close_price || peLtp;
      const peChange = Math.round((peLtp - peClose) * 100) / 100;
      const peChangePercent = peClose > 0 ? Math.round((peChange / peClose) * 10000) / 100 : 0;
      const pePrevOi = pe.prev_oi ?? pe.oi;
      const peOiChange = pe.oi - pePrevOi;
      const peOiChangePercent = pePrevOi > 0 ? Math.round((peOiChange / pePrevOi) * 10000) / 100 : 0;

      options.push({
        strikePrice: strike,
        type: "PE",
        premium: pe.close_price,
        ltp: peLtp,
        change: peChange,
        changePercent: peChangePercent,
        bidPrice: pe.bid_price,
        askPrice: pe.ask_price,
        lotSize,
        expiry: selectedExpiry,
        oi: pe.oi,
        oiLots: Math.round(pe.oi / lotSize),
        prevOi: pePrevOi,
        oiChange: peOiChange,
        oiChangePercent: peOiChangePercent,
        volume: pe.volume,
        iv: peG?.iv ?? null,
        delta: peG?.delta ?? null,
        gamma: peG?.gamma ?? null,
        theta: peG?.theta ?? null,
        vega: peG?.vega ?? null,
      });
    }
  }

  let totalCallOi = 0;
  let totalPutOi = 0;
  for (const opt of options) {
    if (opt.type === "CE") totalCallOi += opt.oi;
    else if (opt.type === "PE") totalPutOi += opt.oi;
  }

  const strikeInterval = symbol === "NIFTY" || symbol === "FINNIFTY" ? 50 : 100;
  const atmStrike = Math.round(underlyingPrice / strikeInterval) * strikeInterval;

  let minLoss = Infinity;
  let maxPain = atmStrike;
  const strikes = Array.from(new Set(options.map((o) => o.strikePrice)));
  for (const testStrike of strikes) {
    let totalLoss = 0;
    for (const opt of options) {
      if (opt.type === "CE" && testStrike > opt.strikePrice) {
        totalLoss += (testStrike - opt.strikePrice) * opt.oi;
      } else if (opt.type === "PE" && testStrike < opt.strikePrice) {
        totalLoss += (opt.strikePrice - testStrike) * opt.oi;
      }
    }
    if (totalLoss < minLoss) {
      minLoss = totalLoss;
      maxPain = testStrike;
    }
  }

  const atmOption = options.find((o) => o.strikePrice === atmStrike && o.type === "CE");
  const atmIv = atmOption?.iv ?? 14.5;

  const pcr = totalCallOi > 0 ? Math.round((totalPutOi / totalCallOi) * 100) / 100 : 1;
  let sentiment: "Strongly Bullish" | "Bullish" | "Neutral" | "Bearish" | "Strongly Bearish" = "Neutral";
  if (pcr >= 1.25) sentiment = "Strongly Bullish";
  else if (pcr >= 1.05) sentiment = "Bullish";
  else if (pcr >= 0.85) sentiment = "Neutral";
  else if (pcr >= 0.65) sentiment = "Bearish";
  else sentiment = "Strongly Bearish";

  const result = {
    symbol,
    expiry: selectedExpiry,
    underlyingPrice,
    atmStrike,
    maxPain,
    atmIv,
    pcr,
    totalCallOi,
    totalPutOi,
    sentiment,
    options,
  };
  return cache(chainCache, cacheKey, result);
}

// ── Single option price (for order execution) ────────────────────────────────
export async function getCurrentOptionPrice(
  symbol: string,
  strikePrice: number,
  optionType: "CE" | "PE",
  expiry: string,
): Promise<number> {
  const cacheKey = `${symbol}:${strikePrice}:${optionType}:${expiry}`;
  const hit = cached(priceCache, cacheKey, 2000);
  if (hit) return hit;

  try {
    const chain = await getOptionsChain(symbol, expiry);
    const opt = chain.options.find(
      (o) => o.strikePrice === strikePrice && o.type === optionType,
    );
    if (opt && opt.ltp > 0) return cache(priceCache, cacheKey, opt.ltp);
  } catch {
    /* fall through */
  }

  return simGetCurrentOptionPrice(symbol, strikePrice, optionType, expiry);
}

// Re-export market status from simulator (it's time-based, no API needed)
export { getMarketStatus } from "./market-simulator";
