import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { selectBillableCostCharges } from "./finance.service.js";

describe("selectBillableCostCharges", () => {
  const charges = [
    { id: "a", chargeType: "COST", billed: false },
    { id: "b", chargeType: "COST", billed: true },
    { id: "c", chargeType: "REVENUE", billed: false },
    { id: "d", chargeType: "COST", billed: false },
  ];

  it("keeps only unbilled COST charges in the requested id set", () => {
    const selected = selectBillableCostCharges(charges, ["a", "b", "c", "d"]);
    assert.deepEqual(
      selected.map((c) => c.id),
      ["a", "d"],
    );
  });

  it("returns empty when ids already billed or revenue-only", () => {
    assert.equal(selectBillableCostCharges(charges, ["b", "c"]).length, 0);
  });
});
