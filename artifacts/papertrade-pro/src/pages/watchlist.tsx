import React from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";

export default function Watchlist() {
  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Watchlist</h1>
          <p className="text-muted-foreground">Track instruments you are interested in.</p>
        </div>

        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Watchlist page is being built...
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}