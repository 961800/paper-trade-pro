import React, { useEffect, useRef } from "react";

interface TradingViewWidgetProps {
  symbol: string;
  theme?: "light" | "dark";
  interval?: string;
  className?: string;
}

export function TradingViewWidget({ 
  symbol, 
  theme = "dark", 
  interval = "5", 
  className 
}: TradingViewWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Clear previous widget
    containerRef.current.innerHTML = "";

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/tv.js";
    script.async = true;
    script.onload = () => {
      if (typeof window !== "undefined" && (window as any).TradingView) {
        new (window as any).TradingView.widget({
          autosize: true,
          symbol: symbol,
          interval: interval,
          timezone: "Asia/Kolkata",
          theme: theme,
          style: "1",
          locale: "en",
          enable_publishing: false,
          backgroundColor: theme === "dark" ? "#0f172a" : "#ffffff",
          gridColor: theme === "dark" ? "#1e293b" : "#f1f5f9",
          hide_top_toolbar: false,
          hide_legend: false,
          save_image: false,
          container_id: containerRef.current?.id,
        });
      }
    };

    document.head.appendChild(script);

    return () => {
      if (script.parentNode) {
        document.head.removeChild(script);
      }
    };
  }, [symbol, theme, interval]);

  const uniqueId = `tv_chart_${Math.random().toString(36).substring(7)}`;

  return (
    <div 
      id={uniqueId} 
      ref={containerRef} 
      className={className} 
      style={{ height: "100%", width: "100%" }}
    />
  );
}