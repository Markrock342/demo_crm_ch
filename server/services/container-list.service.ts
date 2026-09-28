import { and, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { containers } from "../db/schema/operations.js";

/** Paged containers list: search (box no. / B/L / vessel / seal / yard), status, customer, job + counts per status. */
export async function listContainersPage(
  db: Db,
  organizationId: string,
  o: { q?: string; status?: string; statuses?: string[]; customerId?: string; jobId?: string; limit: number; offset: number },
) {
  const scope: SQL[] = [eq(containers.organizationId, organizationId)];
  if (o.customerId) scope.push(eq(containers.customerId, o.customerId));
  if (o.jobId) scope.push(eq(containers.jobId, o.jobId));
  const q = o.q?.trim();
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    scope.push(
      or(
        ilike(containers.containerNo, like),
        ilike(containers.bl, like),
        ilike(containers.vessel, like),
        ilike(containers.seal, like),
        ilike(containers.yardCode, like),
      )!,
    );
  }
  const where = [...scope];
  if (o.status) where.push(eq(containers.status, o.status));
  if (o.statuses?.length) where.push(inArray(containers.status, o.statuses));

  const [rows, countRows] = await Promise.all([
    db
      .select()
      .from(containers)
      .where(and(...where))
      .orderBy(desc(containers.updatedAt), containers.id)
      .limit(o.limit)
      .offset(o.offset),
    db
      .select({ status: containers.status, n: sql<number>`count(*)::int` })
      .from(containers)
      .where(and(...scope))
      .groupBy(containers.status),
  ]);
  const counts: Record<string, number> = { all: 0 };
  for (const r of countRows) {
    counts[r.status] = Number(r.n);
    counts.all += Number(r.n);
  }
  const total = o.status ? (counts[o.status] ?? 0) : o.statuses?.length ? o.statuses.reduce((n, s) => n + (counts[s] ?? 0), 0) : counts.all;
  return { rows, total, counts };
}
