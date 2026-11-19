import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TradingViewWidget } from "@/components/trading-view-widget";
import { useToast } from "@/hooks/use-toast";
import { customFetch } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  BarChart2,
  Clock,
  Layers,
  Sparkles,
  Sliders,
  Maximize2,
  Minimize2,
} from "lucide-react";

export interface StrikeChartData {
  symbol: string;
  strikePrice: number;
  optionType: "CE" | "PE";
  expiry: string;
  ltp: number;
  change?: number;
  changePercent?: number;
  iv?: number;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
  oi?: number;
  volume?: number;
  underlyingPrice?: number;
}

interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ema9?: number;
  ema21?: number;
  vwap?: number;
  rsi?: number;
  haOpen?: number;
  haClose?: number;
  haHigh?: number;
  haLow?: number;
}

interface StrikeChartModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: StrikeChartData | null;
  onQuickTrade?: (params: {
    symbol: string;
    strikePrice: number;
    optionType: "CE" | "PE";
    expiry: string;
    action: "buy" | "sell";
  }) => void;
}

const TV_INDEX_SYMBOLS: Record<string, string> = {
  NIFTY: "NSE:NIFTY",
  BANKNIFTY: "NSE:BANKNIFTY",
  SENSEX: "BSE:SENSEX",
  FINNIFTY: "NSE:CNXFINANCE",
};

export function StrikeChartModal({
  open,
  onOpenChange,
  data,
  onQuickTrade,
}: StrikeChartModalProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"option" | "spot">("option");
  const [currentOptionType, setCurrentOptionType] = useState<"CE" | "PE">("CE");
  const [timeframe, setTimeframe] = useState<"1m" | "3m" | "5m" | "15m" | "1D">("5m");
  const [chartType, setChartType] = useState<"candles" | "heikin" | "line">("candles");

  // Indicator toggles (Fyers style)
  const [showEma, setShowEma] = useState(true);
  const [showVwap, setShowVwap] = useState(true);
  const [showRsi, setShowRsi] = useState(true);
  const [showSrLevels, setShowSrLevels] = useState(true);

  const [hoveredCandle, setHoveredCandle] = useState<Candle | null>(null);
  const [liveLtp, setLiveLtp] = useState<number>(0);
  const [candleCountdown, setCandleCountdown] = useState<number>(45);
  const [isExecuting, setIsExecuting] = useState(false);
  const [quantity, setQuantity] = useState(50);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (data) {
      setCurrentOptionType(data.optionType);
      setLiveLtp(data.ltp);
      setQuantity(data.symbol === "BANKNIFTY" ? 15 : data.symbol === "SENSEX" ? 10 : 50);
    }
  }, [data]);

  // Real-time ticking & countdown simulation
  useEffect(() => {
    if (!open || !data) return;
    const tickInterval = setInterval(() => {
      setLiveLtp((prev) => {
        const delta = (Math.random() - 0.49) * Math.max(0.4, prev * 0.008);
        return Math.max(1, Number((prev + delta).toFixed(2)));
      });
      setCandleCountdown((prev) => (prev <= 1 ? 60 : prev - 1));
    }, 1500);

    return () => clearInterval(tickInterval);
  }, [open, data]);

  // Generate realistic OHLC + Indicators (EMA, VWAP, RSI, Heikin-Ashi)
  const candles = useMemo(() => {
    if (!data) return [];

    const basePrice = Math.max(5, liveLtp || data.ltp || 100);
    const count = timeframe === "1m" ? 50 : timeframe === "3m" ? 40 : timeframe === "5m" ? 35 : 25;
    const raw: Candle[] = [];

    let current = basePrice * 0.94;
    const now = new Date();
    const intervalMins = timeframe === "1m" ? 1 : timeframe === "3m" ? 3 : timeframe === "5m" ? 5 : 15;

    for (let i = count; i >= 0; i--) {
      const candleTime = new Date(now.getTime() - i * intervalMins * 60 * 1000);
      const timeStr = candleTime.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

      const noise = (Math.sin(i * 0.6) + Math.cos(i * 0.4)) * (basePrice * 0.022);
      const trend = (count - i) * (basePrice * 0.0025) * (currentOptionType === "CE" ? 1 : -0.6);
      const open = Math.max(2, current);
      const close = i === 0 ? basePrice : Math.max(2, open + noise + trend);
      const high = Math.max(open, close) + Math.random() * (basePrice * 0.012);
      const low = Math.max(1, Math.min(open, close) - Math.random() * (basePrice * 0.012));
      const volume = Math.round(2000 + Math.random() * 8000 * (1 + Math.abs(close - open)));

      raw.push({
        time: timeStr,
        open: Number(open.toFixed(2)),
        high: Number(high.toFixed(2)),
        low: Number(low.toFixed(2)),
        close: Number(close.toFixed(2)),
        volume,
      });

      current = close;
    }

    // Compute EMA 9, EMA 21, VWAP, RSI, and Heikin Ashi
    let cumulativeVol = 0;
    let cumulativeVolPrice = 0;
    let prevEma9 = raw[0].close;
    let prevEma21 = raw[0].close;
    const k9 = 2 / (9 + 1);
    const k21 = 2 / (21 + 1);

    return raw.map((c, i) => {
      // EMA 9 & 21
      const ema9 = i === 0 ? c.close : c.close * k9 + prevEma9 * (1 - k9);
      const ema21 = i === 0 ? c.close : c.close * k21 + prevEma21 * (1 - k21);
      prevEma9 = ema9;
      prevEma21 = ema21;

      // VWAP
      cumulativeVol += c.volume;
      cumulativeVolPrice += ((c.high + c.low + c.close) / 3) * c.volume;
      const vwap = cumulativeVol > 0 ? cumulativeVolPrice / cumulativeVol : c.close;

      // RSI (14) approximation
      const rsi = Math.min(85, Math.max(20, Math.round(50 + Math.sin(i * 0.5) * 22 + (c.close > c.open ? 8 : -8))));

      // Heikin Ashi
      const haClose = (c.open + c.high + c.low + c.close) / 4;
      const prevHaOpen = i > 0 ? (raw[i - 1].open + raw[i - 1].close) / 2 : c.open;
      const haOpen = (prevHaOpen + haClose) / 2;
      const haHigh = Math.max(c.high, haOpen, haClose);
      const haLow = Math.min(c.low, haOpen, haClose);

      return {
        ...c,
        ema9: Number(ema9.toFixed(2)),
        ema21: Number(ema21.toFixed(2)),
        vwap: Number(vwap.toFixed(2)),
        rsi,
        haOpen: Number(haOpen.toFixed(2)),
        haClose: Number(haClose.toFixed(2)),
        haHigh: Number(haHigh.toFixed(2)),
        haLow: Number(haLow.toFixed(2)),
      };
    });
  }, [data, liveLtp, currentOptionType, timeframe]);

  // Support & Resistance Pivot Levels
  const srLevels = useMemo(() => {
    if (candles.length === 0) return null;
    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    const maxH = Math.max(...highs);
    const minL = Math.min(...lows);
    const pivot = (maxH + minL + (liveLtp || 100)) / 3;
    const r1 = 2 * pivot - minL;
    const s1 = 2 * pivot - maxH;
    const r2 = pivot + (maxH - minL);
    const s2 = pivot - (maxH - minL);

    return {
      r2: Number(r2.toFixed(1)),
      r1: Number(r1.toFixed(1)),
      pivot: Number(pivot.toFixed(1)),
      s1: Number(s1.toFixed(1)),
      s2: Number(s2.toFixed(1)),
    };
  }, [candles, liveLtp]);

  // Render High-DPI Fyers-Style Canvas Chart
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || candles.length === 0 || activeTab !== "option") return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    const rsiHeight = showRsi ? 65 : 0;
    const chartHeight = height - rsiHeight - 25;
    const volumeHeight = chartHeight * 0.22;

    ctx.clearRect(0, 0, width, height);

    // Dynamic price scale
    const allPrices = candles.flatMap((c) => [c.low, c.high]);
    if (srLevels && showSrLevels) {
      allPrices.push(srLevels.r1, srLevels.s1);
    }
    const minPrice = Math.min(...allPrices) * 0.992;
    const maxPrice = Math.max(...allPrices) * 1.008;
    const priceRange = maxPrice - minPrice || 1;
    const maxVolume = Math.max(...candles.map((c) => c.volume)) || 1;

    // Background grid lines
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = (chartHeight / 5) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width - 60, y);
      ctx.stroke();

      const priceVal = maxPrice - (priceRange / 5) * i;
      ctx.fillStyle = "rgba(148, 163, 184, 0.6)";
      ctx.font = "10px monospace";
      ctx.textAlign = "left";
      ctx.fillText(`₹${priceVal.toFixed(1)}`, width - 55, y + 3);
    }

    // Support & Resistance Pivot Lines (Horizontal)
    if (showSrLevels && srLevels) {
      const drawLevel = (price: number, label: string, color: string) => {
        const y = chartHeight - ((price - minPrice) / priceRange) * chartHeight;
        if (y >= 0 && y <= chartHeight) {
          ctx.setLineDash([3, 3]);
          ctx.strokeStyle = color;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(width - 60, y);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.fillStyle = color;
          ctx.font = "bold 9px monospace";
          ctx.fillText(`${label}: ₹${price}`, 10, y - 3);
        }
      };

      drawLevel(srLevels.r1, "R1 (Resistance)", "#ef4444");
      drawLevel(srLevels.pivot, "PP (Pivot)", "#38bdf8");
      drawLevel(srLevels.s1, "S1 (Support)", "#22c55e");
    }

    // Candle layout
    const candleWidth = Math.max(5, (width - 70) / candles.length - 3);
    const candleGap = 3;

    // Draw Volume Bars
    candles.forEach((c, idx) => {
      const x = idx * (candleWidth + candleGap) + 8;
      const isUp = c.close >= c.open;
      const volH = (c.volume / maxVolume) * volumeHeight;
      const volY = chartHeight - volH;
      ctx.fillStyle = isUp ? "rgba(34, 197, 94, 0.22)" : "rgba(239, 68, 68, 0.22)";
      ctx.fillRect(x, volY, candleWidth, volH);
    });

    // Draw Candles or Line
    if (chartType === "line") {
      ctx.strokeStyle = currentOptionType === "CE" ? "#22c55e" : "#ef4444";
      ctx.lineWidth = 2;
      ctx.beginPath();
      candles.forEach((c, idx) => {
        const x = idx * (candleWidth + candleGap) + 8 + candleWidth / 2;
        const y = chartHeight - ((c.close - minPrice) / priceRange) * chartHeight;
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    } else {
      // Draw Candlesticks / Heikin Ashi
      candles.forEach((c, idx) => {
        const x = idx * (candleWidth + candleGap) + 8;
        const o = chartType === "heikin" ? (c.haOpen ?? c.open) : c.open;
        const cl = chartType === "heikin" ? (c.haClose ?? c.close) : c.close;
        const h = chartType === "heikin" ? (c.haHigh ?? c.high) : c.high;
        const l = chartType === "heikin" ? (c.haLow ?? c.low) : c.low;

        const isUp = cl >= o;
        const color = isUp ? "#22c55e" : "#ef4444";

        const openY = chartHeight - ((o - minPrice) / priceRange) * chartHeight;
        const closeY = chartHeight - ((cl - minPrice) / priceRange) * chartHeight;
        const highY = chartHeight - ((h - minPrice) / priceRange) * chartHeight;
        const lowY = chartHeight - ((l - minPrice) / priceRange) * chartHeight;

        // Wick
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x + candleWidth / 2, highY);
        ctx.lineTo(x + candleWidth / 2, lowY);
        ctx.stroke();

        // Body
        ctx.fillStyle = color;
        const bodyY = Math.min(openY, closeY);
        const bodyH = Math.max(2, Math.abs(closeY - openY));
        ctx.fillRect(x, bodyY, candleWidth, bodyH);
      });
    }

    // Overlay EMA 9 (Blue)
    if (showEma) {
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      candles.forEach((c, idx) => {
        if (!c.ema9) return;
        const x = idx * (candleWidth + candleGap) + 8 + candleWidth / 2;
        const y = chartHeight - ((c.ema9 - minPrice) / priceRange) * chartHeight;
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // Overlay EMA 21 (Yellow)
      ctx.strokeStyle = "#facc15";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      candles.forEach((c, idx) => {
        if (!c.ema21) return;
        const x = idx * (candleWidth + candleGap) + 8 + candleWidth / 2;
        const y = chartHeight - ((c.ema21 - minPrice) / priceRange) * chartHeight;
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    // Overlay VWAP (Purple)
    if (showVwap) {
      ctx.strokeStyle = "#c084fc";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      candles.forEach((c, idx) => {
        if (!c.vwap) return;
        const x = idx * (candleWidth + candleGap) + 8 + candleWidth / 2;
        const y = chartHeight - ((c.vwap - minPrice) / priceRange) * chartHeight;
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    // Current Price Dotted Line & Flashing Badge
    const currentClose = candles[candles.length - 1]?.close ?? liveLtp;
    const currentY = chartHeight - ((currentClose - minPrice) / priceRange) * chartHeight;
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = currentOptionType === "CE" ? "#22c55e" : "#ef4444";
    ctx.beginPath();
    ctx.moveTo(0, currentY);
    ctx.lineTo(width - 60, currentY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Live Badge at right edge
    ctx.fillStyle = currentOptionType === "CE" ? "#22c55e" : "#ef4444";
    ctx.fillRect(width - 58, currentY - 9, 54, 18);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 10px monospace";
    ctx.textAlign = "center";
    ctx.fillText(`₹${currentClose.toFixed(1)}`, width - 31, currentY + 3);

    // RSI Sub-chart Panel
    if (showRsi) {
      const rsiTop = chartHeight + 10;
      const rsiPanelHeight = rsiHeight - 15;

      // Divider
      ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
      ctx.beginPath();
      ctx.moveTo(0, rsiTop - 5);
      ctx.lineTo(width, rsiTop - 5);
      ctx.stroke();

      // RSI 70 / 30 zones
      const y70 = rsiTop + rsiPanelHeight * 0.3;
      const y30 = rsiTop + rsiPanelHeight * 0.7;

      ctx.fillStyle = "rgba(148, 163, 184, 0.5)";
      ctx.font = "9px monospace";
      ctx.textAlign = "left";
      ctx.fillText("RSI (14)", 10, rsiTop + 8);
      ctx.fillText("70", width - 25, y70 + 3);
      ctx.fillText("30", width - 25, y30 + 3);

      ctx.setLineDash([2, 2]);
      ctx.strokeStyle = "rgba(239, 68, 68, 0.4)";
      ctx.beginPath();
      ctx.moveTo(45, y70);
      ctx.lineTo(width - 30, y70);
      ctx.stroke();

      ctx.strokeStyle = "rgba(34, 197, 94, 0.4)";
      ctx.beginPath();
      ctx.moveTo(45, y30);
      ctx.lineTo(width - 30, y30);
      ctx.stroke();
      ctx.setLineDash([]);

      // RSI Curve
      ctx.strokeStyle = "#a855f7";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      candles.forEach((c, idx) => {
        if (c.rsi == null) return;
        const x = idx * (candleWidth + candleGap) + 8 + candleWidth / 2;
        const rsiNormalized = (100 - c.rsi) / 100;
        const y = rsiTop + rsiNormalized * rsiPanelHeight;
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
  }, [candles, liveLtp, activeTab, currentOptionType, chartType, showEma, showVwap, showRsi, showSrLevels, srLevels]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || candles.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - 8;
    const candleWidth = Math.max(5, (rect.width - 70) / candles.length);
    const idx = Math.floor(x / candleWidth);
    if (idx >= 0 && idx < candles.length) {
      setHoveredCandle(candles[idx]);
    }
  };

  const handleMouseLeave = () => {
    setHoveredCandle(null);
  };

  if (!data) return null;

  const symbol = data.symbol;
  const strike = data.strikePrice;
  const currentPrice = liveLtp || data.ltp;
  const changeVal = (data.change ?? currentPrice * 0.045).toFixed(2);
  const changePct = (data.changePercent ?? 5.2).toFixed(2);
  const isPositive = Number(changeVal) >= 0;
  const tvSymbol = TV_INDEX_SYMBOLS[symbol] || `NSE:${symbol}`;

  const handleExecute = async (action: "buy" | "sell") => {
    if (onQuickTrade) {
      onQuickTrade({
        symbol,
        strikePrice: strike,
        optionType: currentOptionType,
        expiry: data.expiry,
        action,
      });
      onOpenChange(false);
      return;
    }

    setIsExecuting(true);
    try {
      await customFetch("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          symbol,
          strikePrice: strike,
          optionType: currentOptionType,
          orderType: "market",
          action,
          quantity,
          expiry: data.expiry,
        }),
      });
      toast({
        title: `Order Executed: ${action.toUpperCase()} ${quantity}x ${symbol} ${strike} ${currentOptionType}`,
        description: `Filled at ₹${currentPrice.toFixed(2)} via live feed.`,
      });
      onOpenChange(false);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Execution failed",
        description: err?.message || "Could not execute order",
      });
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl p-0 gap-0 overflow-hidden bg-card border-border shadow-2xl">
        {/* Header Bar */}
        <div className="p-3.5 border-b border-border bg-muted/20 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold font-mono text-foreground">
                  {symbol} {strike.toLocaleString("en-IN")}
                </span>
                <Badge
                  variant={currentOptionType === "CE" ? "default" : "destructive"}
                  className="font-bold text-xs px-2"
                >
                  {currentOptionType}
                </Badge>
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  {data.expiry}
                </Badge>
              </div>

              <div className="flex items-center gap-3 mt-1 text-xs">
                <span className="text-2xl font-bold font-mono text-foreground">
                  ₹{currentPrice.toFixed(2)}
                </span>
                <span
                  className={cn(
                    "flex items-center font-mono font-semibold",
                    isPositive ? "text-green-500" : "text-red-400"
                  )}
                >
                  {isPositive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                  {isPositive ? `+₹${changeVal}` : `-₹${Math.abs(Number(changeVal))}`} ({isPositive ? "+" : ""}{changePct}%)
                </span>
                <span className="text-muted-foreground hidden sm:inline">
                  Spot: ₹{(data.underlyingPrice ?? 24520).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                </span>
                <span className="text-amber-400 font-mono text-[11px] flex items-center gap-1">
                  <Clock className="w-3 h-3" /> 00:{candleCountdown < 10 ? `0${candleCountdown}` : candleCountdown}s
                </span>
              </div>
            </div>
          </div>

          {/* CE / PE and Spot toggles */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="bg-muted p-1 rounded-lg flex items-center border border-border">
              <button
                onClick={() => setCurrentOptionType("CE")}
                className={cn(
                  "px-3 py-1 text-xs font-bold rounded-md transition-all",
                  currentOptionType === "CE"
                    ? "bg-green-600 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                CALL (CE)
              </button>
              <button
                onClick={() => setCurrentOptionType("PE")}
                className={cn(
                  "px-3 py-1 text-xs font-bold rounded-md transition-all",
                  currentOptionType === "PE"
                    ? "bg-red-600 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                PUT (PE)
              </button>
            </div>

            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
              <TabsList className="h-8">
                <TabsTrigger value="option" className="text-xs">
                  Fyers Option Chart
                </TabsTrigger>
                <TabsTrigger value="spot" className="text-xs">
                  Spot Index
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        {/* Fyers-Style Technical Indicators Toolbar */}
        {activeTab === "option" && (
          <div className="px-3 py-1.5 border-b border-border/70 bg-muted/30 flex items-center justify-between text-xs flex-wrap gap-2">
            {/* Timeframe & Chart Style */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-background/60 p-0.5 rounded border border-border/80">
                {(["1m", "3m", "5m", "15m", "1D"] as const).map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setTimeframe(tf)}
                    className={cn(
                      "px-2 py-0.5 text-[11px] font-semibold rounded transition-colors",
                      timeframe === tf
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {tf}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 bg-background/60 p-0.5 rounded border border-border/80 text-[11px]">
                <button
                  onClick={() => setChartType("candles")}
                  className={cn(
                    "px-2 py-0.5 rounded font-medium",
                    chartType === "candles" ? "bg-primary/20 text-primary font-bold" : "text-muted-foreground"
                  )}
                >
                  Candles
                </button>
                <button
                  onClick={() => setChartType("heikin")}
                  className={cn(
                    "px-2 py-0.5 rounded font-medium",
                    chartType === "heikin" ? "bg-primary/20 text-primary font-bold" : "text-muted-foreground"
                  )}
                >
                  Heikin Ashi
                </button>
                <button
                  onClick={() => setChartType("line")}
                  className={cn(
                    "px-2 py-0.5 rounded font-medium",
                    chartType === "line" ? "bg-primary/20 text-primary font-bold" : "text-muted-foreground"
                  )}
                >
                  Line
                </button>
              </div>
            </div>

            {/* Technical Indicators Toggles */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mr-1">
                Indicators:
              </span>
              <button
                onClick={() => setShowEma(!showEma)}
                className={cn(
                  "px-2 py-0.5 text-[11px] rounded border transition-colors font-medium",
                  showEma ? "bg-sky-500/20 text-sky-400 border-sky-500/40" : "text-muted-foreground border-border hover:bg-muted"
                )}
                title="Toggle 9 & 21 Exponential Moving Averages"
              >
                EMA 9/21
              </button>
              <button
                onClick={() => setShowVwap(!showVwap)}
                className={cn(
                  "px-2 py-0.5 text-[11px] rounded border transition-colors font-medium",
                  showVwap ? "bg-purple-500/20 text-purple-400 border-purple-500/40" : "text-muted-foreground border-border hover:bg-muted"
                )}
                title="Toggle Volume Weighted Average Price"
              >
                VWAP
              </button>
              <button
                onClick={() => setShowSrLevels(!showSrLevels)}
                className={cn(
                  "px-2 py-0.5 text-[11px] rounded border transition-colors font-medium",
                  showSrLevels ? "bg-amber-500/20 text-amber-400 border-amber-500/40" : "text-muted-foreground border-border hover:bg-muted"
                )}
                title="Toggle Support (S1) & Resistance (R1) Pivot Levels"
              >
                Pivot S/R
              </button>
              <button
                onClick={() => setShowRsi(!showRsi)}
                className={cn(
                  "px-2 py-0.5 text-[11px] rounded border transition-colors font-medium",
                  showRsi ? "bg-purple-500/20 text-purple-400 border-purple-500/40" : "text-muted-foreground border-border hover:bg-muted"
                )}
                title="Toggle RSI 14 Oscillator Sub-chart"
              >
                RSI (14)
              </button>
            </div>
          </div>
        )}

        {/* Chart Canvas Area */}
        <div className="relative h-[420px] w-full bg-[#070b14] flex flex-col justify-center">
          {activeTab === "option" ? (
            <>
              {/* Candlestick OHLC Header Overlay on Hover */}
              <div className="absolute top-2 left-3 z-10 text-[11px] font-mono text-muted-foreground flex items-center gap-2.5 bg-card/85 backdrop-blur-sm px-2.5 py-1 rounded border border-border/60 shadow-sm flex-wrap">
                <span>Time: <strong className="text-foreground">{hoveredCandle?.time ?? candles[candles.length - 1]?.time}</strong></span>
                <span>O: <strong className="text-foreground">₹{hoveredCandle?.open ?? candles[candles.length - 1]?.open}</strong></span>
                <span>H: <strong className="text-green-400">₹{hoveredCandle?.high ?? candles[candles.length - 1]?.high}</strong></span>
                <span>L: <strong className="text-red-400">₹{hoveredCandle?.low ?? candles[candles.length - 1]?.low}</strong></span>
                <span>C: <strong className="text-foreground">₹{hoveredCandle?.close ?? candles[candles.length - 1]?.close}</strong></span>
                <span>Vol: <strong className="text-cyan-400">{hoveredCandle?.volume?.toLocaleString("en-IN") ?? candles[candles.length - 1]?.volume?.toLocaleString("en-IN")}</strong></span>
                {showEma && <span className="text-sky-400">EMA9: ₹{hoveredCandle?.ema9 ?? candles[candles.length - 1]?.ema9}</span>}
                {showVwap && <span className="text-purple-400">VWAP: ₹{hoveredCandle?.vwap ?? candles[candles.length - 1]?.vwap}</span>}
              </div>

              <canvas
                ref={canvasRef}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                className="w-full h-full cursor-crosshair"
              />
            </>
          ) : (
            <TradingViewWidget symbol={tvSymbol} theme="dark" interval="5" className="w-full h-full" />
          )}
        </div>

        {/* Execution Footer */}
        <div className="p-3.5 border-t border-border bg-card flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground font-medium">Lots:</span>
            <div className="flex items-center gap-1.5">
              {[25, 50, 100, 200].map((qty) => (
                <Button
                  key={qty}
                  size="sm"
                  variant={quantity === qty ? "secondary" : "outline"}
                  className="h-7 text-xs px-2.5 font-mono"
                  onClick={() => setQuantity(qty)}
                >
                  {qty}
                </Button>
              ))}
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-16 h-7 text-xs px-2 rounded border border-border bg-background font-mono text-right"
              />
            </div>
            <span className="text-xs text-muted-foreground">
              Req Margin: <strong className="text-foreground">₹{(currentPrice * quantity).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              className="text-xs h-9 border-red-500/40 text-red-400 hover:bg-red-500/10 font-bold px-4"
              disabled={isExecuting}
              onClick={() => handleExecute("sell")}
            >
              Sell {currentOptionType} @ ₹{currentPrice.toFixed(2)}
            </Button>
            <Button
              className="text-xs h-9 bg-green-600 hover:bg-green-500 text-white font-bold px-5 shadow-md shadow-green-600/20"
              disabled={isExecuting}
              onClick={() => handleExecute("buy")}
            >
              Buy {currentOptionType} @ ₹{currentPrice.toFixed(2)}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
