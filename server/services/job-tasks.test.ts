import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tenantResourceMatches } from "./tenancy.service.js";

describe("job-tasks.service", () => {
  it("tenantResourceMatches used for task isolation boundary", () => {
    const orgA = "11111111-1111-4111-8111-111111111111";
    assert.equal(tenantResourceMatches(orgA, orgA), true);
    assert.equal(tenantResourceMatches(orgA, "other"), false);
  });
});
