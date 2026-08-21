import { z } from "zod";

import { buildFoldedTrackedIndex, findTrackedEquivalent, fold } from "./mpn-matching";

/** Beyond this many categories the guided wizard stops being scannable. */
export const CATEGORY_CAP = 8;
const MAX_SUGGESTED_CANDIDATES = 2;

const candidateSchema = z.object({
  mpn: z.string().min(1),
  rationale: z.string().min(1),
});

export const designCategorySchema = z.object({
  label: z.string().min(1),
  requirement: z.string().min(1),
  qtyPerUnit: z.coerce.number().int().positive().catch(1),
  criticality: z.enum(["critical", "important", "optional"]).catch("important"),
  /** The model's own attempt at naming a tracked part - reconcileWithCatalog re-derives the real answer. */
  trackedMatch: candidateSchema.nullish(),
  /** Real, named part numbers from the model's own knowledge - unverified until resolved. */
  suggestedCandidates: z.array(candidateSchema).catch([]),
});

export const designExtractionSchema = z.object({
  buildSummary: z.string().min(1),
  suggestedBuildName: z.string().min(1),
  categories: z.array(designCategorySchema).min(1),
});

export type DesignCandidate = z.infer<typeof candidateSchema>;
export type DesignCategory = z.infer<typeof designCategorySchema>;
export type DesignExtraction = z.infer<typeof designExtractionSchema>;

/** `tracked` is only ever true once it's been checked against the real catalog - never the model's say-so. */
export interface ReconciledCandidate extends DesignCandidate {
  tracked: boolean;
}

export interface ReconciledCategory extends Omit<DesignCategory, "trackedMatch" | "suggestedCandidates"> {
  trackedMatch: ReconciledCandidate | null;
  suggestedCandidates: ReconciledCandidate[];
}

export interface ReconciledExtraction extends Omit<DesignExtraction, "categories"> {
  categories: ReconciledCategory[];
  /** True if the model returned more categories than CATEGORY_CAP and some were dropped. */
  truncated: boolean;
}

/**
 * The model is told to only set trackedMatch when a real tracked part fits, and to name
 * suggestedCandidates only when nothing tracked does - but it can still get either wrong: it
 * can claim a "tracked" match that isn't in the real list, miss a genuine tracked match
 * because its spelling differs from the list it was given, or bury a second genuinely tracked
 * part inside its "suggestions" once it already picked a different one as the primary match.
 *
 * Every candidate the model produced for a category - its trackedMatch attempt and every
 * suggestion - gets checked against the real tracked set here, independently, using the
 * catalog's exact MPN string on a hit so downstream lookups by MPN succeed. The first real
 * match becomes the category's primary trackedMatch; any *other* candidate that also turns
 * out to be genuinely tracked keeps its own `tracked: true` flag rather than being flattened
 * into "unverified" just because it wasn't first. Nothing the model calls "tracked" is ever
 * trusted without this check.
 */
export function reconcileWithCatalog(parsed: DesignExtraction, trackedMpns: Set<string>): ReconciledExtraction {
  const foldedTracked = buildFoldedTrackedIndex(trackedMpns);

  const categories = parsed.categories.map((category) => {
    const attempts = [...(category.trackedMatch ? [category.trackedMatch] : []), ...category.suggestedCandidates];

    const seen = new Set<string>();
    const deduped = attempts.filter((c) => {
      const key = fold(c.mpn);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const resolved: ReconciledCandidate[] = deduped.map((c) => {
      const real = findTrackedEquivalent(c.mpn, foldedTracked);
      return real ? { mpn: real, rationale: c.rationale, tracked: true } : { mpn: c.mpn, rationale: c.rationale, tracked: false };
    });

    const trackedIndex = resolved.findIndex((c) => c.tracked);
    const trackedMatch = trackedIndex >= 0 ? resolved[trackedIndex] : null;
    const suggestedCandidates = resolved.filter((_, i) => i !== trackedIndex).slice(0, MAX_SUGGESTED_CANDIDATES);

    return { ...category, trackedMatch, suggestedCandidates };
  });

  const truncated = categories.length > CATEGORY_CAP;
  return { ...parsed, categories: categories.slice(0, CATEGORY_CAP), truncated };
}
