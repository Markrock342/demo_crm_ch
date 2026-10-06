import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { businessUnits } from "../db/schema/inbox.js";
import { writeAudit } from "./audit.service.js";

/** Business units in the client's group (ธุรกิจในเครือ): port, empty depot, barge, CFS, trucking … */

export const UNIT_COLORS = ["teal", "blue", "amber", "violet", "rose", "slate"] as const;
export type UnitColor = (typeof UNIT_COLORS)[number];

export type BusinessUnitDto = { id: string; name: string; color: UnitColor | null; sortOrder: number; archived: boolean };

const toDto = (r: typeof businessUnits.$inferSelect): BusinessUnitDto => ({
  id: r.id,
  name: r.name,
  color: (r.color as UnitColor | null) ?? null,
  sortOrder: r.sortOrder,
  archived: Boolean(r.archivedAt),
});

export async function listBusinessUnits(db: Db, organizationId: string, includeArchived = false) {
  const rows = await db
    .select()
    .from(businessUnits)
    .where(and(eq(businessUnits.organizationId, organizationId), includeArchived ? undefined : isNull(businessUnits.archivedAt)))
    .orderBy(asc(businessUnits.sortOrder), asc(businessUnits.createdAt));
  return rows.map(toDto);
}

export type BusinessUnitInput = { name?: string; color?: UnitColor | null; sortOrder?: number; archived?: boolean };

export async function createBusinessUnit(db: Db, organizationId: string, userId: string, input: { name: string; color?: UnitColor | null; sortOrder?: number }) {
  const existing = await listBusinessUnits(db, organizationId, true);
  const [row] = await db
    .insert(businessUnits)
    .values({
      id: `bu_${randomUUID()}`,
      organizationId,
      name: input.name.trim(),
      color: input.color ?? UNIT_COLORS[existing.length % UNIT_COLORS.length],
      sortOrder: input.sortOrder ?? (existing.at(-1)?.sortOrder ?? 0) + 10,
    })
    .returning();
  const dto = toDto(row!);
  await writeAudit(db, { userId, organizationId, action: "BUSINESS_UNIT_CREATED", entityType: "business_unit", entityId: dto.id, newValue: dto });
  return dto;
}

export async function updateBusinessUnit(db: Db, organizationId: string, userId: string, id: string, patch: BusinessUnitInput) {
  const [before] = await db
    .select()
    .from(businessUnits)
    .where(and(eq(businessUnits.id, id), eq(businessUnits.organizationId, organizationId)))
    .limit(1);
  if (!before) return null;
  const set: Partial<typeof businessUnits.$inferInsert> = { updatedAt: new Date() };
  if (patch.name !== undefined) set.name = patch.name.trim();
  if (patch.color !== undefined) set.color = patch.color;
  if (patch.sortOrder !== undefined) set.sortOrder = patch.sortOrder;
  // Archived units keep their tags on old cases / customers but leave pickers and filters.
  if (patch.archived !== undefined) set.archivedAt = patch.archived ? (before.archivedAt ?? new Date()) : null;
  const [row] = await db.update(businessUnits).set(set).where(eq(businessUnits.id, id)).returning();
  const dto = toDto(row!);
  await writeAudit(db, { userId, organizationId, action: "BUSINESS_UNIT_UPDATED", entityType: "business_unit", entityId: id, oldValue: toDto(before), newValue: dto });
  return dto;
}
