import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { grossProfit, marginPct, mul, toDb } from "./money.js";

describe("money", () => {
  it("calculates margin percentage safely", () => {
    assert.equal(toDb(marginPct("54500", "39000")), "28.4404");
    assert.equal(toDb(marginPct("0", "100")), "0.0000");
  });

  it("calculates gross profit", () => {
    assert.equal(toDb(grossProfit("54500", "39000")), "15500.0000");
  });

  it("multiplies quantity and rate", () => {
    assert.equal(toDb(mul("2", "850")), "1700.0000");
  });
});
