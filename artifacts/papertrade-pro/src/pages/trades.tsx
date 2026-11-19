import React, { useState } from "react";
import { Layout } from "@/components/layout";
import { useGetTrades, getGetTradesQueryKey, customFetch } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PnLBadge } from "@/components/pnl-badge";
import { cn } from "@/lib/utils";
import { 
  RefreshCw, 
  BookOpen, 
  Star, 
  Smile, 
  Zap, 
  Flame, 
  Coins, 
  Frown, 
  CheckCircle2, 
  Tag, 
  MessageSquare 
} from "lucide-react";

const STRATEGY_OPTIONS = [
  "Breakout",
  "Pullback / Reversal",
  "Momentum / Scalp",
  "Support & Resistance",
  "Expiry Hero/Zero",
  "Straddle / Strangle",
  "Option Selling (Theta)",
  "Hedging",
  "Discretionary",
];

const EMOTION_OPTIONS = [
  { id: "Disciplined", label: "Disciplined", icon: "🧘", desc: "Followed trading plan & rules" },
  { id: "FOMO", label: "FOMO", icon: "⚡", desc: "Fear of missing out, chased price" },
  { id: "Revenge", label: "Revenge", icon: "🔥", desc: "Trading out of anger or chasing losses" },
  { id: "Greed", label: "Greed", icon: "💰", desc: "Held too long, ignored profit target" },
  { id: "Fear", label: "Fear", icon: "😨", desc: "Panicked, exited trade prematurely" },
];

export default function Trades() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "open" | "closed">("all");

  // Journal modal state
  const [journalTrade, setJournalTrade] = useState<any | null>(null);
  const [journalNotes, setJournalNotes] = useState("");
  const [journalStrategy, setJournalStrategy] = useState("");
  const [journalEmotion, setJournalEmotion] = useState("");
  const [journalRating, setJournalRating] = useState(3);
  const [journalSaving, setJournalSaving] = useState(false);

  const { data: rawTrades, isLoading, refetch } = useGetTrades(
    {},
    { query: { queryKey: getGetTradesQueryKey() } }
  );

  const trades = (rawTrades as any[]) ?? [];

  const filtered = trades.filter((t) => {
    if (filter === "all") return true;
    return t.status === filter;
  });

  const totalPnl = filtered.filter((t) => t.pnl != null).reduce((s, t) => s + (t.pnl ?? 0), 0);

  // Journal Stats Calculations
  const journaledTrades = trades.filter((t) => t.notes || t.emotion || t.strategy);
  const disciplinedTrades = trades.filter((t) => t.emotion === "Disciplined");
  const disciplinedWins = disciplinedTrades.filter((t) => (t.pnl ?? 0) > 0);
  const disciplinedWinRate = disciplinedTrades.length > 0
    ? Math.round((disciplinedWins.length / disciplinedTrades.length) * 100)
    : 0;

  const openJournal = (trade: any) => {
    setJournalTrade(trade);
    setJournalNotes(trade.notes ?? "");
    setJournalStrategy(trade.strategy ?? STRATEGY_OPTIONS[0]);
    setJournalEmotion(trade.emotion ?? "Disciplined");
    setJournalRating(trade.rating ?? 4);
  };

  const handleSaveJournal = async () => {
    if (!journalTrade) return;
    setJournalSaving(true);
    try {
      await customFetch(`/api/trades/${journalTrade.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          notes: journalNotes,
          strategy: journalStrategy,
          emotion: journalEmotion,
          rating: journalRating,
        }),
      });

      queryClient.invalidateQueries({ queryKey: getGetTradesQueryKey() });
      toast({ title: "Journal Entry Saved", description: "Reflection and discipline tags recorded." });
      setJournalTrade(null);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Failed to save journal", description: err.message });
    } finally {
      setJournalSaving(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Trade History & Journal</h1>
            <p className="text-muted-foreground text-sm">
              Review executed trades · Record psychological reflections & strategies
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
        </div>

        {/* Discipline & Journal Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card className="bg-card/60">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Journaled Trades</p>
                <p className="text-xl font-bold font-mono mt-1">
                  {journaledTrades.length} <span className="text-xs font-normal text-muted-foreground">/ {trades.length}</span>
                </p>
              </div>
              <BookOpen className="w-6 h-6 text-primary/70" />
            </CardContent>
          </Card>

          <Card className="bg-card/60">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Disciplined Trades Win Rate</p>
                <p className="text-xl font-bold font-mono text-green-400 mt-1">
                  {disciplinedTrades.length > 0 ? `${disciplinedWinRate}%` : "—"}
                </p>
              </div>
              <span className="text-2xl">🧘</span>
            </CardContent>
          </Card>

          <Card className="bg-card/60">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Net Realized P&L</p>
                <div className="mt-1"><PnLBadge amount={totalPnl} /></div>
              </div>
              <span className="text-xs text-muted-foreground font-mono">{filtered.length} trades</span>
            </CardContent>
          </Card>
        </div>

        {/* Filter controls */}
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
              <span className="text-muted-foreground">Filtered Realized P&L:</span>
              <PnLBadge amount={totalPnl} />
            </div>
          )}
        </div>

        {/* Trades Table */}
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
                      <th className="text-left px-4 py-3">Discipline / Journal</th>
                      <th className="text-right px-4 py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((trade: any) => (
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
                          {trade.emotion || trade.strategy ? (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {trade.emotion && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal border-primary/30">
                                    {trade.emotion === "Disciplined" ? "🧘 Disciplined" : trade.emotion === "FOMO" ? "⚡ FOMO" : trade.emotion === "Revenge" ? "🔥 Revenge" : trade.emotion}
                                  </Badge>
                                )}
                                {trade.strategy && (
                                  <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">
                                    {trade.strategy}
                                  </span>
                                )}
                              </div>
                              {trade.notes && (
                                <p className="text-[11px] text-muted-foreground line-clamp-1 italic">
                                  "{trade.notes}"
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">No reflections yet</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1 border-primary/30 text-primary hover:bg-primary/10"
                            onClick={() => openJournal(trade)}
                          >
                            <BookOpen className="w-3 h-3" />
                            {trade.notes || trade.emotion ? "Edit" : "Journal"}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Trade Reflection & Journal Modal */}
        <Dialog open={!!journalTrade} onOpenChange={(open) => !open && setJournalTrade(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-base font-semibold flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-primary" />
                Trade Reflection & Journal
              </DialogTitle>
            </DialogHeader>

            {journalTrade && (
              <div className="space-y-4 py-2 text-xs">
                {/* Trade summary banner */}
                <div className="bg-muted/40 p-3 rounded-lg flex justify-between items-center">
                  <div>
                    <p className="font-bold text-sm">
                      {journalTrade.symbol} {journalTrade.strikePrice} {journalTrade.optionType}
                    </p>
                    <p className="text-muted-foreground font-mono">
                      {journalTrade.action.toUpperCase()} {journalTrade.quantity} @ ₹{journalTrade.entryPrice.toFixed(2)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-muted-foreground text-[11px]">P&L</p>
                    {journalTrade.pnl != null ? <PnLBadge amount={journalTrade.pnl} /> : <span className="font-mono">Open</span>}
                  </div>
                </div>

                {/* Strategy Tag Selector */}
                <div>
                  <label className="font-semibold block mb-1">Strategy Setup</label>
                  <select
                    value={journalStrategy}
                    onChange={(e) => setJournalStrategy(e.target.value)}
                    className="w-full px-3 py-1.5 rounded border border-border bg-background text-xs focus:ring-1 focus:ring-primary"
                  >
                    {STRATEGY_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>

                {/* Emotion / Discipline Selector */}
                <div>
                  <label className="font-semibold block mb-1.5">Discipline & Psychological State</label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {EMOTION_OPTIONS.map((emo) => (
                      <button
                        key={emo.id}
                        type="button"
                        onClick={() => setJournalEmotion(emo.id)}
                        className={cn(
                          "p-2 rounded-lg border text-left transition-all",
                          journalEmotion === emo.id
                            ? "border-primary bg-primary/10 ring-1 ring-primary/40 font-semibold text-foreground"
                            : "border-border bg-card/60 hover:bg-muted/30 text-muted-foreground"
                        )}
                      >
                        <div className="flex items-center gap-1.5">
                          <span>{emo.icon}</span>
                          <span className="text-xs">{emo.label}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{emo.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Rating 1 to 5 Stars */}
                <div>
                  <label className="font-semibold block mb-1">Execution Quality (1–5 Stars)</label>
                  <div className="flex gap-1.5 items-center">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setJournalRating(star)}
                        className={cn(
                          "p-1.5 rounded hover:bg-muted/50 transition-colors",
                          star <= journalRating ? "text-amber-400" : "text-muted-foreground/40"
                        )}
                      >
                        <Star className="w-5 h-5 fill-current" />
                      </button>
                    ))}
                    <span className="text-xs text-muted-foreground ml-2 font-mono">{journalRating} / 5</span>
                  </div>
                </div>

                {/* Reflection Notes Textarea */}
                <div>
                  <label className="font-semibold block mb-1">Trade Notes & Lessons Learned</label>
                  <textarea
                    rows={3}
                    value={journalNotes}
                    onChange={(e) => setJournalNotes(e.target.value)}
                    placeholder="Why did you take this trade? Did you respect your stop-loss? What will you do differently next time?"
                    className="w-full px-3 py-2 rounded border border-border bg-background text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
              </div>
            )}

            <DialogFooter className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setJournalTrade(null)}>Cancel</Button>
              <Button size="sm" disabled={journalSaving} onClick={handleSaveJournal}>
                {journalSaving ? "Saving..." : "Save Journal Entry"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
