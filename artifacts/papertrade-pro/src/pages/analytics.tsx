import React from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";

export default function Analytics() {
  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground">Deep dive into your trading performance.</p>
        </div>

        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Analytics page is being built...
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}