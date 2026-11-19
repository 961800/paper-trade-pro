import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  BarChart2,
  Maximize2,
  RefreshCw,
  Clock,
  ShieldAlert,
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
  const [timeframe, setTimeframe] = useState<"1m" | "5m" | "15m" | "1D">("5m");
  const [hoveredCandle, setHoveredCandle] = useState<Candle | null>(null);
  const [liveLtp, setLiveLtp] = useState<number>(0);
  const [isExecuting, setIsExecuting] = useState(false);
  const [quantity, setQuantity] = useState(50); // Default Nifty lot size

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Sync initial option type when modal opens with new data
  useEffect(() => {
    if (data) {
      setCurrentOptionType(data.optionType);
      setLiveLtp(data.ltp);
      setQuantity(data.symbol === "BANKNIFTY" ? 15 : data.symbol === "SENSEX" ? 10 : 50);
    }
  }, [data]);

  // Generate realistic OHLC candles tailored to option strike price
  const candles = useMemo(() => {
    if (!data) return [];

    const basePrice = Math.max(5, liveLtp || data.ltp || 100);
    const count = timeframe === "1m" ? 45 : timeframe === "5m" ? 35 : timeframe === "15m" ? 28 : 20;
    const list: Candle[] = [];

    let current = basePrice * 0.92;
    const now = new Date();
    const intervalMins = timeframe === "1m" ? 1 : timeframe === "5m" ? 5 : timeframe === "15m" ? 15 : 60 * 24;

    for (let i = count; i >= 0; i--) {
      const candleTime = new Date(now.getTime() - i * intervalMins * 60 * 1000);
      const timeStr =
        timeframe === "1D"
          ? candleTime.toLocaleDateString("en-IN", { month: "short", day: "numeric" })
          : candleTime.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

      // Calculate realistic option price fluctuation
      const noise = (Math.sin(i * 0.7) + Math.cos(i * 0.3)) * (basePrice * 0.025);
      const trend = (count - i) * (basePrice * 0.003) * (currentOptionType === "CE" ? 1 : -0.5);
      const open = Math.max(2, current);
      const close = i === 0 ? basePrice : Math.max(2, open + noise + trend);
      const high = Math.max(open, close) + Math.random() * (basePrice * 0.015);
      const low = Math.max(1, Math.min(open, close) - Math.random() * (basePrice * 0.015));
      const volume = Math.round(1500 + Math.random() * 8500 * (1 + Math.abs(close - open)));

      list.push({
        time: timeStr,
        open: Number(open.toFixed(2)),
        high: Number(high.toFixed(2)),
        low: Number(low.toFixed(2)),
        close: Number(close.toFixed(2)),
        volume,
      });

      current = close;
    }

    return list;
  }, [data, liveLtp, currentOptionType, timeframe]);

  // Live price tick simulation
  useEffect(() => {
    if (!open || !data) return;
    const interval = setInterval(() => {
      setLiveLtp((prev) => {
        const delta = (Math.random() - 0.49) * (Math.max(1, prev * 0.006));
        return Math.max(1, Number((prev + delta).toFixed(2)));
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [open, data]);

  // Draw High-Performance Canvas Candlestick Chart
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || candles.length === 0 || activeTab !== "option") return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Handle high DPI displays
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const chartHeight = height * 0.75;
    const volumeHeight = height * 0.2;

    ctx.clearRect(0, 0, width, height);

    // Compute min / max
    const prices = candles.flatMap((c) => [c.low, c.high]);
    const minPrice = Math.min(...prices) * 0.995;
    const maxPrice = Math.max(...prices) * 1.005;
    const priceRange = maxPrice - minPrice || 1;

    const maxVolume = Math.max(...candles.map((c) => c.volume)) || 1;

    // Grid lines
    ctx.strokeStyle = "rgba(255, 255, 255, 0.07)";
    ctx.lineWidth = 1;
    const gridSteps = 4;
    for (let i = 0; i <= gridSteps; i++) {
      const y = (chartHeight / gridSteps) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width - 55, y);
      ctx.stroke();

      const priceVal = maxPrice - (priceRange / gridSteps) * i;
      ctx.fillStyle = "rgba(148, 163, 184, 0.7)";
      ctx.font = "10px monospace";
      ctx.textAlign = "left";
      ctx.fillText(`₹${priceVal.toFixed(1)}`, width - 50, y + 3);
    }

    // Candle metrics
    const candleWidth = Math.max(4, (width - 65) / candles.length - 3);
    const candleGap = 3;

    // Draw Candles & Volume
    candles.forEach((candle, idx) => {
      const x = idx * (candleWidth + candleGap) + 10;
      const isUp = candle.close >= candle.open;
      const color = isUp ? "#22c55e" : "#ef4444";

      const openY = chartHeight - ((candle.open - minPrice) / priceRange) * chartHeight;
      const closeY = chartHeight - ((candle.close - minPrice) / priceRange) * chartHeight;
      const highY = chartHeight - ((candle.high - minPrice) / priceRange) * chartHeight;
      const lowY = chartHeight - ((candle.low - minPrice) / priceRange) * chartHeight;

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

      // Volume bar
      const volH = (candle.volume / maxVolume) * volumeHeight;
      const volY = height - volH;
      ctx.fillStyle = isUp ? "rgba(34, 197, 94, 0.25)" : "rgba(239, 68, 68, 0.25)";
      ctx.fillRect(x, volY, candleWidth, volH);
    });

    // Draw Current Live Price Dotted Line
    const currentClose = candles[candles.length - 1]?.close ?? liveLtp;
    const currentY = chartHeight - ((currentClose - minPrice) / priceRange) * chartHeight;
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = currentOptionType === "CE" ? "#22c55e" : "#ef4444";
    ctx.beginPath();
    ctx.moveTo(0, currentY);
    ctx.lineTo(width - 55, currentY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Live Badge at right edge
    ctx.fillStyle = currentOptionType === "CE" ? "#22c55e" : "#ef4444";
    ctx.fillRect(width - 55, currentY - 9, 52, 18);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 10px monospace";
    ctx.textAlign = "center";
    ctx.fillText(`₹${currentClose.toFixed(1)}`, width - 29, currentY + 3);
  }, [candles, liveLtp, activeTab, currentOptionType]);

  // Mouse move handler for interactive crosshair & tooltip
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || candles.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - 10;
    const candleWidth = Math.max(4, (rect.width - 65) / candles.length);
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
  const changeVal = (data.change ?? currentPrice * 0.05).toFixed(2);
  const changePct = (data.changePercent ?? 4.8).toFixed(2);
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
        description: `Filled at ₹${currentPrice.toFixed(2)} via real-time market simulator.`,
      });
      onOpenChange(false);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Execution failed",
        description: err?.message || "Could not execute quick order",
      });
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0 gap-0 overflow-hidden bg-card border-border/80 shadow-2xl">
        {/* Header Bar */}
        <div className="p-4 border-b border-border bg-muted/20 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold font-mono tracking-tight text-foreground">
                  {symbol} {strike.toLocaleString("en-IN")}
                </span>
                <Badge
                  variant={currentOptionType === "CE" ? "default" : "destructive"}
                  className="font-bold text-xs"
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
                <span className="text-muted-foreground">
                  Spot: ₹{(data.underlyingPrice ?? 24500).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                </span>
              </div>
            </div>
          </div>

          {/* Quick CE / PE and Spot toggles */}
          <div className="flex items-center gap-2">
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
                  Option Chart
                </TabsTrigger>
                <TabsTrigger value="spot" className="text-xs">
                  Spot Index
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        {/* Greeks & Stats Strip */}
        <div className="px-4 py-2 border-b border-border/60 bg-muted/10 flex items-center justify-between text-xs flex-wrap gap-2">
          <div className="flex items-center gap-4 text-muted-foreground">
            <span>
              Delta (Δ): <strong className="text-foreground">{data.delta?.toFixed(3) ?? "0.512"}</strong>
            </span>
            <span>
              Theta (Θ): <strong className="text-amber-400">{data.theta ? `₹${data.theta.toFixed(1)}/d` : "-₹11.4/d"}</strong>
            </span>
            <span>
              Gamma (Γ): <strong className="text-foreground">{data.gamma?.toFixed(4) ?? "0.0019"}</strong>
            </span>
            <span>
              Vega (ν): <strong className="text-cyan-400">{data.vega?.toFixed(1) ?? "18.5"}</strong>
            </span>
            <span>
              IV: <strong className="text-foreground">{data.iv?.toFixed(1) ?? "14.2"}%</strong>
            </span>
          </div>

          {activeTab === "option" && (
            <div className="flex items-center gap-1">
              {(["1m", "5m", "15m", "1D"] as const).map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={cn(
                    "px-2 py-0.5 text-[11px] font-medium rounded transition-colors",
                    timeframe === tf
                      ? "bg-primary text-primary-foreground font-bold"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  {tf}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Chart Canvas Area */}
        <div className="relative h-[380px] w-full bg-[#0a0f1d] flex flex-col justify-center">
          {activeTab === "option" ? (
            <>
              {/* Candlestick OHLC Header Overlay on Hover */}
              <div className="absolute top-2 left-4 z-10 text-[11px] font-mono text-muted-foreground flex items-center gap-3 bg-card/80 backdrop-blur-sm px-2.5 py-1 rounded border border-border/50">
                <span>Time: <strong className="text-foreground">{hoveredCandle?.time ?? candles[candles.length - 1]?.time}</strong></span>
                <span>O: <strong className="text-foreground">₹{hoveredCandle?.open ?? candles[candles.length - 1]?.open}</strong></span>
                <span>H: <strong className="text-green-400">₹{hoveredCandle?.high ?? candles[candles.length - 1]?.high}</strong></span>
                <span>L: <strong className="text-red-400">₹{hoveredCandle?.low ?? candles[candles.length - 1]?.low}</strong></span>
                <span>C: <strong className="text-foreground">₹{hoveredCandle?.close ?? candles[candles.length - 1]?.close}</strong></span>
                <span>Vol: <strong className="text-cyan-400">{hoveredCandle?.volume?.toLocaleString("en-IN") ?? candles[candles.length - 1]?.volume?.toLocaleString("en-IN")}</strong></span>
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

        {/* Quick Execution Trading Footer */}
        <div className="p-4 border-t border-border bg-card flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground font-medium">Quantity (Lots):</span>
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
              Margin: <strong className="text-foreground">₹{(currentPrice * quantity).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</strong>
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              className="text-xs h-9 border-red-500/40 text-red-400 hover:bg-red-500/10 hover:text-red-300 font-bold px-5"
              disabled={isExecuting}
              onClick={() => handleExecute("sell")}
            >
              Sell {currentOptionType} @ ₹{currentPrice.toFixed(2)}
            </Button>
            <Button
              className="text-xs h-9 bg-green-600 hover:bg-green-500 text-white font-bold px-6 shadow-lg shadow-green-600/20"
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
