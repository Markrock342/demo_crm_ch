import type { Department } from "../shell/types.ts";

import type { Icon } from "@phosphor-icons/react";
import {
  Bell,
  CalendarBlank,
  ChartBar,
  Cube,
  CurrencyCircleDollar,
  EnvelopeSimple,
  FileText,
  Funnel,
  Gear,
  House,
  IdentificationCard,
  Lightning,
  ListChecks,
  Package,
  Receipt,
  Storefront,
  Boat,
  SquaresFour,
  Tray,
  Users,
  WarningCircle,
  Invoice,
} from "@phosphor-icons/react";

export type NavItem = {
  path: string;
  labelKey: string;
  icon: Icon;
  end?: boolean;
  /** Hide unless tenant enables yard module (ops/admin only). */
  yardModule?: boolean;
};

export type NavGroup = {
  key: string;
  labelKey: string;
  items: NavItem[];
};

/** Sidebar navigation — grouped by the job people are doing, one entry per page. */
export const v2NavGroups: NavGroup[] = [
  {
    key: "home",
    labelKey: "navGroupHome",
    items: [
      { path: "/", labelKey: "navOverview", icon: House, end: true },
      { path: "/exceptions", labelKey: "navActionCenter", icon: WarningCircle },
      { path: "/tasks", labelKey: "navTasks", icon: ListChecks },
      { path: "/inbox", labelKey: "navInbox", icon: EnvelopeSimple },
      { path: "/calendar", labelKey: "navCalendar", icon: CalendarBlank },
    ],
  },
  {
    key: "sales",
    labelKey: "navGroupSales",
    items: [
      { path: "/leads", labelKey: "navLeads", icon: Tray },
      { path: "/pipeline", labelKey: "navPipeline", icon: Funnel },
      { path: "/customers", labelKey: "navCustomers", icon: Users },
      { path: "/contacts", labelKey: "navContacts", icon: IdentificationCard },
      { path: "/rates", labelKey: "navRates", icon: CurrencyCircleDollar },
      { path: "/quotations", labelKey: "navQuotations", icon: Receipt },
    ],
  },
  {
    key: "ops",
    labelKey: "navGroupOps",
    items: [
      { path: "/jobs", labelKey: "navJobs", icon: Package },
      { path: "/shipments", labelKey: "navShipments", icon: Boat },
      { path: "/boxes", labelKey: "navBoxes", icon: Cube },
      { path: "/yard", labelKey: "navYard", icon: SquaresFour, yardModule: true },
      { path: "/docs", labelKey: "navDocs", icon: FileText },
    ],
  },
  {
    key: "finance",
    labelKey: "navGroupFinance",
    items: [
      { path: "/invoices", labelKey: "navInvoices", icon: Invoice },
      { path: "/vendor-bills", labelKey: "navVendorBills", icon: Receipt },
      { path: "/vendors", labelKey: "navVendors", icon: Storefront },
      { path: "/reports", labelKey: "navReports", icon: ChartBar },
    ],
  },
  {
    key: "system",
    labelKey: "navGroupSystem",
    items: [
      { path: "/automation", labelKey: "navAutomation", icon: Lightning },
      { path: "/notifications", labelKey: "navNotifications", icon: Bell },
      { path: "/settings", labelKey: "navSettings", icon: Gear },
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

export type ResolvedNavGroup = { key: string; label: string; items: (NavItem & { label: string })[] };

export function v2NavForDepartment(
  department: Department | null,
  tx: (key: string) => string,
  opts?: { yardEnabled?: boolean },
): ResolvedNavGroup[] {
  const yardEnabled = opts?.yardEnabled ?? (department === "ops" || department === "admin");
  return v2NavGroups
    .map((g) => ({
      key: g.key,
      label: tx(g.labelKey),
      items: g.items
        .filter((item) => !item.yardModule || yardEnabled)
        .filter((item) => (department ? v2NavPathAllowed(department, item.path) : false))
        .map((item) => ({ ...item, label: tx(item.labelKey) })),
    }))
    .filter((g) => g.items.length > 0);
}

/** Longest nav path that prefixes the current location — drives the active item + page title. */
export function activeNavItem(groups: ResolvedNavGroup[], pathname: string) {
  let best: (NavItem & { label: string }) | null = null;
  for (const g of groups) {
    for (const item of g.items) {
      const hit = item.end ? pathname === item.path : pathname === item.path || pathname.startsWith(item.path + "/");
      if (hit && (!best || item.path.length > best.path.length)) best = item;
    }
  }
  return best;
}

/** Map real API roles to the menu department. Highest-privilege role wins. */
export function departmentFromRoles(roles: readonly string[] | undefined | null): Department | null {
  if (!roles?.length) return null;
  const r = new Set(roles);
  if (r.has("SUPER_ADMIN") || r.has("MANAGEMENT")) return "admin";
  if (r.has("ACCOUNTING")) return "finance";
  if (r.has("SALES") || r.has("PRICING")) return "sales";
  if (r.has("OPERATIONS") || r.has("CUSTOMER_SERVICE")) return "ops";
  return "sales";
}
