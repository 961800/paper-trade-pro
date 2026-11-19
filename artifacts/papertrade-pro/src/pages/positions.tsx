import React, { useState } from "react";
import { Layout } from "@/components/layout";
import { useGetPositions, useSquareOffPosition, getGetPositionsQueryKey, customFetch } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PnLBadge } from "@/components/pnl-badge";
import { cn } from "@/lib/utils";
import { RefreshCw, X, Target, ShieldAlert, Sliders } from "lucide-react";

export default function Positions() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"open" | "closed">("open");

  // Bracket modal state
  const [editingPos, setEditingPos] = useState<any | null>(null);
  const [modalSL, setModalSL] = useState("");
  const [modalTP, setModalTP] = useState("");
  const [modalTrail, setModalTrail] = useState("");
  const [bracketSaving, setBracketSaving] = useState(false);

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

  const openBracketModal = (pos: any) => {
    setEditingPos(pos);
    setModalSL(pos.stopLoss ? String(pos.stopLoss) : "");
    setModalTP(pos.targetPrice ? String(pos.targetPrice) : "");
    setModalTrail(pos.trailingStop ? String(pos.trailingStop) : "");
  };

  const handleSaveBracket = async () => {
    if (!editingPos) return;
    setBracketSaving(true);
    try {
      await customFetch(`/api/positions/${editingPos.id}/bracket`, {
        method: "PATCH",
        body: JSON.stringify({
          stopLoss: modalSL ? parseFloat(modalSL) : null,
          targetPrice: modalTP ? parseFloat(modalTP) : null,
          trailingStop: modalTrail ? parseFloat(modalTrail) : null,
        }),
      });

      queryClient.invalidateQueries({ queryKey: getGetPositionsQueryKey() });
      toast({ title: "Bracket orders updated", description: `Updated SL/TP on ${editingPos.symbol} ${editingPos.strikePrice} ${editingPos.optionType}.` });
      setEditingPos(null);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Update failed", description: err.message });
    } finally {
      setBracketSaving(false);
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
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Positions</h1>
            <p className="text-muted-foreground text-sm">
              {openPositions.length} active positions · Auto SL/TP execution enabled
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
                      {tab === "open" && <th className="text-right px-4 py-3">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((pos: any) => (
                      <tr key={pos.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-semibold">{pos.symbol}</div>
                          <div className="text-xs text-muted-foreground">
                            {pos.strikePrice} <span className={cn("font-bold", pos.optionType === "CE" ? "text-green-500" : "text-red-400")}>{pos.optionType}</span>
                            {" · "}{pos.expiry}
                          </div>
                          {/* SL / TP Badges */}
                          {tab === "open" && (pos.stopLoss || pos.targetPrice || pos.trailingStop) && (
                            <div className="flex gap-1.5 mt-1 flex-wrap">
                              {pos.stopLoss && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 font-mono">
                                  <ShieldAlert className="w-2.5 h-2.5" /> SL: ₹{pos.stopLoss}
                                </span>
                              )}
                              {pos.targetPrice && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-green-500/10 text-green-400 border border-green-500/20 font-mono">
                                  <Target className="w-2.5 h-2.5" /> TP: ₹{pos.targetPrice}
                                </span>
                              )}
                              {pos.trailingStop && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono">
                                  Trail: ₹{pos.trailingStop}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">{pos.quantity}</td>
                        <td className="px-4 py-3 text-right font-mono">₹{pos.averagePrice.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right font-mono">₹{pos.currentPrice.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right">
                          <PnLBadge amount={tab === "open" ? pos.unrealizedPnl : pos.pnl} />
                        </td>
                        {tab === "open" && (
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs border-primary/40 text-primary hover:bg-primary/10"
                                onClick={() => openBracketModal(pos)}
                              >
                                <Sliders className="w-3 h-3 mr-1" /> SL/TP
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs border-red-500/50 text-red-400 hover:bg-red-500/10"
                                disabled={squareOff.isPending}
                                onClick={() => handleSquareOff(pos.id, `${pos.symbol} ${pos.strikePrice} ${pos.optionType}`)}
                              >
                                <X className="w-3 h-3 mr-1" /> Exit
                              </Button>
                            </div>
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

        {/* Dialog to Edit Bracket Orders (SL & TP) */}
        <Dialog open={!!editingPos} onOpenChange={(open) => !open && setEditingPos(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base font-semibold flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" />
                Configure Bracket (SL & Target)
              </DialogTitle>
            </DialogHeader>

            {editingPos && (
              <div className="space-y-4 py-2 text-xs">
                <div className="bg-muted/40 p-3 rounded-lg flex justify-between items-center">
                  <div>
                    <p className="font-bold text-sm">{editingPos.symbol} {editingPos.strikePrice} {editingPos.optionType}</p>
                    <p className="text-muted-foreground">{editingPos.expiry} · Qty: {editingPos.quantity}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-muted-foreground">Current LTP</p>
                    <p className="font-bold font-mono text-sm">₹{editingPos.currentPrice.toFixed(2)}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="font-semibold block mb-1 text-red-400">Stop-Loss Trigger Price (₹)</label>
                    <input
                      type="number"
                      value={modalSL}
                      onChange={(e) => setModalSL(e.target.value)}
                      placeholder="e.g. 45.00 (leave blank to disable)"
                      className="w-full px-3 py-1.5 rounded border border-border bg-background font-mono text-sm"
                    />
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Auto-exits when price drops to or below this level.
                    </p>
                  </div>

                  <div>
                    <label className="font-semibold block mb-1 text-green-400">Profit Target Price (₹)</label>
                    <input
                      type="number"
                      value={modalTP}
                      onChange={(e) => setModalTP(e.target.value)}
                      placeholder="e.g. 95.00 (leave blank to disable)"
                      className="w-full px-3 py-1.5 rounded border border-border bg-background font-mono text-sm"
                    />
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Auto-exits when price rises to or above this level.
                    </p>
                  </div>

                  <div>
                    <label className="font-semibold block mb-1 text-blue-400">Trailing Stop-Loss (₹, Optional)</label>
                    <input
                      type="number"
                      value={modalTrail}
                      onChange={(e) => setModalTrail(e.target.value)}
                      placeholder="e.g. 5.00"
                      className="w-full px-3 py-1.5 rounded border border-border bg-background font-mono text-sm"
                    />
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Automatically raises your SL upward as the market price climbs.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <DialogFooter className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setEditingPos(null)}>Cancel</Button>
              <Button size="sm" disabled={bracketSaving} onClick={handleSaveBracket}>
                {bracketSaving ? "Saving..." : "Save Bracket Orders"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
