import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";
import { tenantResourceMatches } from "./tenancy.service.js";
import { getJob } from "./operations.service.js";
import { jobs } from "../db/schema/operations.js";

describe("tenant isolation", () => {
  it("tenantResourceMatches rejects cross-tenant resource access", () => {
    const orgA = "11111111-1111-4111-8111-111111111111";
    const orgB = "22222222-2222-4222-8222-222222222222";
    assert.equal(tenantResourceMatches(orgA, orgA), true);
    assert.equal(tenantResourceMatches(orgB, orgA), false);
    assert.equal(tenantResourceMatches(null, orgA), false);
    assert.equal(tenantResourceMatches(undefined, orgA), false);
  });

  it("getJob returns null for wrong organization (simulated DB tenant filter)", async () => {
    const orgA = "11111111-1111-4111-8111-111111111111";
    const orgB = "22222222-2222-4222-8222-222222222222";
    const jobRow = {
      id: "s1",
      organizationId: orgA,
      jobNumber: "JOB-TEST",
      customerId: "c1",
      bookingId: null,
      quotationId: null,
      quotationRevisionId: null,
      direction: "EXPORT",
      mode: "SEA_FCL",
      serviceType: "PORT_TO_PORT",
      incoterm: null,
      origin: "A",
      destination: "B",
      pol: "AAA",
      pod: "BBB",
      carrier: null,
      bookingNumber: null,
      masterBl: null,
      houseBl: null,
      vessel: null,
      voyage: null,
      etd: null,
      eta: null,
      commodity: null,
      containerType: null,
      containerCount: 1,
      teu: 1,
      salesOwnerId: null,
      assignedOperator: null,
      status: "BOOKING",
      currency: "THB",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    function mockDb(expectedOrgId: string) {
      return {
        select: () => ({
          from: () => ({
            where: (clause: unknown) => ({
              limit: async () => {
                assert.ok(clause, "getJob must filter with WHERE clause");
                const expected = and(eq(jobs.id, "s1"), eq(jobs.organizationId, expectedOrgId));
                assert.deepEqual(clause, expected);
                return jobRow.organizationId === expectedOrgId ? [jobRow] : [];
              },
            }),
          }),
        }),
      } as never;
    }

    assert.equal((await getJob(mockDb(orgA), orgA, "s1"))?.id, "s1");
    assert.equal(await getJob(mockDb(orgB), orgB, "s1"), null);
  });
});
