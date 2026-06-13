import React, { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useGetIndices, getGetIndicesQueryKey } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { ArrowUpIcon, ArrowDownIcon } from "lucide-react";

export function Ticker() {
  const { data: indices } = useGetIndices({
    query: {
      queryKey: getGetIndicesQueryKey(),
      refetchInterval: 5000,
    }
  });

  if (!indices || indices.length === 0) return null;

  return (
    <div className="w-full bg-card border-b border-border overflow-hidden flex whitespace-nowrap py-2">
      <div className="animate-marquee flex gap-8 items-center px-4">
        {/* Duplicate list for seamless marquee effect */}
        {[...indices, ...indices].map((index, i) => (
          <div key={`${index.symbol}-${i}`} className="flex items-center gap-2 text-sm">
            <span className="font-semibold">{index.name}</span>
            <span className="font-mono">{index.ltp.toLocaleString('en-IN')}</span>
            <span className={cn(
              "flex items-center text-xs font-mono",
              index.change >= 0 ? "text-green-500" : "text-red-500"
            )}>
              {index.change >= 0 ? <ArrowUpIcon className="w-3 h-3" /> : <ArrowDownIcon className="w-3 h-3" />}
              {Math.abs(index.change).toLocaleString('en-IN')} ({index.changePercent.toFixed(2)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}