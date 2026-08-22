import assert from "node:assert/strict";
import test from "node:test";

import { describeVerificationFailure, verificationSucceeded } from "./heal-verification";

test("a heal is successful only after the effective collector re-scrapes valid data", () => {
  assert.equal(
    verificationSucceeded({
      verified: true,
      incident: { status: "resolved" },
      reingestResult: { ok: true, detail: "stock=19271 INR" },
    }),
    true,
  );

  assert.equal(
    verificationSucceeded({
      verified: false,
      incident: { status: "open" },
      reingestResult: { ok: false, detail: "DigiKey output has stock but no price breaks" },
    }),
    false,
  );
});

test("verification failure preserves the extraction error for CI logs", () => {
  assert.equal(
    describeVerificationFailure({
      verified: false,
      reingestResult: { ok: false, detail: "DigiKey output has stock but no price breaks" },
    }),
    "DigiKey output has stock but no price breaks",
  );
});
