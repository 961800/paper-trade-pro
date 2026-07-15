import React, { useState } from "react";
import { Layout } from "@/components/layout";
import { useGetAdminUsers } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PnLBadge } from "@/components/pnl-badge";
import { Users, Search, TrendingUp, Wallet, Landmark, Briefcase } from "lucide-react";

function fmt(n: number) {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export default function AdminUsers() {
  const { data, isLoading } = useGetAdminUsers({ query: { queryKey: ["/api/admin/users"] } });
  const [search, setSearch] = useState("");

  const users = data?.users ?? [];
  const filtered = users.filter(
    (u) =>
      u.fullName.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()),
  );

  const totalPortfolio = users.reduce((s, u) => s + u.portfolioValue, 0);
  const totalCapital = users.reduce((s, u) => s + u.initialCapital, 0);
  const totalPnl = users.reduce((s, u) => s + u.totalPnl, 0);

  return (
    <Layout>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Users className="w-6 h-6" /> Users &amp; Auth
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              {users.length} registered trader{users.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {/* Aggregate stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Users className="w-3 h-3" /> Total Users
              </p>
              <p className="text-xl font-bold mt-1">{users.length}</p>
            </CardContent>
          </Card>
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> Total Portfolio
              </p>
              <p className="text-xl font-bold mt-1">{fmt(totalPortfolio)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Landmark className="w-3 h-3" /> Total Capital
              </p>
              <p className="text-xl font-bold mt-1">{fmt(totalCapital)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Wallet className="w-3 h-3" /> Total P&amp;L
              </p>
              <div className="mt-1">
                <PnLBadge amount={totalPnl} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* User table */}
        <Card>
          <CardHeader className="py-3 px-4 border-b border-border">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Users</CardTitle>
              <div className="relative w-56">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search users"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-8 text-xs"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="py-12 text-center text-muted-foreground text-sm">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">No users found</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                      <th className="text-left px-4 py-2.5 font-medium">User</th>
                      <th className="text-right px-4 py-2.5 font-medium">Initial Capital</th>
                      <th className="text-right px-4 py-2.5 font-medium">Cash Balance</th>
                      <th className="text-right px-4 py-2.5 font-medium">Portfolio Value</th>
                      <th className="text-right px-4 py-2.5 font-medium">Total P&amp;L</th>
                      <th className="text-right px-4 py-2.5 font-medium">Open Positions</th>
                      <th className="text-right px-4 py-2.5 font-medium">Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((u, i) => (
                      <tr
                        key={u.id}
                        className={`border-b border-border last:border-0 hover:bg-muted/20 transition-colors ${i % 2 === 0 ? "" : "bg-muted/10"}`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                              {u.fullName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium leading-tight">{u.fullName}</p>
                              <p className="text-xs text-muted-foreground">{u.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmt(u.initialCapital)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmt(u.balance)}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium">{fmt(u.portfolioValue)}</td>
                        <td className="px-4 py-3 text-right">
                          <PnLBadge amount={u.totalPnl} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          {u.openPositionsCount > 0 ? (
                            <span className="inline-flex items-center gap-1 text-xs bg-blue-500/10 text-blue-400 rounded px-1.5 py-0.5">
                              <Briefcase className="w-3 h-3" /> {u.openPositionsCount}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                          {new Date(u.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
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
