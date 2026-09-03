import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mailTransitionAllowed } from "./comms.service.js";

describe("mailTransitionAllowed", () => {
  it("allows open → sent/rejected and same-state", () => {
    assert.equal(mailTransitionAllowed("open", "sent"), true);
    assert.equal(mailTransitionAllowed("open", "rejected"), true);
    assert.equal(mailTransitionAllowed("sent", "sent"), true);
  });

  it("blocks illegal transitions", () => {
    assert.equal(mailTransitionAllowed("sent", "open"), false);
    assert.equal(mailTransitionAllowed("rejected", "sent"), false);
  });
});
