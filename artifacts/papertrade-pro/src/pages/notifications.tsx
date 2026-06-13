import React from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";

export default function Notifications() {
  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
          <p className="text-muted-foreground">Alerts and updates about your account.</p>
        </div>

        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Notifications page is being built...
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}