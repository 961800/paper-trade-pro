import React from "react";
import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/use-auth";
import { useGetDashboard } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PnLBadge } from "@/components/pnl-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Wallet, Activity, Briefcase, TrendingUp } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function Dashboard() {
  const { user } = useAuth();
  const { data: dashboard, isLoading } = useGetDashboard();

  if (isLoading || !dashboard) {
    return (
      <Layout>
        <div className="space-y-6 animate-pulse">
          <Skeleton className="h-8 w-48" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-32 w-full rounded-xl" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Skeleton className="h-96 w-full rounded-xl" />
            <Skeleton className="h-96 w-full rounded-xl" />
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Welcome back, {user?.fullName?.split(' ')[0]}</h1>
          <p className="text-muted-foreground">Here's your trading performance overview.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Available Margin</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">₹{dashboard.balance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total P&L</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                <PnLBadge amount={dashboard.totalPnl} showPercent percentValue={(dashboard.totalPnl / user!.initialCapital) * 100} />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Portfolio Value</CardTitle>
              <Briefcase className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">₹{dashboard.portfolioValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
              <p className="text-xs text-muted-foreground mt-1">Open Positions: {dashboard.openPositionsCount}</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboard.winRate.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground mt-1">From {dashboard.totalTrades} total trades</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent Trades</CardTitle>
            </CardHeader>
            <CardContent>
              {dashboard.recentTrades && dashboard.recentTrades.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Instrument</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">P&L</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dashboard.recentTrades.map((trade) => (
                        <TableRow key={trade.id}>
                          <TableCell>
                            <div className="font-medium">{trade.symbol}</div>
                            <div className="text-xs text-muted-foreground">{trade.strikePrice} {trade.optionType}</div>
                          </TableCell>
                          <TableCell>
                            <span className={`uppercase text-xs font-bold ${trade.action === 'buy' ? 'text-blue-500' : 'text-orange-500'}`}>
                              {trade.action}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">{trade.quantity}</TableCell>
                          <TableCell className="text-right">
                            {trade.pnl !== null && trade.pnl !== undefined ? (
                              <PnLBadge amount={trade.pnl} />
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <p className="text-muted-foreground">No recent trades found.</p>
                </div>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Open Positions</CardTitle>
            </CardHeader>
            <CardContent>
              {dashboard.openPositions && dashboard.openPositions.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Instrument</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Avg Price</TableHead>
                        <TableHead className="text-right">LTP</TableHead>
                        <TableHead className="text-right">Unrealized P&L</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dashboard.openPositions.map((position) => (
                        <TableRow key={position.id}>
                          <TableCell>
                            <div className="font-medium">{position.symbol}</div>
                            <div className="text-xs text-muted-foreground">{position.strikePrice} {position.optionType}</div>
                          </TableCell>
                          <TableCell className="text-right">{position.quantity}</TableCell>
                          <TableCell className="text-right font-mono">₹{position.averagePrice.toFixed(2)}</TableCell>
                          <TableCell className="text-right font-mono">₹{position.currentPrice.toFixed(2)}</TableCell>
                          <TableCell className="text-right">
                            <PnLBadge amount={position.unrealizedPnl} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <p className="text-muted-foreground">No open positions.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}