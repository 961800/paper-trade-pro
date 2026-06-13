import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import {
  useGetIndices,
  useGetOptionsChain,
  useGetExpiries,
  usePlaceOrder,
  getGetIndicesQueryKey,
  getGetOptionsChainQueryKey,
  getGetExpiriesQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ArrowUpIcon, ArrowDownIcon, TrendingUp, TrendingDown, AlertCircle } from "lucide-react";

function useSearchParam(key: string) {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(key) ?? "";
}

export default function Trade() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

  const { data: indices } = useGetIndices({
    query: { queryKey: getGetIndicesQueryKey(), refetchInterval: 10000 },
  });

  const { data: expiries } = useGetExpiries(
    { symbol },
    { query: { queryKey: getGetExpiriesQueryKey({ symbol }) } }
  );

  useEffect(() => {
    if (expiries && expiries.length > 0 && !selectedExpiry) setSelectedExpiry(expiries[0]);
  }, [expiries, selectedExpiry]);

  const { data: chain, isLoading: chainLoading } = useGetOptionsChain(
    { symbol, expiry: selectedExpiry || "2026-06-26" },
    {
      query: {
        queryKey: getGetOptionsChainQueryKey({ symbol, expiry: selectedExpiry || "2026-06-26" }),
        enabled: !!selectedExpiry,
        refetchInterval: 5000,
      },
    }
  );

  const placeOrderMutation = usePlaceOrder();

  const selectedIndex = indices?.find((i) => i.symbol === symbol);
  const atmStrike = chain ? Math.round(chain.underlyingPrice / 50) * 50 : 0;

  const selectedOption = chain?.options.find(
    (o) => o.strikePrice === selectedStrike && o.type === selectedType
  );

  const lotSize = selectedOption?.lotSize ?? 50;
  const ltp = selectedOption?.ltp ?? 0;
  const orderValue = ltp * lotSize * lots;
  const margin = orderValue;

  const strikes = chain
    ? Array.from(new Set(chain.options.map((o) => o.strikePrice))).sort((a, b) => a - b)
    : [];

  const handlePlaceOrder = async () => {
    if (!selectedStrike || !selectedExpiry) {
      toast({ variant: "destructive", title: "Select strike and expiry" });
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
          expiry: selectedExpiry,
        },
      });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/positions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({
        title: `${action.toUpperCase()} order placed!`,
        description: `${lots} lot(s) of ${symbol} ${selectedStrike} ${selectedType} @ ₹${ltp.toFixed(2)}`,
      });
      setLocation("/orders");
    } catch (err: any) {
      toast({ variant: "destructive", title: "Order failed", description: err.message });
    }
  };

  return (
    <Layout>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Trade Options</h1>
          <p className="text-muted-foreground text-sm">Select instrument · Set lots · Place order</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left: Symbol & Chain */}
          <div className="lg:col-span-2 space-y-4">
            {/* Symbol selector */}
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-wrap gap-2 mb-3">
                  {["NIFTY", "BANKNIFTY", "SENSEX", "FINNIFTY"].map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant={symbol === s ? "default" : "outline"}
                      onClick={() => { setSymbol(s); setSelectedStrike(null); setSelectedExpiry(""); }}
                    >
                      {s}
                    </Button>
                  ))}
                </div>
                {selectedIndex && (
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-bold font-mono">
                      ₹{selectedIndex.ltp.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                    </span>
                    <span className={cn("text-sm flex items-center gap-0.5", selectedIndex.change >= 0 ? "text-green-500" : "text-red-500")}>
                      {selectedIndex.change >= 0 ? <ArrowUpIcon className="w-4 h-4" /> : <ArrowDownIcon className="w-4 h-4" />}
                      {selectedIndex.change >= 0 ? "+" : ""}{selectedIndex.change.toFixed(2)} ({selectedIndex.changePercent.toFixed(2)}%)
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Expiry */}
            {expiries && expiries.length > 0 && (
              <div className="flex gap-2 flex-wrap items-center">
                <span className="text-sm text-muted-foreground">Expiry:</span>
                {expiries.slice(0, 5).map((exp) => (
                  <Button key={exp} size="sm" variant={selectedExpiry === exp ? "default" : "outline"} className="h-7 text-xs" onClick={() => setSelectedExpiry(exp)}>
                    {exp}
                  </Button>
                ))}
              </div>
            )}

            {/* CE / PE toggle */}
            <div className="flex gap-2">
              <Button
                variant={selectedType === "CE" ? "default" : "outline"}
                className={selectedType === "CE" ? "bg-green-600 hover:bg-green-700 text-white border-green-600" : ""}
                onClick={() => setSelectedType("CE")}
              >
                <TrendingUp className="w-4 h-4 mr-2" /> CALL (CE)
              </Button>
              <Button
                variant={selectedType === "PE" ? "default" : "outline"}
                className={selectedType === "PE" ? "bg-red-600 hover:bg-red-700 text-white border-red-600" : ""}
                onClick={() => setSelectedType("PE")}
              >
                <TrendingDown className="w-4 h-4 mr-2" /> PUT (PE)
              </Button>
            </div>

            {/* Strike selector */}
            <Card>
              <CardHeader className="py-2 px-4 border-b border-border">
                <CardTitle className="text-xs text-muted-foreground font-medium">Select Strike Price</CardTitle>
              </CardHeader>
              <CardContent className="p-0 max-h-72 overflow-y-auto">
                {chainLoading ? (
                  <div className="p-4 space-y-2">{Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-card border-b border-border">
                      <tr className="text-xs text-muted-foreground">
                        <th className="text-left px-4 py-2">Strike</th>
                        <th className="text-right px-4 py-2">LTP</th>
                        <th className="text-right px-4 py-2">IV%</th>
                        <th className="text-right px-4 py-2">Delta</th>
                        <th className="text-right px-4 py-2">OI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {strikes.map((strike) => {
                        const opt = chain?.options.find((o) => o.strikePrice === strike && o.type === selectedType);
                        const isAtm = strike === atmStrike;
                        const isSelected = selectedStrike === strike;
                        return (
                          <tr
                            key={strike}
                            onClick={() => setSelectedStrike(strike)}
                            className={cn(
                              "border-b border-border/40 cursor-pointer transition-colors",
                              isAtm && "bg-primary/5",
                              isSelected ? "bg-primary/20 border-primary" : "hover:bg-muted/30"
                            )}
                          >
                            <td className="px-4 py-2 font-mono font-semibold">
                              {isAtm && <span className="text-[9px] text-primary mr-1 border border-primary/40 px-1 rounded">ATM</span>}
                              {strike.toLocaleString("en-IN")}
                            </td>
                            <td className={cn("px-4 py-2 text-right font-mono font-bold", selectedType === "CE" ? "text-green-500" : "text-red-400")}>
                              ₹{opt?.ltp?.toFixed(2) ?? "-"}
                            </td>
                            <td className="px-4 py-2 text-right text-muted-foreground">{opt?.iv?.toFixed(1) ?? "-"}</td>
                            <td className="px-4 py-2 text-right text-muted-foreground">{opt?.delta?.toFixed(3) ?? "-"}</td>
                            <td className="px-4 py-2 text-right text-muted-foreground">{opt?.oi?.toLocaleString("en-IN") ?? "-"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right: Order Panel */}
          <div className="space-y-4">
            <Card className={cn("border-2", action === "buy" ? "border-green-500/40" : "border-red-500/40")}>
              <CardHeader className="py-3 px-4 border-b border-border">
                <CardTitle className="text-sm">Place Order</CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                {/* Selected Option Info */}
                {selectedOption ? (
                  <div className="bg-muted/30 rounded-lg p-3 space-y-1">
                    <p className="text-xs text-muted-foreground">Selected Instrument</p>
                    <p className="font-bold">{symbol} {selectedStrike} {selectedType}</p>
                    <p className="text-xs text-muted-foreground">{selectedExpiry} · Lot: {lotSize}</p>
                    <p className={cn("text-lg font-bold font-mono", selectedType === "CE" ? "text-green-500" : "text-red-400")}>
                      ₹{ltp.toFixed(2)}
                    </p>
                  </div>
                ) : (
                  <div className="bg-muted/30 rounded-lg p-3 flex items-center gap-2 text-muted-foreground text-sm">
                    <AlertCircle className="w-4 h-4" />
                    Select a strike price from the chain
                  </div>
                )}

                {/* BUY / SELL */}
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
                      placeholder={ltp.toFixed(2)}
                      className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                )}

                {/* Lots */}
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Lots</p>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => setLots(Math.max(1, lots - 1))} className="w-9 h-9 p-0">-</Button>
                    <span className="flex-1 text-center font-bold text-lg">{lots}</span>
                    <Button size="sm" variant="outline" onClick={() => setLots(lots + 1)} className="w-9 h-9 p-0">+</Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{lots * lotSize} qty ({lotSize} per lot)</p>
                </div>

                {/* Order Summary */}
                <div className="border border-border rounded-lg p-3 space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">LTP</span>
                    <span className="font-mono">₹{ltp.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Quantity</span>
                    <span className="font-mono">{lots * lotSize}</span>
                  </div>
                  <div className="flex justify-between font-semibold border-t border-border pt-1.5 mt-1.5">
                    <span>Order Value</span>
                    <span className="font-mono">₹{orderValue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                  </div>
                  {user && (
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Available Balance</span>
                      <span className="font-mono">₹{user.balance.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                    </div>
                  )}
                </div>

                <Button
                  className={cn("w-full font-bold", action === "buy" ? "bg-green-600 hover:bg-green-700 text-white" : "bg-red-600 hover:bg-red-700 text-white")}
                  disabled={!selectedStrike || placeOrderMutation.isPending}
                  onClick={handlePlaceOrder}
                >
                  {placeOrderMutation.isPending ? "Placing..." : `${action.toUpperCase()} ${lots} Lot${lots > 1 ? "s" : ""}`}
                </Button>
              </CardContent>
            </Card>

            {/* Quick Stats */}
            {selectedOption && (
              <Card>
                <CardContent className="p-4 space-y-2 text-sm">
                  <p className="text-xs text-muted-foreground font-semibold uppercase">Greeks & Data</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: "IV", value: selectedOption.iv ? `${selectedOption.iv.toFixed(1)}%` : "-" },
                      { label: "Delta", value: selectedOption.delta?.toFixed(3) ?? "-" },
                      { label: "Bid", value: `₹${selectedOption.bidPrice.toFixed(2)}` },
                      { label: "Ask", value: `₹${selectedOption.askPrice.toFixed(2)}` },
                      { label: "OI", value: selectedOption.oi.toLocaleString("en-IN") },
                      { label: "Volume", value: selectedOption.volume.toLocaleString("en-IN") },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="font-mono font-semibold">{value}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
