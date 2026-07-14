import { Router } from "express";
import { getAllIndices, getOptionsChain, getExpiries, getMarketStatus } from "../lib/upstox-client";

const router = Router();
const VALID_SYMBOLS = ["NIFTY", "BANKNIFTY", "SENSEX", "FINNIFTY"];

router.get("/status", (_req, res): void => {
  res.json(getMarketStatus());
});

router.get("/indices", async (_req, res): Promise<void> => {
  try {
    const indices = await getAllIndices();
    res.json(indices);
  } catch {
    res.status(503).json({ error: "Market data unavailable" });
  }
});

router.get("/options", async (req, res): Promise<void> => {
  const { symbol, expiry } = req.query as { symbol?: string; expiry?: string };
  if (!symbol || !VALID_SYMBOLS.includes(symbol.toUpperCase())) {
    res.status(400).json({ error: "Invalid or missing symbol. Use NIFTY, BANKNIFTY, SENSEX, or FINNIFTY" });
    return;
  }
  try {
    const chain = await getOptionsChain(symbol.toUpperCase(), expiry);
    res.json(chain);
  } catch {
    res.status(503).json({ error: "Market data unavailable" });
  }
});

router.get("/expiries", async (req, res): Promise<void> => {
  const { symbol } = req.query as { symbol?: string };
  if (!symbol || !VALID_SYMBOLS.includes(symbol.toUpperCase())) {
    res.status(400).json({ error: "Invalid or missing symbol" });
    return;
  }
  try {
    const expiries = await getExpiries(symbol.toUpperCase());
    res.json(expiries);
  } catch {
    res.status(503).json({ error: "Market data unavailable" });
  }
});

router.get("/search", (_req, res): void => {
  const { q } = _req.query as { q?: string };
  if (!q || q.trim().length === 0) {
    res.status(400).json({ error: "Search query required" });
    return;
  }
  const query = q.toUpperCase();
  const NAMES: Record<string, string> = { NIFTY: "NIFTY 50", BANKNIFTY: "BANK NIFTY", SENSEX: "SENSEX", FINNIFTY: "FINNIFTY" };
  const instruments = VALID_SYMBOLS
    .filter((sym) => sym.includes(query) || NAMES[sym].toUpperCase().includes(query))
    .map((sym) => ({ symbol: sym, name: NAMES[sym], type: "index" }));
  res.json(instruments);
});

export { router as marketRouter };
