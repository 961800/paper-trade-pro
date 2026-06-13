import React, { useState } from "react";
import { Layout } from "@/components/layout";
import { useGetTrades, getGetTradesQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PnLBadge } from "@/components/pnl-badge";
import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";

export default function Trades() {
  const [filter, setFilter] = useState<"all" | "open" | "closed">("all");

  const { data: trades, isLoading, refetch } = useGetTrades(
    {},
    { query: { queryKey: getGetTradesQueryKey() } }
  );

  const filtered = trades?.filter((t) => {
    if (filter === "all") return true;
    return t.status === filter;
  }) ?? [];

  const totalPnl = filtered.filter((t) => t.pnl != null).reduce((s, t) => s + (t.pnl ?? 0), 0);

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Trade History</h1>
            <p className="text-muted-foreground text-sm">{trades?.length ?? 0} total trades</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex gap-2">
            {(["all", "open", "closed"] as const).map((f) => (
              <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} className="capitalize h-7 text-xs" onClick={() => setFilter(f)}>
                {f}
              </Button>
            ))}
          </div>
          {filter === "closed" && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Realized P&L:</span>
              <PnLBadge amount={totalPnl} />
            </div>
          )}
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">{Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-muted-foreground">No trades found</p>
                <p className="text-xs text-muted-foreground mt-1">Trades appear here once orders are executed.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                      <th className="text-left px-4 py-3">Instrument</th>
                      <th className="text-left px-4 py-3">Action</th>
                      <th className="text-right px-4 py-3">Qty</th>
                      <th className="text-right px-4 py-3">Entry</th>
                      <th className="text-right px-4 py-3">Exit</th>
                      <th className="text-right px-4 py-3">P&L</th>
                      <th className="text-left px-4 py-3">Status</th>
                      <th className="text-left px-4 py-3">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((trade) => (
                      <tr key={trade.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-semibold">{trade.symbol}</div>
                          <div className="text-xs text-muted-foreground">
                            {trade.strikePrice}{" "}
                            <span className={cn("font-bold", trade.optionType === "CE" ? "text-green-500" : "text-red-400")}>
                              {trade.optionType}
                            </span>
                            {trade.expiry && ` · ${trade.expiry}`}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn("text-xs font-bold uppercase px-2 py-0.5 rounded-full", trade.action === "buy" ? "bg-blue-500/10 text-blue-400" : "bg-orange-500/10 text-orange-400")}>
                            {trade.action}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono">{trade.quantity}</td>
                        <td className="px-4 py-3 text-right font-mono">₹{trade.entryPrice.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right font-mono">
                          {trade.exitPrice ? `₹${trade.exitPrice.toFixed(2)}` : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {trade.pnl != null ? <PnLBadge amount={trade.pnl} /> : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn("text-xs px-2 py-0.5 rounded-full border", trade.status === "open" ? "border-blue-500/30 text-blue-400 bg-blue-500/10" : "border-muted text-muted-foreground bg-muted/30")}>
                            {trade.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {new Date(trade.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </td>
                      </tr>
                    ))}
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
