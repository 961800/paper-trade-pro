import React from "react";
import { Layout } from "@/components/layout";
import { useGetLeaderboard, getGetLeaderboardQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PnLBadge } from "@/components/pnl-badge";
import { cn } from "@/lib/utils";
import { Trophy, Medal } from "lucide-react";

const RANK_STYLE: Record<number, string> = {
  1: "text-yellow-400",
  2: "text-slate-400",
  3: "text-amber-600",
};

export default function Leaderboard() {
  const { user } = useAuth();

  const { data: entries, isLoading } = useGetLeaderboard(
    {},
    { query: { queryKey: getGetLeaderboardQueryKey() } }
  );

  const userEntry = entries?.find((e) => e.userId === user?.id);
  const userRank = userEntry ? (entries?.indexOf(userEntry) ?? -1) + 1 : null;

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Trophy className="w-7 h-7 text-yellow-400" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Leaderboard</h1>
            <p className="text-muted-foreground text-sm">Top traders by total P&L</p>
          </div>
        </div>

        {/* Your Rank */}
        {userEntry && userRank && (
          <Card className="border-primary/40 bg-primary/5">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold text-primary">#{userRank}</span>
                <div>
                  <p className="font-semibold">{userEntry.fullName} <span className="text-xs text-primary">(You)</span></p>
                  <p className="text-xs text-muted-foreground">{userEntry.totalTrades} trades · {userEntry.winRate.toFixed(1)}% win rate</p>
                </div>
              </div>
              <PnLBadge amount={userEntry.totalPnl} />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="py-3 px-4 border-b border-border">
            <CardTitle className="text-sm">Rankings</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">{Array(10).fill(0).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : !entries || entries.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-muted-foreground">No traders yet</p>
                <p className="text-xs text-muted-foreground mt-1">Be the first to complete trades and appear here!</p>
              </div>
            ) : (
              <div>
                {entries.map((entry, idx) => {
                  const rank = idx + 1;
                  const isMe = entry.userId === user?.id;
                  return (
                    <div
                      key={entry.userId}
                      className={cn(
                        "flex items-center gap-4 px-4 py-3 border-b border-border/50 transition-colors",
                        isMe ? "bg-primary/5" : "hover:bg-muted/20"
                      )}
                    >
                      <div className={cn("w-8 text-center font-bold text-lg", RANK_STYLE[rank] ?? "text-muted-foreground")}>
                        {rank <= 3 ? <Medal className="w-5 h-5 mx-auto" /> : rank}
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold">
                          {entry.fullName}
                          {isMe && <span className="text-xs text-primary ml-2">(You)</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {entry.totalTrades} trades · {entry.winRate.toFixed(1)}% win · {entry.city}
                        </p>
                      </div>
                      <div className="text-right">
                        <PnLBadge amount={entry.totalPnl} />
                        <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                          {entry.percentageGain >= 0 ? "+" : ""}{entry.percentageGain.toFixed(2)}%
                        </p>
                      </div>
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
