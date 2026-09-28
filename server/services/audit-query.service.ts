import { and, desc, eq, gte, ilike, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { auditLogs, users } from "../db/schema/auth.js";
import { organizationMembers } from "../db/schema/tenancy.js";

/** Read side of the audit log for the admin viewer (Settings → Audit log). */

export type AuditFilter = {
  userId?: string;
  entityType?: string;
  action?: string;
  from?: Date;
  to?: Date;
  q?: string;
  page?: number;
  pageSize?: number;
};

export type AuditChange = { field: string; from?: string | null; to?: string | null };

export type AuditRow = {
  id: string;
  at: string;
  action: string;
  entityType: string;
  entityId: string | null;
  entityLabel: string | null;
  user: { id: string; name: string; email: string } | null;
  changes: AuditChange[];
  /** true when the whole record was captured (create) rather than a before/after diff. */
  created: boolean;
};

const HIDDEN_FIELDS = new Set(["id", "organizationId", "organization_id", "createdAt", "created_at", "updatedAt", "updated_at", "passwordHash", "password", "token", "portalPin", "code"]);
const MAX_CHANGES = 15;

function show(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 120 ? `${s.slice(0, 117)}…` : s;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Field-level differences between two JSON snapshots (top-level keys). */
export function diffValues(oldValue: unknown, newValue: unknown): { changes: AuditChange[]; created: boolean } {
  const oldObj = isPlainObject(oldValue) ? oldValue : null;
  const newObj = isPlainObject(newValue) ? newValue : null;
  const changes: AuditChange[] = [];
  if (oldObj && newObj) {
    const keys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
    for (const k of keys) {
      if (HIDDEN_FIELDS.has(k)) continue;
      if (!(k in newObj)) continue; // partial "after" snapshots: unchanged fields are omitted
      if (JSON.stringify(oldObj[k]) === JSON.stringify(newObj[k])) continue;
      changes.push({ field: k, from: show(oldObj[k]), to: show(newObj[k]) });
    }
    return { changes: changes.slice(0, MAX_CHANGES), created: false };
  }
  if (newObj) {
    for (const [k, v] of Object.entries(newObj)) {
      if (HIDDEN_FIELDS.has(k) || v === null || v === undefined || v === "") continue;
      changes.push({ field: k, to: show(v) });
    }
    return { changes: changes.slice(0, MAX_CHANGES), created: !oldObj };
  }
  if (oldObj) {
    for (const [k, v] of Object.entries(oldObj)) {
      if (HIDDEN_FIELDS.has(k) || v === null || v === undefined || v === "") continue;
      changes.push({ field: k, from: show(v) });
    }
    return { changes: changes.slice(0, MAX_CHANGES), created: false };
  }
  if (newValue !== null && newValue !== undefined) changes.push({ field: "value", to: show(newValue) });
  return { changes, created: false };
}

/** Entries visible to an organization: tagged with it, or untagged (older rows) by one of its members. */
function orgScope(organizationId: string): SQL {
  return or(
    eq(auditLogs.organizationId, organizationId),
    and(
      isNull(auditLogs.organizationId),
      inArray(
        auditLogs.userId,
        sql`(SELECT ${organizationMembers.userId} FROM ${organizationMembers} WHERE ${organizationMembers.organizationId} = ${organizationId})`,
      ),
    ),
  )!;
}

/** Label lookups for "which record": entity type → table + label expression (fixed identifiers only). */
const LABELS: Record<string, { table: string; label: string }> = {
  customer: { table: "customers", label: "coalesce(nullif(name_th,''), name_en)" },
  contact: { table: "contacts", label: "name" },
  lead: { table: "leads", label: "company" },
  opportunity: { table: "opportunities", label: "title" },
  quotation: { table: "quotations", label: "quotation_number" },
  booking: { table: "bookings", label: "booking_number" },
  job: { table: "jobs", label: "job_number" },
  job_task: { table: "job_tasks", label: "title" },
  invoice: { table: "invoices", label: "invoice_number" },
  billing_note: { table: "billing_notes", label: "billing_number" },
  payment: { table: "payments", label: "payment_number" },
  vendor: { table: "vendors", label: "company" },
  vendor_bill: { table: "vendor_bills", label: "bill_number" },
  user: { table: "users", label: "coalesce(nullif(name,''), email)" },
  organization: { table: "organizations", label: "name" },
};

async function resolveLabels(db: Db, rows: { entityType: string; entityId: string | null }[]) {
  const byType = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!r.entityId || !LABELS[r.entityType]) continue;
    if (!byType.has(r.entityType)) byType.set(r.entityType, new Set());
    byType.get(r.entityType)!.add(r.entityId);
  }
  const out = new Map<string, string>();
  for (const [type, ids] of byType) {
    const spec = LABELS[type]!;
    try {
      const res = await db.execute(
        sql`SELECT id::text AS id, ${sql.raw(spec.label)} AS label FROM ${sql.raw(`"${spec.table}"`)} WHERE id::text IN (${sql.join(
          [...ids].map((id) => sql`${id}`),
          sql`, `,
        )})`,
      );
      for (const r of res as unknown as { id: string; label: string | null }[]) {
        if (r.label) out.set(`${type}:${r.id}`, r.label);
      }
    } catch {
      // A missing table/column must never break the viewer.
    }
  }
  return out;
}

function labelFromValue(v: unknown): string | null {
  if (!isPlainObject(v)) return null;
  for (const k of ["invoiceNumber", "quotationNumber", "billingNumber", "jobNumber", "billNumber", "paymentNumber", "bookingNumber", "containerNo", "number", "title", "company", "name", "email"]) {
    if (typeof v[k] === "string" && v[k]) return v[k] as string;
  }
  return null;
}

export async function queryAuditLogs(db: Db, organizationId: string, f: AuditFilter) {
  const pageSize = Math.min(Math.max(f.pageSize ?? 25, 1), 100);
  const page = Math.max(f.page ?? 1, 1);
  const clauses: SQL[] = [orgScope(organizationId)];
  if (f.userId) clauses.push(eq(auditLogs.userId, f.userId));
  if (f.entityType) clauses.push(eq(auditLogs.entityType, f.entityType));
  if (f.action) clauses.push(eq(auditLogs.action, f.action));
  if (f.from) clauses.push(gte(auditLogs.createdAt, f.from));
  if (f.to) clauses.push(lt(auditLogs.createdAt, f.to));
  const q = f.q?.trim();
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    clauses.push(
      or(
        ilike(auditLogs.action, like),
        ilike(auditLogs.entityType, like),
        ilike(auditLogs.entityId, like),
        ilike(users.name, like),
        ilike(users.email, like),
        sql`${auditLogs.newValue}::text ILIKE ${like}`,
        sql`${auditLogs.oldValue}::text ILIKE ${like}`,
      )!,
    );
  }
  const where = and(...clauses);

  const [{ total }] = (await db
    .select({ total: sql<number>`count(*)::int` })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(where)) as [{ total: number }];

  const rows = await db
    .select({ a: auditLogs, userName: users.name, userEmail: users.email })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(where)
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const labels = await resolveLabels(
    db,
    rows.map((r) => ({ entityType: r.a.entityType, entityId: r.a.entityId })),
  );

  const items: AuditRow[] = rows.map(({ a, userName, userEmail }) => {
    const { changes, created } = diffValues(a.oldValue, a.newValue);
    return {
      id: a.id,
      at: a.createdAt.toISOString(),
      action: a.action,
      entityType: a.entityType,
      entityId: a.entityId,
      entityLabel: (a.entityId && labels.get(`${a.entityType}:${a.entityId}`)) || labelFromValue(a.newValue) || labelFromValue(a.oldValue),
      user: a.userId ? { id: a.userId, name: userName ?? "", email: userEmail ?? "" } : null,
      changes,
      created,
    };
  });

  return { items, total: Number(total), page, pageSize };
}

/** Filter options: org members and the entity types / actions that occur in this org's log. */
export async function auditFacets(db: Db, organizationId: string) {
  const members = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(organizationMembers)
    .innerJoin(users, eq(organizationMembers.userId, users.id))
    .where(eq(organizationMembers.organizationId, organizationId))
    .orderBy(users.name);
  const types = await db
    .selectDistinct({ entityType: auditLogs.entityType })
    .from(auditLogs)
    .where(orgScope(organizationId))
    .orderBy(auditLogs.entityType);
  const actions = await db
    .selectDistinct({ action: auditLogs.action })
    .from(auditLogs)
    .where(orgScope(organizationId))
    .orderBy(auditLogs.action);
  return { users: members, entityTypes: types.map((t) => t.entityType), actions: actions.map((a) => a.action) };
}
