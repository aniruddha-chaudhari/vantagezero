import { NextResponse } from "next/server";
import { z } from "zod";

import { searchCatalogCandidates } from "@/db/catalog";

const bodySchema = z.object({ mpn: z.string().min(1) });

/** Same-origin UI action from the Build Detail page - a judge searching for their own untracked part. */
export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "mpn is required" }, { status: 400 });
  }

  try {
    const candidates = await searchCatalogCandidates(parsed.data.mpn.trim());
    return NextResponse.json({ candidates });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
