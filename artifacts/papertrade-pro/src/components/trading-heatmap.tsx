import React, { useState, useRef } from "react";
import { cn } from "@/lib/utils";

interface DayData {
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

interface TradingHeatmapProps {
  data: DayData[];
  year: number;
  onDayClick?: (day: DayData) => void;
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getDayColor(d: DayData, maxProfit: number, maxLoss: number): string {
  if (d.status === "weekend") return "bg-muted/40";
  if (d.status === "holiday") return "bg-orange-500/60";
  if (d.status === "no_trade") return "bg-muted/20 border border-border/30";
  if (d.status === "profit") {
    const intensity = maxProfit > 0 ? d.pnl / maxProfit : 0;
    if (intensity > 0.75) return "bg-green-600";
    if (intensity > 0.5) return "bg-green-500";
    if (intensity > 0.25) return "bg-green-400";
    return "bg-green-300";
  }
  if (d.status === "loss") {
    const intensity = maxLoss > 0 ? Math.abs(d.pnl) / maxLoss : 0;
    if (intensity > 0.75) return "bg-red-700";
    if (intensity > 0.5) return "bg-red-600";
    if (intensity > 0.25) return "bg-red-500";
    return "bg-red-400";
  }
  return "bg-muted/20";
}

interface TooltipState {
  day: DayData;
  x: number;
  y: number;
}

export function TradingHeatmap({ data, year, onDayClick }: TradingHeatmapProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  if (!data.length) return null;

  const byDate: Record<string, DayData> = {};
  for (const d of data) byDate[d.date] = d;

  const maxProfit = Math.max(...data.filter((d) => d.status === "profit").map((d) => d.pnl), 1);
  const maxLoss = Math.max(...data.filter((d) => d.status === "loss").map((d) => Math.abs(d.pnl)), 1);

  // Build week columns: each column = 7 days starting from Sunday
  const jan1 = new Date(year, 0, 1);
  const jan1Dow = jan1.getDay(); // 0=Sun
  // Start grid from the Sunday on or before Jan 1
  const gridStart = new Date(jan1);
  gridStart.setDate(gridStart.getDate() - jan1Dow);

  const weeks: (DayData | null)[][] = [];
  let current = new Date(gridStart);
  while (current.getFullYear() <= year || (current.getFullYear() === year && current.getMonth() <= 11)) {
    if (current.getFullYear() > year) break;
    const week: (DayData | null)[] = [];
    for (let d = 0; d < 7; d++) {
      const ds = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-${String(current.getDate()).padStart(2, "0")}`;
      if (current.getFullYear() !== year) {
        week.push(null);
      } else {
        week.push(byDate[ds] ?? null);
      }
      current.setDate(current.getDate() + 1);
    }
    weeks.push(week);
    if (current.getFullYear() > year) break;
  }

  // Month label positions (which column does each month start in)
  const monthPositions: { month: number; col: number }[] = [];
  for (let wi = 0; wi < weeks.length; wi++) {
    const week = weeks[wi];
    for (let di = 0; di < 7; di++) {
      const d = week[di];
      if (d) {
        const m = parseInt(d.date.split("-")[1]) - 1;
        const day = parseInt(d.date.split("-")[2]);
        if (day <= 7 && !monthPositions.find((mp) => mp.month === m)) {
          monthPositions.push({ month: m, col: wi });
        }
      }
    }
  }

  const handleMouseEnter = (day: DayData, e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cellRect = (e.target as HTMLElement).getBoundingClientRect();
    setTooltip({
      day,
      x: cellRect.left - rect.left + cellRect.width / 2,
      y: cellRect.top - rect.top,
    });
  };

  const formatPnl = (n: number) => {
    if (n === 0) return "₹0";
    return `${n > 0 ? "+" : "-"}₹${Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  };

  return (
    <div ref={containerRef} className="relative select-none">
      {/* Month labels */}
      <div className="flex mb-1 ml-8" style={{ gap: 2 }}>
        {weeks.map((_, wi) => {
          const mp = monthPositions.find((m) => m.col === wi);
          return (
            <div key={wi} className="text-[10px] text-muted-foreground" style={{ width: 12, flexShrink: 0, textAlign: "left" }}>
              {mp ? MONTH_LABELS[mp.month] : ""}
            </div>
          );
        })}
      </div>

      <div className="flex gap-1">
        {/* Day labels */}
        <div className="flex flex-col" style={{ gap: 2, width: 28 }}>
          {DAY_LABELS.map((d, i) => (
            <div key={d} className="text-[10px] text-muted-foreground flex items-center justify-end pr-1" style={{ height: 12 }}>
              {i % 2 !== 0 ? d : ""}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="flex overflow-x-auto pb-1" style={{ gap: 2 }}>
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col" style={{ gap: 2 }}>
              {week.map((day, di) => {
                if (!day) {
                  return <div key={di} style={{ width: 12, height: 12 }} />;
                }
                return (
                  <div
                    key={di}
                    style={{ width: 12, height: 12, borderRadius: 2 }}
                    className={cn(
                      "cursor-pointer transition-opacity hover:opacity-80",
                      getDayColor(day, maxProfit, maxLoss)
                    )}
                    onMouseEnter={(e) => handleMouseEnter(day, e)}
                    onMouseLeave={() => setTooltip(null)}
                    onClick={() => onDayClick?.(day)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <div className="w-3 h-3 rounded-sm bg-green-300" />
          <div className="w-3 h-3 rounded-sm bg-green-400" />
          <div className="w-3 h-3 rounded-sm bg-green-500" />
          <div className="w-3 h-3 rounded-sm bg-green-600" />
          <span>High Profit</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <div className="w-3 h-3 rounded-sm bg-red-400" />
          <div className="w-3 h-3 rounded-sm bg-red-500" />
          <div className="w-3 h-3 rounded-sm bg-red-600" />
          <div className="w-3 h-3 rounded-sm bg-red-700" />
          <span>Heavy Loss</span>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <div className="w-3 h-3 rounded-sm bg-muted/20 border border-border/30" />
          <span>No Trade</span>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <div className="w-3 h-3 rounded-sm bg-muted/40" />
          <span>Weekend</span>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <div className="w-3 h-3 rounded-sm bg-orange-500/60" />
          <span>Holiday</span>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute z-50 pointer-events-none bg-popover border border-border rounded-lg shadow-xl p-3 text-xs w-56"
          style={{
            left: Math.min(tooltip.x - 112, (containerRef.current?.offsetWidth ?? 500) - 220),
            top: tooltip.y - 8,
            transform: "translateY(-100%)",
          }}
        >
          <p className="font-bold text-sm mb-1.5">
            {new Date(tooltip.day.date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
          </p>
          {tooltip.day.status === "weekend" && <p className="text-muted-foreground">Weekend</p>}
          {tooltip.day.status === "holiday" && <p className="text-orange-400 font-medium">Market Holiday</p>}
          {tooltip.day.status === "no_trade" && <p className="text-muted-foreground">No Trades</p>}
          {(tooltip.day.status === "profit" || tooltip.day.status === "loss") && (
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Net P&L</span>
                <span className={cn("font-bold", tooltip.day.pnl >= 0 ? "text-green-500" : "text-red-400")}>
                  {formatPnl(tooltip.day.pnl)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Trades</span>
                <span className="font-medium">{tooltip.day.trades}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Win Rate</span>
                <span className="font-medium">{tooltip.day.winRate.toFixed(0)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">W / L</span>
                <span><span className="text-green-500">{tooltip.day.wins}W</span> / <span className="text-red-400">{tooltip.day.losses}L</span></span>
              </div>
              {tooltip.day.bestTrade > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Best</span>
                  <span className="text-green-500">+₹{tooltip.day.bestTrade.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                </div>
              )}
              {tooltip.day.worstTrade < 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Worst</span>
                  <span className="text-red-400">-₹{Math.abs(tooltip.day.worstTrade).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
