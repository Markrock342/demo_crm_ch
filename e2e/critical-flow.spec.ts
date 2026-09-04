import { test, expect } from "@playwright/test";

const STAFF_EMAIL = "admin@cangzhan.com";
const STAFF_PASSWORD = "demo123";

async function staffLogin(page: import("@playwright/test").Page) {
  await page.goto("/login");
  const email = page.locator('input[type="email"]');
  const productionSubmit = page.locator(".login-remote button[type='submit']:not([disabled])");
  if (await productionSubmit.isVisible({ timeout: 3000 }).catch(() => false)) {
    await email.fill(STAFF_EMAIL);
    await page.locator('input[type="password"]').fill(STAFF_PASSWORD);
    await productionSubmit.click();
  } else {
    // Shell/demo login — admin dept is the 4th button (sales, ops, finance, admin)
    await page.locator(".login-dept-btn").nth(3).click();
  }
  await page.waitForURL(/\/(|overview|jobs|exceptions)/, { timeout: 20000 });
}

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

  test("portal: login → home jobs list", async ({ page }) => {
    await page.goto("/portal");
    await page.locator("select").selectOption({ index: 0 });
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/portal\/home/, { timeout: 15000 });
    await expect(page.getByRole("link", { name: /JOB-/ }).first()).toBeVisible();
  });
});
