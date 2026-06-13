import React from "react";
import { Layout } from "@/components/layout";
import { useGetAnalyticsSummary, useGetMonthlyAnalytics, getGetAnalyticsSummaryQueryKey, getGetMonthlyAnalyticsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PnLBadge } from "@/components/pnl-badge";
import { cn } from "@/lib/utils";
import { BarChart2, Target, Activity, TrendingUp, TrendingDown } from "lucide-react";

export default function Analytics() {
  const { data: summary, isLoading: summaryLoading } = useGetAnalyticsSummary({
    query: { queryKey: getGetAnalyticsSummaryQueryKey() },
  });

  const { data: monthly, isLoading: monthlyLoading } = useGetMonthlyAnalytics({
    query: { queryKey: getGetMonthlyAnalyticsQueryKey() },
  });

  const maxPnl = monthly ? Math.max(...monthly.map((m) => Math.abs(m.pnl)), 1) : 1;

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <BarChart2 className="w-6 h-6" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
            <p className="text-muted-foreground text-sm">Deep dive into your trading performance</p>
          </div>
        </div>

        {/* Summary Stats */}
        {summaryLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array(8).fill(0).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : summary ? (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: "Total Trades", value: summary.totalTrades, icon: <Activity className="w-4 h-4" /> },
                { label: "Win Rate", value: `${summary.winRate.toFixed(1)}%`, icon: <Target className="w-4 h-4" /> },
                { label: "Profit Days", value: summary.profitDays, icon: <TrendingUp className="w-4 h-4 text-green-500" /> },
                { label: "Loss Days", value: summary.lossDays, icon: <TrendingDown className="w-4 h-4 text-red-400" /> },
              ].map(({ label, value, icon }) => (
                <Card key={label}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      {icon}
                    </div>
                    <p className="text-2xl font-bold mt-1">{value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: "Total P&L", value: <PnLBadge amount={summary.totalPnl} /> },
                { label: "Avg P&L/Trade", value: <PnLBadge amount={summary.avgPnlPerTrade} /> },
                { label: "Best Trade", value: <PnLBadge amount={summary.bestTrade} /> },
                { label: "Worst Trade", value: <PnLBadge amount={summary.worstTrade} /> },
              ].map(({ label, value }) => (
                <Card key={label}>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground mb-1">{label}</p>
                    {value}
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Extra Stats */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Current Streak", value: `${summary.currentStreak} trades` },
                { label: "Win Rate", value: `${summary.winRate.toFixed(1)}%` },
              ].map(({ label, value }) => (
                <Card key={label}>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground mb-1">{label}</p>
                    <p className="text-xl font-bold">{value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        ) : null}

        {/* Monthly Chart */}
        <Card>
          <CardHeader className="py-3 px-4 border-b border-border">
            <CardTitle className="text-sm">Monthly P&L</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            {monthlyLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : !monthly || monthly.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">No monthly data yet. Start trading to build your history.</p>
            ) : (
              <div className="flex items-end gap-2 h-40">
                {monthly.map((m) => {
                  const height = Math.max(4, Math.abs(m.pnl) / maxPnl * 100);
                  const isPositive = m.pnl >= 0;
                  return (
                    <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-xs text-muted-foreground font-mono">{m.pnl >= 0 ? "+" : ""}{(m.pnl / 1000).toFixed(1)}k</span>
                      <div
                        className={cn("w-full rounded-t", isPositive ? "bg-green-500/70" : "bg-red-500/70")}
                        style={{ height: `${height}%` }}
                      />
                      <span className="text-[10px] text-muted-foreground">{m.month}</span>
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
