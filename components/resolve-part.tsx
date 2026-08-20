"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

interface Candidate {
  sourceName: string;
  url: string;
  title: string | null;
}

type Status = "idle" | "searching" | "results" | "resolving" | "done" | "error";

/**
 * The "ceiling" resolution flow for an untracked BOM line: search Bright Data's Web Search
 * API for candidate product pages, let the judge confirm one, then run the real PDP collector
 * on it. A wrong pick is caught the same way catalog seeding is - by identity validation.
 */
export function ResolvePart({ mpn }: { mpn: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  async function search() {
    setStatus("searching");
    setMessage(null);
    try {
      const res = await fetch("/api/catalog/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mpn }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Search failed");
      if (body.candidates.length === 0) {
        setStatus("error");
        setMessage("No candidates found on RS Online or element14.");
        return;
      }
      setCandidates(body.candidates);
      setStatus("results");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Search failed");
    }
  }

  async function confirm(candidate: Candidate) {
    setStatus("resolving");
    setMessage(null);
    try {
      const res = await fetch("/api/catalog/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mpn, sourceName: candidate.sourceName, url: candidate.url }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Resolve failed");
      if (!body.result.ok) {
        setStatus("error");
        setMessage(`${candidate.sourceName} extraction failed: ${body.result.detail}`);
        return;
      }
      setStatus("done");
      router.refresh();
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Resolve failed");
    }
  }

  if (status === "idle") {
    return (
      <Button size="sm" variant="outline" onClick={search}>
        Search for this part
      </Button>
    );
  }

  if (status === "searching") {
    return <p className="text-xs text-muted-foreground">Searching RS Online and element14…</p>;
  }

  if (status === "resolving") {
    return <p className="text-xs text-muted-foreground">Fetching live data…</p>;
  }

  if (status === "done") {
    return <p className="text-xs text-chart-4">Resolved.</p>;
  }

  if (status === "results") {
    return (
      <div className="space-y-1.5">
        {candidates.map((c) => (
          <div key={c.sourceName} className="flex items-center gap-2 text-xs">
            <span className="w-20 shrink-0 font-medium">{c.sourceName}</span>
            <span className="max-w-[220px] truncate text-muted-foreground">{c.title ?? c.url}</span>
            <Button size="sm" variant="outline" onClick={() => confirm(c)}>
              Use this
            </Button>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <p className="text-xs text-destructive">{message}</p>
      <Button size="sm" variant="outline" onClick={search}>
        Try again
      </Button>
    </div>
  );
}
