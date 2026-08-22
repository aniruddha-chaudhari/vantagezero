import { NextResponse } from "next/server";

import { listOpenIncidentsForHealing } from "@/db/incidents";
import { getSourceTargetIdsForMpns } from "@/db/queries";
import { requireIngestToken } from "@/lib/api-auth";

/** Read-only: the heal loop's candidate list, with rate-discipline facts already computed. */
export async function GET(request: Request) {
  const authError = requireIngestToken(request);
  if (authError) return authError;

  const mpns = new URL(request.url).searchParams
    .get("mpns")
    ?.split(",")
    .map((mpn) => mpn.trim())
    .filter(Boolean);
  const sourceTargets = mpns?.length ? await getSourceTargetIdsForMpns(mpns) : undefined;
  const sourceTargetIds = sourceTargets?.map((target) => target.id);
  const incidents = await listOpenIncidentsForHealing(sourceTargetIds);
  return NextResponse.json({ incidents });
}
