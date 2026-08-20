/**
 * The four heal gates (master-plan v3 §11). A heal regenerates extraction logic and its
 * preview always *looks* plausible - the test here is not "is this plausible," it's
 * "could a wrong-field grab pass my checks." Each gate is pure and independently testable
 * (see gates.test.ts) so CI and any future UI share one implementation of the safety story.
 */

export type GateName = "identity" | "shape" | "continuity" | "collision";

export interface GateResult {
  gate: GateName;
  passed: boolean;
  reason: string;
}

export type GateDecision = "auto_approve" | "auto_reject" | "escalate";

export interface GateEvaluation {
  results: GateResult[];
  decision: GateDecision;
}

function normalize(mpn: string): string {
  return mpn.trim().toUpperCase();
}

/** Gate 1 - the healed preview drifted to a different product on the page. */
export function checkIdentityGate(
  extractedMpn: string | null | undefined,
  expectedMpn: string,
  partNumbersOnPage?: string[],
): GateResult {
  if (extractedMpn && normalize(extractedMpn) === normalize(expectedMpn)) {
    return { gate: "identity", passed: true, reason: "Extracted MPN matches the requested part" };
  }
  if (partNumbersOnPage?.some((p) => normalize(p) === normalize(expectedMpn))) {
    return { gate: "identity", passed: true, reason: "Requested part found in the page's part-numbers list" };
  }
  return {
    gate: "identity",
    passed: false,
    reason: `Extracted "${extractedMpn ?? "null"}" does not match requested "${expectedMpn}"`,
  };
}

/** Gate 2 - a heal that fixes one field while silently dropping another that used to be there. */
export function checkShapeGate(
  healedRaw: Record<string, unknown>,
  previousRaw: Record<string, unknown> | null,
): GateResult {
  if (!previousRaw) {
    return { gate: "shape", passed: true, reason: "No prior shape on record to compare against" };
  }
  const droppedFields = Object.keys(previousRaw).filter(
    (key) => previousRaw[key] != null && (healedRaw[key] == null),
  );
  if (droppedFields.length > 0) {
    return {
      gate: "shape",
      passed: false,
      reason: `Fields present before the break are missing from the healed output: ${droppedFields.join(", ")}`,
    };
  }
  return { gate: "shape", passed: true, reason: "All previously-present fields are still present" };
}

/**
 * Gate 3 - is the healed value within a sane band of the last valid observation. Wide
 * enough to tolerate a real stockout (stock can legitimately crash to near zero); narrow
 * enough to catch "grabbed a different, smaller field" (e.g. 6,368 -> 100, the pin count).
 */
export function checkContinuityGate(newValue: number, lastValidValue: number | null): GateResult {
  if (lastValidValue == null) {
    return { gate: "continuity", passed: true, reason: "No prior value on record - nothing to compare" };
  }
  if (lastValidValue === 0) {
    return { gate: "continuity", passed: true, reason: "Prior value was zero - any new value is a legitimate change" };
  }

  const ratio = newValue / lastValidValue;
  const droppedTooFar = ratio < 0.1; // >90% drop
  const roseTooFar = ratio > 10; // >10x rise

  if (droppedTooFar || roseTooFar) {
    return {
      gate: "continuity",
      passed: false,
      reason: `Value moved from ${lastValidValue} to ${newValue}, outside the plausible band for one snapshot`,
    };
  }
  return { gate: "continuity", passed: true, reason: "Value is within a plausible band of the last observation" };
}

/**
 * Gate 4 - the one nobody builds and the one that matters most. A healed value that
 * exactly equals a different field's value on the same page is the signature of a
 * selector that grabbed the wrong element (stock === incoming, stock === pin count).
 */
export function checkCollisionGate(healedRaw: Record<string, unknown>, targetField: string): GateResult {
  const targetValue = healedRaw[targetField];
  if (typeof targetValue !== "number") {
    return { gate: "collision", passed: true, reason: `${targetField} is not numeric - collision check not applicable` };
  }

  for (const [key, value] of Object.entries(healedRaw)) {
    if (key === targetField) continue;
    if (typeof value === "number" && value === targetValue) {
      return {
        gate: "collision",
        passed: false,
        reason: `Healed ${targetField} (${targetValue}) exactly matches field "${key}" on the same page - likely a wrong-selector grab`,
      };
    }
  }
  return { gate: "collision", passed: true, reason: "No field collision detected" };
}

/**
 * The decision rule, verbatim from §11:
 *   all four pass                 -> AUTO-APPROVE
 *   identity or shape fails       -> AUTO-REJECT (reheal with a sharper prompt)
 *   continuity or collision fails -> ESCALATE to a human
 * Identity/shape failures are checked first because they indicate the heal is
 * unambiguously wrong (not just "possibly wrong"), where a plausible-but-wrong value
 * is what continuity/collision exist to catch.
 */
export function evaluateGates(results: GateResult[]): GateEvaluation {
  const byName = new Map(results.map((r) => [r.gate, r]));
  const identity = byName.get("identity");
  const shape = byName.get("shape");
  const continuity = byName.get("continuity");
  const collision = byName.get("collision");

  if (identity?.passed === false || shape?.passed === false) {
    return { results, decision: "auto_reject" };
  }
  if (continuity?.passed === false || collision?.passed === false) {
    return { results, decision: "escalate" };
  }
  return { results, decision: "auto_approve" };
}
