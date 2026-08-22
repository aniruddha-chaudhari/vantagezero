import assert from "node:assert/strict";
import test from "node:test";

import { MissingRequiredField } from "./errors";
import { validateDistributorObservation, type DistributorObservationInput } from "./schemas";

function observation(overrides: Partial<DistributorObservationInput> = {}): DistributorObservationInput {
  return {
    mpn: "USB4105-GF-A",
    manufacturer: "GCT",
    sourceType: "distributor",
    supplier: "DigiKey",
    supplierSku: null,
    sourceUrl: "https://www.digikey.in/example",
    region: "India",
    imageUrl: null,
    stock: 152_521,
    incoming: null,
    incomingDate: null,
    availabilityText: null,
    deliveryText: null,
    leadTimeWeeks: 7,
    currency: "INR",
    minimumOrderQty: 1,
    orderMultiple: 1,
    priceBreaks: [{ minQty: 8_000, unitPrice: 83.25 }],
    package: null,
    ...overrides,
  };
}

test("in-stock distributor data without price tiers opens a healable gap", () => {
  assert.throws(
    () => validateDistributorObservation({ raw: observation({ priceBreaks: [] }), expectedMpn: "USB4105-GF-A" }),
    (error) => error instanceof MissingRequiredField && error.code === "MISSING_REQUIRED_FIELD",
  );
});

test("an 8,000-unit tier is valid pricing for the 10,000-unit build", () => {
  const validated = validateDistributorObservation({ raw: observation(), expectedMpn: "USB4105-GF-A" });
  assert.deepEqual(validated.priceBreaks, [{ minQty: 8_000, unitPrice: 83.25 }]);
});

test("an out-of-stock listing may legitimately omit current pricing", () => {
  const validated = validateDistributorObservation({
    raw: observation({ stock: 0, priceBreaks: [] }),
    expectedMpn: "USB4105-GF-A",
  });
  assert.deepEqual(validated.priceBreaks, []);
});
