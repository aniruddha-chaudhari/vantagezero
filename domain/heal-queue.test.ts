import assert from "node:assert/strict";
import test from "node:test";

import { selectHealCandidates, type HealQueueCandidate } from "./heal-queue";

function incident(overrides: Partial<HealQueueCandidate> = {}): HealQueueCandidate {
  return {
    id: "incident-1",
    sourceTargetId: "target-1",
    collectorId: "collector-1",
    incidentType: "MISSING_REQUIRED_FIELD",
    openedAt: "2026-08-22T08:00:00.000Z",
    eligibleForAutoHeal: true,
    ...overrides,
  };
}

test("collapses duplicate incidents for one collector into one heal", () => {
  const selected = selectHealCandidates(
    [
      incident({ id: "newest", openedAt: "2026-08-22T10:00:00.000Z" }),
      incident({ id: "oldest", openedAt: "2026-08-22T08:00:00.000Z" }),
      incident({ id: "middle", openedAt: "2026-08-22T09:00:00.000Z" }),
    ],
    { force: true, sourceTargetId: "target-1" },
  );

  assert.deepEqual(selected.map((item) => item.id), ["oldest"]);
});

test("bounds an automatic run after filtering and collector deduplication", () => {
  const selected = selectHealCandidates(
    [
      incident({ id: "ineligible", collectorId: "collector-0", eligibleForAutoHeal: false }),
      incident({ id: "first", collectorId: "collector-1" }),
      incident({ id: "duplicate", collectorId: "collector-1" }),
      incident({ id: "second", collectorId: "collector-2" }),
    ],
    { force: false, maxIncidents: 1 },
  );

  assert.deepEqual(selected.map((item) => item.id), ["first"]);
});

test("force bypasses eligibility but not the collector safety rule", () => {
  const selected = selectHealCandidates(
    [
      incident({ id: "first", eligibleForAutoHeal: false }),
      incident({ id: "duplicate", eligibleForAutoHeal: false }),
    ],
    { force: true },
  );

  assert.deepEqual(selected.map((item) => item.id), ["first"]);
});

test("force never turns a wrong-page incident into a heal candidate", () => {
  const selected = selectHealCandidates(
    [incident({ id: "wrong-page", incidentType: "PART_IDENTITY_MISMATCH", eligibleForAutoHeal: false })],
    { force: true },
  );

  assert.deepEqual(selected, []);
});

test("an identity mismatch blocks other incidents for that same source target", () => {
  const selected = selectHealCandidates(
    [
      incident({ id: "missing-price" }),
      incident({ id: "wrong-page", incidentType: "PART_IDENTITY_MISMATCH", eligibleForAutoHeal: false }),
      incident({ id: "other-target", sourceTargetId: "target-2", collectorId: "collector-2" }),
    ],
    { force: true },
  );

  assert.deepEqual(selected.map((item) => item.id), ["other-target"]);
});
