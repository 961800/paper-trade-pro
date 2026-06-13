import React, { useState } from "react";
import { Layout } from "@/components/layout";
import { useGetOrders, useCancelOrder, getGetOrdersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { RefreshCw, X } from "lucide-react";

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30",
  executed: "bg-green-500/10 text-green-500 border-green-500/30",
  rejected: "bg-red-500/10 text-red-400 border-red-500/30",
  cancelled: "bg-muted text-muted-foreground",
};

export default function Orders() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "pending" | "executed" | "cancelled">("all");

  const { data: orders, isLoading, refetch } = useGetOrders(
    {},
    { query: { queryKey: getGetOrdersQueryKey(), refetchInterval: 5000 } }
  );

  const cancelMutation = useCancelOrder();

  const handleCancel = async (id: number) => {
    try {
      await cancelMutation.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getGetOrdersQueryKey() });
      toast({ title: "Order cancelled" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Cancel failed", description: err.message });
    }
  };

  const filtered = orders?.filter((o) => {
    if (filter === "all") return true;
    if (filter === "pending") return o.status === "pending";
    if (filter === "executed") return o.status === "executed";
    if (filter === "cancelled") return o.status === "cancelled" || o.status === "rejected";
    return true;
  }) ?? [];

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Order Book</h1>
            <p className="text-muted-foreground text-sm">{orders?.length ?? 0} total orders</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
        </div>

        <div className="flex gap-2 flex-wrap">
          {(["all", "pending", "executed", "cancelled"] as const).map((f) => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} className="capitalize h-7 text-xs" onClick={() => setFilter(f)}>
              {f}
            </Button>
          ))}
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">{Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-muted-foreground">No orders found</p>
                <p className="text-xs text-muted-foreground mt-1">Go to Trade to place your first order.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                      <th className="text-left px-4 py-3">Instrument</th>
                      <th className="text-left px-4 py-3">Type</th>
                      <th className="text-right px-4 py-3">Qty</th>
                      <th className="text-right px-4 py-3">Price</th>
                      <th className="text-left px-4 py-3">Status</th>
                      <th className="text-left px-4 py-3">Time</th>
                      <th className="text-right px-4 py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((order) => (
                      <tr key={order.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-semibold">{order.symbol}</div>
                          <div className="text-xs text-muted-foreground">
                            {order.strikePrice}{" "}
                            <span className={cn("font-bold", order.optionType === "CE" ? "text-green-500" : "text-red-400")}>
                              {order.optionType}
                            </span>
                            {" · "}{order.expiry}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className={cn("font-bold text-xs uppercase", order.action === "buy" ? "text-blue-400" : "text-orange-400")}>
                            {order.action}
                          </div>
                          <div className="text-xs text-muted-foreground">{order.orderType}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono">{order.quantity}</td>
                        <td className="px-4 py-3 text-right font-mono">
                          ₹{(order.executedPrice ?? 0).toFixed(2)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium", STATUS_STYLE[order.status] ?? "")}>
                            {order.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {new Date(order.createdAt).toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {order.status === "pending" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs border-red-500/50 text-red-400 hover:bg-red-500/10"
                              disabled={cancelMutation.isPending}
                              onClick={() => handleCancel(order.id)}
                            >
                              <X className="w-3 h-3 mr-1" /> Cancel
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
