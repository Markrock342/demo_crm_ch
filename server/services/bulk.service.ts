import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { invoices } from "../db/schema/finance.js";
import { jobs } from "../db/schema/operations.js";
import { userHasOrganizationAccess } from "./tenancy.service.js";

/** Bulk actions on the jobs / invoices lists. Every id is checked against the organization. */

export const BULK_MAX = 500;
/** Operational job statuses people can set in bulk (same codes the booking flow writes). */
export const JOB_BULK_STATUSES = ["BOOKING", "GATE_IN", "SAIL", "ARRIVED", "DELIVERED"] as const;
export type JobBulkStatus = (typeof JOB_BULK_STATUSES)[number];

export class BulkError extends Error {
  status: 400 | 404;
  field?: string;
  constructor(code: string, status: 400 | 404, field?: string) {
    super(code);
    this.status = status;
    this.field = field;
  }
}

/** Ids that exist in this org (keeps the order given). Throws 404 when any id is foreign / unknown. */
async function ownJobIds(db: Db, organizationId: string, ids: string[]) {
  const rows = await db
    .select({ id: jobs.id, status: jobs.status, salesOwnerId: jobs.salesOwnerId, assignedOperator: jobs.assignedOperator })
    .from(jobs)
    .where(and(eq(jobs.organizationId, organizationId), inArray(jobs.id, ids)));
  if (rows.length !== new Set(ids).size) throw new BulkError("not_found", 404, "ids");
  return rows;
}

export async function bulkSetJobStatus(db: Db, organizationId: string, ids: string[], status: JobBulkStatus) {
  const before = await ownJobIds(db, organizationId, ids);
  const changed = before.filter((r) => r.status !== status);
  if (changed.length) {
    await db
      .update(jobs)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(jobs.organizationId, organizationId), inArray(jobs.id, changed.map((r) => r.id))));
  }
  return { updated: changed.length, unchanged: before.length - changed.length, before: changed.map((r) => ({ id: r.id, status: r.status })) };
}

export async function bulkAssignJobOwner(
  db: Db,
  organizationId: string,
  ids: string[],
  field: "sales" | "ops",
  userId: string | null,
) {
  if (userId && !(await userHasOrganizationAccess(db, userId, organizationId))) throw new BulkError("user_not_found", 404, "userId");
  const before = await ownJobIds(db, organizationId, ids);
  const col = field === "sales" ? "salesOwnerId" : "assignedOperator";
  const changed = before.filter((r) => r[col] !== userId);
  if (changed.length) {
    await db
      .update(jobs)
      .set(field === "sales" ? { salesOwnerId: userId, updatedAt: new Date() } : { assignedOperator: userId, updatedAt: new Date() })
      .where(and(eq(jobs.organizationId, organizationId), inArray(jobs.id, changed.map((r) => r.id))));
  }
  return { updated: changed.length, unchanged: before.length - changed.length, before: changed.map((r) => ({ id: r.id, [col]: r[col] })) };
}

/** Issue every DRAFT among the ids; non-drafts are reported as skipped (not an error). */
export async function bulkIssueInvoices(db: Db, organizationId: string, ids: string[], issuedBy: string) {
  const rows = await db
    .select({ id: invoices.id, status: invoices.status, invoiceNumber: invoices.invoiceNumber })
    .from(invoices)
    .where(and(eq(invoices.organizationId, organizationId), inArray(invoices.id, ids)));
  if (rows.length !== new Set(ids).size) throw new BulkError("not_found", 404, "ids");
  const drafts = rows.filter((r) => r.status === "DRAFT");
  if (drafts.length) {
    const now = new Date();
    await db
      .update(invoices)
      .set({ status: "ISSUED", issuedBy, issuedAt: now, updatedAt: now })
      .where(and(eq(invoices.organizationId, organizationId), inArray(invoices.id, drafts.map((r) => r.id)), eq(invoices.status, "DRAFT")));
  }
  return {
    issued: drafts.map((r) => ({ id: r.id, invoiceNumber: r.invoiceNumber })),
    skipped: rows.filter((r) => r.status !== "DRAFT").map((r) => ({ id: r.id, invoiceNumber: r.invoiceNumber, status: r.status })),
  };
}

/** RFC 4180 CSV with a UTF-8 BOM so Excel opens Thai / Chinese text correctly. */
export function toCsv(header: string[], rows: Array<Array<string | number | boolean | null | undefined>>): string {
  const cell = (v: string | number | boolean | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    // Neutralize spreadsheet formulas (CSV injection).
    const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return "﻿" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
