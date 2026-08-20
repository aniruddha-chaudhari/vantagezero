import { NextResponse } from "next/server";

import { getLatestValidSnapshot } from "@/db/incidents";
import { requireIngestToken } from "@/lib/api-auth";

/** Gate 3 (continuity) needs this: the last valid observation to compare a healed preview against. */
export async function GET(request: Request) {
  const authError = requireIngestToken(request);
  if (authError) return authError;

  const sourceTargetId = new URL(request.url).searchParams.get("source_target_id");
  if (!sourceTargetId) {
    return NextResponse.json({ error: "source_target_id query param is required" }, { status: 400 });
  }

  const snapshot = await getLatestValidSnapshot(sourceTargetId);
  if (!snapshot) {
    return NextResponse.json({ error: `source target ${sourceTargetId} not found` }, { status: 404 });
  }

  return NextResponse.json(snapshot);
}
