import type { Department } from "../shell/types.ts";

export type NavItem = {
  path: string;
  labelKey: string;
  end?: boolean;
  /** Hide unless tenant enables yard module (ops/admin only). */
  yardModule?: boolean;
};

export type NavGroup = {
  key: string;
  labelKey: string;
  items: NavItem[];
};

/** LogisticsOS V2 navigation — maps to existing routes until dedicated pages land. */
export const v2NavGroups: NavGroup[] = [
  {
    key: "navDashboard",
    labelKey: "navDashboard",
    items: [
      { path: "/", labelKey: "navOverview", end: true },
      { path: "/exceptions", labelKey: "navActionCenter" },
    ],
  },
  {
    key: "navSales",
    labelKey: "navSales",
    items: [
      { path: "/leads", labelKey: "navLeads" },
      { path: "/customers", labelKey: "navCustomers" },
      { path: "/contacts", labelKey: "navContacts" },
      { path: "/rates", labelKey: "navRates" },
      { path: "/quotations", labelKey: "navQuotations" },
    ],
  },
  {
    key: "navOperations",
    labelKey: "navOperations",
    items: [
      { path: "/jobs", labelKey: "navJobs" },
      { path: "/shipments", labelKey: "navShipments" },
      { path: "/boxes", labelKey: "navBoxes" },
      { path: "/docs", labelKey: "navDocs" },
      { path: "/inbox", labelKey: "navInbox" },
      { path: "/tasks", labelKey: "navTasks" },
      { path: "/calendar", labelKey: "navCalendar" },
    ],
  },
  {
    key: "navFinance",
    labelKey: "navFinance",
    items: [
      { path: "/invoices", labelKey: "navInvoices" },
      { path: "/vendor-bills", labelKey: "navVendorBills" },
      { path: "/vendors", labelKey: "navVendors" },
      { path: "/reports", labelKey: "navFinanceReports" },
    ],
  },
  {
    key: "navAnalytics",
    labelKey: "navAnalytics",
    items: [{ path: "/reports", labelKey: "navReports" }],
  },
  {
    key: "navAutomation",
    labelKey: "navAutomation",
    items: [
      { path: "/automation", labelKey: "navAutomation" },
      { path: "/notifications", labelKey: "navNotifications" },
    ],
  },
  {
    key: "navAdmin",
    labelKey: "navAdmin",
    items: [
      { path: "/settings", labelKey: "navSettings" },
      { path: "/yard", labelKey: "navYard", yardModule: true },
      { path: "/pipeline", labelKey: "navPipeline" },
    ],
  },
];

const allowedByDept: Record<Department, ReadonlySet<string>> = {
  sales: new Set([
    "/",
    "/exceptions",
    "/notifications",
    "/pipeline",
    "/leads",
    "/customers",
    "/contacts",
    "/rates",
    "/quotations",
    "/jobs",
    "/boxes",
    "/shipments",
    "/tasks",
    "/calendar",
    "/settings",
  ]),
  ops: new Set([
    "/",
    "/exceptions",
    "/notifications",
    "/yard",
    "/boxes",
    "/shipments",
    "/jobs",
    "/docs",
    "/tasks",
    "/calendar",
    "/inbox",
    "/settings",
  ]),
  finance: new Set([
    "/",
    "/exceptions",
    "/notifications",
    "/invoices",
    "/vendors",
    "/vendor-bills",
    "/reports",
    "/jobs",
    "/rates",
    "/settings",
  ]),
  admin: new Set([
    "/",
    "/exceptions",
    "/notifications",
    "/pipeline",
    "/leads",
    "/customers",
    "/contacts",
    "/rates",
    "/quotations",
    "/jobs",
    "/invoices",
    "/vendors",
    "/vendor-bills",
    "/boxes",
    "/shipments",
    "/yard",
    "/inbox",
    "/docs",
    "/tasks",
    "/calendar",
    "/reports",
    "/automation",
    "/settings",
  ]),
};

export function v2NavPathAllowed(department: Department | null, path: string): boolean {
  if (!department) return false;
  return allowedByDept[department].has(path);
}

export function v2NavForDepartment(
  department: Department | null,
  tx: (key: string) => string,
  opts?: { yardEnabled?: boolean },
): { path: string; name: string; routes?: { path: string; name: string }[] }[] {
  const yardEnabled = opts?.yardEnabled ?? (department === "ops" || department === "admin");
  return v2NavGroups
    .map((g) => ({
      path: g.items[0]?.path ?? "/",
      name: tx(g.labelKey),
      routes: g.items
        .filter((item) => !item.yardModule || yardEnabled)
        .filter((item) => (department ? v2NavPathAllowed(department, item.path) : false))
        .map((item) => ({ path: item.path, name: tx(item.labelKey) })),
    }))
    .filter((g) => g.routes && g.routes.length > 0);
}
