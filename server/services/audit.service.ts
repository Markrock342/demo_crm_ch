import type { Db } from "../db/index.js";
import { auditLogs } from "../db/schema/index.js";

export async function writeAudit(
  db: Db,
  input: {
    userId?: string | null;
    /** Organization the entry belongs to (shown in that org's audit log). */
    organizationId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    oldValue?: unknown;
    newValue?: unknown;
  },
) {
  await db.insert(auditLogs).values({
    userId: input.userId ?? null,
    organizationId: input.organizationId ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    oldValue: input.oldValue ?? null,
    newValue: input.newValue ?? null,
  });
}
