import { test, expect } from "@playwright/test";

const STAFF_EMAIL = "admin@cangzhan.com";
const STAFF_PASSWORD = "demo123";

async function staffLogin(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(STAFF_EMAIL);
  await page.locator('input[type="password"]').fill(STAFF_PASSWORD);
  await page.locator(".login-remote button[type='submit']").click();
  await page.waitForURL(/\/(|overview|jobs|exceptions)$/, { timeout: 20000 });
}

/** Portal customer used by the E2E run (seed customer with jobs + a contact e-mail). */
const PORTAL_CUSTOMER_ID = "c1";

test.describe("LogisticsOS critical flow", () => {
  test("staff: login → jobs → job detail milestones", async ({ page }) => {
    await staffLogin(page);
    await page.goto("/jobs");
    const jobCell = page.getByText(/JOB-/).first();
    await expect(jobCell).toBeVisible({ timeout: 20000 });
    await jobCell.click();
    await expect(page.getByRole("heading", { name: /JOB-/ })).toBeVisible({ timeout: 15000 });
    const milestonesTab = page.getByRole("tab", { name: /Milestones|里程碑/i });
    if (await milestonesTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await milestonesTab.click();
      await expect(page.locator(".ant-checkbox").first()).toBeVisible();
    } else {
      await expect(page.getByText(/概况|Overview|Milestones|里程碑/i)).toBeVisible();
    }
  });

  test("staff: quote wizard shows full workflow steps", async ({ page }) => {
    await staffLogin(page);
    await page.goto("/quotations/new");
    await expect(page.locator(".ant-steps")).toBeVisible({ timeout: 15000 });
    const steps = page.locator(".ant-steps-item");
    await expect(steps.first()).toBeVisible();
    expect(await steps.count()).toBeGreaterThanOrEqual(3);
  });

  test("login: wrong password shows an error", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[type="email"]').fill(STAFF_EMAIL);
    await page.locator('input[type="password"]').fill("definitely-wrong");
    await page.locator(".login-remote button[type='submit']").click();
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test("portal: e-mail + access code → home jobs list", async ({ page }) => {
    // Staff issues (rotates) the customer's portal access code through the API.
    const api = page.request;
    const login = await api.post("/api/auth/login", { data: { email: STAFF_EMAIL, password: STAFF_PASSWORD } });
    expect(login.ok()).toBeTruthy();
    const issued = await api.post(`/api/portal/access-code/${PORTAL_CUSTOMER_ID}`);
    expect(issued.ok()).toBeTruthy();
    const { code, emails } = (await issued.json()) as { code: string; emails: string[] };
    expect(emails.length).toBeGreaterThan(0);
    await api.post("/api/auth/logout");

    await page.goto("/portal");
    await page.locator('.portal-login input[type="email"]').fill(emails[0]!);
    await page.locator('.portal-login input[name="access-code"]').fill("WRONG-CODE");
    await page.locator('.portal-login button[type="submit"]').click();
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 10000 });

    await page.locator('.portal-login input[name="access-code"]').fill(code);
    await page.locator('.portal-login button[type="submit"]').click();
    await page.waitForURL(/\/portal\/home/, { timeout: 15000 });
    await expect(page.getByRole("link", { name: /JOB-/ }).first()).toBeVisible();
  });
});
