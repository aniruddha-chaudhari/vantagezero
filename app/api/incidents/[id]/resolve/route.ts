import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveIncident } from "@/db/incidents";
import { requireIngestToken } from "@/lib/api-auth";

const bodySchema = z.object({
  gateResultsJson: z.unknown().optional(),
  healPrompt: z.string().optional(),
  resolution: z.enum(["auto_approved", "auto_rejected", "human_approved", "human_rejected"]),
  status: z.enum(["resolved", "rejected", "awaiting_approval", "open"]),
  triggeredBy: z.enum(["cron", "manual"]).optional(),
});

/**
 * CI writes the gate decision back here. On approval this re-runs the collector via the
 * same ingestSourceTarget every other ingestion path uses - "approved" always means
 * "re-verified," never just "marked approved."
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const authError = requireIngestToken(request);
  if (authError) return authError;

  const { id } = await context.params;
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const result = await resolveIncident(id, parsed.data);
    return NextResponse.json({ incident: result.incident, reingestResult: result.reingestResult });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
