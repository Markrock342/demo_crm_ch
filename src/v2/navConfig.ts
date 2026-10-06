import type { Department } from "../shell/types.ts";
import type { ModuleKey, ModuleSet } from "../api/modules.ts";

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
  FileXls,
  Headset,
  PresentationChart,
} from "@phosphor-icons/react";

export type NavItem = {
  path: string;
  labelKey: string;
  icon: Icon;
  end?: boolean;
  /** Yard page (yard module; ops/admin menus only). */
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
      { path: "/cases", labelKey: "nav_cases", icon: Headset },
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
      { path: "/reports/marketing", labelKey: "nav_mkt_reports", icon: PresentationChart },
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
      { path: "/import", labelKey: "im_title", icon: FileXls },
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
    "/reports/marketing",
    "/settings",
  ]),
  marketing: new Set([
    "/",
    "/tasks",
    "/inbox",
    "/calendar",
    "/leads",
    "/pipeline",
    "/customers",
    "/contacts",
    "/quotations",
    "/rates",
    "/reports/marketing",
    "/notifications",
    "/settings",
  ]),
  cs: new Set([
    "/",
    "/cases",
    "/inbox",
    "/tasks",
    "/calendar",
    "/customers",
    "/contacts",
    "/jobs",
    "/shipments",
    "/boxes",
    "/notifications",
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
    "/cases",
    "/reports/marketing",
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
    "/import",
    "/settings",
  ]),
};

/**
 * Which company module a page belongs to (longest prefix wins, so /reports/marketing ≠ /reports).
 * Customers / contacts belong to sales OR customer service; pages not listed are always on.
 */
const PATH_MODULES: [string, ModuleKey[]][] = [
  ["/leads", ["sales"]],
  ["/pipeline", ["sales"]],
  ["/quotations", ["sales"]],
  ["/rates", ["sales"]],
  ["/reports/marketing", ["sales"]],
  ["/customers", ["sales", "cs"]],
  ["/contacts", ["sales", "cs"]],
  ["/cases", ["cs"]],
  ["/inbox", ["cs"]],
  ["/jobs", ["tracking"]],
  ["/shipments", ["tracking"]],
  ["/boxes", ["tracking"]],
  ["/docs", ["docs"]],
  ["/yard", ["yard"]],
  ["/invoices", ["finance"]],
  ["/vendor-bills", ["finance"]],
  ["/vendors", ["finance"]],
  ["/reports", ["finance"]],
  ["/automation", ["automation"]],
];

/** Modules a path needs (any one of them on is enough); null = not tied to a module. */
export function modulesForPath(pathname: string): ModuleKey[] | null {
  let best: [string, ModuleKey[]] | null = null;
  for (const entry of PATH_MODULES) {
    const [p] = entry;
    if ((pathname === p || pathname.startsWith(p + "/")) && (!best || p.length > best[0].length)) best = entry;
  }
  return best ? best[1] : null;
}

/** The module that switches this path off, or null when the page may show. */
export function disabledModuleForPath(pathname: string, modules: ModuleSet | null | undefined): ModuleKey | null {
  if (!modules) return null;
  const need = modulesForPath(pathname);
  if (!need || need.some((m) => modules[m] !== false)) return null;
  return need[0]!;
}

export function v2NavPathAllowed(department: Department | null, path: string, modules?: ModuleSet | null): boolean {
  if (!department) return false;
  return allowedByDept[department].has(path) && !disabledModuleForPath(path, modules);
}

export type ResolvedNavGroup = { key: string; label: string; items: (NavItem & { label: string })[] };

/** Sidebar for a department, minus pages of modules the company has turned off. */
export function v2NavForDepartment(
  department: Department | null,
  tx: (key: string) => string,
  opts?: { modules?: ModuleSet | null },
): ResolvedNavGroup[] {
  return v2NavGroups
    .map((g) => ({
      key: g.key,
      label: tx(g.labelKey),
      items: g.items
        .filter((item) => v2NavPathAllowed(department, item.path, opts?.modules))
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
  if (r.has("MARKETING")) return "marketing";
  if (r.has("OPERATIONS")) return "ops";
  if (r.has("CUSTOMER_SERVICE")) return "cs";
  return "sales";
}
