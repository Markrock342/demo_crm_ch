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
  "rate.buy.view",
  "rate.sell.view",
  "margin.view",
  "quotation.create",
  "quotation.approve",
  "shipment.edit",
  "container.edit",
  "billing.view",
  "billing.edit",
  "report.finance.view",
  "user.manage",
  "customer.view",
  "customer.edit",
  "audit.view",
] as const;

export type PermissionCode = (typeof PERMISSIONS)[number];

const ALL = new Set<PermissionCode>(PERMISSIONS);

export const ROLE_PERMISSIONS: Record<RoleCode, readonly PermissionCode[]> = {
  SUPER_ADMIN: PERMISSIONS,
  MANAGEMENT: [
    "rate.buy.view",
    "rate.sell.view",
    "margin.view",
    "quotation.approve",
    "shipment.edit",
    "container.edit",
    "billing.view",
    "billing.edit",
    "report.finance.view",
    "customer.view",
    "customer.edit",
    "audit.view",
  ],
  SALES: ["rate.sell.view", "quotation.create", "customer.view", "customer.edit", "margin.view"],
  PRICING: ["rate.buy.view", "rate.sell.view", "margin.view", "quotation.create", "quotation.approve"],
  CUSTOMER_SERVICE: ["customer.view", "customer.edit", "shipment.edit", "container.edit"],
  OPERATIONS: ["shipment.edit", "container.edit", "customer.view"],
  ACCOUNTING: ["billing.view", "billing.edit", "report.finance.view", "customer.view", "margin.view"],
  VIEWER: ["customer.view"],
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
  return permissionsForRoles(roles).has(perm);
}
