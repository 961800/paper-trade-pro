import React from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";

export default function Orders() {
  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Order Book</h1>
          <p className="text-muted-foreground">View and manage all your pending and executed orders.</p>
        </div>

        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Orders page is being built...
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}