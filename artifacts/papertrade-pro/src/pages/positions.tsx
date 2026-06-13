import React, { useState } from "react";
import { Layout } from "@/components/layout";
import { useGetPositions, useSquareOffPosition, getGetPositionsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PnLBadge } from "@/components/pnl-badge";
import { cn } from "@/lib/utils";
import { RefreshCw, X } from "lucide-react";

export default function Positions() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"open" | "closed">("open");

  const { data: positions, isLoading, refetch } = useGetPositions(
    {},
    { query: { queryKey: getGetPositionsQueryKey(), refetchInterval: 10000 } }
  );

  const squareOff = useSquareOffPosition();

  const handleSquareOff = async (id: number, symbol: string) => {
    try {
      await squareOff.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getGetPositionsQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({ title: "Position closed", description: `${symbol} position squared off successfully.` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Failed to square off", description: err.message });
    }
  };

  const openPositions = positions?.filter((p) => p.status === "open") ?? [];
  const closedPositions = positions?.filter((p) => p.status === "closed") ?? [];
  const filtered = tab === "open" ? openPositions : closedPositions;

  const totalUnrealized = openPositions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
  const totalRealized = closedPositions.reduce((sum, p) => sum + p.pnl, 0);

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Positions</h1>
            <p className="text-muted-foreground text-sm">
              {openPositions.length} open · {closedPositions.length} closed
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Unrealized P&L</p>
              <div className="mt-1"><PnLBadge amount={totalUnrealized} /></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Realized P&L</p>
              <div className="mt-1"><PnLBadge amount={totalRealized} /></div>
            </CardContent>
          </Card>
        </div>

        {/* Tab */}
        <div className="flex gap-2">
          <Button size="sm" variant={tab === "open" ? "default" : "outline"} onClick={() => setTab("open")}>
            Open ({openPositions.length})
          </Button>
          <Button size="sm" variant={tab === "closed" ? "default" : "outline"} onClick={() => setTab("closed")}>
            Closed ({closedPositions.length})
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">{Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-muted-foreground">No {tab} positions</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {tab === "open" ? "Go to Trade to place orders." : "Closed positions will appear here."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                      <th className="text-left px-4 py-3">Instrument</th>
                      <th className="text-right px-4 py-3">Qty</th>
                      <th className="text-right px-4 py-3">Avg Price</th>
                      <th className="text-right px-4 py-3">LTP</th>
                      <th className="text-right px-4 py-3">{tab === "open" ? "Unrealized P&L" : "Realized P&L"}</th>
                      {tab === "open" && <th className="text-right px-4 py-3">Action</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((pos) => (
                      <tr key={pos.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-semibold">{pos.symbol}</div>
                          <div className="text-xs text-muted-foreground">
                            {pos.strikePrice} <span className={cn("font-bold", pos.optionType === "CE" ? "text-green-500" : "text-red-400")}>{pos.optionType}</span>
                            {" · "}{pos.expiry}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono">{pos.quantity}</td>
                        <td className="px-4 py-3 text-right font-mono">₹{pos.averagePrice.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right font-mono">₹{pos.currentPrice.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right">
                          <PnLBadge amount={tab === "open" ? pos.unrealizedPnl : pos.pnl} />
                        </td>
                        {tab === "open" && (
                          <td className="px-4 py-3 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs border-red-500/50 text-red-400 hover:bg-red-500/10"
                              disabled={squareOff.isPending}
                              onClick={() => handleSquareOff(pos.id, `${pos.symbol} ${pos.strikePrice} ${pos.optionType}`)}
                            >
                              <X className="w-3 h-3 mr-1" /> Exit
                            </Button>
                          </td>
                        )}
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
