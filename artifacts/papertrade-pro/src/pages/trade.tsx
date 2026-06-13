import React from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";

export default function Trade() {
  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Trade Options</h1>
          <p className="text-muted-foreground">Place orders and calculate position sizing.</p>
        </div>

        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Trade page is being built...
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}