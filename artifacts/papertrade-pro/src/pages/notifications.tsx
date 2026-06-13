import React from "react";
import { Layout } from "@/components/layout";
import {
  useGetNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  getGetNotificationsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Bell, CheckCheck, Info, AlertCircle, TrendingUp, DollarSign } from "lucide-react";

const ICON_MAP: Record<string, React.ReactNode> = {
  trade: <TrendingUp className="w-4 h-4 text-blue-400" />,
  pnl: <DollarSign className="w-4 h-4 text-green-500" />,
  alert: <AlertCircle className="w-4 h-4 text-yellow-400" />,
  system: <Info className="w-4 h-4 text-muted-foreground" />,
};

export default function Notifications() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: notifications, isLoading } = useGetNotifications({
    query: { queryKey: getGetNotificationsQueryKey(), refetchInterval: 30000 },
  });

  const markReadMutation = useMarkNotificationRead();
  const markAllReadMutation = useMarkAllNotificationsRead();

  const unreadCount = notifications?.filter((n) => !n.isRead).length ?? 0;

  const handleMarkRead = async (id: number) => {
    try {
      await markReadMutation.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getGetNotificationsQueryKey() });
    } catch {}
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllReadMutation.mutateAsync();
      queryClient.invalidateQueries({ queryKey: getGetNotificationsQueryKey() });
      toast({ title: "All notifications marked as read" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Failed", description: err.message });
    }
  };

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bell className="w-6 h-6" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
              <p className="text-muted-foreground text-sm">
                {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
              </p>
            </div>
          </div>
          {unreadCount > 0 && (
            <Button size="sm" variant="outline" onClick={handleMarkAllRead} disabled={markAllReadMutation.isPending}>
              <CheckCheck className="w-4 h-4 mr-2" /> Mark all read
            </Button>
          )}
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">{Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
            ) : !notifications || notifications.length === 0 ? (
              <div className="py-16 text-center">
                <Bell className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No notifications yet</p>
                <p className="text-xs text-muted-foreground mt-1">Trade activity and alerts will appear here.</p>
              </div>
            ) : (
              <div>
                {notifications.map((notif) => (
                  <div
                    key={notif.id}
                    onClick={() => !notif.isRead && handleMarkRead(notif.id)}
                    className={cn(
                      "flex items-start gap-3 px-4 py-3 border-b border-border/50 transition-colors cursor-pointer",
                      !notif.isRead ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/20"
                    )}
                  >
                    <div className="mt-0.5 p-1.5 rounded-full bg-muted">
                      {ICON_MAP[notif.type] ?? ICON_MAP.system}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-sm", !notif.isRead && "font-semibold")}>{notif.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{notif.message}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(notif.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    {!notif.isRead && (
                      <div className="w-2 h-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
