import { Router } from "express";
import { getAllIndices, getIndexQuote, getOptionsChain, getExpiries, getMarketStatus } from "../lib/market-simulator";

const router = Router();

const VALID_SYMBOLS = ["NIFTY", "BANKNIFTY", "SENSEX", "FINNIFTY"];

router.get("/status", (_req, res): void => {
  const status = getMarketStatus();
  res.json(status);
});

router.get("/indices", (_req, res): void => {
  const indices = getAllIndices();
  res.json(indices);
});

router.get("/options", (req, res): void => {
  const { symbol, expiry } = req.query as { symbol?: string; expiry?: string };
  if (!symbol || !VALID_SYMBOLS.includes(symbol.toUpperCase())) {
    res.status(400).json({ error: "Invalid or missing symbol. Use NIFTY, BANKNIFTY, SENSEX, or FINNIFTY" });
    return;
  }
  const chain = getOptionsChain(symbol.toUpperCase(), expiry);
  res.json(chain);
});

router.get("/expiries", (req, res): void => {
  const { symbol } = req.query as { symbol?: string };
  if (!symbol || !VALID_SYMBOLS.includes(symbol.toUpperCase())) {
    res.status(400).json({ error: "Invalid or missing symbol" });
    return;
  }
  const expiries = getExpiries(symbol.toUpperCase());
  res.json(expiries);
});

router.get("/search", (req, res): void => {
  const { q } = req.query as { q?: string };
  if (!q || q.trim().length === 0) {
    res.status(400).json({ error: "Search query required" });
    return;
  }
  const query = q.toUpperCase();
  const instruments = VALID_SYMBOLS
    .filter((sym) => sym.includes(query) || getFullName(sym).toUpperCase().includes(query))
    .map((sym) => ({ symbol: sym, name: getFullName(sym), type: "index" }));
  res.json(instruments);
});

function getFullName(symbol: string): string {
  const names: Record<string, string> = {
    NIFTY:     "NIFTY 50",
    BANKNIFTY: "BANK NIFTY",
    SENSEX:    "SENSEX",
    FINNIFTY:  "FINNIFTY",
  };
  return names[symbol] ?? symbol;
}

export { router as marketRouter };
