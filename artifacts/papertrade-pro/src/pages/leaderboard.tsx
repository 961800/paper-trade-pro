import React from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";

export default function Leaderboard() {
  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Leaderboard</h1>
          <p className="text-muted-foreground">See how you rank against other traders.</p>
        </div>

        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Leaderboard page is being built...
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}