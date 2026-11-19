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
  customFetch,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TradingViewWidget } from "@/components/trading-view-widget";
import { StrikeChartModal, StrikeChartData } from "@/components/strike-chart-modal";
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
  Info,
  BarChart2,
  Target,
  Crosshair,
  Activity,
  Sparkles
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
  const [upstoxStatus, setUpstoxStatus] = useState<any>(null);
  const [chartModalData, setChartModalData] = useState<StrikeChartData | null>(null);
  const [isChartModalOpen, setIsChartModalOpen] = useState(false);

  const handleOpenStrikeChart = (strikePrice: number, preferredType: "CE" | "PE" = "CE") => {
    const ce = chain?.options?.find((o: any) => o.strikePrice === strikePrice && o.type === "CE");
    const pe = chain?.options?.find((o: any) => o.strikePrice === strikePrice && o.type === "PE");
    const opt = preferredType === "CE" ? ce : pe;

    setChartModalData({
      symbol: selectedSymbol,
      strikePrice,
      optionType: preferredType,
      expiry: selectedExpiry || "2026-06-26",
      ltp: opt?.ltp ?? (preferredType === "CE" ? 180 : 140),
      change: opt?.change,
      changePercent: opt?.changePercent,
      iv: opt?.iv,
      delta: opt?.delta,
      gamma: opt?.gamma,
      theta: opt?.theta,
      vega: opt?.vega,
      oi: opt?.oi,
      volume: opt?.volume,
      underlyingPrice: chain?.underlyingPrice,
    });
    setIsChartModalOpen(true);
  };

  const [strikeFilter, setStrikeFilter] = useState<"atm5" | "atm10" | "all">("atm5");

  useEffect(() => {
    customFetch<any>("/api/market/upstox-status")
      .then((data) => setUpstoxStatus(data))
      .catch(() => {});
  }, []);

  const { data: indices, isLoading: indicesLoading, refetch: refetchIndices } = useGetIndices({
    query: { queryKey: getGetIndicesQueryKey(), refetchInterval: 2500 },
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
        refetchInterval: 2500,
      },
    }
  );

  const chain = rawChain as any;

  const strikeInterval = selectedSymbol === "SENSEX" ? 500 : selectedSymbol === "BANKNIFTY" ? 200 : 100;
  const atmStrike = chain ? Math.round(chain.underlyingPrice / strikeInterval) * strikeInterval : 0;
  const allStrikes = chain
    ? Array.from(new Set(chain.options.map((o: any) => o.strikePrice))).sort((a: any, b: any) => a - b) as number[]
    : [];

  // Filter strikes so ATM is directly visible without scrolling!
  const strikes = allStrikes.filter((s) => {
    if (strikeFilter === "atm5") return Math.abs(s - atmStrike) <= 5 * strikeInterval;
    if (strikeFilter === "atm10") return Math.abs(s - atmStrike) <= 10 * strikeInterval;
    return true;
  });

  const atmCe = chain?.options?.find((o: any) => o.strikePrice === atmStrike && o.type === "CE");
  const atmPe = chain?.options?.find((o: any) => o.strikePrice === atmStrike && o.type === "PE");
  const straddleCost = (atmCe?.ltp ?? 0) + (atmPe?.ltp ?? 0);
  const maxPain = chain?.maxPain ?? atmStrike;
  const atmIv = chain?.atmIv ?? 14.2;

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
            {upstoxStatus && (
              <Badge
                variant="outline"
                className={cn(
                  "text-xs gap-1.5 px-2.5 py-1 font-medium",
                  upstoxStatus.connected
                    ? "bg-green-500/10 text-green-400 border-green-500/30"
                    : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                )}
                title={upstoxStatus.hint}
              >
                <span className={cn("w-1.5 h-1.5 rounded-full", upstoxStatus.connected ? "bg-green-400 animate-pulse" : "bg-amber-400")} />
                {upstoxStatus.connected ? "Upstox Live Feed" : "Simulated Feed"}
              </Badge>
            )}
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

        {/* Live Index Tickers */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {indicesLoading
            ? Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
            : indices?.map((idx) => {
                const isSelected = selectedSymbol === idx.symbol;
                const isUp = idx.change >= 0;
                return (
                  <Card
                    key={idx.symbol}
                    onClick={() => {
                      setSelectedSymbol(idx.symbol);
                      setShowChart(true);
                    }}
                    className={cn(
                      "cursor-pointer transition-all hover:border-primary/60 relative overflow-hidden",
                      isSelected && "border-primary bg-primary/5 ring-1 ring-primary/40 shadow-md"
                    )}
                  >
                    <CardContent className="p-3.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground font-semibold">{idx.name}</span>
                        <span className="flex items-center gap-1 text-[10px] font-mono font-medium text-muted-foreground">
                          <span className={cn("w-1.5 h-1.5 rounded-full animate-pulse", isUp ? "bg-green-500" : "bg-red-500")} />
                          LIVE
                        </span>
                      </div>
                      <p className="text-xl font-bold font-mono mt-1 text-foreground">
                        ₹{idx.ltp.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                      </p>
                      <div className="flex items-center justify-between mt-1 text-xs font-mono">
                        <span className={cn("flex items-center gap-0.5 font-bold", isUp ? "text-green-500" : "text-red-500")}>
                          {isUp ? <ArrowUpIcon className="w-3 h-3" /> : <ArrowDownIcon className="w-3 h-3" />}
                          {isUp ? "+" : ""}{idx.change.toFixed(2)} ({idx.changePercent.toFixed(2)}%)
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          H: ₹{idx.high?.toFixed(0)} L: ₹{idx.low?.toFixed(0)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
        </div>

        {/* Embedded Interactive Fyers / TradingView Candlestick Chart */}
        {showChart && (
          <Card className="overflow-hidden border-primary/30 shadow-lg">
            <CardHeader className="py-2.5 px-4 bg-muted/40 border-b border-border flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <LineChart className="w-4 h-4 text-primary" />
                <CardTitle className="text-sm font-semibold">{selectedSymbol} Fyers / TradingView Technical Chart</CardTitle>
                <Badge variant="outline" className="text-[10px] text-primary border-primary/40">
                  Real-Time Multi-Indicators
                </Badge>
              </div>
              <span className="text-xs text-muted-foreground">Includes RSI, MACD, Volume & EMAs</span>
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

        {/* DIRECT ATM QUICK INSIGHT BANNER */}
        {chain && atmStrike > 0 && (
          <Card className="border-primary/50 bg-gradient-to-r from-primary/10 via-card to-card shadow-md">
            <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-xl bg-primary/20 border border-primary/40 flex items-center justify-center shrink-0">
                  <Target className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-primary inline" /> Direct ATM Focus
                    </span>
                    <Badge className="bg-primary text-primary-foreground font-mono font-bold text-xs px-2 py-0.5">
                      {selectedSymbol} {atmStrike.toLocaleString("en-IN")} ATM
                    </Badge>
                    <span className="text-xs text-muted-foreground font-mono">
                      Spot Index: ₹{chain.underlyingPrice.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-1.5 text-xs font-mono flex-wrap">
                    <span className="text-green-400 font-bold">
                      ATM Call (CE): ₹{atmCe?.ltp?.toFixed(2) ?? "-"} (Δ {atmCe?.delta?.toFixed(2) ?? "0.51"})
                    </span>
                    <span className="text-red-400 font-bold">
                      ATM Put (PE): ₹{atmPe?.ltp?.toFixed(2) ?? "-"} (Δ {atmPe?.delta?.toFixed(2) ?? "-0.49"})
                    </span>
                    <span className="text-muted-foreground">
                      Straddle: ₹{straddleCost.toFixed(2)}
                    </span>
                    <span className="text-amber-400 font-semibold">
                      Max Pain: ₹{maxPain.toLocaleString("en-IN")}
                    </span>
                    <span className="text-cyan-400">
                      ATM IV: {atmIv}%
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  size="sm"
                  className="h-8 bg-green-600 hover:bg-green-500 text-white font-bold text-xs gap-1 shadow-sm"
                  onClick={() => setLocation(`/trade?symbol=${selectedSymbol}&strike=${atmStrike}&type=CE&expiry=${selectedExpiry}&action=buy`)}
                >
                  Buy ATM Call @ ₹{atmCe?.ltp?.toFixed(2) ?? "-"}
                </Button>
                <Button
                  size="sm"
                  className="h-8 bg-red-600 hover:bg-red-500 text-white font-bold text-xs gap-1 shadow-sm"
                  onClick={() => setLocation(`/trade?symbol=${selectedSymbol}&strike=${atmStrike}&type=PE&expiry=${selectedExpiry}&action=buy`)}
                >
                  Buy ATM Put @ ₹{atmPe?.ltp?.toFixed(2) ?? "-"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs border-primary/40 text-primary hover:bg-primary/10 gap-1 font-semibold"
                  onClick={() => handleOpenStrikeChart(atmStrike, "CE")}
                >
                  <BarChart2 className="w-3.5 h-3.5" /> ATM Candlestick Chart
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* PCR & Advanced Derivatives Analytics Banner */}
        {chain && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="bg-card/60 border-border">
              <CardContent className="p-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Put-Call Ratio (PCR)</p>
                  <p className="text-xl font-bold font-mono mt-0.5">{pcr.toFixed(2)}</p>
                </div>
                <Badge variant="outline" className={cn("text-xs font-semibold px-2 py-0.5", sentimentColor)}>
                  {sentiment}
                </Badge>
              </CardContent>
            </Card>

            <Card className="bg-card/60 border-border">
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground font-medium">Total Call OI (Resistance)</p>
                <p className="text-lg font-bold font-mono text-green-400 mt-0.5">
                  {(chain.totalCallOi ?? 0).toLocaleString("en-IN")}
                </p>
              </CardContent>
            </Card>

            <Card className="bg-card/60 border-border">
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground font-medium">Total Put OI (Support)</p>
                <p className="text-lg font-bold font-mono text-red-400 mt-0.5">
                  {(chain.totalPutOi ?? 0).toLocaleString("en-IN")}
                </p>
              </CardContent>
            </Card>

            <Card className="bg-card/60 border-border">
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground font-medium">Max Pain & ATM IV</p>
                <div className="flex items-center justify-between mt-0.5 font-mono">
                  <span className="text-lg font-bold text-amber-400">₹{maxPain.toLocaleString("en-IN")}</span>
                  <span className="text-xs text-cyan-400 font-semibold">{atmIv}% IV</span>
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

          <div className="flex items-center gap-2 flex-wrap">
            {/* Strike Range Direct Filter */}
            <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg border border-border">
              <span className="text-xs text-muted-foreground px-1.5 font-medium">Strikes:</span>
              <button
                onClick={() => setStrikeFilter("atm5")}
                className={cn(
                  "px-2 py-0.5 text-xs font-semibold rounded transition-all",
                  strikeFilter === "atm5" ? "bg-primary text-primary-foreground shadow-sm font-bold" : "text-muted-foreground hover:text-foreground"
                )}
                title="Directly display ATM and 5 strikes above/below"
              >
                ATM ± 5 (Direct View)
              </button>
              <button
                onClick={() => setStrikeFilter("atm10")}
                className={cn(
                  "px-2 py-0.5 text-xs font-semibold rounded transition-all",
                  strikeFilter === "atm10" ? "bg-primary text-primary-foreground shadow-sm font-bold" : "text-muted-foreground hover:text-foreground"
                )}
              >
                ATM ± 10
              </button>
              <button
                onClick={() => setStrikeFilter("all")}
                className={cn(
                  "px-2 py-0.5 text-xs font-semibold rounded transition-all",
                  strikeFilter === "all" ? "bg-primary text-primary-foreground shadow-sm font-bold" : "text-muted-foreground hover:text-foreground"
                )}
              >
                All Strikes
              </button>
            </div>

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
                          <tr
                            key={strike}
                            className={cn(
                              "border-b border-border/40 hover:bg-muted/20 transition-colors",
                              isAtm && "bg-primary/15 border-y-2 border-primary/60 font-semibold"
                            )}
                          >
                            <td className="px-3 py-2 text-muted-foreground font-mono">{ce?.oi?.toLocaleString("en-IN") ?? "-"}</td>
                            <td className="px-3 py-2 text-right text-muted-foreground font-mono">{ce?.volume?.toLocaleString("en-IN") ?? "-"}</td>
                            <td className="px-3 py-2 text-right text-muted-foreground">{ce?.iv?.toFixed(1) ?? "-"}</td>
                            <td className="px-3 py-2 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenStrikeChart(strike, "CE");
                                  }}
                                  className="text-muted-foreground hover:text-green-400 p-1 rounded hover:bg-green-500/10 transition-colors"
                                  title="Open CE Candlestick Chart"
                                >
                                  <BarChart2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => setLocation(`/trade?symbol=${selectedSymbol}&strike=${strike}&type=CE&expiry=${selectedExpiry}`)}
                                  className="font-mono font-bold text-green-500 hover:underline hover:text-green-400 transition-colors"
                                  title="Trade CE"
                                >
                                  {ce?.ltp?.toFixed(2) ?? "-"}
                                </button>
                              </div>
                            </td>
                            <td className={cn("px-4 py-2 text-center font-bold font-mono", isAtm ? "text-primary" : "text-foreground")}>
                              <button
                                onClick={() => handleOpenStrikeChart(strike, "CE")}
                                className={cn(
                                  "group hover:text-primary hover:bg-primary/10 px-2 py-0.5 rounded transition-all inline-flex items-center gap-1 font-bold font-mono",
                                  isAtm && "bg-primary/20 ring-1 ring-primary/40"
                                )}
                                title="Click to open real-time candlestick chart (Groww style)"
                              >
                                {isAtm && (
                                  <span className="text-[9px] bg-primary text-primary-foreground font-bold px-1.5 py-0.5 rounded mr-0.5 animate-pulse">
                                    ATM
                                  </span>
                                )}
                                <span>{strike.toLocaleString("en-IN")}</span>
                                <BarChart2 className="w-3 h-3 text-muted-foreground group-hover:text-primary opacity-50 group-hover:opacity-100 transition-opacity" />
                              </button>
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => setLocation(`/trade?symbol=${selectedSymbol}&strike=${strike}&type=PE&expiry=${selectedExpiry}`)}
                                  className="font-mono font-bold text-red-400 hover:underline hover:text-red-300 transition-colors"
                                  title="Trade PE"
                                >
                                  {pe?.ltp?.toFixed(2) ?? "-"}
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenStrikeChart(strike, "PE");
                                  }}
                                  className="text-muted-foreground hover:text-red-400 p-1 rounded hover:bg-red-500/10 transition-colors"
                                  title="Open PE Candlestick Chart"
                                >
                                  <BarChart2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">{pe?.iv?.toFixed(1) ?? "-"}</td>
                            <td className="px-3 py-2 text-muted-foreground font-mono">{pe?.volume?.toLocaleString("en-IN") ?? "-"}</td>
                            <td className="px-3 py-2 text-muted-foreground font-mono">{pe?.oi?.toLocaleString("en-IN") ?? "-"}</td>
                          </tr>
                        );
                      } else {
                        // Greeks view
                        return (
                          <tr
                            key={strike}
                            className={cn(
                              "border-b border-border/40 hover:bg-muted/20 transition-colors",
                              isAtm && "bg-primary/15 border-y-2 border-primary/60 font-semibold"
                            )}
                          >
                            <td className="px-3 py-2 font-mono font-semibold text-green-400">{ce?.delta != null ? ce.delta.toFixed(3) : "-"}</td>
                            <td className="px-3 py-2 text-right font-mono text-muted-foreground">{ce?.gamma != null ? ce.gamma.toFixed(4) : "-"}</td>
                            <td className="px-3 py-2 text-right font-mono text-amber-400">{ce?.theta != null ? `₹${ce.theta.toFixed(1)}` : "-"}</td>
                            <td className="px-3 py-2 text-right font-mono text-cyan-400">{ce?.vega != null ? ce.vega.toFixed(1) : "-"}</td>
                            <td className={cn("px-4 py-2 text-center font-bold font-mono", isAtm ? "text-primary" : "text-foreground")}>
                              <button
                                onClick={() => handleOpenStrikeChart(strike, "CE")}
                                className="group hover:text-primary hover:bg-primary/10 px-2 py-0.5 rounded transition-all inline-flex items-center gap-1 font-bold font-mono"
                                title="Click to open real-time candlestick chart (Groww style)"
                              >
                                {isAtm && <span className="text-[9px] text-primary mr-0.5 font-normal border border-primary/40 px-1 rounded">ATM</span>}
                                <span>{strike.toLocaleString("en-IN")}</span>
                                <BarChart2 className="w-3 h-3 text-muted-foreground group-hover:text-primary opacity-50 group-hover:opacity-100 transition-opacity" />
                              </button>
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

      {/* Groww-style Real-Time Candlestick Chart Modal */}
      <StrikeChartModal
        open={isChartModalOpen}
        onOpenChange={setIsChartModalOpen}
        data={chartModalData}
        onQuickTrade={(params) => {
          setLocation(
            `/trade?symbol=${params.symbol}&strike=${params.strikePrice}&type=${params.optionType}&expiry=${params.expiry}&action=${params.action}`
          );
        }}
      />
    </Layout>
  );
}
