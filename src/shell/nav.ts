import type { Department } from "./types.ts";

/** Nav item paths allowed per department. Logistics routes never included. */
const allowedByDept: Record<Department, ReadonlySet<string>> = {
  sales: new Set([
    "/",
    "/pipeline",
    "/leads",
    "/customers",
    "/contacts",
    "/rates",
    "/quotations",
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
  return "/";
}
