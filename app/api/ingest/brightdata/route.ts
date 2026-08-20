import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { ingestSourceTarget } from "@/brightdata/ingestion";
import { db } from "@/db/client";
import { sourceTargets } from "@/db/schema";
import { requireIngestToken } from "@/lib/api-auth";

/** Runs sequentially and can take minutes for a large catalog - extend the function timeout. */
export const maxDuration = 300;

/**
 * Internal trigger endpoint - the only thing the CI cron (or a future judge-triggered
 * run) is allowed to call. It only ever runs the same ingestSourceTarget() function
 * the CLI script uses; it can never create, heal, or approve a collector (master-plan
 * v3 terminal/app boundary - Vantage never manages collectors).
 */
export async function POST(request: Request) {
  const authError = requireIngestToken(request);
  if (authError) return authError;

  const body = await request.json().catch(() => ({}));

  if (body?.sourceTargetId) {
    const result = await ingestSourceTarget(body.sourceTargetId, { triggeredBy: "judge" });
    return NextResponse.json({ results: [result] });
  }

  if (body?.all) {
    const targets = await db
      .select({ id: sourceTargets.id })
      .from(sourceTargets)
      .where(eq(sourceTargets.enabled, true));

    const results = [];
    for (const target of targets) {
      results.push(await ingestSourceTarget(target.id, { triggeredBy: "cron" }));
    }

    return NextResponse.json({
      results,
      summary: { total: results.length, ok: results.filter((r) => r.ok).length },
    });
  }

  return NextResponse.json({ error: "Body must include either { sourceTargetId } or { all: true }" }, { status: 400 });
}
