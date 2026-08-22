"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

type Status = "idle" | "triggering" | "done" | "error";

/**
 * Triggers a real scrape for every tracked source behind `mpns`, right now, instead of
 * waiting for the next 6-hourly cron tick - via POST /api/ingest/refresh, which dispatches
 * the actual GitHub Actions Collect workflow scoped to these MPNs.
 *
 * Does not run the scrape inline and does not wait for a result: an earlier version called
 * ingestSourceTarget() synchronously in the API route, which worked for one source but hit
 * Vercel's function timeout on a multi-source refresh (scraping takes as long as it takes; a
 * serverless request has a ceiling the Actions runner doesn't). So this only confirms the
 * trigger succeeded - the actual data lands a little later, visible on the Actions tab and
 * then on this page after a manual reload.
 *
 * A genuinely heal-worthy failure from the triggered run - a missing/null field, not an
 * identity mismatch - gets healed automatically too: a completed Collect run already triggers
 * the Heal workflow via workflow_run, same as the real cron.
 */
export function RefreshButton({ mpns }: { mpns: string[] }) {
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function trigger() {
    setStatus("triggering");
    setMessage(null);
    try {
      const res = await fetch("/api/ingest/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mpns }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not trigger a refresh");
      setMessage(`Triggered for ${body.sourceCount} source(s) — check the Actions tab, then reload in ~30-60s`);
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Could not trigger a refresh");
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" onClick={trigger} disabled={status === "triggering"}>
        <RefreshCw className={`size-3.5 ${status === "triggering" ? "animate-spin" : ""}`} />
        {status === "triggering" ? "Triggering…" : "Refresh data"}
      </Button>
      {message && (
        <span className={`text-xs ${status === "error" ? "text-destructive" : "text-muted-foreground"}`}>{message}</span>
      )}
    </div>
  );
}
