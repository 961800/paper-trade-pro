import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import {
  useGetIndices,
  useGetOptionsChain,
  useGetExpiries,
  getGetOptionsChainQueryKey,
  getGetExpiriesQueryKey,
  getGetIndicesQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TradingViewWidget } from "@/components/trading-view-widget";
import { cn } from "@/lib/utils";
import { 
  ArrowUpIcon, 
  ArrowDownIcon, 
  RefreshCw, 
  LineChart, 
  ChevronDown, 
  ChevronUp, 
  Gauge, 
  TrendingUp, 
  TrendingDown, 
  Info 
} from "lucide-react";

const TV_SYMBOLS: Record<string, string> = {
  NIFTY: "NSE:NIFTY",
  BANKNIFTY: "NSE:BANKNIFTY",
  SENSEX: "BSE:SENSEX",
  FINNIFTY: "NSE:CNXFINANCE",
};

export default function Market() {
  const [, setLocation] = useLocation();
  const [selectedSymbol, setSelectedSymbol] = useState("NIFTY");
  const [selectedExpiry, setSelectedExpiry] = useState("");
  const [showChart, setShowChart] = useState(false);
  const [viewMode, setViewMode] = useState<"prices" | "greeks">("prices");

  const { data: indices, isLoading: indicesLoading, refetch: refetchIndices } = useGetIndices({
    query: { queryKey: getGetIndicesQueryKey(), refetchInterval: 10000 },
  });

  const { data: expiries } = useGetExpiries(
    { symbol: selectedSymbol },
    { query: { queryKey: getGetExpiriesQueryKey({ symbol: selectedSymbol }) } }
  );

  useEffect(() => {
    if (expiries && expiries.length > 0) setSelectedExpiry(expiries[0]);
  }, [expiries]);

  useEffect(() => {
    setSelectedExpiry("");
  }, [selectedSymbol]);

  const { data: rawChain, isLoading: chainLoading, refetch: refetchChain } = useGetOptionsChain(
    { symbol: selectedSymbol, expiry: selectedExpiry || "2026-06-26" },
    {
      query: {
        queryKey: getGetOptionsChainQueryKey({ symbol: selectedSymbol, expiry: selectedExpiry || "2026-06-26" }),
        enabled: !!selectedExpiry,
        refetchInterval: 10000,
      },
    }
  );

  const chain = rawChain as any;

  const strikeInterval = selectedSymbol === "SENSEX" ? 500 : selectedSymbol === "BANKNIFTY" ? 200 : 100;
  const atmStrike = chain ? Math.round(chain.underlyingPrice / strikeInterval) * strikeInterval : 0;
  const strikes = chain
    ? Array.from(new Set(chain.options.map((o: any) => o.strikePrice))).sort((a: any, b: any) => a - b) as number[]
    : [];

  const pcr = chain?.pcr ?? 1;
  const sentiment = chain?.sentiment ?? "Neutral";

  const sentimentColor =
    sentiment.includes("Bullish")
      ? "text-green-400 border-green-500/30 bg-green-500/10"
      : sentiment.includes("Bearish")
      ? "text-red-400 border-red-500/30 bg-red-500/10"
      : "text-yellow-400 border-yellow-500/30 bg-yellow-500/10";

  return (
    <Layout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Market & Options Chain</h1>
            <p className="text-muted-foreground text-sm">
              Live index quotes · Technical charts · Real-time Option Greeks & PCR
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={showChart ? "default" : "outline"}
              size="sm"
              onClick={() => setShowChart(!showChart)}
              className="gap-1.5"
            >
              <LineChart className="w-4 h-4" />
              {showChart ? "Hide Chart" : "Live Chart"}
              {showChart ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </Button>
            <Button variant="outline" size="sm" onClick={() => { refetchIndices(); refetchChain(); }}>
              <RefreshCw className="w-4 h-4 mr-1.5" /> Refresh
            </Button>
          </div>
        </div>

        {/* Index Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {indicesLoading
            ? Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
            : indices?.map((idx) => (
                <Card
                  key={idx.symbol}
                  onClick={() => setSelectedSymbol(idx.symbol)}
                  className={cn(
                    "cursor-pointer transition-all hover:border-primary/60",
                    selectedSymbol === idx.symbol && "border-primary bg-primary/5 ring-1 ring-primary/40"
                  )}
                >
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground font-medium">{idx.name}</p>
                    <p className="text-xl font-bold font-mono mt-1">
                      ₹{idx.ltp.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                    </p>
                    <p className={cn("text-xs font-mono mt-1 flex items-center gap-0.5", idx.change >= 0 ? "text-green-500" : "text-red-500")}>
                      {idx.change >= 0 ? <ArrowUpIcon className="w-3 h-3" /> : <ArrowDownIcon className="w-3 h-3" />}
                      {idx.change >= 0 ? "+" : ""}{idx.change.toFixed(2)} ({idx.changePercent.toFixed(2)}%)
                    </p>
                  </CardContent>
                </Card>
              ))}
        </div>

        {/* Embedded Interactive TradingView Candlestick Chart */}
        {showChart && (
          <Card className="overflow-hidden border-primary/30 shadow-lg">
            <CardHeader className="py-2.5 px-4 bg-muted/40 border-b border-border flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <LineChart className="w-4 h-4 text-primary" />
                <CardTitle className="text-sm font-semibold">{selectedSymbol} Live Candlestick Chart</CardTitle>
              </div>
              <span className="text-xs text-muted-foreground">Powered by TradingView</span>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-[440px] w-full">
                <TradingViewWidget
                  symbol={TV_SYMBOLS[selectedSymbol] ?? "NSE:NIFTY"}
                  theme="dark"
                  interval="5"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* PCR & Market Sentiment Analytics Banner */}
        {chain && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Card className="bg-card/60 border-border">
              <CardContent className="p-3.5 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Put-Call Ratio (PCR)</p>
                  <p className="text-xl font-bold font-mono mt-0.5">{pcr.toFixed(2)}</p>
                </div>
                <Badge variant="outline" className={cn("text-xs font-semibold px-2.5 py-1", sentimentColor)}>
                  {sentiment}
                </Badge>
              </CardContent>
            </Card>

            <Card className="bg-card/60 border-border">
              <CardContent className="p-3.5">
                <p className="text-xs text-muted-foreground font-medium">Total Call OI</p>
                <p className="text-lg font-bold font-mono text-green-400 mt-0.5">
                  {(chain.totalCallOi ?? 0).toLocaleString("en-IN")}
                </p>
              </CardContent>
            </Card>

            <Card className="bg-card/60 border-border">
              <CardContent className="p-3.5">
                <p className="text-xs text-muted-foreground font-medium">Total Put OI</p>
                <p className="text-lg font-bold font-mono text-red-400 mt-0.5">
                  {(chain.totalPutOi ?? 0).toLocaleString("en-IN")}
                </p>
              </CardContent>
            </Card>

            <Card className="bg-card/60 border-border">
              <CardContent className="p-3.5">
                <p className="text-xs text-muted-foreground font-medium">ATM Strike</p>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-lg font-bold font-mono text-primary">{atmStrike.toLocaleString("en-IN")}</span>
                  <span className="text-[11px] text-muted-foreground">Spot: ₹{chain.underlyingPrice.toFixed(0)}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Expiry Selector & View Mode Toggle */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          {expiries && expiries.length > 0 && (
            <div className="flex gap-2 flex-wrap items-center">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Expiry:</span>
              {expiries.slice(0, 6).map((exp) => (
                <Button
                  key={exp}
                  size="sm"
                  variant={selectedExpiry === exp ? "default" : "outline"}
                  className="h-7 text-xs font-medium"
                  onClick={() => setSelectedExpiry(exp)}
                >
                  {exp}
                </Button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg border border-border">
            <Button
              size="sm"
              variant={viewMode === "prices" ? "secondary" : "ghost"}
              className="h-6 text-xs px-2.5"
              onClick={() => setViewMode("prices")}
            >
              Prices & Volume
            </Button>
            <Button
              size="sm"
              variant={viewMode === "greeks" ? "secondary" : "ghost"}
              className="h-6 text-xs px-2.5"
              onClick={() => setViewMode("greeks")}
            >
              Option Greeks (Δ, Γ, Θ, ν)
            </Button>
          </div>
        </div>

        {/* Options Chain Table */}
        <Card className="overflow-hidden">
          <CardHeader className="py-3 px-4 border-b border-border bg-card">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <span>{selectedSymbol} Options Chain</span>
                {chain && (
                  <span className="text-muted-foreground font-normal text-xs">
                    Spot: ₹{chain.underlyingPrice.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                  </span>
                )}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">{selectedExpiry || "Select expiry"}</Badge>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {chainLoading ? (
              <div className="p-6 space-y-2">
                {Array(8).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : !chain ? (
              <p className="text-center text-muted-foreground py-10 text-sm">Select an expiry to load the options chain</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    {viewMode === "prices" ? (
                      <tr className="border-b border-border bg-muted/40 text-muted-foreground">
                        <th className="text-left px-3 py-2.5">OI</th>
                        <th className="text-right px-3 py-2.5">Volume</th>
                        <th className="text-right px-3 py-2.5">IV%</th>
                        <th className="text-right px-3 py-2.5 text-green-500 font-bold">CE LTP ▼</th>
                        <th className="text-center px-4 py-2.5 font-bold text-foreground">STRIKE</th>
                        <th className="text-left px-3 py-2.5 text-red-400 font-bold">PE LTP ▼</th>
                        <th className="text-left px-3 py-2.5">IV%</th>
                        <th className="text-left px-3 py-2.5">Volume</th>
                        <th className="text-left px-3 py-2.5">OI</th>
                      </tr>
                    ) : (
                      <tr className="border-b border-border bg-muted/40 text-muted-foreground">
                        <th className="text-left px-3 py-2.5 text-green-400">Delta (Δ)</th>
                        <th className="text-right px-3 py-2.5">Gamma (Γ)</th>
                        <th className="text-right px-3 py-2.5 text-amber-400">Theta (Θ/d)</th>
                        <th className="text-right px-3 py-2.5 text-cyan-400">Vega (ν)</th>
                        <th className="text-center px-4 py-2.5 font-bold text-foreground">STRIKE</th>
                        <th className="text-left px-3 py-2.5 text-red-400">Delta (Δ)</th>
                        <th className="text-left px-3 py-2.5">Gamma (Γ)</th>
                        <th className="text-left px-3 py-2.5 text-amber-400">Theta (Θ/d)</th>
                        <th className="text-left px-3 py-2.5 text-cyan-400">Vega (ν)</th>
                      </tr>
                    )}
                  </thead>
                  <tbody>
                    {strikes.map((strike) => {
                      const ce = chain.options.find((o: any) => o.strikePrice === strike && o.type === "CE");
                      const pe = chain.options.find((o: any) => o.strikePrice === strike && o.type === "PE");
                      const isAtm = strike === atmStrike;

                      if (viewMode === "prices") {
                        return (
                          <tr key={strike} className={cn("border-b border-border/40 hover:bg-muted/20 transition-colors", isAtm && "bg-primary/5")}>
                            <td className="px-3 py-2 text-muted-foreground font-mono">{ce?.oi?.toLocaleString("en-IN") ?? "-"}</td>
                            <td className="px-3 py-2 text-right text-muted-foreground font-mono">{ce?.volume?.toLocaleString("en-IN") ?? "-"}</td>
                            <td className="px-3 py-2 text-right text-muted-foreground">{ce?.iv?.toFixed(1) ?? "-"}</td>
                            <td className="px-3 py-2 text-right">
                              <button
                                onClick={() => setLocation(`/trade?symbol=${selectedSymbol}&strike=${strike}&type=CE&expiry=${selectedExpiry}`)}
                                className="font-mono font-bold text-green-500 hover:underline hover:text-green-400 transition-colors"
                              >
                                {ce?.ltp?.toFixed(2) ?? "-"}
                              </button>
                            </td>
                            <td className={cn("px-4 py-2 text-center font-bold font-mono", isAtm ? "text-primary" : "text-foreground")}>
                              {isAtm && <span className="text-[9px] text-primary mr-1 font-normal border border-primary/40 px-1 rounded">ATM</span>}
                              {strike.toLocaleString("en-IN")}
                            </td>
                            <td className="px-3 py-2">
                              <button
                                onClick={() => setLocation(`/trade?symbol=${selectedSymbol}&strike=${strike}&type=PE&expiry=${selectedExpiry}`)}
                                className="font-mono font-bold text-red-400 hover:underline hover:text-red-300 transition-colors"
                              >
                                {pe?.ltp?.toFixed(2) ?? "-"}
                              </button>
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">{pe?.iv?.toFixed(1) ?? "-"}</td>
                            <td className="px-3 py-2 text-muted-foreground font-mono">{pe?.volume?.toLocaleString("en-IN") ?? "-"}</td>
                            <td className="px-3 py-2 text-muted-foreground font-mono">{pe?.oi?.toLocaleString("en-IN") ?? "-"}</td>
                          </tr>
                        );
                      } else {
                        // Greeks view
                        return (
                          <tr key={strike} className={cn("border-b border-border/40 hover:bg-muted/20 transition-colors", isAtm && "bg-primary/5")}>
                            <td className="px-3 py-2 font-mono font-semibold text-green-400">{ce?.delta != null ? ce.delta.toFixed(3) : "-"}</td>
                            <td className="px-3 py-2 text-right font-mono text-muted-foreground">{ce?.gamma != null ? ce.gamma.toFixed(4) : "-"}</td>
                            <td className="px-3 py-2 text-right font-mono text-amber-400">{ce?.theta != null ? `₹${ce.theta.toFixed(1)}` : "-"}</td>
                            <td className="px-3 py-2 text-right font-mono text-cyan-400">{ce?.vega != null ? ce.vega.toFixed(1) : "-"}</td>
                            <td className={cn("px-4 py-2 text-center font-bold font-mono", isAtm ? "text-primary" : "text-foreground")}>
                              {isAtm && <span className="text-[9px] text-primary mr-1 font-normal border border-primary/40 px-1 rounded">ATM</span>}
                              {strike.toLocaleString("en-IN")}
                            </td>
                            <td className="px-3 py-2 font-mono font-semibold text-red-400">{pe?.delta != null ? pe.delta.toFixed(3) : "-"}</td>
                            <td className="px-3 py-2 font-mono text-muted-foreground">{pe?.gamma != null ? pe.gamma.toFixed(4) : "-"}</td>
                            <td className="px-3 py-2 font-mono text-amber-400">{pe?.theta != null ? `₹${pe.theta.toFixed(1)}` : "-"}</td>
                            <td className="px-3 py-2 font-mono text-cyan-400">{pe?.vega != null ? pe.vega.toFixed(1) : "-"}</td>
                          </tr>
                        );
                      }
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
