import React from 'react';
import { cn } from "@/lib/utils";

interface PnLBadgeProps {
  amount: number;
  className?: string;
  showPercent?: boolean;
  percentValue?: number;
  prefix?: string;
}

export function PnLBadge({ amount, className, showPercent = false, percentValue, prefix = "" }: PnLBadgeProps) {
  const isPositive = amount >= 0;
  
  return (
    <span className={cn(
      "font-mono font-medium",
      isPositive ? "text-green-500" : "text-red-500",
      className
    )}>
      {prefix}{isPositive ? "+" : "-"}₹{Math.abs(amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
      {showPercent && percentValue !== undefined && (
        <span className="ml-1 text-xs opacity-80">
          ({isPositive ? "+" : ""}{percentValue.toFixed(2)}%)
        </span>
      )}
    </span>
  );
}