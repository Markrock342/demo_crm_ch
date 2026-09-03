import type { Department } from "./types.ts";

/** Nav allowlists per department (mirrors locked product matrix). */
const allowedByDept: Record<Department, ReadonlySet<string>> = {
  sales: new Set([
    "/",
    "/pipeline",
    "/leads",
    "/customers",
    "/contacts",
    "/rates",
    "/quotations",
    "/boxes",
    "/shipments",
    "/tasks",
    "/calendar",
    "/settings",
  ]),
  ops: new Set([
    "/yard",
    "/boxes",
    "/shipments",
    "/jobs",
    "/docs",
    "/tasks",
    "/calendar",
    "/settings",
  ]),
  finance: new Set(["/invoices", "/vendor-bills", "/reports", "/settings"]),
  admin: new Set([
    "/",
    "/pipeline",
    "/leads",
    "/customers",
    "/contacts",
    "/rates",
    "/quotations",
    "/jobs",
    "/invoices",
    "/vendor-bills",
    "/boxes",
    "/shipments",
    "/yard",
    "/inbox",
    "/docs",
    "/tasks",
    "/calendar",
    "/reports",
    "/settings",
  ]),
};

export function navPathAllowed(department: Department | null, path: string): boolean {
  if (!department) return false;
  return allowedByDept[department].has(path);
}

export function homePathFor(department: Department): string {
  if (department === "finance") return "/invoices";
  if (department === "ops") return "/yard";
  return "/";
}

/** Sales tracks boxes/shipments read-only; Ops/Admin can mutate logistics. */
export function canEditLogistics(department: Department | null): boolean {
  return department === "ops" || department === "admin";
}
