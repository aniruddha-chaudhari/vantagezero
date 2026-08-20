import { NextResponse } from "next/server";
import { z } from "zod";

import { approveIncidentHeal } from "@/db/incidents";

const bodySchema = z.object({ reject: z.boolean().default(false) });

/**
 * The one exception to "Vantage never manages collectors" (§4): a human approving or
 * rejecting an already-escalated incident from the Scraper Health screen. Called directly
 * from the browser (no bearer token) - unlike the CI-facing routes, this is same-origin UI
 * action, not an external automation credential.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const json = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const result = await approveIncidentHeal(id, { reject: parsed.data.reject });
    return NextResponse.json({ incident: result.incident, reingestResult: result.reingestResult });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
