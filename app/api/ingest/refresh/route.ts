import { NextResponse } from "next/server";
import { z } from "zod";

import { getSourceTargetIdsForMpns } from "@/db/queries";
import { dispatchCollectWorkflow } from "@/lib/github";

const bodySchema = z.object({ mpns: z.array(z.string().min(1)).min(1).max(20) });

/**
 * "Refresh data" on a component or build page. Dispatches the real GitHub Actions Collect
 * workflow, scoped to just these MPNs, instead of scraping inline.
 *
 * It used to run ingestSourceTarget() synchronously in this route. That worked for one
 * source, but a multi-source refresh genuinely took over two minutes against live Bright
 * Data and hit Vercel's hard function timeout (FUNCTION_INVOCATION_TIMEOUT - a platform HTML
 * error page, not JSON, which is what showed up client-side as "Unexpected token 'A' ... is
 * not valid JSON"). Scraping takes as long as it takes; a serverless request has a ceiling.
 * The Actions runner doesn't, so collection belongs there - the same conclusion this project
 * already reached for the 6-hourly cron.
 *
 * This also means the response is immediate and doesn't carry results - the caller points the
 * user at the Actions tab instead of blocking on one. And because a completed Collect run
 * already triggers Heal automatically via workflow_run (proven working), a genuinely
 * heal-worthy failure from this scoped run gets healed the same way a full cron cycle would -
 * no separate heal-dispatch needed here.
 */
export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "mpns must be a non-empty array of strings (max 20)" }, { status: 400 });
  }

  const targets = await getSourceTargetIdsForMpns(parsed.data.mpns);
  if (targets.length === 0) {
    return NextResponse.json({ error: "No trackable sources found for the given parts" }, { status: 404 });
  }

  const dispatched = await dispatchCollectWorkflow(parsed.data.mpns);
  if (!dispatched) {
    return NextResponse.json({ error: "Could not trigger the Collect workflow (GITHUB_TOKEN not configured?)" }, { status: 502 });
  }

  return NextResponse.json({ triggered: true, sourceCount: targets.length });
}
