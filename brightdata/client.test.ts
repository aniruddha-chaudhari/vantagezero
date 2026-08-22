import assert from "node:assert/strict";
import test from "node:test";

import { buildHealRequest, describeHealFailure, shouldRetryHealFailure } from "./client";

test("self-healing receives the exact broken product URL as custom input", () => {
  const url = "https://www.digikey.in/en/products/detail/gct/USB4105-GF-A/11198441";

  assert.deepEqual(buildHealRequest(url, "Fix missing price breaks"), {
    prompt: "Fix missing price breaks",
    custom_input: [{ url }],
  });
});

test("retries one terminal Bright Data code_fixer failure and no other terminal state", () => {
  const failure = {
    id: "ia_demo",
    status: "error",
    step: "code_fixer",
    completed_steps: ["planner", "control_preview_runner"],
  };

  assert.equal(shouldRetryHealFailure(failure, 1), true);
  assert.equal(shouldRetryHealFailure(failure, 2), false);
  assert.equal(shouldRetryHealFailure({ ...failure, step: "planner" }, 1), false);
  assert.equal(shouldRetryHealFailure({ ...failure, status: "cancelled" }, 1), false);
});

test("self-healing failure diagnostics identify Bright Data's failed stage", () => {
  assert.equal(
    describeHealFailure({
      id: "ia_demo",
      status: "error",
      step: "code_fixer",
      completed_steps: ["planner", "control_preview_runner"],
    }),
    "status: error; step: code_fixer; job: ia_demo; completed: planner, control_preview_runner",
  );
});
