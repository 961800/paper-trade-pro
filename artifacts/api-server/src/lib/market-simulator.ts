// Realistic market price simulator for Indian indices and options

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

const BASE_PRICES: Record<string, { name: string; basePrice: number; lotSize: number }> = {
  NIFTY: { name: "NIFTY 50", basePrice: 22500, lotSize: 50 },
  BANKNIFTY: { name: "BANK NIFTY", basePrice: 48200, lotSize: 15 },
  SENSEX: { name: "SENSEX", basePrice: 74500, lotSize: 10 },
  FINNIFTY: { name: "FINNIFTY", basePrice: 21800, lotSize: 40 },
};

// Keep a running state for each symbol
const state: Record<string, { ltp: number; open: number; high: number; low: number; prevClose: number; lastUpdate: number }> = {};

function initSymbol(symbol: string) {
  const base = BASE_PRICES[symbol];
  if (!base) return;
  const variation = (Math.random() - 0.5) * base.basePrice * 0.01;
  const ltp = Math.round((base.basePrice + variation) * 100) / 100;
  state[symbol] = {
    ltp,
    open: Math.round((ltp * (1 + (Math.random() - 0.5) * 0.005)) * 100) / 100,
    high: Math.round((ltp * (1 + Math.random() * 0.008)) * 100) / 100,
    low: Math.round((ltp * (1 - Math.random() * 0.008)) * 100) / 100,
    prevClose: Math.round((ltp * (1 + (Math.random() - 0.5) * 0.015)) * 100) / 100,
    lastUpdate: Date.now(),
  };
}

export function getIndexQuote(symbol: string): IndexData {
  const base = BASE_PRICES[symbol];
  if (!base) throw new Error(`Unknown symbol: ${symbol}`);

  if (!state[symbol]) {
    initSymbol(symbol);
  }

  const s = state[symbol];
  const now = Date.now();
  const elapsed = (now - s.lastUpdate) / 1000;

  // Update price with realistic Brownian motion (more volatile during market hours)
  const volatility = 0.0003 * Math.sqrt(elapsed + 0.5);
  const drift = (Math.random() - 0.48) * volatility;
  s.ltp = Math.round((s.ltp * (1 + drift)) * 100) / 100;
  s.high = Math.max(s.high, s.ltp);
  s.low = Math.min(s.low, s.ltp);
  s.lastUpdate = now;

  const change = Math.round((s.ltp - s.prevClose) * 100) / 100;
  const changePercent = Math.round((change / s.prevClose) * 10000) / 100;

  return {
    symbol,
    name: base.name,
    ltp: s.ltp,
    change,
    changePercent,
    open: s.open,
    high: s.high,
    low: s.low,
    prevClose: s.prevClose,
  };
}

export function getAllIndices(): IndexData[] {
  return Object.keys(BASE_PRICES).map((sym) => getIndexQuote(sym));
}

export function getExpiries(symbol: string): string[] {
  const today = new Date();
  const expiries: string[] = [];

  // Generate next 4 weekly/monthly expiries
  const d = new Date(today);
  // Move to next Thursday (weekly expiry for NIFTY/BANKNIFTY)
  const dayOfWeek = d.getDay();
  const daysUntilThursday = (4 - dayOfWeek + 7) % 7 || 7;
  d.setDate(d.getDate() + daysUntilThursday);

  for (let i = 0; i < 4; i++) {
    expiries.push(formatExpiry(new Date(d)));
    d.setDate(d.getDate() + 7);
  }

  // Add next month expiry
  const nextMonth = new Date(today);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  // Last Thursday of next month
  nextMonth.setDate(1);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  nextMonth.setDate(0);
  while (nextMonth.getDay() !== 4) {
    nextMonth.setDate(nextMonth.getDate() - 1);
  }
  expiries.push(formatExpiry(nextMonth));

  return [...new Set(expiries)].slice(0, 5);
}

function formatExpiry(d: Date): string {
  return d.toISOString().split("T")[0];
}

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

  // Calculate days to expiry
  const today = new Date();
  const expiryDate = new Date(selectedExpiry);
  const dte = Math.max(1, Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));

  // Generate strike prices around ATM
  const strikeInterval = symbol === "SENSEX" ? 200 : symbol === "BANKNIFTY" ? 100 : 50;
  const atmStrike = Math.round(underlyingPrice / strikeInterval) * strikeInterval;
  const strikes: number[] = [];

  for (let i = -10; i <= 10; i++) {
    strikes.push(atmStrike + i * strikeInterval);
  }

  const options: OptionContract[] = [];

  for (const strike of strikes) {
    const moneyness = (underlyingPrice - strike) / underlyingPrice;
    const iv = 0.15 + Math.abs(moneyness) * 0.5 + Math.random() * 0.02; // IV smile

    // Black-Scholes approximation
    const cePremium = calcOptionPremium(underlyingPrice, strike, dte / 365, iv, "CE");
    const pePremium = calcOptionPremium(underlyingPrice, strike, dte / 365, iv, "PE");

    const ceSpread = cePremium * 0.02;
    const peSpread = pePremium * 0.02;

    options.push({
      strikePrice: strike,
      type: "CE",
      premium: Math.round(cePremium * 100) / 100,
      ltp: Math.round((cePremium * (1 + (Math.random() - 0.5) * 0.01)) * 100) / 100,
      bidPrice: Math.round((cePremium - ceSpread) * 100) / 100,
      askPrice: Math.round((cePremium + ceSpread) * 100) / 100,
      lotSize: base.lotSize,
      expiry: selectedExpiry,
      oi: Math.floor(Math.random() * 500000 + 10000),
      volume: Math.floor(Math.random() * 100000 + 1000),
      iv: Math.round(iv * 10000) / 100,
      delta: Math.round(calcDelta(underlyingPrice, strike, dte / 365, iv, "CE") * 1000) / 1000,
    });

    options.push({
      strikePrice: strike,
      type: "PE",
      premium: Math.round(pePremium * 100) / 100,
      ltp: Math.round((pePremium * (1 + (Math.random() - 0.5) * 0.01)) * 100) / 100,
      bidPrice: Math.round((pePremium - peSpread) * 100) / 100,
      askPrice: Math.round((pePremium + peSpread) * 100) / 100,
      lotSize: base.lotSize,
      expiry: selectedExpiry,
      oi: Math.floor(Math.random() * 500000 + 10000),
      volume: Math.floor(Math.random() * 100000 + 1000),
      iv: Math.round(iv * 10000) / 100,
      delta: Math.round(calcDelta(underlyingPrice, strike, dte / 365, iv, "PE") * 1000) / 1000,
    });
  }

  return {
    symbol,
    expiry: selectedExpiry,
    underlyingPrice,
    options,
  };
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

// Simple Black-Scholes for educational/simulation purposes
function calcOptionPremium(S: number, K: number, T: number, sigma: number, type: "CE" | "PE"): number {
  if (T <= 0) return Math.max(0, type === "CE" ? S - K : K - S);
  const r = 0.065; // Risk-free rate (India ~6.5%)
  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  const nd1 = normalCDF(type === "CE" ? d1 : -d1);
  const nd2 = normalCDF(type === "CE" ? d2 : -d2);
  if (type === "CE") {
    return Math.max(0, S * nd1 - K * Math.exp(-r * T) * nd2);
  } else {
    return Math.max(0, K * Math.exp(-r * T) * nd2 - S * nd1);
  }
}

function calcDelta(S: number, K: number, T: number, sigma: number, type: "CE" | "PE"): number {
  if (T <= 0) return type === "CE" ? (S > K ? 1 : 0) : S < K ? -1 : 0;
  const r = 0.065;
  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * Math.sqrt(T));
  return type === "CE" ? normalCDF(d1) : normalCDF(d1) - 1;
}

function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2315419 * Math.abs(x));
  const d = 0.3989422820 * Math.exp(-x * x * 0.5);
  const poly =
    t * (0.3193815 + t * (-0.3565638 + t * (1.7814779 + t * (-1.8212560 + t * 1.3302744))));
  const cdf = 1 - d * poly;
  return x > 0 ? cdf : 1 - cdf;
}

export function getLotSize(symbol: string): number {
  return BASE_PRICES[symbol]?.lotSize ?? 50;
}

export function getCurrentOptionPrice(symbol: string, strikePrice: number, optionType: "CE" | "PE", expiry: string): number {
  const quote = getIndexQuote(symbol);
  const today = new Date();
  const expiryDate = new Date(expiry);
  const dte = Math.max(1, Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
  const iv = 0.18 + Math.abs((quote.ltp - strikePrice) / quote.ltp) * 0.4;
  const price = calcOptionPremium(quote.ltp, strikePrice, dte / 365, iv, optionType);
  return Math.round(price * 100) / 100;
}
