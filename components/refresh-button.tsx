"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

type Status = "idle" | "refreshing" | "done" | "error";

/**
 * Re-runs the real collector for every tracked source behind `mpns`, right now, instead of
 * waiting for the next 6-hourly cron tick - a live scrape, not just a re-read of whatever's
 * already in the database. Goes through POST /api/ingest/refresh -> ingestSourceTarget(), the
 * exact same validate-or-incident pipeline the cron uses, so a bad page still opens an
 * incident here rather than showing stale or fabricated data.
 *
 * Deliberately does not trigger a heal. Healing regenerates a collector's extraction logic
 * from an AI description of what broke - that's a template-authoring action gated behind the
 * four gates in domain/gates.ts, not a same-click data refresh, and Bright Data has no HTTP
 * equivalent to `bdata scraper heal` verified working from this app yet (only run and search
 * have one). A source that's actually broken surfaces here as a fresh incident, same as it
 * would from the cron - visible on /dashboard/sources, healed from there or from the CI loop.
 */
export function RefreshButton({ mpns }: { mpns: string[] }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    setStatus("refreshing");
    setMessage(null);
    try {
      const res = await fetch("/api/ingest/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mpns }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Refresh failed");
      const { total, ok } = body.summary as { total: number; ok: number };
      setMessage(ok === total ? `${ok}/${total} sources updated` : `${ok}/${total} updated - ${total - ok} opened an incident`);
      setStatus("done");
      router.refresh();
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Refresh failed");
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" onClick={refresh} disabled={status === "refreshing"}>
        <RefreshCw className={`size-3.5 ${status === "refreshing" ? "animate-spin" : ""}`} />
        {status === "refreshing" ? "Scraping live…" : "Refresh data"}
      </Button>
      {message && (
        <span className={`text-xs ${status === "error" ? "text-destructive" : "text-muted-foreground"}`}>{message}</span>
      )}
    </div>
  );
}
