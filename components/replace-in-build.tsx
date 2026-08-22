"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

export interface BuildUsingPart {
  id: string;
  name: string;
  bomItemId: string;
}

type Status = "idle" | "replacing" | "done" | "error";

/**
 * The explicit human action AlternativeParts' own caveat calls for: "never a recommendation
 * to swap without engineering review." Nothing here happens automatically - a person picks
 * one build's BOM line and one candidate part, and only that line changes. Never a bulk
 * find/replace across every build referencing the original MPN.
 *
 * Rendered only once the candidate part is verified tracked (already tracked, or resolved via
 * ResolvePart in this session) - replacing in with an unverified MPN would silently produce an
 * unmonitored BOM line with no live data behind it.
 */
export function ReplaceInBuild({ candidateMpn, builds }: { candidateMpn: string; builds: BuildUsingPart[] }) {
  const router = useRouter();
  const [selectedBomItemId, setSelectedBomItemId] = useState(builds[0]?.bomItemId ?? "");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);

  if (builds.length === 0) return null;

  const selectedBuild = builds.find((b) => b.bomItemId === selectedBomItemId);

  async function replace() {
    if (!selectedBomItemId) return;
    setStatus("replacing");
    setMessage(null);
    try {
      const res = await fetch("/api/bom-items/replace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bomItemId: selectedBomItemId, newMpn: candidateMpn }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Replace failed");
      setStatus("done");
      router.refresh();
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Replace failed");
    }
  }

  if (status === "done" && selectedBuild) {
    return (
      <Link href={`/dashboard/builds/${selectedBuild.id}`} className="text-xs font-medium text-chart-4 hover:underline">
        Replaced in {selectedBuild.name} — view build →
      </Link>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {builds.length > 1 ? (
        <select
          value={selectedBomItemId}
          onChange={(e) => setSelectedBomItemId(e.target.value)}
          className="h-8 rounded-md border bg-background px-2 text-xs"
        >
          {builds.map((b) => (
            <option key={b.bomItemId} value={b.bomItemId}>
              {b.name}
            </option>
          ))}
        </select>
      ) : (
        <span className="text-xs text-muted-foreground">in {builds[0].name}</span>
      )}
      <Button size="sm" variant="outline" disabled={status === "replacing"} onClick={replace}>
        {status === "replacing" ? "Replacing…" : "Replace in this build"}
      </Button>
      {status === "error" && <p className="text-xs text-destructive">{message}</p>}
    </div>
  );
}
