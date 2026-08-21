import { NextResponse } from "next/server";
import { z } from "zod";

import { listCatalog } from "@/db/analytics";
import { alternativesSchema, reconcileAlternatives } from "@/domain/alternatives";
import { suggestAlternativeParts } from "@/lib/groq";

const bodySchema = z.object({
  mpn: z.string().min(1),
});

/** Suggests possible substitutes for one part - never asserts one is safe to swap in. */
export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json(
      { error: "AI-assisted alternative-part suggestions aren't configured on this deployment (missing GROQ_API_KEY)." },
      { status: 503 },
    );
  }

  try {
    const catalog = await listCatalog();
    const normalized = parsed.data.mpn.trim().toUpperCase();
    const focal = catalog.find((c) => c.mpn.trim().toUpperCase() === normalized);

    const raw = await suggestAlternativeParts({
      mpn: parsed.data.mpn,
      manufacturer: focal?.manufacturer ?? null,
      package: focal?.package ?? null,
      marketingStatus: focal?.marketingStatus ?? null,
      trackedCatalog: catalog
        .filter((c) => c.mpn.trim().toUpperCase() !== normalized)
        .map((c) => ({ mpn: c.mpn, manufacturer: c.manufacturer, package: c.package, marketingStatus: c.marketingStatus })),
    });

    const result = alternativesSchema.safeParse(raw);
    if (!result.success) {
      return NextResponse.json({ error: "Could not generate alternative-part suggestions - try again." }, { status: 502 });
    }

    const trackedMpns = new Set(catalog.map((c) => c.mpn));
    const reconciled = reconcileAlternatives(result.data, trackedMpns, parsed.data.mpn);

    // Full catalog entries so the client can render real stock/price/lifecycle for any
    // candidate that turned out to be tracked - never re-derived from the model's output.
    return NextResponse.json({ ...reconciled, catalog });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
