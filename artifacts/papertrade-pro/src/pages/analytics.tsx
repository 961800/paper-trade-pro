import React, { useState } from "react";
import { Layout } from "@/components/layout";
import {
  useGetAnalyticsSummary,
  useGetMonthlyAnalytics,
  useGetExtendedStats,
  useGetHeatmap,
  getGetAnalyticsSummaryQueryKey,
  getGetMonthlyAnalyticsQueryKey,
  getGetExtendedStatsQueryKey,
  getGetHeatmapQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PnLBadge } from "@/components/pnl-badge";
import { TradingHeatmap } from "@/components/trading-heatmap";
import { cn } from "@/lib/utils";
import {
  BarChart2, Target, Activity, TrendingUp, TrendingDown,
  Flame, Shield, Zap, DollarSign, Calendar, ChevronLeft, ChevronRight,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

interface DayDetail {
  date: string;
  pnl: number;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  bestTrade: number;
  worstTrade: number;
  status: string;
}

function StatCard({ label, value, icon, className }: { label: string; value: React.ReactNode; icon?: React.ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-muted-foreground">{label}</p>
          {icon && <span className="text-muted-foreground">{icon}</span>}
        </div>
        <div className="text-xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

const PIE_COLORS = ["#22c55e", "#ef4444"];

export default function Analytics() {
  const [heatmapYear, setHeatmapYear] = useState(new Date().getFullYear());
  const [selectedDay, setSelectedDay] = useState<DayDetail | null>(null);

  const { data: summary, isLoading: summaryLoading } = useGetAnalyticsSummary({
    query: { queryKey: getGetAnalyticsSummaryQueryKey() },
  });

  const { data: monthly, isLoading: monthlyLoading } = useGetMonthlyAnalytics({
    query: { queryKey: getGetMonthlyAnalyticsQueryKey() },
  });

  const { data: extStats, isLoading: extLoading } = useGetExtendedStats({
    query: { queryKey: getGetExtendedStatsQueryKey() },
  });

  const { data: heatmapData, isLoading: heatmapLoading } = useGetHeatmap(
    { year: heatmapYear },
    { query: { queryKey: getGetHeatmapQueryKey({ year: heatmapYear }) } }
  );

  const formatK = (v: number) => {
    if (Math.abs(v) >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
    if (Math.abs(v) >= 1000) return `₹${(v / 1000).toFixed(1)}k`;
    return `₹${v.toFixed(0)}`;
  };

  const pieData = extStats ? [
    { name: "Wins", value: Math.round(extStats.winRate) },
    { name: "Losses", value: Math.round(100 - extStats.winRate) },
  ] : [];

  const cumulativeChartData = extStats?.cumulativePnl.slice(-50) ?? [];

  return (
    <Layout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <BarChart2 className="w-6 h-6" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
            <p className="text-muted-foreground text-sm">Full trading performance breakdown</p>
          </div>
        </div>

        {/* ============== TOP STATS ROW ============== */}
        {summaryLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array(8).fill(0).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        ) : summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total Trades" value={summary.totalTrades} icon={<Activity className="w-4 h-4" />} />
            <StatCard label="Win Rate" value={`${summary.winRate.toFixed(1)}%`} icon={<Target className="w-4 h-4" />} />
            <StatCard label="Profit Days" value={summary.profitDays} icon={<TrendingUp className="w-4 h-4 text-green-500" />} />
            <StatCard label="Loss Days" value={summary.lossDays} icon={<TrendingDown className="w-4 h-4 text-red-400" />} />
            <StatCard label="Total P&L" value={<PnLBadge amount={summary.totalPnl} />} icon={<DollarSign className="w-4 h-4" />} />
            <StatCard label="Avg P&L / Trade" value={<PnLBadge amount={summary.avgPnlPerTrade} />} />
            <StatCard label="Best Trade" value={<PnLBadge amount={summary.bestTrade} />} icon={<Zap className="w-4 h-4 text-green-500" />} />
            <StatCard label="Worst Trade" value={<PnLBadge amount={summary.worstTrade} />} icon={<Shield className="w-4 h-4 text-red-400" />} />
          </div>
        )}

        {/* ============== EXTENDED STATS ============== */}
        {extLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array(8).fill(0).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        ) : extStats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label="Profit Factor"
              value={<span className={extStats.profitFactor >= 1 ? "text-green-500" : "text-red-400"}>{extStats.profitFactor === 999 ? "∞" : extStats.profitFactor.toFixed(2)}</span>}
              icon={<Flame className="w-4 h-4 text-orange-400" />}
            />
            <StatCard
              label="Max Drawdown"
              value={<span className="text-red-400">-₹{extStats.maxDrawdown.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>}
              icon={<TrendingDown className="w-4 h-4 text-red-400" />}
            />
            <StatCard label="Max Consec. Wins" value={<span className="text-green-500">{extStats.maxConsecutiveWins}</span>} icon={<Zap className="w-4 h-4 text-green-500" />} />
            <StatCard label="Max Consec. Losses" value={<span className="text-red-400">{extStats.maxConsecutiveLosses}</span>} icon={<TrendingDown className="w-4 h-4 text-red-400" />} />
            <StatCard label="Avg Profit" value={<PnLBadge amount={extStats.avgProfit} />} />
            <StatCard label="Avg Loss" value={<PnLBadge amount={extStats.avgLoss} />} />
            <StatCard label="Total Gross Profit" value={<PnLBadge amount={extStats.totalProfit} />} />
            <StatCard label="Total Gross Loss" value={<PnLBadge amount={extStats.totalLoss} />} />
            <StatCard
              label="ROI"
              value={<span className={extStats.roi >= 0 ? "text-green-500" : "text-red-400"}>{extStats.roi >= 0 ? "+" : ""}{extStats.roi.toFixed(2)}%</span>}
              icon={<TrendingUp className="w-4 h-4" />}
            />
            <StatCard label="Current Streak" value={summary ? <span className={summary.currentStreak >= 0 ? "text-green-500" : "text-red-400"}>{summary.currentStreak > 0 ? "+" : ""}{summary.currentStreak} trades</span> : "-"} />
          </div>
        )}

        {/* ============== HEATMAP ============== */}
        <Card>
          <CardHeader className="py-3 px-4 border-b border-border">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Calendar className="w-4 h-4" /> Trading Performance Heatmap
              </CardTitle>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setHeatmapYear(y => y - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm font-semibold w-12 text-center">{heatmapYear}</span>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={heatmapYear >= new Date().getFullYear()} onClick={() => setHeatmapYear(y => y + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 overflow-x-auto">
            {heatmapLoading ? (
              <Skeleton className="h-28 w-full" />
            ) : heatmapData ? (
              <TradingHeatmap data={heatmapData} year={heatmapYear} onDayClick={(d) => setSelectedDay(d)} />
            ) : (
              <p className="text-center text-muted-foreground py-8 text-sm">No heatmap data available.</p>
            )}
          </CardContent>
        </Card>

        {/* Selected Day Detail */}
        {selectedDay && (selectedDay.status === "profit" || selectedDay.status === "loss") && (
          <Card className={cn("border", selectedDay.pnl >= 0 ? "border-green-500/40 bg-green-500/5" : "border-red-500/40 bg-red-500/5")}>
            <CardHeader className="py-3 px-4 border-b border-border">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">
                  {new Date(selectedDay.date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </CardTitle>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelectedDay(null)}>✕ Close</Button>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 text-sm">
                {[
                  { label: "Net P&L", value: <PnLBadge amount={selectedDay.pnl} /> },
                  { label: "Trades", value: selectedDay.trades },
                  { label: "Win Rate", value: `${selectedDay.winRate.toFixed(0)}%` },
                  { label: "W / L", value: <span><span className="text-green-500">{selectedDay.wins}W</span> / <span className="text-red-400">{selectedDay.losses}L</span></span> },
                  { label: "Best Trade", value: selectedDay.bestTrade > 0 ? <PnLBadge amount={selectedDay.bestTrade} /> : "—" },
                  { label: "Worst Trade", value: selectedDay.worstTrade < 0 ? <PnLBadge amount={selectedDay.worstTrade} /> : "—" },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <div className="font-bold mt-0.5">{value}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ============== CHARTS ROW ============== */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Cumulative P&L Curve */}
          <Card className="lg:col-span-2">
            <CardHeader className="py-3 px-4 border-b border-border">
              <CardTitle className="text-sm">Cumulative P&L Curve</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              {extLoading ? (
                <Skeleton className="h-48 w-full" />
              ) : cumulativeChartData.length === 0 ? (
                <p className="text-center text-muted-foreground py-12 text-sm">No trade history yet. Complete trades to see your P&L curve.</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={cumulativeChartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={extStats && extStats.totalPnl >= 0 ? "#22c55e" : "#ef4444"} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={extStats && extStats.totalPnl >= 0 ? "#22c55e" : "#ef4444"} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickFormatter={(v) => v.slice(5)} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickFormatter={formatK} width={50} />
                    <Tooltip
                      contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ fontWeight: 600 }}
                      formatter={(v: number) => [`₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`, "Cumulative P&L"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="cumulative"
                      stroke={extStats && extStats.totalPnl >= 0 ? "#22c55e" : "#ef4444"}
                      strokeWidth={2}
                      fill="url(#pnlGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Win/Loss Pie */}
          <Card>
            <CardHeader className="py-3 px-4 border-b border-border">
              <CardTitle className="text-sm">Win / Loss Ratio</CardTitle>
            </CardHeader>
            <CardContent className="p-4 flex items-center justify-center">
              {extLoading ? (
                <Skeleton className="h-48 w-48 rounded-full" />
              ) : pieData.length === 0 || (pieData[0].value === 0 && pieData[1].value === 0) ? (
                <p className="text-center text-muted-foreground text-sm py-12">No trades yet</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                      {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                      formatter={(v: number) => [`${v}%`]}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ============== MONTHLY P&L BAR CHART ============== */}
        <Card>
          <CardHeader className="py-3 px-4 border-b border-border">
            <CardTitle className="text-sm">Monthly Performance</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            {monthlyLoading ? (
              <Skeleton className="h-52 w-full" />
            ) : !monthly || monthly.length === 0 ? (
              <p className="text-center text-muted-foreground py-12 text-sm">No monthly data yet. Start trading to build your history.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthly} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                  <YAxis tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickFormatter={formatK} width={52} />
                  <Tooltip
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number, _: string, props: any) => [
                      `${v >= 0 ? "+" : ""}₹${Math.abs(v).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`,
                      "P&L",
                    ]}
                  />
                  <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                    {monthly.map((m, i) => <Cell key={i} fill={m.pnl >= 0 ? "#22c55e" : "#ef4444"} fillOpacity={0.8} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* ============== OVERALL STATS PANEL ============== */}
        {extStats && (
          <Card>
            <CardHeader className="py-3 px-4 border-b border-border">
              <CardTitle className="text-sm">Overall Statistics Panel</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-3 text-sm">
                {[
                  { label: "Total Trades", value: extStats.totalTrades },
                  { label: "Win Rate", value: `${extStats.winRate.toFixed(2)}%` },
                  { label: "Profit Factor", value: extStats.profitFactor === 999 ? "∞" : extStats.profitFactor.toFixed(2) },
                  { label: "ROI", value: `${extStats.roi >= 0 ? "+" : ""}${extStats.roi.toFixed(2)}%` },
                  { label: "Net P&L", value: <PnLBadge amount={extStats.totalPnl} /> },
                  { label: "Total Profit", value: <PnLBadge amount={extStats.totalProfit} /> },
                  { label: "Total Loss", value: <PnLBadge amount={extStats.totalLoss} /> },
                  { label: "Avg Profit", value: <PnLBadge amount={extStats.avgProfit} /> },
                  { label: "Avg Loss", value: <PnLBadge amount={extStats.avgLoss} /> },
                  { label: "Best Trade", value: <PnLBadge amount={extStats.bestTrade} /> },
                  { label: "Worst Trade", value: <PnLBadge amount={extStats.worstTrade} /> },
                  { label: "Max Drawdown", value: <span className="text-red-400 font-mono">-₹{extStats.maxDrawdown.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span> },
                  { label: "Max Consec. Wins", value: <span className="text-green-500 font-bold">{extStats.maxConsecutiveWins}</span> },
                  { label: "Max Consec. Losses", value: <span className="text-red-400 font-bold">{extStats.maxConsecutiveLosses}</span> },
                  summary && { label: "Profit Days", value: <span className="text-green-500">{summary.profitDays}</span> },
                  summary && { label: "Loss Days", value: <span className="text-red-400">{summary.lossDays}</span> },
                ].filter(Boolean).map((row: any) => (
                  <div key={row.label} className="flex flex-col gap-0.5">
                    <span className="text-xs text-muted-foreground">{row.label}</span>
                    <span className="font-semibold">{row.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
