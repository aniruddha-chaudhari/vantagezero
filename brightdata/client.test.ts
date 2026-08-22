import assert from "node:assert/strict";
import test from "node:test";

import { buildHealRequest } from "./client";

test("self-healing receives the exact broken product URL as custom input", () => {
  const url = "https://www.digikey.in/en/products/detail/gct/USB4105-GF-A/11198441";

  assert.deepEqual(buildHealRequest(url, "Fix missing price breaks"), {
    prompt: "Fix missing price breaks",
    custom_input: [{ url }],
  });
});
