export interface HealQueueCandidate {
  id: string;
  sourceTargetId: string;
  collectorId: string | null;
  incidentType: string;
  openedAt: string;
  eligibleForAutoHeal: boolean;
}

interface SelectHealCandidatesOptions {
  force: boolean;
  sourceTargetId?: string;
  maxIncidents?: number;
}

/**
 * Produces a deterministic, collector-safe work queue.
 *
 * One collector can have several open incidents for the same broken extraction. Bright
 * Data only permits one refactor job for that collector, so treating every incident as a
 * separate heal causes the later calls to collide with the first. The oldest incident owns
 * the heal; newer duplicates remain open and become cooldown-ineligible once it completes.
 */
export function selectHealCandidates<T extends HealQueueCandidate>(
  incidents: T[],
  options: SelectHealCandidatesOptions,
): T[] {
  const healableTypes = new Set(["SCHEMA_VALIDATION_FAILED", "MISSING_REQUIRED_FIELD", "SEMANTIC_SANITY_FAILED"]);
  const identityBlockedTargets = new Set(
    incidents
      .filter((incident) => incident.incidentType === "PART_IDENTITY_MISMATCH")
      .map((incident) => incident.sourceTargetId),
  );

  const ordered = incidents
    .filter((incident) => incident.collectorId != null)
    .filter((incident) => !options.sourceTargetId || incident.sourceTargetId === options.sourceTargetId)
    .filter((incident) => healableTypes.has(incident.incidentType))
    .filter((incident) => !identityBlockedTargets.has(incident.sourceTargetId))
    .filter((incident) => options.force || incident.eligibleForAutoHeal)
    .sort((a, b) => new Date(a.openedAt).getTime() - new Date(b.openedAt).getTime());

  const seenCollectors = new Set<string>();
  const distinct = ordered.filter((incident) => {
    const collectorId = incident.collectorId!;
    if (seenCollectors.has(collectorId)) return false;
    seenCollectors.add(collectorId);
    return true;
  });

  return options.maxIncidents == null ? distinct : distinct.slice(0, options.maxIncidents);
}
