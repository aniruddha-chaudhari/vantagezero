import assert from "node:assert/strict";
import { test } from "node:test";

import { checkCollisionGate, checkContinuityGate, checkIdentityGate, checkShapeGate, evaluateGates } from "./gates";

test("gate 1 (identity): wrong-MPN preview fails and forces auto_reject", () => {
  const identity = checkIdentityGate("ESP32-RELAY04", "ESP32-WROOM-32E");
  assert.equal(identity.passed, false);

  const decision = evaluateGates([
    identity,
    { gate: "shape", passed: true, reason: "" },
    { gate: "continuity", passed: true, reason: "" },
    { gate: "collision", passed: true, reason: "" },
  ]);
  assert.equal(decision.decision, "auto_reject");
});

test("gate 1: family-page identity passes via part_numbers[] membership", () => {
  const identity = checkIdentityGate(null, "STM32F407VGT6", ["STM32F407VGT7", "STM32F407VGT6"]);
  assert.equal(identity.passed, true);
});

test("gate 2 (shape): a dropped field fails and forces auto_reject", () => {
  const previous = { stock: 6150, leadTimeWeeks: 32, currency: "GBP" };
  const healed = { stock: 6200, currency: "GBP" }; // leadTimeWeeks silently dropped
  const shape = checkShapeGate(healed, previous);
  assert.equal(shape.passed, false);
  assert.match(shape.reason, /leadTimeWeeks/);

  const decision = evaluateGates([
    { gate: "identity", passed: true, reason: "" },
    shape,
    { gate: "continuity", passed: true, reason: "" },
    { gate: "collision", passed: true, reason: "" },
  ]);
  assert.equal(decision.decision, "auto_reject");
});

test("gate 3 (continuity): stock replaced by pin count escalates", () => {
  // 6,368 -> 100, the plan's own example of a wrong-field grab.
  const continuity = checkContinuityGate(100, 6368);
  assert.equal(continuity.passed, false);

  const decision = evaluateGates([
    { gate: "identity", passed: true, reason: "" },
    { gate: "shape", passed: true, reason: "" },
    continuity,
    { gate: "collision", passed: true, reason: "" },
  ]);
  assert.equal(decision.decision, "escalate");
});

test("gate 3: a large but plausible real drop still passes", () => {
  // A genuine 60% stock drop (already enough to fire a "high" severity business event
  // elsewhere) must not itself be blocked by continuity - only implausible jumps are.
  const continuity = checkContinuityGate(2500, 6368);
  assert.equal(continuity.passed, true);
});

test("gate 3: a near-total wipeout escalates rather than auto-passing", () => {
  // Plausible-but-wrong is indistinguishable from a real catastrophic stockout by magnitude
  // alone, so per the plan this is deliberately NOT auto-approved - a human decides.
  const continuity = checkContinuityGate(4, 6368);
  assert.equal(continuity.passed, false);
});

test("gate 4 (collision): stock equal to incoming escalates", () => {
  const collision = checkCollisionGate({ stock: 133, incoming: 133, currency: "GBP" }, "stock");
  assert.equal(collision.passed, false);
  assert.match(collision.reason, /incoming/);

  const decision = evaluateGates([
    { gate: "identity", passed: true, reason: "" },
    { gate: "shape", passed: true, reason: "" },
    { gate: "continuity", passed: true, reason: "" },
    collision,
  ]);
  assert.equal(decision.decision, "escalate");
});

test("all four gates passing yields auto_approve", () => {
  const decision = evaluateGates([
    { gate: "identity", passed: true, reason: "" },
    { gate: "shape", passed: true, reason: "" },
    { gate: "continuity", passed: true, reason: "" },
    { gate: "collision", passed: true, reason: "" },
  ]);
  assert.equal(decision.decision, "auto_approve");
});
