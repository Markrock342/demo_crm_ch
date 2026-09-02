import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { containers } from "../db/schema/operations.js";

export type ContainerDto = {
  id: string;
  jobId: string | null;
  customerId: string;
  containerNo: string;
  type: string;
  status: string;
  direction: string;
  bl: string | null;
  pol: string | null;
  pod: string | null;
  teu: number;
  eta: string | null;
  yardCode: string | null;
  vessel: string | null;
  seal: string | null;
  commodity: string | null;
};

function toDto(row: typeof containers.$inferSelect): ContainerDto {
  return {
    id: row.id,
    jobId: row.jobId,
    customerId: row.customerId,
    containerNo: row.containerNo,
    type: row.type,
    status: row.status,
    direction: row.direction,
    bl: row.bl,
    pol: row.pol,
    pod: row.pod,
    teu: row.teu,
    eta: row.eta ? String(row.eta) : null,
    yardCode: row.yardCode,
    vessel: row.vessel,
    seal: row.seal,
    commodity: row.commodity,
  };
}

export async function listContainers(
  db: Db,
  filters?: { status?: string; customerId?: string; statuses?: string[] },
) {
  const clauses = [];
  if (filters?.customerId) clauses.push(eq(containers.customerId, filters.customerId));
  if (filters?.status) clauses.push(eq(containers.status, filters.status));
  if (filters?.statuses?.length) clauses.push(inArray(containers.status, filters.statuses));

  const rows = await db
    .select()
    .from(containers)
    .where(clauses.length ? and(...clauses) : undefined)
    .orderBy(desc(containers.updatedAt));
  return rows.map(toDto);
}

export async function getContainer(db: Db, id: string) {
  const [row] = await db.select().from(containers).where(eq(containers.id, id)).limit(1);
  return row ? toDto(row) : null;
}

export async function createContainer(
  db: Db,
  input: {
    customerId: string;
    containerNo: string;
    type: string;
    direction: string;
    status?: string;
    bl?: string;
    yardCode?: string;
    teu?: number;
    eta?: string;
    jobId?: string;
    pol?: string;
    pod?: string;
    vessel?: string;
    seal?: string;
    commodity?: string;
  },
) {
  const containerNo = input.containerNo.trim().toUpperCase();
  const id = `ctr-${containerNo}`;
  const [row] = await db
    .insert(containers)
    .values({
      id,
      customerId: input.customerId,
      containerNo,
      type: input.type,
      direction: input.direction,
      status: input.status ?? "yard",
      bl: input.bl ?? null,
      yardCode: input.yardCode ?? null,
      teu: input.teu ?? (input.type.includes("20") ? 1 : 2),
      eta: input.eta ? input.eta : null,
      jobId: input.jobId ?? null,
      pol: input.pol ?? null,
      pod: input.pod ?? null,
      vessel: input.vessel ?? null,
      seal: input.seal ?? null,
      commodity: input.commodity ?? null,
    })
    .returning();
  return toDto(row);
}

export async function updateContainer(
  db: Db,
  id: string,
  patch: {
    status?: string;
    yardCode?: string;
    bl?: string;
    eta?: string | null;
    vessel?: string | null;
    jobId?: string | null;
  },
) {
  const [row] = await db
    .update(containers)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(containers.id, id))
    .returning();
  return row ? toDto(row) : null;
}

export async function countContainersByCustomer(db: Db, customerId: string) {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(containers)
    .where(eq(containers.customerId, customerId));
  return count;
}
