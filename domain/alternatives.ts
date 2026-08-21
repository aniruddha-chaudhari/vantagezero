import { z } from "zod";

import { buildFoldedTrackedIndex, findTrackedEquivalent, fold } from "./mpn-matching";

const MAX_CANDIDATES = 3;

const alternativeCandidateSchema = z.object({
  mpn: z.string().min(1),
  rationale: z.string().min(1),
  /** Required, not optional - the model must always state the compatibility risk, even if "none found". */
  tradeoff: z.string().min(1),
});

export const alternativesSchema = z.object({
  candidates: z.array(alternativeCandidateSchema).catch([]),
});

export type AlternativeCandidate = z.infer<typeof alternativeCandidateSchema>;
export type AlternativesResult = z.infer<typeof alternativesSchema>;

export interface ReconciledAlternative extends AlternativeCandidate {
  tracked: boolean;
}

export interface ReconciledAlternatives {
  candidates: ReconciledAlternative[];
}

/**
 * Same reconciliation discipline as domain/design.ts's reconcileWithCatalog: every candidate
 * checked independently against the real tracked set, never the model's say-so. The focal
 * part itself is filtered out here too - a part is never its own alternative, even if the
 * model's fuzzy spelling of it would otherwise pass the fold-match check.
 */
export function reconcileAlternatives(parsed: AlternativesResult, trackedMpns: Set<string>, focalMpn: string): ReconciledAlternatives {
  const foldedTracked = buildFoldedTrackedIndex(trackedMpns);
  const focalFold = fold(focalMpn);

  const seen = new Set<string>();
  const deduped = parsed.candidates.filter((c) => {
    const key = fold(c.mpn);
    if (key === focalFold || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const candidates: ReconciledAlternative[] = deduped.slice(0, MAX_CANDIDATES).map((c) => {
    const real = findTrackedEquivalent(c.mpn, foldedTracked);
    return real
      ? { mpn: real, rationale: c.rationale, tradeoff: c.tradeoff, tracked: true }
      : { mpn: c.mpn, rationale: c.rationale, tradeoff: c.tradeoff, tracked: false };
  });

  return { candidates };
}
