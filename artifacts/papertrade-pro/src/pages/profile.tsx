import React from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";

export default function Profile() {
  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
          <p className="text-muted-foreground">Manage your personal details and risk settings.</p>
        </div>

        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Profile page is being built...
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}