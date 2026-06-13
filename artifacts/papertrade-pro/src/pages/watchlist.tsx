import React, { useState } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import {
  useGetWatchlist,
  useAddToWatchlist,
  useRemoveFromWatchlist,
  useGetIndices,
  getGetWatchlistQueryKey,
  getGetIndicesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Plus, Trash2, ArrowUpIcon, ArrowDownIcon, ArrowRight } from "lucide-react";

const QUICK_ADD = [
  { symbol: "NIFTY", name: "NIFTY 50", type: "INDEX" },
  { symbol: "BANKNIFTY", name: "BANK NIFTY", type: "INDEX" },
  { symbol: "SENSEX", name: "SENSEX", type: "INDEX" },
  { symbol: "FINNIFTY", name: "FINNIFTY", type: "INDEX" },
];

export default function Watchlist() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: watchlist, isLoading } = useGetWatchlist({
    query: { queryKey: getGetWatchlistQueryKey() },
  });

  const { data: indices } = useGetIndices({
    query: { queryKey: getGetIndicesQueryKey(), refetchInterval: 10000 },
  });

  const addMutation = useAddToWatchlist();
  const removeMutation = useRemoveFromWatchlist();

  const handleAdd = async (symbol: string, name: string, type: string) => {
    try {
      await addMutation.mutateAsync({ data: { symbol, name, type } });
      queryClient.invalidateQueries({ queryKey: getGetWatchlistQueryKey() });
      toast({ title: `${symbol} added to watchlist` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Failed to add", description: err.message });
    }
  };

  const handleRemove = async (id: number, symbol: string) => {
    try {
      await removeMutation.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getGetWatchlistQueryKey() });
      toast({ title: `${symbol} removed from watchlist` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Failed to remove", description: err.message });
    }
  };

  const watchedSymbols = new Set(watchlist?.map((w) => w.symbol) ?? []);

  return (
    <Layout>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Watchlist</h1>
          <p className="text-muted-foreground text-sm">Track your favourite instruments</p>
        </div>

        {/* Quick Add */}
        <Card>
          <CardHeader className="py-3 px-4 border-b border-border">
            <CardTitle className="text-sm">Quick Add</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-2">
              {QUICK_ADD.map(({ symbol, name, type }) => (
                <Button
                  key={symbol}
                  size="sm"
                  variant={watchedSymbols.has(symbol) ? "secondary" : "outline"}
                  disabled={watchedSymbols.has(symbol) || addMutation.isPending}
                  onClick={() => handleAdd(symbol, name, type)}
                  className="h-8 text-xs"
                >
                  {watchedSymbols.has(symbol) ? "✓ " : <Plus className="w-3 h-3 mr-1" />}
                  {symbol}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Watchlist with live quotes */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">{Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
            ) : !watchlist || watchlist.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-muted-foreground">Your watchlist is empty</p>
                <p className="text-xs text-muted-foreground mt-1">Add instruments using the Quick Add above.</p>
              </div>
            ) : (
              <div>
                {watchlist.map((item) => {
                  const quote = indices?.find((idx) => idx.symbol === item.symbol);
                  return (
                    <div key={item.id} className="flex items-center justify-between px-4 py-3 border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{item.symbol}</span>
                          <span className="text-xs text-muted-foreground">{item.name}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{item.type}</span>
                        </div>
                        {quote && (
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="font-mono font-bold">₹{quote.ltp.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
                            <span className={cn("text-xs flex items-center gap-0.5", quote.change >= 0 ? "text-green-500" : "text-red-500")}>
                              {quote.change >= 0 ? <ArrowUpIcon className="w-3 h-3" /> : <ArrowDownIcon className="w-3 h-3" />}
                              {quote.change >= 0 ? "+" : ""}{quote.change.toFixed(2)} ({quote.changePercent.toFixed(2)}%)
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => setLocation(`/trade?symbol=${item.symbol}`)}
                        >
                          Trade <ArrowRight className="w-3 h-3 ml-1" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400"
                          disabled={removeMutation.isPending}
                          onClick={() => handleRemove(item.id, item.symbol)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
