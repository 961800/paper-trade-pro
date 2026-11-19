import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import {
  useGetIndices,
  useGetOptionsChain,
  useGetExpiries,
  usePlaceOrder,
  useGetMarketStatus,
  getGetIndicesQueryKey,
  getGetOptionsChainQueryKey,
  getGetExpiriesQueryKey,
  getGetMarketStatusQueryKey,
  customFetch,
} from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TradingViewWidget } from "@/components/trading-view-widget";
import { cn } from "@/lib/utils";
import {
  ArrowUpIcon,
  ArrowDownIcon,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Clock,
  Ban,
  LineChart,
  ChevronDown,
  ChevronUp,
  Layers,
  ShieldAlert,
  Target,
  Crosshair,
  CheckCircle2,
  Lock,
} from "lucide-react";

function useSearchParam(key: string) {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(key) ?? "";
}

const MARKET_STATUS_COLORS: Record<string, string> = {
  open: "bg-green-500/15 text-green-400 border-green-500/30",
  "pre-open": "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  closed: "bg-muted text-muted-foreground border-border",
  weekend: "bg-muted text-muted-foreground border-border",
  holiday: "bg-orange-500/15 text-orange-400 border-orange-500/30",
};

const TV_SYMBOLS: Record<string, string> = {
  NIFTY: "NSE:NIFTY",
  BANKNIFTY: "NSE:BANKNIFTY",
  SENSEX: "BSE:SENSEX",
  FINNIFTY: "NSE:CNXFINANCE",
};

export default function Trade() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"single" | "strategy">("single");
  const [showChart, setShowChart] = useState(false);

  // Single order form state
  const [symbol, setSymbol] = useState(useSearchParam("symbol") || "NIFTY");
  const [selectedExpiry, setSelectedExpiry] = useState(useSearchParam("expiry") || "");
  const [selectedStrike, setSelectedStrike] = useState<number | null>(
    Number(useSearchParam("strike")) || null
  );
  const [selectedType, setSelectedType] = useState<"CE" | "PE">(
    (useSearchParam("type") as "CE" | "PE") || "CE"
  );
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [action, setAction] = useState<"buy" | "sell">("buy");
  const [lots, setLots] = useState(1);
  const [limitPrice, setLimitPrice] = useState("");

  // Bracket Order (SL & Target)
  const [enableBracket, setEnableBracket] = useState(false);
  const [stopLossPrice, setStopLossPrice] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [trailingStop, setTrailingStop] = useState("");

  // Strategy Builder State
  const [selectedStrategy, setSelectedStrategy] = useState<string>("bull_call_spread");
  const [strategyLots, setStrategyLots] = useState(1);
  const [strategySubmitting, setStrategySubmitting] = useState(false);

  const { data: marketStatus } = useGetMarketStatus({
    query: { queryKey: getGetMarketStatusQueryKey(), refetchInterval: 30000 },
  });

  const { data: indices } = useGetIndices({
    query: { queryKey: getGetIndicesQueryKey(), refetchInterval: 3000 },
  });

  const { data: expiries } = useGetExpiries(
    { symbol },
    { query: { queryKey: getGetExpiriesQueryKey({ symbol }) } }
  );

  useEffect(() => {
    if (expiries && expiries.length > 0 && !selectedExpiry) setSelectedExpiry(expiries[0]);
  }, [expiries, selectedExpiry]);

  const { data: rawChain, isLoading: chainLoading } = useGetOptionsChain(
    { symbol, expiry: selectedExpiry || "2026-06-26" },
    {
      query: {
        queryKey: getGetOptionsChainQueryKey({ symbol, expiry: selectedExpiry || "2026-06-26" }),
        enabled: !!selectedExpiry,
        refetchInterval: 2500,
      },
    }
  );

  const chain = rawChain as any;
  const placeOrderMutation = usePlaceOrder();

  const selectedIndex = indices?.find((i) => i.symbol === symbol);
  const strikeInterval = symbol === "SENSEX" ? 500 : symbol === "BANKNIFTY" ? 200 : 100;
  const atmStrike = chain ? Math.round(chain.underlyingPrice / strikeInterval) * strikeInterval : 0;

  const selectedOption = chain?.options.find(
    (o: any) => o.strikePrice === selectedStrike && o.type === selectedType
  );

  const lotSize = selectedOption?.lotSize ?? (symbol === "NIFTY" ? 65 : symbol === "BANKNIFTY" ? 30 : symbol === "SENSEX" ? 20 : 60);
  const ltp = selectedOption?.ltp ?? 0;
  const orderValue = ltp * lotSize * lots;

  const strikes = chain
    ? Array.from(new Set(chain.options.map((o: any) => o.strikePrice))).sort((a: any, b: any) => a - b) as number[]
    : [];

  const tradingEnabled = marketStatus?.tradingEnabled ?? true;
  const isKillSwitchActive = (user as any)?.killSwitchActive ?? false;

  // Single Order Placement
  const handlePlaceOrder = async () => {
    if (isKillSwitchActive) {
      toast({ variant: "destructive", title: "Trading is Locked", description: "Emergency Kill Switch is ACTIVE. Disable it in Settings to trade." });
      return;
    }
    if (!selectedStrike || !selectedExpiry) {
      toast({ variant: "destructive", title: "Select strike and expiry" });
      return;
    }
    if (lots <= 0) {
      toast({ variant: "destructive", title: "Invalid quantity", description: "Lots must be at least 1." });
      return;
    }
    if (orderType === "limit" && (!limitPrice || parseFloat(limitPrice) <= 0)) {
      toast({ variant: "destructive", title: "Invalid limit price", description: "Please enter a valid limit price." });
      return;
    }

    try {
      await placeOrderMutation.mutateAsync({
        data: {
          symbol,
          strikePrice: selectedStrike,
          optionType: selectedType,
          action,
          quantity: lots * lotSize,
          orderType,
          limitPrice: orderType === "limit" ? parseFloat(limitPrice) : undefined,
          stopLoss: enableBracket && stopLossPrice ? parseFloat(stopLossPrice) : undefined,
          targetPrice: enableBracket && targetPrice ? parseFloat(targetPrice) : undefined,
          trailingStop: enableBracket && trailingStop ? parseFloat(trailingStop) : undefined,
          expiry: selectedExpiry,
        } as any,
      });

      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/positions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({
        title: `${action.toUpperCase()} order placed!`,
        description: `${lots} lot(s) of ${symbol} ${selectedStrike} ${selectedType} @ ₹${ltp.toFixed(2)}${enableBracket ? " (Bracket SL/TP configured)" : ""}`,
      });
      setLocation("/orders");
    } catch (err: any) {
      toast({ variant: "destructive", title: "Order failed", description: err.message });
    }
  };

  // Pre-configured strategy legs generator
  const getStrategyLegs = () => {
    if (!chain || strikes.length === 0) return [];
    const atm = atmStrike;
    const interval = strikeInterval;

    switch (selectedStrategy) {
      case "bull_call_spread":
        return [
          { name: "Leg 1 (Buy ATM Call)", action: "buy", type: "CE", strike: atm, lots: strategyLots },
          { name: "Leg 2 (Sell OTM Call)", action: "sell", type: "CE", strike: atm + interval, lots: strategyLots },
        ];
      case "bear_put_spread":
        return [
          { name: "Leg 1 (Buy ATM Put)", action: "buy", type: "PE", strike: atm, lots: strategyLots },
          { name: "Leg 2 (Sell OTM Put)", action: "sell", type: "PE", strike: atm - interval, lots: strategyLots },
        ];
      case "long_straddle":
        return [
          { name: "Leg 1 (Buy ATM Call)", action: "buy", type: "CE", strike: atm, lots: strategyLots },
          { name: "Leg 2 (Buy ATM Put)", action: "buy", type: "PE", strike: atm, lots: strategyLots },
        ];
      case "short_straddle":
        return [
          { name: "Leg 1 (Sell ATM Call)", action: "sell", type: "CE", strike: atm, lots: strategyLots },
          { name: "Leg 2 (Sell ATM Put)", action: "sell", type: "PE", strike: atm, lots: strategyLots },
        ];
      case "long_strangle":
        return [
          { name: "Leg 1 (Buy OTM Call)", action: "buy", type: "CE", strike: atm + interval, lots: strategyLots },
          { name: "Leg 2 (Buy OTM Put)", action: "buy", type: "PE", strike: atm - interval, lots: strategyLots },
        ];
      case "iron_condor":
        return [
          { name: "Leg 1 (Buy OTM Put Wing)", action: "buy", type: "PE", strike: atm - 2 * interval, lots: strategyLots },
          { name: "Leg 2 (Sell OTM Put Body)", action: "sell", type: "PE", strike: atm - interval, lots: strategyLots },
          { name: "Leg 3 (Sell OTM Call Body)", action: "sell", type: "CE", strike: atm + interval, lots: strategyLots },
          { name: "Leg 4 (Buy OTM Call Wing)", action: "buy", type: "CE", strike: atm + 2 * interval, lots: strategyLots },
        ];
      default:
        return [];
    }
  };

  const strategyLegsWithPrices = getStrategyLegs().map((leg) => {
    const opt = chain?.options?.find((o: any) => o.strikePrice === leg.strike && o.type === leg.type);
    const price = opt?.ltp ?? 0;
    const legValue = price * lotSize * leg.lots;
    return { ...leg, ltp: price, legValue, lotSize };
  });

  const netStrategyCost = strategyLegsWithPrices.reduce((sum, leg) => {
    return leg.action === "buy" ? sum + leg.legValue : sum - leg.legValue;
  }, 0);

  // Payoff calculations for Strategy SVG Curve
  const generatePayoffCurve = () => {
    if (!chain || strategyLegsWithPrices.length === 0) return { points: [], maxProfit: 0, maxLoss: 0, breakevens: [] };
    const spot = chain.underlyingPrice;
    const range = spot * 0.04;
    const minP = spot - range;
    const maxP = spot + range;
    const step = (maxP - minP) / 40;

    const points: { price: number; pnl: number }[] = [];
    let maxProfit = -Infinity;
    let maxLoss = Infinity;

    for (let p = minP; p <= maxP; p += step) {
      let totalPnl = 0;
      for (const leg of strategyLegsWithPrices) {
        let payoffAtExpiry = 0;
        if (leg.type === "CE") {
          payoffAtExpiry = Math.max(0, p - leg.strike);
        } else {
          payoffAtExpiry = Math.max(0, leg.strike - p);
        }

        const legPnl = (leg.action === "buy" ? (payoffAtExpiry - leg.ltp) : (leg.ltp - payoffAtExpiry)) * leg.lotSize * leg.lots;
        totalPnl += legPnl;
      }
      points.push({ price: p, pnl: totalPnl });
      if (totalPnl > maxProfit) maxProfit = totalPnl;
      if (totalPnl < maxLoss) maxLoss = totalPnl;
    }

    const breakevens: number[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      if ((points[i].pnl <= 0 && points[i + 1].pnl >= 0) || (points[i].pnl >= 0 && points[i + 1].pnl <= 0)) {
        breakevens.push(Math.round(points[i].price));
      }
    }

    return { points, maxProfit, maxLoss, breakevens };
  };

  const payoffData = generatePayoffCurve();

  // Execute multi-leg strategy
  const handleExecuteStrategy = async () => {
    if (isKillSwitchActive) {
      toast({ variant: "destructive", title: "Trading is Locked", description: "Emergency Kill Switch is ACTIVE." });
      return;
    }
    if (!selectedExpiry) {
      toast({ variant: "destructive", title: "Select an expiry date" });
      return;
    }
    setStrategySubmitting(true);
    try {
      const orders = strategyLegsWithPrices.map((leg) => ({
        symbol,
        strikePrice: leg.strike,
        optionType: leg.type,
        action: leg.action,
        quantity: leg.lots * lotSize,
        orderType: "market",
        expiry: selectedExpiry,
      }));

      await customFetch("/api/orders/batch", {
        method: "POST",
        body: JSON.stringify({
          strategyName: selectedStrategy.toUpperCase().replace(/_/g, " "),
          orders,
        }),
      });

      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/positions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });

      toast({
        title: "Strategy Executed!",
        description: `Successfully executed ${orders.length} legs for ${symbol} ${selectedStrategy.replace(/_/g, " ")}.`,
      });
      setLocation("/positions");
    } catch (err: any) {
      toast({ variant: "destructive", title: "Strategy execution failed", description: err.message });
    } finally {
      setStrategySubmitting(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-4">
        {/* Top Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Trade Terminal</h1>
            <p className="text-muted-foreground text-sm">
              Single Orders · Multi-Leg Strategies · Bracket Orders (SL/TP)
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
            {marketStatus && (
              <Badge
                variant="outline"
                className={cn("text-xs gap-1.5 px-3 py-1.5", MARKET_STATUS_COLORS[marketStatus.status])}
              >
                <span className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  marketStatus.status === "open" ? "bg-green-500 animate-pulse" : "bg-current opacity-60"
                )} />
                {marketStatus.message}
              </Badge>
            )}
          </div>
        </div>

        {/* Kill Switch / Risk Lockout Warning Banner */}
        {isKillSwitchActive && (
          <div className="rounded-xl border border-red-500/50 bg-red-500/10 p-4 flex items-center justify-between text-red-400">
            <div className="flex items-center gap-3">
              <Lock className="w-5 h-5 shrink-0" />
              <div>
                <p className="font-semibold text-sm">Discipline Lockout Active</p>
                <p className="text-xs text-red-300">
                  Trading has been locked by your Emergency Kill Switch. This protects you from emotional trading.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="border-red-500/40 text-red-300 hover:bg-red-500/20"
              onClick={() => setLocation("/settings")}
            >
              Settings
            </Button>
          </div>
        )}

        {/* Embedded Technical Chart */}
        {showChart && (
          <Card className="overflow-hidden border-primary/30 shadow-md">
            <CardHeader className="py-2.5 px-4 bg-muted/40 border-b border-border flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <LineChart className="w-4 h-4 text-primary" />
                <CardTitle className="text-sm font-semibold">{symbol} Technical Candlesticks</CardTitle>
              </div>
              <span className="text-xs text-muted-foreground">Live 5m Timeframe</span>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-[400px] w-full">
                <TradingViewWidget
                  symbol={TV_SYMBOLS[symbol] ?? "NSE:NIFTY"}
                  theme="dark"
                  interval="5"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tab Selector: Single Order vs Strategy Builder */}
        <div className="flex items-center justify-between flex-wrap gap-2 border-b border-border pb-3">
          <div className="flex gap-2">
            <Button
              variant={activeTab === "single" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab("single")}
              className="gap-2 font-medium"
            >
              <Crosshair className="w-4 h-4" /> Single Option Order
            </Button>
            <Button
              variant={activeTab === "strategy" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab("strategy")}
              className="gap-2 font-medium"
            >
              <Layers className="w-4 h-4" /> Multi-Leg Strategy Builder
            </Button>
          </div>

          <div className="flex items-center gap-1.5">
            {["NIFTY", "BANKNIFTY", "SENSEX", "FINNIFTY"].map((s) => (
              <Button
                key={s}
                size="sm"
                variant={symbol === s ? "secondary" : "ghost"}
                className={cn("h-7 text-xs font-semibold", symbol === s && "border border-primary/40")}
                onClick={() => { setSymbol(s); setSelectedStrike(null); setSelectedExpiry(""); }}
              >
                {s}
              </Button>
            ))}
          </div>
        </div>

        {/* ======================= TAB 1: SINGLE OPTION ORDER ======================= */}
        {activeTab === "single" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-4">
              {/* Underlying Spot Quote */}
              <Card>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{symbol} SPOT</span>
                    {selectedIndex && (
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-2xl font-bold font-mono">
                          ₹{selectedIndex.ltp.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                        </span>
                        <span className={cn("text-xs font-mono flex items-center gap-0.5", selectedIndex.change >= 0 ? "text-green-500" : "text-red-500")}>
                          {selectedIndex.change >= 0 ? <ArrowUpIcon className="w-3.5 h-3.5" /> : <ArrowDownIcon className="w-3.5 h-3.5" />}
                          {selectedIndex.change >= 0 ? "+" : ""}{selectedIndex.change.toFixed(2)} ({selectedIndex.changePercent.toFixed(2)}%)
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-muted-foreground">Lot Size</span>
                    <p className="text-sm font-bold font-mono">{lotSize} Qty</p>
                  </div>
                </CardContent>
              </Card>

              {/* Expiry Selector */}
              {expiries && expiries.length > 0 && (
                <div className="flex gap-2 flex-wrap items-center">
                  <span className="text-xs font-semibold text-muted-foreground uppercase">Expiry:</span>
                  {expiries.slice(0, 5).map((exp) => (
                    <Button
                      key={exp}
                      size="sm"
                      variant={selectedExpiry === exp ? "default" : "outline"}
                      className="h-7 text-xs"
                      onClick={() => setSelectedExpiry(exp)}
                    >
                      {exp}
                    </Button>
                  ))}
                </div>
              )}

              {/* Call / Put Toggle */}
              <div className="flex gap-2">
                <Button
                  variant={selectedType === "CE" ? "default" : "outline"}
                  className={selectedType === "CE" ? "bg-green-600 hover:bg-green-700 text-white border-green-600 flex-1" : "flex-1"}
                  onClick={() => setSelectedType("CE")}
                >
                  <TrendingUp className="w-4 h-4 mr-2" /> CALL (CE)
                </Button>
                <Button
                  variant={selectedType === "PE" ? "default" : "outline"}
                  className={selectedType === "PE" ? "bg-red-600 hover:bg-red-700 text-white border-red-600 flex-1" : "flex-1"}
                  onClick={() => setSelectedType("PE")}
                >
                  <TrendingDown className="w-4 h-4 mr-2" /> PUT (PE)
                </Button>
              </div>

              {/* Strikes Table */}
              <Card>
                <CardHeader className="py-2.5 px-4 border-b border-border flex flex-row items-center justify-between">
                  <CardTitle className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                    Select Strike Price
                  </CardTitle>
                  <span className="text-xs text-muted-foreground">Click to select</span>
                </CardHeader>
                <CardContent className="p-0 max-h-72 overflow-y-auto">
                  {chainLoading ? (
                    <div className="p-4 space-y-2">{Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
                  ) : (
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-card border-b border-border">
                        <tr className="text-muted-foreground">
                          <th className="text-left px-4 py-2">Strike</th>
                          <th className="text-right px-4 py-2">LTP</th>
                          <th className="text-right px-4 py-2">IV%</th>
                          <th className="text-right px-4 py-2">Delta</th>
                          <th className="text-right px-4 py-2">OI</th>
                        </tr>
                      </thead>
                      <tbody>
                        {strikes.map((strike) => {
                          const opt = chain?.options.find((o: any) => o.strikePrice === strike && o.type === selectedType);
                          const isAtm = strike === atmStrike;
                          const isSelected = selectedStrike === strike;
                          return (
                            <tr
                              key={strike}
                              onClick={() => setSelectedStrike(strike)}
                              className={cn(
                                "border-b border-border/40 cursor-pointer transition-colors",
                                isAtm && "bg-primary/5",
                                isSelected ? "bg-primary/20 border-primary font-bold" : "hover:bg-muted/30"
                              )}
                            >
                              <td className="px-4 py-2 font-mono">
                                {isAtm && <span className="text-[9px] text-primary mr-1 border border-primary/40 px-1 rounded">ATM</span>}
                                {strike.toLocaleString("en-IN")}
                              </td>
                              <td className={cn("px-4 py-2 text-right font-mono font-bold", selectedType === "CE" ? "text-green-500" : "text-red-400")}>
                                ₹{opt?.ltp?.toFixed(2) ?? "-"}
                              </td>
                              <td className="px-4 py-2 text-right text-muted-foreground">{opt?.iv?.toFixed(1) ?? "-"}</td>
                              <td className="px-4 py-2 text-right text-muted-foreground font-mono">{opt?.delta?.toFixed(3) ?? "-"}</td>
                              <td className="px-4 py-2 text-right text-muted-foreground font-mono">{opt?.oi?.toLocaleString("en-IN") ?? "-"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right: Order Placement Card with Bracket Orders */}
            <div className="space-y-4">
              <Card className={cn("border-2 shadow-sm", action === "buy" ? "border-green-500/40" : "border-red-500/40")}>
                <CardHeader className="py-3 px-4 border-b border-border">
                  <CardTitle className="text-sm font-semibold">Order Execution</CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                  {selectedOption ? (
                    <div className="bg-muted/30 rounded-lg p-3 space-y-1">
                      <p className="text-xs text-muted-foreground">Selected Instrument</p>
                      <p className="font-bold text-sm">{symbol} {selectedStrike} {selectedType}</p>
                      <p className="text-xs text-muted-foreground">{selectedExpiry} · Lot: {lotSize}</p>
                      <p className={cn("text-lg font-bold font-mono", selectedType === "CE" ? "text-green-500" : "text-red-400")}>
                        ₹{ltp.toFixed(2)}
                      </p>
                    </div>
                  ) : (
                    <div className="bg-muted/30 rounded-lg p-3 flex items-center gap-2 text-muted-foreground text-xs">
                      <AlertCircle className="w-4 h-4 text-amber-400" />
                      Select a strike price from the table to configure order
                    </div>
                  )}

                  {/* BUY / SELL Switch */}
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant={action === "buy" ? "default" : "outline"}
                      className={action === "buy" ? "bg-green-600 hover:bg-green-700 text-white" : ""}
                      onClick={() => setAction("buy")}
                    >
                      BUY
                    </Button>
                    <Button
                      variant={action === "sell" ? "default" : "outline"}
                      className={action === "sell" ? "bg-red-600 hover:bg-red-700 text-white" : ""}
                      onClick={() => setAction("sell")}
                    >
                      SELL
                    </Button>
                  </div>

                  {/* Order Type */}
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Order Type</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Button size="sm" variant={orderType === "market" ? "default" : "outline"} onClick={() => setOrderType("market")}>Market</Button>
                      <Button size="sm" variant={orderType === "limit" ? "default" : "outline"} onClick={() => setOrderType("limit")}>Limit</Button>
                    </div>
                  </div>

                  {orderType === "limit" && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Limit Price (₹)</p>
                      <input
                        type="number"
                        value={limitPrice}
                        onChange={(e) => setLimitPrice(e.target.value)}
                        placeholder={ltp > 0 ? ltp.toFixed(2) : "0.00"}
                        className="w-full px-3 py-1.5 rounded-md border border-border bg-background text-sm font-mono focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  )}

                  {/* Lots Selector */}
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Lots</p>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => setLots(Math.max(1, lots - 1))} className="w-8 h-8 p-0">-</Button>
                      <span className="flex-1 text-center font-bold text-base font-mono">{lots}</span>
                      <Button size="sm" variant="outline" onClick={() => setLots(lots + 1)} className="w-8 h-8 p-0">+</Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1 font-mono">{lots * lotSize} qty ({lotSize}/lot)</p>
                  </div>

                  {/* ================= BRACKET ORDER SECTION ================= */}
                  <div className="pt-2 border-t border-border space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
                        <Crosshair className="w-3.5 h-3.5 text-primary" />
                        <span>Bracket Order (SL & Target)</span>
                      </label>
                      <input
                        type="checkbox"
                        checked={enableBracket}
                        onChange={(e) => setEnableBracket(e.target.checked)}
                        className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer"
                      />
                    </div>

                    {enableBracket && (
                      <div className="space-y-3 bg-muted/20 p-2.5 rounded-lg border border-border text-xs">
                        {/* Stop Loss Input */}
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-muted-foreground flex items-center gap-1">
                              <ShieldAlert className="w-3 h-3 text-red-400" /> Stop-Loss Price (₹)
                            </span>
                            {ltp > 0 && (
                              <div className="flex gap-1">
                                {[-10, -20, -30].map((pct) => (
                                  <button
                                    key={pct}
                                    type="button"
                                    onClick={() => setStopLossPrice((ltp * (1 + pct / 100)).toFixed(1))}
                                    className="px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-[10px] text-red-300 font-mono"
                                  >
                                    {pct}%
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <input
                            type="number"
                            value={stopLossPrice}
                            onChange={(e) => setStopLossPrice(e.target.value)}
                            placeholder={ltp > 0 ? (ltp * 0.85).toFixed(1) : "SL Trigger Price"}
                            className="w-full px-2.5 py-1 rounded border border-border bg-background font-mono text-xs"
                          />
                        </div>

                        {/* Target Price Input */}
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-muted-foreground flex items-center gap-1">
                              <Target className="w-3 h-3 text-green-400" /> Target Price (₹)
                            </span>
                            {ltp > 0 && (
                              <div className="flex gap-1">
                                {[20, 50, 100].map((pct) => (
                                  <button
                                    key={pct}
                                    type="button"
                                    onClick={() => setTargetPrice((ltp * (1 + pct / 100)).toFixed(1))}
                                    className="px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-[10px] text-green-300 font-mono"
                                  >
                                    +{pct}%
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <input
                            type="number"
                            value={targetPrice}
                            onChange={(e) => setTargetPrice(e.target.value)}
                            placeholder={ltp > 0 ? (ltp * 1.3).toFixed(1) : "Profit Target Price"}
                            className="w-full px-2.5 py-1 rounded border border-border bg-background font-mono text-xs"
                          />
                        </div>

                        {/* Trailing Stop */}
                        <div>
                          <span className="text-muted-foreground block mb-1">Trailing SL Jump (₹, Optional)</span>
                          <input
                            type="number"
                            value={trailingStop}
                            onChange={(e) => setTrailingStop(e.target.value)}
                            placeholder="e.g. 5.00"
                            className="w-full px-2.5 py-1 rounded border border-border bg-background font-mono text-xs"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Summary Box */}
                  <div className="border border-border rounded-lg p-2.5 space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Order Value</span>
                      <span className="font-mono font-bold">₹{orderValue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                    </div>
                    {user && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>Balance</span>
                        <span className="font-mono">₹{user.balance.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                      </div>
                    )}
                  </div>

                  {/* Action Button */}
                  <Button
                    className={cn(
                      "w-full font-bold",
                      action === "buy" ? "bg-green-600 hover:bg-green-700 text-white" : "bg-red-600 hover:bg-red-700 text-white"
                    )}
                    disabled={!selectedStrike || placeOrderMutation.isPending || !tradingEnabled || isKillSwitchActive}
                    onClick={handlePlaceOrder}
                  >
                    {isKillSwitchActive ? (
                      <><Lock className="w-4 h-4 mr-2" /> Kill Switch Active</>
                    ) : !tradingEnabled ? (
                      <><Ban className="w-4 h-4 mr-2" /> Market Closed</>
                    ) : placeOrderMutation.isPending ? "Placing..." : (
                      `${action.toUpperCase()} ${lots} Lot${lots > 1 ? "s" : ""}`
                    )}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* ======================= TAB 2: MULTI-LEG STRATEGY BUILDER ======================= */}
        {activeTab === "strategy" && (
          <div className="space-y-4">
            {/* Strategy Selection Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
              {[
                { id: "bull_call_spread", name: "Bull Call Spread", outlook: "Bullish (Capped Risk)" },
                { id: "bear_put_spread", name: "Bear Put Spread", outlook: "Bearish (Capped Risk)" },
                { id: "long_straddle", name: "Long Straddle", outlook: "High Volatility" },
                { id: "short_straddle", name: "Short Straddle", outlook: "Range Bound (Theta)" },
                { id: "long_strangle", name: "Long Strangle", outlook: "Breakout Play" },
                { id: "iron_condor", name: "Iron Condor", outlook: "Delta Neutral Range" },
              ].map((strat) => (
                <Card
                  key={strat.id}
                  onClick={() => setSelectedStrategy(strat.id)}
                  className={cn(
                    "cursor-pointer transition-all hover:border-primary/60 p-3",
                    selectedStrategy === strat.id && "border-primary bg-primary/10 ring-1 ring-primary/40"
                  )}
                >
                  <p className="font-semibold text-xs text-foreground">{strat.name}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{strat.outlook}</p>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Left 2 Cols: Legs Configuration & Payoff Diagram */}
              <div className="lg:col-span-2 space-y-4">
                {/* Legs Table */}
                <Card>
                  <CardHeader className="py-2.5 px-4 border-b border-border flex flex-row items-center justify-between">
                    <CardTitle className="text-xs font-semibold uppercase tracking-wider">Strategy Legs</CardTitle>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Lots:</span>
                      <Button size="sm" variant="outline" className="h-6 w-6 p-0 text-xs" onClick={() => setStrategyLots(Math.max(1, strategyLots - 1))}>-</Button>
                      <span className="text-xs font-mono font-bold">{strategyLots}</span>
                      <Button size="sm" variant="outline" className="h-6 w-6 p-0 text-xs" onClick={() => setStrategyLots(strategyLots + 1)}>+</Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border bg-muted/30 text-muted-foreground">
                            <th className="text-left px-3 py-2">Leg Name</th>
                            <th className="text-left px-3 py-2">Action</th>
                            <th className="text-center px-3 py-2">Strike</th>
                            <th className="text-center px-3 py-2">Type</th>
                            <th className="text-right px-3 py-2">LTP</th>
                            <th className="text-right px-3 py-2">Net Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {strategyLegsWithPrices.map((leg, idx) => (
                            <tr key={idx} className="border-b border-border/40">
                              <td className="px-3 py-2.5 font-medium">{leg.name}</td>
                              <td className="px-3 py-2.5">
                                <Badge variant="outline" className={cn("text-[10px] font-bold uppercase", leg.action === "buy" ? "bg-green-500/10 text-green-400 border-green-500/30" : "bg-red-500/10 text-red-400 border-red-500/30")}>
                                  {leg.action}
                                </Badge>
                              </td>
                              <td className="px-3 py-2.5 text-center font-mono font-bold">{leg.strike}</td>
                              <td className="px-3 py-2.5 text-center">
                                <span className={cn("font-bold", leg.type === "CE" ? "text-green-400" : "text-red-400")}>
                                  {leg.type}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-right font-mono">₹{leg.ltp.toFixed(2)}</td>
                              <td className="px-3 py-2.5 text-right font-mono font-semibold">
                                {leg.action === "buy" ? "-" : "+"}₹{leg.legValue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                {/* Interactive SVG Payoff Diagram */}
                <Card>
                  <CardHeader className="py-2.5 px-4 border-b border-border flex flex-row items-center justify-between">
                    <CardTitle className="text-xs font-semibold uppercase tracking-wider">Strategy Payoff at Expiry</CardTitle>
                    <div className="flex gap-3 text-xs">
                      {payoffData.breakevens.length > 0 && (
                        <span className="text-muted-foreground">
                          Breakeven: <span className="font-mono font-bold text-foreground">{payoffData.breakevens.join(", ")}</span>
                        </span>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="p-4">
                    {payoffData.points.length > 0 ? (
                      <div className="space-y-3">
                        <div className="h-56 w-full relative">
                          <svg className="w-full h-full" viewBox="0 0 500 200" preserveAspectRatio="none">
                            {/* Zero line */}
                            <line x1="0" y1="100" x2="500" y2="100" stroke="currentColor" strokeDasharray="3 3" className="text-muted-foreground/50" strokeWidth="1" />
                            {/* Spot marker */}
                            <line x1="250" y1="0" x2="250" y2="200" stroke="currentColor" strokeDasharray="2 2" className="text-primary/60" strokeWidth="1" />
                            
                            {/* Curve path */}
                            {(() => {
                              const pts = payoffData.points;
                              const maxPnl = Math.max(Math.abs(payoffData.maxProfit), Math.abs(payoffData.maxLoss), 1000);
                              const svgPts = pts.map((pt, i) => {
                                const x = (i / (pts.length - 1)) * 500;
                                const y = 100 - (pt.pnl / maxPnl) * 85;
                                return `${x},${y}`;
                              }).join(" ");

                              return (
                                <polyline
                                  fill="none"
                                  stroke="#3b82f6"
                                  strokeWidth="2.5"
                                  points={svgPts}
                                />
                              );
                            })()}
                          </svg>
                          <span className="absolute top-2 left-2 text-[10px] text-green-400 font-mono">+Profit</span>
                          <span className="absolute bottom-2 left-2 text-[10px] text-red-400 font-mono">-Loss</span>
                          <span className="absolute top-2 left-1/2 -translate-x-1/2 text-[10px] text-primary font-mono bg-background/80 px-1 rounded border border-primary/30">
                            Spot: ₹{chain?.underlyingPrice?.toFixed(0)}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center text-xs pt-2 border-t border-border">
                          <div>
                            <span className="text-muted-foreground block text-[11px]">Max Profit</span>
                            <span className="font-mono font-bold text-green-400">
                              {payoffData.maxProfit > 500000 ? "Unlimited" : `₹${Math.round(payoffData.maxProfit).toLocaleString("en-IN")}`}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground block text-[11px]">Max Loss</span>
                            <span className="font-mono font-bold text-red-400">
                              {payoffData.maxLoss < -500000 ? "Unlimited" : `₹${Math.round(Math.abs(payoffData.maxLoss)).toLocaleString("en-IN")}`}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground block text-[11px]">Net Premium</span>
                            <span className="font-mono font-bold">
                              {netStrategyCost >= 0 ? `Debit ₹${Math.round(netStrategyCost).toLocaleString("en-IN")}` : `Credit ₹${Math.round(Math.abs(netStrategyCost)).toLocaleString("en-IN")}`}
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-center py-10 text-xs">Load options chain to compute strategy payoff</p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Right Col: Execution Card */}
              <div className="space-y-4">
                <Card className="border-primary/40 shadow-sm">
                  <CardHeader className="py-3 px-4 border-b border-border">
                    <CardTitle className="text-sm font-semibold">Execute Strategy</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-4 text-xs">
                    <div className="bg-muted/30 p-3 rounded-lg space-y-1">
                      <p className="text-muted-foreground">Selected Strategy</p>
                      <p className="font-bold text-sm text-foreground">{selectedStrategy.toUpperCase().replace(/_/g, " ")}</p>
                      <p className="text-muted-foreground">{symbol} · {strategyLegsWithPrices.length} Legs · {selectedExpiry}</p>
                    </div>

                    <div className="space-y-2 border-t border-border pt-3">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total Quantity</span>
                        <span className="font-mono font-bold">{strategyLots * lotSize * strategyLegsWithPrices.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Net Cash Flow</span>
                        <span className={cn("font-mono font-bold", netStrategyCost >= 0 ? "text-amber-400" : "text-green-400")}>
                          {netStrategyCost >= 0 ? `-₹${Math.round(netStrategyCost).toLocaleString("en-IN")}` : `+₹${Math.round(Math.abs(netStrategyCost)).toLocaleString("en-IN")}`}
                        </span>
                      </div>
                      {user && (
                        <div className="flex justify-between text-muted-foreground">
                          <span>Available Capital</span>
                          <span className="font-mono">₹{user.balance.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                        </div>
                      )}
                    </div>

                    <Button
                      className="w-full font-bold bg-primary hover:bg-primary/90 text-primary-foreground"
                      disabled={strategySubmitting || !tradingEnabled || isKillSwitchActive || strategyLegsWithPrices.length === 0}
                      onClick={handleExecuteStrategy}
                    >
                      {strategySubmitting ? "Executing All Legs..." : `Execute Strategy (${strategyLegsWithPrices.length} Legs)`}
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
