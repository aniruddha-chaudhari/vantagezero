import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db/client";
import { bomItems } from "@/db/schema";

const bodySchema = z.object({
  bomItemId: z.string().uuid(),
  newMpn: z.string().min(1),
});

/**
 * Swaps one BOM line's part number - the deliberate, explicit action AlternativeParts'
 * suggestions never take on their own (see that component's own "never a recommendation to
 * swap without engineering review" caveat). This route is the review: a human looked at the
 * tradeoff text and chose to replace, part by part, build by build - never a bulk find/replace
 * across every build referencing the old MPN.
 *
 * Same-origin UI action, like /api/incidents/[id]/approve - no bearer token.
 *
 * Does not itself verify newMpn resolves to live data - pair with ResolvePart first (or use
 * an already-tracked candidate) so the swapped-in part isn't silently unmonitored.
 */
export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "bomItemId and newMpn are required" }, { status: 400 });
  }

  const { bomItemId, newMpn } = parsed.data;

  const [existing] = await db.select().from(bomItems).where(eq(bomItems.id, bomItemId)).limit(1);
  if (!existing) {
    return NextResponse.json({ error: "BOM line not found" }, { status: 404 });
  }

  const [updated] = await db
    .update(bomItems)
    .set({ mpn: newMpn.trim().toUpperCase(), manufacturer: null, monitored: true })
    .where(eq(bomItems.id, bomItemId))
    .returning();

  return NextResponse.json({ bomItem: updated });
}
