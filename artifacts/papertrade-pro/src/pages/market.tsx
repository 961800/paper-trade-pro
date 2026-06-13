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
import { cn } from "@/lib/utils";
import { ArrowUpIcon, ArrowDownIcon, RefreshCw } from "lucide-react";

export default function Market() {
  const [, setLocation] = useLocation();
  const [selectedSymbol, setSelectedSymbol] = useState("NIFTY");
  const [selectedExpiry, setSelectedExpiry] = useState("");

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

  const { data: chain, isLoading: chainLoading, refetch: refetchChain } = useGetOptionsChain(
    { symbol: selectedSymbol, expiry: selectedExpiry || "2026-06-26" },
    {
      query: {
        queryKey: getGetOptionsChainQueryKey({ symbol: selectedSymbol, expiry: selectedExpiry || "2026-06-26" }),
        enabled: !!selectedExpiry,
        refetchInterval: 10000,
      },
    }
  );

  const atmStrike = chain ? Math.round(chain.underlyingPrice / 50) * 50 : 0;
  const strikes = chain
    ? Array.from(new Set(chain.options.map((o) => o.strikePrice))).sort((a, b) => a - b)
    : [];

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Market & Options Chain</h1>
            <p className="text-muted-foreground text-sm">Live index data · Click any LTP to trade</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => { refetchIndices(); refetchChain(); }}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {indicesLoading
            ? Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
            : indices?.map((idx) => (
                <Card
                  key={idx.symbol}
                  onClick={() => setSelectedSymbol(idx.symbol)}
                  className={cn(
                    "cursor-pointer transition-all hover:border-primary/60",
                    selectedSymbol === idx.symbol && "border-primary bg-primary/5"
                  )}
                >
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground font-medium">{idx.name}</p>
                    <p className="text-xl font-bold font-mono mt-1">
                      {idx.ltp.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                    </p>
                    <p className={cn("text-xs font-mono mt-1 flex items-center gap-0.5", idx.change >= 0 ? "text-green-500" : "text-red-500")}>
                      {idx.change >= 0 ? <ArrowUpIcon className="w-3 h-3" /> : <ArrowDownIcon className="w-3 h-3" />}
                      {idx.change >= 0 ? "+" : ""}{idx.change.toFixed(2)} ({idx.changePercent.toFixed(2)}%)
                    </p>
                  </CardContent>
                </Card>
              ))}
        </div>

        {expiries && expiries.length > 0 && (
          <div className="flex gap-2 flex-wrap items-center">
            <span className="text-sm text-muted-foreground">Expiry:</span>
            {expiries.slice(0, 6).map((exp) => (
              <Button key={exp} size="sm" variant={selectedExpiry === exp ? "default" : "outline"} className="h-7 text-xs" onClick={() => setSelectedExpiry(exp)}>
                {exp}
              </Button>
            ))}
          </div>
        )}

        <Card>
          <CardHeader className="py-3 px-4 border-b border-border">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">
                {selectedSymbol} Options Chain
                {chain && (
                  <span className="ml-2 text-muted-foreground font-normal text-xs">
                    Spot: ₹{chain.underlyingPrice.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                  </span>
                )}
              </CardTitle>
              <Badge variant="outline" className="text-xs">{selectedExpiry || "Select expiry"}</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {chainLoading ? (
              <div className="p-6 space-y-2">{Array(8).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : !chain ? (
              <p className="text-center text-muted-foreground py-10 text-sm">Select an expiry to load the options chain</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-muted-foreground">
                      <th className="text-left px-3 py-2">OI</th>
                      <th className="text-right px-3 py-2">Volume</th>
                      <th className="text-right px-3 py-2">IV%</th>
                      <th className="text-right px-3 py-2 text-green-500 font-bold">CE LTP ▼</th>
                      <th className="text-center px-4 py-2 font-bold text-foreground">STRIKE</th>
                      <th className="text-left px-3 py-2 text-red-400 font-bold">PE LTP ▼</th>
                      <th className="text-left px-3 py-2">IV%</th>
                      <th className="text-left px-3 py-2">Volume</th>
                      <th className="text-left px-3 py-2">OI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {strikes.map((strike) => {
                      const ce = chain.options.find((o) => o.strikePrice === strike && o.type === "CE");
                      const pe = chain.options.find((o) => o.strikePrice === strike && o.type === "PE");
                      const isAtm = strike === atmStrike;
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
                          <td className={cn("px-4 py-2 text-center font-bold", isAtm ? "text-primary" : "text-foreground")}>
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
