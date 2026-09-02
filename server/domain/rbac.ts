export const ROLES = [
  "SUPER_ADMIN",
  "MANAGEMENT",
  "SALES",
  "PRICING",
  "CUSTOMER_SERVICE",
  "OPERATIONS",
  "ACCOUNTING",
  "VIEWER",
] as const;

export type RoleCode = (typeof ROLES)[number];

export const PERMISSIONS = [
  "customer.view",
  "customer.create",
  "customer.edit",
  "rate.view_sell",
  "rate.view_buy",
  "rate.create",
  "rate.edit",
  "margin.view",
  "quotation.view",
  "quotation.create",
  "quotation.edit",
  "quotation.send",
  "quotation.approve",
  "shipment.view",
  "shipment.edit",
  "container.edit",
  "finance.revenue.view",
  "finance.cost.view",
  "finance.margin.view",
  "invoice.view",
  "invoice.create",
  "invoice.issue",
  "billing.view",
  "billing.create",
  "payment.view",
  "payment.record",
  "vendor_bill.view",
  "vendor_bill.create",
  "vendor_bill.approve",
  "report.sales.view",
  "report.finance.view",
  "user.manage",
  "audit.view",
  // legacy aliases
  "rate.buy.view",
  "rate.sell.view",
  "billing.edit",
] as const;

export type PermissionCode = (typeof PERMISSIONS)[number];

const ALL = new Set<PermissionCode>(PERMISSIONS);

export const ROLE_PERMISSIONS: Record<RoleCode, readonly PermissionCode[]> = {
  SUPER_ADMIN: PERMISSIONS,
  MANAGEMENT: [
    "customer.view",
    "customer.edit",
    "rate.view_buy",
    "rate.view_sell",
    "rate.create",
    "rate.edit",
    "margin.view",
    "finance.margin.view",
    "quotation.view",
    "quotation.approve",
    "quotation.send",
    "shipment.view",
    "shipment.edit",
    "container.edit",
    "finance.revenue.view",
    "finance.cost.view",
    "invoice.view",
    "invoice.issue",
    "billing.view",
    "billing.create",
    "payment.view",
    "payment.record",
    "vendor_bill.view",
    "vendor_bill.approve",
    "report.sales.view",
    "report.finance.view",
    "audit.view",
    "rate.buy.view",
    "rate.sell.view",
    "billing.edit",
  ],
  SALES: [
    "customer.view",
    "customer.create",
    "customer.edit",
    "rate.view_sell",
    "rate.sell.view",
    "quotation.view",
    "quotation.create",
    "quotation.edit",
    "quotation.send",
    "margin.view",
    "shipment.view",
    "finance.revenue.view",
    "invoice.view",
    "report.sales.view",
  ],
  PRICING: [
    "customer.view",
    "rate.view_buy",
    "rate.view_sell",
    "rate.buy.view",
    "rate.sell.view",
    "rate.create",
    "rate.edit",
    "margin.view",
    "finance.margin.view",
    "quotation.view",
    "quotation.create",
    "quotation.approve",
    "quotation.send",
    "report.sales.view",
  ],
  CUSTOMER_SERVICE: ["customer.view", "customer.edit", "shipment.view", "shipment.edit", "container.edit"],
  OPERATIONS: ["customer.view", "shipment.view", "shipment.edit", "container.edit", "finance.cost.view"],
  ACCOUNTING: [
    "customer.view",
    "shipment.view",
    "finance.revenue.view",
    "finance.cost.view",
    "finance.margin.view",
    "margin.view",
    "invoice.view",
    "invoice.create",
    "invoice.issue",
    "billing.view",
    "billing.create",
    "billing.edit",
    "payment.view",
    "payment.record",
    "vendor_bill.view",
    "vendor_bill.create",
    "vendor_bill.approve",
    "report.finance.view",
  ],
  VIEWER: ["customer.view", "quotation.view", "shipment.view", "invoice.view"],
};

export function permissionsForRoles(roles: RoleCode[]): Set<PermissionCode> {
  const out = new Set<PermissionCode>();
  for (const role of roles) {
    for (const p of ROLE_PERMISSIONS[role] ?? []) {
      if (ALL.has(p)) out.add(p);
    }
  }
  return out;
}

export function hasPermission(roles: RoleCode[], perm: PermissionCode): boolean {
  if (roles.includes("SUPER_ADMIN")) return true;
  const set = permissionsForRoles(roles);
  if (set.has(perm)) return true;
  // legacy alias mapping
  if (perm === "rate.buy.view" && set.has("rate.view_buy")) return true;
  if (perm === "rate.sell.view" && set.has("rate.view_sell")) return true;
  if (perm === "billing.edit" && set.has("billing.create")) return true;
  return false;
}

export function canViewBuyRate(roles: RoleCode[]): boolean {
  return hasPermission(roles, "rate.view_buy") || hasPermission(roles, "rate.buy.view");
}

export function canViewMargin(roles: RoleCode[]): boolean {
  return hasPermission(roles, "margin.view") || hasPermission(roles, "finance.margin.view");
}
