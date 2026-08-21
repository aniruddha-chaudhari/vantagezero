"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl">
      <Card className="border-destructive/20">
        <CardHeader className="items-center text-center">
          <TriangleAlert className="size-8 text-destructive" />
          <CardTitle className="mt-2 text-lg">Something went wrong</CardTitle>
          <CardDescription>
            This screen couldn&apos;t load its data. Nothing about your builds has changed - try
            again, or come back in a moment.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3">
          <Button onClick={() => reset()}>Try again</Button>
          {error.digest && <p className="font-mono text-[11px] text-muted-foreground">ref {error.digest}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
