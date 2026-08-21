"use client";

import { useState } from "react";
import Link from "next/link";
import { CircleAlert, Loader2, Sparkles } from "lucide-react";

import { CandidateOptionTile, type ClientCatalogEntry } from "@/components/candidate-option-tile";
import { ResolvePart } from "@/components/resolve-part";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface AlternativeCandidate {
  mpn: string;
  rationale: string;
  tradeoff: string;
  tracked: boolean;
}

type Status = "idle" | "loading" | "results" | "error";

/**
 * Suggests possible substitutes for one part. Never asserts a swap is safe - every result set
 * carries a permanent, hardcoded caveat rather than trusting the model to remember to add
 * one. A manual trigger (like ResolvePart's search button) since this costs a real Groq call;
 * it doesn't fire on page load.
 */
export function AlternativeParts({ mpn }: { mpn: string }) {
  const [status, setStatus] = useState<Status>("idle");
  const [candidates, setCandidates] = useState<AlternativeCandidate[]>([]);
  const [catalog, setCatalog] = useState<ClientCatalogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const catalogByMpn = new Map(catalog.map((c) => [c.mpn, c]));

  async function findAlternatives() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/design/alternatives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mpn }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not find alternatives");
      if (body.candidates.length === 0) {
        setStatus("error");
        setError("No plausible alternatives came back for this part.");
        return;
      }
      setCandidates(body.candidates);
      setCatalog(body.catalog);
      setStatus("results");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Alternative parts</CardTitle>
        <CardDescription>
          Possible substitutes based on this part&apos;s specs - matched against tracked data where
          possible, never a recommendation to swap without engineering review.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {status === "idle" && (
          <Button size="sm" variant="outline" onClick={findAlternatives}>
            <Sparkles className="size-3.5" />
            Find alternative parts
          </Button>
        )}

        {status === "loading" && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Looking for possible substitutes…
          </p>
        )}

        {status === "error" && (
          <div className="space-y-2">
            <p className="flex items-start gap-1.5 text-xs text-destructive">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
              {error}
            </p>
            <Button size="sm" variant="outline" onClick={findAlternatives}>
              Try again
            </Button>
          </div>
        )}

        {status === "results" && (
          <div className="space-y-2.5">
            {candidates.map((candidate) => (
              <CandidateOptionTile
                key={candidate.mpn}
                mpn={candidate.mpn}
                rationale={candidate.rationale}
                entry={candidate.tracked ? catalogByMpn.get(candidate.mpn) : undefined}
                unverified={!candidate.tracked}
                footer={
                  <div className="mt-2 space-y-2 border-t pt-2">
                    <p className="text-[10px] leading-4 text-muted-foreground">
                      <span className="font-semibold text-foreground">Tradeoff:</span> {candidate.tradeoff}
                    </p>
                    {candidate.tracked ? (
                      <Link
                        href={`/dashboard/components/${encodeURIComponent(candidate.mpn)}`}
                        className="text-[11px] font-medium text-primary hover:underline"
                      >
                        View this part →
                      </Link>
                    ) : (
                      <ResolvePart mpn={candidate.mpn} />
                    )}
                  </div>
                }
              />
            ))}
            <p className="pt-1 text-[11px] font-medium text-muted-foreground">
              Potential alternative - engineering approval required.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
