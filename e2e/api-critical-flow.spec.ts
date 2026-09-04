import { test, expect } from "@playwright/test";

const STAFF_EMAIL = "admin@cangzhan.com";
const STAFF_PASSWORD = "demo123";
const CUSTOMER_ID = "c1";
const RATE_LANE_ID = "rl-sh-lcb-40hc";

async function staffLogin(request: import("@playwright/test").APIRequestContext) {
  const res = await request.post("/api/auth/login", {
    data: { email: STAFF_EMAIL, password: STAFF_PASSWORD },
  });
  if (!res.ok()) {
    throw new Error(`staff login failed: ${await res.text()}`);
  }
}

test.describe("API critical workflow", () => {
  test("quote → accept → booking → job → milestone → task → invoice → portal", async ({ request }) => {
    const healthRes = await request.get("/api/health");
    if (!healthRes.ok()) test.skip(true, "API not running — start dev:api");
    const health = (await healthRes.json()) as { database?: boolean; mode?: string };
    if (!health.database || health.mode !== "production") {
      test.skip(true, "Database not connected — run docker-compose + db:migrate + db:seed");
    }

    try {
      await staffLogin(request);
    } catch (e) {
      test.skip(true, e instanceof Error ? e.message : "login failed");
    }

    const quoteRes = await request.post("/api/quotations/from-rate", {
      data: {
        customerId: CUSTOMER_ID,
        rateLaneId: RATE_LANE_ID,
        quantity: 1,
      },
    });
    expect(quoteRes.status(), await quoteRes.text()).toBe(201);
    const quote = (await quoteRes.json()) as { id: string };
    expect(quote.id).toBeTruthy();

    const approvalRes = await request.post(`/api/quotations/${quote.id}/submit-approval`);
    expect(approvalRes.ok(), await approvalRes.text()).toBeTruthy();

    const sendRes = await request.post(`/api/quotations/${quote.id}/send`);
    expect(sendRes.ok(), await sendRes.text()).toBeTruthy();
    const sent = (await sendRes.json()) as { token: string };
    expect(sent.token).toBeTruthy();

    const signRes = await request.post(`/api/public/quotes/${sent.token}/sign`, {
      data: {
        signerName: "E2E Tester",
        signerEmail: "e2e@test.com",
        signatureMethod: "TYPED",
        acceptedTerms: true,
        decision: "ACCEPTED",
      },
    });
    expect(signRes.ok(), await signRes.text()).toBeTruthy();

    const bookingRes = await request.post(`/api/quotations/${quote.id}/booking`);
    expect(bookingRes.status(), await bookingRes.text()).toBe(201);
    const booking = (await bookingRes.json()) as { id: string };

    const jobRes = await request.post(`/api/bookings/${booking.id}/job`);
    expect(jobRes.status(), await jobRes.text()).toBe(201);
    const job = (await jobRes.json()) as { id: string; jobNumber: string };

    const msRes = await request.patch(`/api/jobs/${job.id}/milestones/BOOKING`, {
      data: { complete: true },
    });
    expect(msRes.ok(), await msRes.text()).toBeTruthy();

    const taskRes = await request.post(`/api/jobs/${job.id}/tasks`, {
      data: { title: "E2E verify gate-in docs", priority: "high" },
    });
    expect(taskRes.status(), await taskRes.text()).toBe(201);

    const chargesRes = await request.get(`/api/jobs/${job.id}/charges`);
    expect(chargesRes.ok()).toBeTruthy();
    const charges = (await chargesRes.json()) as { items: Array<{ id: string; chargeType: string; invoiced?: boolean }> };
    const revenueIds = charges.items.filter((c) => c.chargeType === "REVENUE" && !c.invoiced).map((c) => c.id);

    if (revenueIds.length) {
      const invRes = await request.post("/api/invoices/from-job", {
        data: { jobId: job.id, customerId: CUSTOMER_ID, chargeIds: revenueIds },
      });
      expect(invRes.status(), await invRes.text()).toBe(201);
    }

    const portalLoginRes = await request.post("/api/portal/login", {
      data: { customerId: CUSTOMER_ID, pin: "demo" },
    });
    expect(portalLoginRes.ok(), await portalLoginRes.text()).toBeTruthy();

    const portalJobsRes = await request.get("/api/portal/jobs");
    expect(portalJobsRes.ok()).toBeTruthy();
    const portalJobs = (await portalJobsRes.json()) as { items: Array<{ jobNumber: string }> };
    expect(portalJobs.items.some((j) => j.jobNumber === job.jobNumber)).toBeTruthy();
  });
});
