"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * The one write action Vantage's UI is allowed to take on a collector (§4): approving or
 * rejecting an incident that the heal loop already escalated. Never creates, prompts, or
 * heals anything itself.
 */
export function IncidentApproval({ incidentId }: { incidentId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(reject: boolean) {
    setPending(reject ? "reject" : "approve");
    setError(null);
    try {
      const res = await fetch(`/api/incidents/${incidentId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reject }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Action failed");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" disabled={pending !== null} onClick={() => act(false)}>
        {pending === "approve" ? "Approving…" : "Approve"}
      </Button>
      <Button size="sm" variant="destructive" disabled={pending !== null} onClick={() => act(true)}>
        {pending === "reject" ? "Rejecting…" : "Reject"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
