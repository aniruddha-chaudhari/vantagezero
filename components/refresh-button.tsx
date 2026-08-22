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
 * Healing itself still can't run inside this app - `bdata scraper heal` needs a writable
 * filesystem and package resolution at request time, and Next.js sets NEXT_RUNTIME in every
 * request context, dev or deployed, so there's no "just spawn the CLI" option here the way a
 * plain script has. So a failure that's genuinely heal-worthy (a missing/null field, not an
 * identity mismatch or a page that's gone) dispatches the real GitHub Actions Heal workflow -
 * the same one the Collect cron triggers automatically - scoped to just that source target.
 * Same eligibility rule as production: heal-eligible incident type, not healed in the last
 * 24h, at least two consecutive failures. See lib/github.ts and db/incidents.ts.
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
      const { total, ok, healsTriggered } = body.summary as { total: number; ok: number; healsTriggered: number };
      const parts = [ok === total ? `${ok}/${total} sources updated` : `${ok}/${total} updated - ${total - ok} opened an incident`];
      if (healsTriggered > 0) parts.push(`heal triggered in CI for ${healsTriggered}`);
      setMessage(parts.join(" — "));
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
