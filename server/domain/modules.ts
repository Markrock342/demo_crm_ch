/**
 * Per-organization modules. A company buys / uses only some departments of the product; a module
 * that is OFF hides its menus in the app and its API answers 403 `module_disabled`.
 *
 * Kept free of DB imports so the client can mirror it and tests can run without a database.
 */

export const MODULE_KEYS = ["sales", "cs", "tracking", "docs", "yard", "finance", "automation"] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];
export type ModuleSet = Record<ModuleKey, boolean>;

export const ALL_MODULES_ON: ModuleSet = { sales: true, cs: true, tracking: true, docs: true, yard: true, finance: true, automation: true };

export const MODULE_PRESETS = {
  /** ครบทุกโมดูล */
  full: ALL_MODULES_ON,
  /** การตลาด + บริการลูกค้า — what a marketing + CS customer uses (no finance / yard / documents). */
  marketing_cs: { sales: true, cs: true, tracking: true, docs: false, yard: false, finance: false, automation: true },
} as const satisfies Record<string, ModuleSet>;
export type ModulePreset = keyof typeof MODULE_PRESETS;

export function isModuleKey(k: string): k is ModuleKey {
  return (MODULE_KEYS as readonly string[]).includes(k);
}

/** Stored JSON → full set. Missing / unknown / non-boolean values count as ON. */
export function normalizeModules(raw: unknown): ModuleSet {
  const out: ModuleSet = { ...ALL_MODULES_ON };
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (isModuleKey(k) && typeof v === "boolean") out[k] = v;
    }
  }
  return out;
}

export function presetOf(m: ModuleSet): ModulePreset | null {
  for (const [name, set] of Object.entries(MODULE_PRESETS) as [ModulePreset, ModuleSet][]) {
    if (MODULE_KEYS.every((k) => set[k] === m[k])) return name;
  }
  return null;
}

/** Automation rules that only make sense with a module on (finance rules skip when finance is off). */
export const RULE_MODULE: Record<string, ModuleKey> = {
  job_delayed: "tracking",
  eta_changed: "tracking",
  free_time: "tracking",
  doc_missing: "docs",
  invoice_overdue: "finance",
  quote_expiring: "sales",
  case_assigned: "cs",
  case_sla: "cs",
};

/** Rule keys to skip for this module set (every rule when automation itself is off). */
export function rulesOffByModules(m: ModuleSet, ruleKeys: readonly string[]): string[] {
  if (!m.automation) return [...ruleKeys];
  return ruleKeys.filter((k) => RULE_MODULE[k] && !m[RULE_MODULE[k]!]);
}

const under = (p: string, prefix: string) => p === prefix || p.startsWith(prefix + "/");

const FINANCE_PREFIXES = ["/invoices", "/billing-notes", "/payments", "/vendor-bills", "/finance", "/exports/invoices.csv", "/bulk/invoices"];
const TRACKING_PREFIXES = ["/jobs", "/bookings", "/containers", "/tracking", "/exports/jobs.csv", "/bulk/jobs", "/reports/jobs-summary"];
const SALES_PREFIXES = ["/leads", "/opportunities", "/quotations", "/rates", "/marketing", "/reports/marketing"];
const DOCS_PREFIXES = ["/docs", "/document-templates"];

/**
 * Which disabled module blocks this API call, or null when it may pass.
 * `path` is the request path with or without the `/api` prefix.
 *
 * Never gated: sign-in, users, company profile / settings, notifications, tasks, activities,
 * customers, contacts, mail, import, audit, onboarding, public quote links, the customer portal, cron.
 * - finance off: invoices, billing notes, payments, vendor bills, AR summary, job charges / financials;
 *   vendors too unless sales is on (sales rate forms pick vendors).
 * - tracking off: jobs / bookings / containers — but read-only GETs stay open while cs or sales is on,
 *   so CS can still look up a shipment and sales can see a customer's jobs.
 */
export function blockingModule(method: string, path: string, m: ModuleSet): ModuleKey | null {
  const p = (path.startsWith("/api/") ? path.slice(4) : path).split("?")[0]!.replace(/\/+$/, "") || "/";

  if (!m.finance) {
    if (FINANCE_PREFIXES.some((x) => under(p, x))) return "finance";
    if (/^\/jobs\/[^/]+\/(charges|financials)(\/|$)/.test(p)) return "finance";
    if (under(p, "/vendors") && !m.sales) return "finance";
  }
  if (!m.docs && DOCS_PREFIXES.some((x) => under(p, x))) return "docs";
  if (!m.automation && under(p, "/automation")) return "automation";
  if (!m.cs && under(p, "/cases")) return "cs";
  if (!m.sales && SALES_PREFIXES.some((x) => under(p, x))) return "sales";
  if (!m.tracking && TRACKING_PREFIXES.some((x) => under(p, x))) {
    const read = method === "GET" || method === "HEAD";
    if (read && (m.cs || m.sales)) return null;
    return "tracking";
  }
  return null;
}
