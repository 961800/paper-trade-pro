import React from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";

export default function Positions() {
  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Positions</h1>
          <p className="text-muted-foreground">Manage your open trades and view closed positions.</p>
        </div>

        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Positions page is being built...
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}