// Realistic market price simulator for Indian indices and options
// Prices are stable between calls and only drift when the market is open.

export interface IndexData {
  symbol: string;
  name: string;
  ltp: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
}

export interface MarketStatusInfo {
  status: "pre-open" | "open" | "closed" | "weekend" | "holiday";
  message: string;
  tradingEnabled: boolean;
  nextOpenAt?: string;
}

// NSE trading holidays 2025-2026
const NSE_HOLIDAYS = new Set([
  "2025-01-26", "2025-02-19", "2025-03-14", "2025-04-10", "2025-04-14",
  "2025-04-18", "2025-05-01", "2025-08-15", "2025-08-27", "2025-10-02",
  "2025-10-20", "2025-11-05", "2025-11-24", "2025-12-25",
  "2026-01-26", "2026-03-14", "2026-03-25", "2026-04-02", "2026-04-14",
  "2026-04-15", "2026-05-01", "2026-08-15", "2026-09-16", "2026-10-02",
  "2026-10-21", "2026-11-04", "2026-11-25", "2026-12-25",
]);

const BASE_PRICES: Record<string, { name: string; basePrice: number; lotSize: number }> = {
  NIFTY:     { name: "NIFTY 50",   basePrice: 24500, lotSize: 65 },
  BANKNIFTY: { name: "BANK NIFTY", basePrice: 54000, lotSize: 30 },
  SENSEX:    { name: "SENSEX",     basePrice: 80500, lotSize: 20 },
  FINNIFTY:  { name: "FINNIFTY",   basePrice: 23800, lotSize: 60 },
};

// ── Underlying index state ──────────────────────────────────────────────────
const indexState: Record<string, {
  ltp: number; open: number; high: number; low: number; prevClose: number; lastUpdate: number;
}> = {};

function initIndex(symbol: string) {
  const base = BASE_PRICES[symbol];
  if (!base) return;
  // Deterministic seed variation from symbol name (no Math.random at init)
  const seed = symbol.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const variation = ((seed % 100) - 50) / 100 * base.basePrice * 0.005;
  const ltp = Math.round((base.basePrice + variation) * 100) / 100;
  const prevClose = Math.round((base.basePrice * (1 + ((seed % 20) - 10) / 10000)) * 100) / 100;
  indexState[symbol] = {
    ltp,
    open:      Math.round((ltp * (1 + ((seed % 5) - 2) / 10000)) * 100) / 100,
    high:      Math.round((ltp * 1.004)  * 100) / 100,
    low:       Math.round((ltp * 0.996)  * 100) / 100,
    prevClose,
    lastUpdate: Date.now(),
  };
}

export function getMarketStatus(): MarketStatusInfo {
  const now = new Date();
  const istMs = now.getTime() + 5.5 * 60 * 60 * 1000;
  const istNow = new Date(istMs);

  const dayOfWeek = istNow.getUTCDay(); // 0=Sun, 6=Sat
  const dateStr = istNow.toISOString().split("T")[0];

  if (dayOfWeek === 0) return { status: "weekend", message: "Market Closed — Sunday",   tradingEnabled: false };
  if (dayOfWeek === 6) return { status: "weekend", message: "Market Closed — Saturday", tradingEnabled: false };
  if (NSE_HOLIDAYS.has(dateStr)) return { status: "holiday", message: "Market Closed — Public Holiday", tradingEnabled: false };

  const timeInMinutes = istNow.getUTCHours() * 60 + istNow.getUTCMinutes();
  const PRE_OPEN_START = 9 * 60;        // 09:00 IST
  const OPEN_START     = 9 * 60 + 15;  // 09:15 IST
  const CLOSE_TIME     = 15 * 60 + 30; // 15:30 IST

  if (timeInMinutes >= PRE_OPEN_START && timeInMinutes < OPEN_START) {
    return { status: "pre-open", message: "Pre-Open Session (09:00–09:15 IST)", tradingEnabled: false };
  }
  if (timeInMinutes >= OPEN_START && timeInMinutes < CLOSE_TIME) {
    return { status: "open", message: "Market Open (09:15–15:30 IST)", tradingEnabled: true };
  }
  return { status: "closed", message: "Market Closed — Opens 09:15 IST", tradingEnabled: false };
}

export function getIndexQuote(symbol: string): IndexData {
  const base = BASE_PRICES[symbol];
  if (!base) throw new Error(`Unknown symbol: ${symbol}`);

  if (!indexState[symbol]) initIndex(symbol);

  const s = indexState[symbol];
  const now = Date.now();
  const elapsed = (now - s.lastUpdate) / 1000;

  const { tradingEnabled } = getMarketStatus();
  if (tradingEnabled && elapsed > 0.5) {
    // Brownian motion drift — only when market is open
    const volatility = 0.0003 * Math.sqrt(Math.min(elapsed, 10) + 0.5);
    const drift = (Math.random() - 0.48) * volatility;
    s.ltp = Math.round((s.ltp * (1 + drift)) * 100) / 100;
    s.high = Math.max(s.high, s.ltp);
    s.low  = Math.min(s.low, s.ltp);
    s.lastUpdate = now;
  }

  const change        = Math.round((s.ltp - s.prevClose) * 100) / 100;
  const changePercent = Math.round((change / s.prevClose) * 10000) / 100;

  return { symbol, name: base.name, ltp: s.ltp, change, changePercent, open: s.open, high: s.high, low: s.low, prevClose: s.prevClose };
}

export function getAllIndices(): IndexData[] {
  return Object.keys(BASE_PRICES).map((sym) => getIndexQuote(sym));
}

// ── Options chain state cache ───────────────────────────────────────────────
// Keyed by `${symbol}:${expiry}:${strike}:${type}`
interface OptionState {
  ltp: number;
  bidPrice: number;
  askPrice: number;
  oi: number;
  volume: number;
  lastUpdate: number;
}
const optionStateCache = new Map<string, OptionState>();

function optionKey(symbol: string, expiry: string, strike: number, type: "CE" | "PE"): string {
  return `${symbol}:${expiry}:${strike}:${type}`;
}

/** Realistic OI: highest near ATM, falls off exponentially for deep OTM/ITM */
function baseOI(moneyness: number): number {
  const nearness = Math.exp(-Math.abs(moneyness) * 25);
  return Math.round((nearness * 480000 + 15000));
}

/** Realistic volume: proportional to OI */
function baseVolume(moneyness: number): number {
  const nearness = Math.exp(-Math.abs(moneyness) * 20);
  return Math.round(nearness * 95000 + 2000);
}

function getOrInitOption(
  symbol: string, expiry: string, strike: number, type: "CE" | "PE",
  initialLtp: number, initialBid: number, initialAsk: number, moneyness: number
): OptionState {
  const key = optionKey(symbol, expiry, strike, type);
  if (!optionStateCache.has(key)) {
    optionStateCache.set(key, {
      ltp:       initialLtp,
      bidPrice:  initialBid,
      askPrice:  initialAsk,
      oi:        baseOI(moneyness),
      volume:    baseVolume(moneyness),
      lastUpdate: Date.now(),
    });
  }
  return optionStateCache.get(key)!;
}

// ── Expiries ────────────────────────────────────────────────────────────────
export function getExpiries(symbol: string): string[] {
  const today = new Date();
  const expiries: string[] = [];

  const d = new Date(today);
  const dayOfWeek = d.getDay();
  const daysUntilThursday = (4 - dayOfWeek + 7) % 7 || 7;
  d.setDate(d.getDate() + daysUntilThursday);

  for (let i = 0; i < 4; i++) {
    expiries.push(formatExpiry(new Date(d)));
    d.setDate(d.getDate() + 7);
  }

  const nextMonth = new Date(today);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  nextMonth.setDate(1);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  nextMonth.setDate(0);
  while (nextMonth.getDay() !== 4) nextMonth.setDate(nextMonth.getDate() - 1);
  expiries.push(formatExpiry(nextMonth));

  return [...new Set(expiries)].slice(0, 5);
}

function formatExpiry(d: Date): string {
  return d.toISOString().split("T")[0];
}

// ── Options chain ───────────────────────────────────────────────────────────
export function getOptionsChain(
  symbol: string,
  expiry?: string
): { symbol: string; expiry: string; underlyingPrice: number; options: OptionContract[] } {
  const base = BASE_PRICES[symbol];
  if (!base) throw new Error(`Unknown symbol: ${symbol}`);

  const quote = getIndexQuote(symbol);
  const underlyingPrice = quote.ltp;

  const expiries = getExpiries(symbol);
  const selectedExpiry = expiry && expiries.includes(expiry) ? expiry : expiries[0];

  const today = new Date();
  const expiryDate = new Date(selectedExpiry);
  const dte = Math.max(0.5, (expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  const strikeInterval = symbol === "SENSEX" ? 500 : symbol === "BANKNIFTY" ? 200 : 100;
  const atmStrike = Math.round(underlyingPrice / strikeInterval) * strikeInterval;
  const strikes: number[] = [];
  for (let i = -10; i <= 10; i++) strikes.push(atmStrike + i * strikeInterval);

  const { tradingEnabled } = getMarketStatus();
  const options: OptionContract[] = [];

  for (const strike of strikes) {
    const moneyness = (underlyingPrice - strike) / underlyingPrice;
    // IV smile: higher IV for OTM, lower for ATM
    const iv = 0.14 + Math.abs(moneyness) * 0.55;

    for (const type of ["CE", "PE"] as const) {
      const fairValue = calcOptionPremium(underlyingPrice, strike, dte / 365, iv, type);
      const spread    = Math.max(0.05, fairValue * 0.015);

      const key = optionKey(symbol, selectedExpiry, strike, type);
      const initialBid = Math.max(0.05, Math.round((fairValue - spread) * 100) / 100);
      const initialAsk = Math.round((fairValue + spread) * 100) / 100;
      const initialLtp = Math.round(fairValue * 100) / 100;

      const state = getOrInitOption(symbol, selectedExpiry, strike, type, initialLtp, initialBid, initialAsk, moneyness);

      if (tradingEnabled) {
        const elapsed = (Date.now() - state.lastUpdate) / 1000;
        if (elapsed > 0.5) {
          // Recalculate LTP based on current underlying — realistic re-pricing
          const newFair   = calcOptionPremium(underlyingPrice, strike, dte / 365, iv, type);
          const newSpread = Math.max(0.05, newFair * 0.015);
          state.ltp       = Math.max(0.05, Math.round(newFair * 100) / 100);
          state.bidPrice  = Math.max(0.05, Math.round((newFair - newSpread) * 100) / 100);
          state.askPrice  = Math.round((newFair + newSpread) * 100) / 100;
          // Volume grows during market hours
          state.volume    = Math.min(state.volume + Math.floor(Math.random() * 8), baseVolume(moneyness) * 2);
          state.lastUpdate = Date.now();
        }
      }

      options.push({
        strikePrice: strike,
        type,
        premium:  Math.round(calcOptionPremium(underlyingPrice, strike, dte / 365, iv, type) * 100) / 100,
        ltp:      state.ltp,
        bidPrice: state.bidPrice,
        askPrice: state.askPrice,
        lotSize:  base.lotSize,
        expiry:   selectedExpiry,
        oi:       state.oi,
        volume:   state.volume,
        iv:       Math.round(iv * 10000) / 100,
        delta:    Math.round(calcDelta(underlyingPrice, strike, dte / 365, iv, type) * 1000) / 1000,
      });
    }
  }

  return { symbol, expiry: selectedExpiry, underlyingPrice, options };
}

export interface OptionContract {
  strikePrice: number;
  type: "CE" | "PE";
  premium: number;
  ltp: number;
  bidPrice: number;
  askPrice: number;
  lotSize: number;
  expiry: string;
  oi: number;
  volume: number;
  iv: number | null;
  delta: number | null;
}

// ── Black-Scholes ───────────────────────────────────────────────────────────
function calcOptionPremium(S: number, K: number, T: number, sigma: number, type: "CE" | "PE"): number {
  if (T <= 0) return Math.max(0, type === "CE" ? S - K : K - S);
  const r  = 0.065;
  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  const nd1 = normalCDF(type === "CE" ? d1 : -d1);
  const nd2 = normalCDF(type === "CE" ? d2 : -d2);
  if (type === "CE") return Math.max(0, S * nd1 - K * Math.exp(-r * T) * nd2);
  return Math.max(0, K * Math.exp(-r * T) * nd2 - S * nd1);
}

function calcDelta(S: number, K: number, T: number, sigma: number, type: "CE" | "PE"): number {
  if (T <= 0) return type === "CE" ? (S > K ? 1 : 0) : S < K ? -1 : 0;
  const r  = 0.065;
  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * Math.sqrt(T));
  return type === "CE" ? normalCDF(d1) : normalCDF(d1) - 1;
}

function normalCDF(x: number): number {
  const t    = 1 / (1 + 0.2315419 * Math.abs(x));
  const d    = 0.3989422820 * Math.exp(-x * x * 0.5);
  const poly = t * (0.3193815 + t * (-0.3565638 + t * (1.7814779 + t * (-1.8212560 + t * 1.3302744))));
  const cdf  = 1 - d * poly;
  return x > 0 ? cdf : 1 - cdf;
}

// ── Helpers ─────────────────────────────────────────────────────────────────
export function getLotSize(symbol: string): number {
  return BASE_PRICES[symbol]?.lotSize ?? 50;
}

export function getCurrentOptionPrice(symbol: string, strikePrice: number, optionType: "CE" | "PE", expiry: string): number {
  const quote = getIndexQuote(symbol);
  const today = new Date();
  const expiryDate = new Date(expiry);
  const dte = Math.max(0.5, (expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const moneyness = (quote.ltp - strikePrice) / quote.ltp;
  const iv = 0.14 + Math.abs(moneyness) * 0.55;
  return Math.max(0.05, Math.round(calcOptionPremium(quote.ltp, strikePrice, dte / 365, iv, optionType) * 100) / 100);
}
