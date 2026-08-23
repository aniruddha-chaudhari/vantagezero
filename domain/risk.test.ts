import assert from "node:assert/strict";
import { test } from "node:test";

import { detectLifecycleChanges } from "./changes";
import { buildabilityScore, canonicalLifecycleStatus, lifecycleRisk } from "./risk";

/**
 * Collectors store the manufacturer's own display string ("Last Time Buy"), the risk table
 * is keyed on tokens (LAST_TIME_BUY). These cover the bridge between the two - a mismatch
 * silently downgrades the highest-urgency pre-obsolete state to "unknown", which makes a
 * build score *better* than it should, and suppresses its lifecycle_worsened alert entirely.
 */

test("canonicalLifecycleStatus bridges display strings to table tokens", () => {
  assert.equal(canonicalLifecycleStatus("Last Time Buy"), "LAST_TIME_BUY");
  assert.equal(canonicalLifecycleStatus("last time buy"), "LAST_TIME_BUY");
  assert.equal(canonicalLifecycleStatus("Last-Time-Buy"), "LAST_TIME_BUY");
  assert.equal(canonicalLifecycleStatus("  Active  "), "ACTIVE");
  assert.equal(canonicalLifecycleStatus("NRND"), "NRND");
});

test("every status the ST collector can emit maps to its intended risk level", () => {
  assert.equal(lifecycleRisk("Active"), "low");
  assert.equal(lifecycleRisk("NRND"), "medium");
  assert.equal(lifecycleRisk("Last Time Buy"), "high");
  assert.equal(lifecycleRisk("Obsolete"), "critical");
});

test("an absent or unrecognized status is a data gap, not a verdict", () => {
  assert.equal(lifecycleRisk(null), "unknown");
  assert.equal(lifecycleRisk("Not A Real Status"), "unknown");
});

test("Preview scores as a real risk, not a data gap", () => {
  assert.equal(lifecycleRisk("Preview"), "high");
});

test("Preview is off the decline axis - releasing to Active is not a worsening", () => {
  // The normal release path. Scoring Preview as high while also ordering it before Active
  // would fire a lifecycle_worsened alert every time a part actually became buyable.
  assert.deepEqual(detectLifecycleChanges({ marketingStatus: "Preview" }, { marketingStatus: "Active" }), []);
  assert.deepEqual(detectLifecycleChanges({ marketingStatus: "Active" }, { marketingStatus: "Preview" }), []);
});

test("a Last Time Buy part is scored, not dropped from the weighted average", () => {
  const scored = buildabilityScore({
    coveragePct: 100,
    worstLeadTimeRisk: "low",
    worstLifecycleRisk: lifecycleRisk("Last Time Buy"),
  });
  // 100*0.6 + 100*0.2 + 30*0.2 = 86. Treating it as "unknown" would drop the lifecycle
  // dimension and round back up to 100 - a worse build reported as a perfect one.
  assert.equal(scored.total, 86);
  assert.equal(scored.lifecycle, 30);
});

test("Active -> Last Time Buy raises a lifecycle_worsened event", () => {
  const events = detectLifecycleChanges({ marketingStatus: "Active" }, { marketingStatus: "Last Time Buy" });
  assert.equal(events.length, 1);
  assert.equal(events[0].eventType, "lifecycle_worsened");
  assert.equal(events[0].severity, "high");
});

test("Active -> Obsolete is critical; recovery and no-change raise nothing", () => {
  const worsened = detectLifecycleChanges({ marketingStatus: "Active" }, { marketingStatus: "Obsolete" });
  assert.equal(worsened[0].severity, "critical");

  assert.deepEqual(detectLifecycleChanges({ marketingStatus: "NRND" }, { marketingStatus: "Active" }), []);
  assert.deepEqual(detectLifecycleChanges({ marketingStatus: "Active" }, { marketingStatus: "Active" }), []);
  assert.deepEqual(detectLifecycleChanges(null, { marketingStatus: "Obsolete" }), []);
});
