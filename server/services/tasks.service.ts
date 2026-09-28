import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, ilike, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { customers } from "../db/schema/crm.js";
import { jobs } from "../db/schema/operations.js";
import { activities, tasks } from "../db/schema/tasks.js";
import { organizationMembers } from "../db/schema/tenancy.js";
import { writeAudit } from "./audit.service.js";

export const TASK_PRIORITIES = ["high", "mid", "low"] as const;
export const TASK_STATUSES = ["open", "done"] as const;
export const ACTIVITY_TYPES = ["call", "mail", "meet", "note", "task"] as const;

export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** Who is asking: own tasks always; everyone's with task.view_all. */
export type TaskActor = { userId: string; viewAll: boolean };

export class TaskInputError extends Error {
  code: string;
  field?: string;
  constructor(code: string, field?: string) {
    super(code);
    this.code = code;
    this.field = field;
  }
}

export type TaskDto = {
  id: string;
  title: string;
  notes: string | null;
  dueAt: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  done: boolean;
  ownerUserId: string | null;
  customerId: string | null;
  jobId: string | null;
  jobNumber: string | null;
  containerNo: string | null;
  createdBy: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ActivityDto = {
  id: string;
  type: ActivityType;
  body: string;
  customerId: string | null;
  jobId: string | null;
  taskId: string | null;
  userId: string | null;
  occurredAt: string;
};

const iso = (d: Date | null) => (d ? d.toISOString() : null);

const taskSelect = {
  task: tasks,
  jobNumber: jobs.jobNumber,
};

function toTaskDto(row: { task: typeof tasks.$inferSelect; jobNumber: string | null }): TaskDto {
  const t = row.task;
  return {
    id: t.id,
    title: t.title,
    notes: t.notes,
    dueAt: iso(t.dueAt),
    priority: (TASK_PRIORITIES as readonly string[]).includes(t.priority) ? (t.priority as TaskPriority) : "mid",
    status: t.status === "done" ? "done" : "open",
    done: t.status === "done",
    ownerUserId: t.ownerUserId,
    customerId: t.customerId,
    jobId: t.jobId,
    jobNumber: row.jobNumber ?? null,
    containerNo: t.containerNo,
    createdBy: t.createdBy,
    completedAt: iso(t.completedAt),
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

function toActivityDto(a: typeof activities.$inferSelect): ActivityDto {
  return {
    id: a.id,
    type: (ACTIVITY_TYPES as readonly string[]).includes(a.type) ? (a.type as ActivityType) : "note",
    body: a.body,
    customerId: a.customerId,
    jobId: a.jobId,
    taskId: a.taskId,
    userId: a.userId,
    occurredAt: a.occurredAt.toISOString(),
  };
}

/** Rows this actor may see / change. */
function visibleTo(actor: TaskActor): SQL | undefined {
  if (actor.viewAll) return undefined;
  return or(eq(tasks.ownerUserId, actor.userId), eq(tasks.createdBy, actor.userId));
}

// ---- reference checks (ids must belong to the caller's organization) -------

async function assertMember(db: Db, organizationId: string, userId: string, field: string) {
  const [m] = await db
    .select({ id: organizationMembers.userId })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, userId)))
    .limit(1);
  if (!m) throw new TaskInputError("unknown_user", field);
}

async function assertCustomer(db: Db, organizationId: string, id: string) {
  const [c] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, id), eq(customers.organizationId, organizationId)))
    .limit(1);
  if (!c) throw new TaskInputError("unknown_customer", "customerId");
}

/** Returns the job's customer so a task on a job inherits it. */
async function assertJob(db: Db, organizationId: string, id: string) {
  const [j] = await db
    .select({ id: jobs.id, customerId: jobs.customerId })
    .from(jobs)
    .where(and(eq(jobs.id, id), eq(jobs.organizationId, organizationId)))
    .limit(1);
  if (!j) throw new TaskInputError("unknown_job", "jobId");
  return j;
}

// ---- tasks -------------------------------------------------------------------

export type TaskListFilter = {
  /** "mine" = owned by the caller (default for everyone); "all" = everything the caller may see. */
  scope?: "mine" | "all";
  ownerUserId?: string;
  /** Only tasks with no owner. */
  unassigned?: boolean;
  customerId?: string;
  jobId?: string;
  status?: TaskStatus | "all";
  dueFrom?: Date;
  dueTo?: Date;
  q?: string;
  limit?: number;
  offset?: number;
};

export async function listTasks(db: Db, organizationId: string, actor: TaskActor, f: TaskListFilter = {}) {
  const conds: (SQL | undefined)[] = [eq(tasks.organizationId, organizationId), visibleTo(actor)];
  if ((f.scope ?? "mine") === "mine") conds.push(eq(tasks.ownerUserId, actor.userId));
  if (f.ownerUserId) conds.push(eq(tasks.ownerUserId, f.ownerUserId));
  if (f.unassigned) conds.push(isNull(tasks.ownerUserId));
  if (f.customerId) conds.push(eq(tasks.customerId, f.customerId));
  if (f.jobId) conds.push(eq(tasks.jobId, f.jobId));
  if (f.status && f.status !== "all") conds.push(eq(tasks.status, f.status));
  if (f.dueFrom) conds.push(gte(tasks.dueAt, f.dueFrom));
  if (f.dueTo) conds.push(lte(tasks.dueAt, f.dueTo));
  if (f.q?.trim()) {
    const like = `%${f.q.trim().replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    conds.push(or(ilike(tasks.title, like), ilike(tasks.containerNo, like), ilike(tasks.notes, like)));
  }
  const where = and(...conds);
  const limit = Math.min(Math.max(Math.trunc(f.limit ?? 200), 1), 500);
  const offset = Math.max(Math.trunc(f.offset ?? 0), 0);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select(taskSelect)
      .from(tasks)
      .leftJoin(jobs, eq(tasks.jobId, jobs.id))
      .where(where)
      // Open first, then soonest due (no due date last), newest first.
      .orderBy(asc(tasks.status), sql`${tasks.dueAt} asc nulls last`, desc(tasks.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(tasks).where(where),
  ]);
  return { items: rows.map(toTaskDto), total, limit, offset };
}

export async function getTask(db: Db, organizationId: string, actor: TaskActor, id: string) {
  const [row] = await db
    .select(taskSelect)
    .from(tasks)
    .leftJoin(jobs, eq(tasks.jobId, jobs.id))
    .where(and(eq(tasks.id, id), eq(tasks.organizationId, organizationId), visibleTo(actor)))
    .limit(1);
  return row ? toTaskDto(row) : null;
}

export type TaskInput = {
  title: string;
  notes?: string | null;
  dueAt?: string | null;
  priority?: TaskPriority;
  ownerUserId?: string | null;
  customerId?: string | null;
  jobId?: string | null;
  containerNo?: string | null;
};

const clean = (v: string | null | undefined) => {
  const s = (v ?? "").trim();
  return s ? s : null;
};

export async function createTask(db: Db, organizationId: string, actor: TaskActor, input: TaskInput) {
  const ownerUserId = input.ownerUserId === undefined ? actor.userId : input.ownerUserId;
  if (ownerUserId) await assertMember(db, organizationId, ownerUserId, "ownerUserId");
  let customerId = clean(input.customerId);
  if (customerId) await assertCustomer(db, organizationId, customerId);
  const jobId = clean(input.jobId);
  if (jobId) {
    const job = await assertJob(db, organizationId, jobId);
    customerId ??= job.customerId;
  }
  const id = `tk_${randomUUID()}`;
  await db.insert(tasks).values({
    id,
    organizationId,
    title: input.title.trim(),
    notes: clean(input.notes),
    dueAt: input.dueAt ? new Date(input.dueAt) : null,
    priority: input.priority ?? "mid",
    status: "open",
    ownerUserId,
    customerId,
    jobId,
    containerNo: clean(input.containerNo)?.toUpperCase() ?? null,
    createdBy: actor.userId,
  });
  const dto = (await getTask(db, organizationId, { ...actor, viewAll: true }, id))!;
  await writeAudit(db, { userId: actor.userId, action: "TASK_CREATED", entityType: "task", entityId: id, newValue: dto });
  return dto;
}

export type TaskPatch = Partial<TaskInput> & { status?: TaskStatus };

/** Returns null when the task does not exist in this org or the actor may not touch it. */
export async function updateTask(db: Db, organizationId: string, actor: TaskActor, id: string, patch: TaskPatch) {
  const before = await getTask(db, organizationId, actor, id);
  if (!before) return null;

  const set: Partial<typeof tasks.$inferInsert> = { updatedAt: new Date() };
  if (patch.title !== undefined) set.title = patch.title.trim();
  if (patch.notes !== undefined) set.notes = clean(patch.notes);
  if (patch.dueAt !== undefined) set.dueAt = patch.dueAt ? new Date(patch.dueAt) : null;
  if (patch.priority !== undefined) set.priority = patch.priority;
  if (patch.containerNo !== undefined) set.containerNo = clean(patch.containerNo)?.toUpperCase() ?? null;
  if (patch.ownerUserId !== undefined) {
    if (patch.ownerUserId) await assertMember(db, organizationId, patch.ownerUserId, "ownerUserId");
    set.ownerUserId = patch.ownerUserId || null;
  }
  if (patch.customerId !== undefined) {
    const c = clean(patch.customerId);
    if (c) await assertCustomer(db, organizationId, c);
    set.customerId = c;
  }
  if (patch.jobId !== undefined) {
    const j = clean(patch.jobId);
    if (j) {
      const job = await assertJob(db, organizationId, j);
      if (patch.customerId === undefined && !before.customerId) set.customerId = job.customerId;
    }
    set.jobId = j;
  }
  if (patch.status !== undefined && patch.status !== before.status) {
    set.status = patch.status;
    set.completedAt = patch.status === "done" ? new Date() : null;
  }

  await db.update(tasks).set(set).where(and(eq(tasks.id, id), eq(tasks.organizationId, organizationId)));
  const after = (await getTask(db, organizationId, { ...actor, viewAll: true }, id))!;
  const action =
    set.status === "done" ? "TASK_COMPLETED" : set.status === "open" ? "TASK_REOPENED" : "TASK_UPDATED";
  await writeAudit(db, { userId: actor.userId, action, entityType: "task", entityId: id, oldValue: before, newValue: after });

  // Finishing a task linked to a customer / job leaves a trace on its timeline.
  if (set.status === "done" && (after.customerId || after.jobId)) {
    await db.insert(activities).values({
      id: `ac_${randomUUID()}`,
      organizationId,
      type: "task",
      body: after.title,
      customerId: after.customerId,
      jobId: after.jobId,
      taskId: after.id,
      userId: actor.userId,
    });
  }
  return after;
}

export async function deleteTask(db: Db, organizationId: string, actor: TaskActor, id: string) {
  const before = await getTask(db, organizationId, actor, id);
  if (!before) return false;
  await db.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.organizationId, organizationId)));
  await writeAudit(db, { userId: actor.userId, action: "TASK_DELETED", entityType: "task", entityId: id, oldValue: before });
  return true;
}

// ---- activities ---------------------------------------------------------------

export type ActivityListFilter = {
  customerId?: string;
  jobId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
};

export async function listActivities(db: Db, organizationId: string, f: ActivityListFilter = {}) {
  const conds: (SQL | undefined)[] = [eq(activities.organizationId, organizationId)];
  if (f.customerId) conds.push(eq(activities.customerId, f.customerId));
  if (f.jobId) conds.push(eq(activities.jobId, f.jobId));
  if (f.from) conds.push(gte(activities.occurredAt, f.from));
  if (f.to) conds.push(lte(activities.occurredAt, f.to));
  const where = and(...conds);
  const limit = Math.min(Math.max(Math.trunc(f.limit ?? 100), 1), 500);
  const offset = Math.max(Math.trunc(f.offset ?? 0), 0);
  const [rows, [{ total }]] = await Promise.all([
    db.select().from(activities).where(where).orderBy(desc(activities.occurredAt), desc(activities.createdAt)).limit(limit).offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(activities).where(where),
  ]);
  return { items: rows.map(toActivityDto), total, limit, offset };
}

export type ActivityInput = {
  type: ActivityType;
  body: string;
  customerId?: string | null;
  jobId?: string | null;
  occurredAt?: string | null;
};

export async function createActivity(db: Db, organizationId: string, userId: string, input: ActivityInput) {
  let customerId = clean(input.customerId);
  const jobId = clean(input.jobId);
  if (!customerId && !jobId) throw new TaskInputError("customer_or_job_required", "customerId");
  if (customerId) await assertCustomer(db, organizationId, customerId);
  if (jobId) {
    const job = await assertJob(db, organizationId, jobId);
    customerId ??= job.customerId;
  }
  const id = `ac_${randomUUID()}`;
  const [row] = await db
    .insert(activities)
    .values({
      id,
      organizationId,
      type: input.type,
      body: input.body.trim(),
      customerId,
      jobId,
      userId,
      occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
    })
    .returning();
  const dto = toActivityDto(row);
  await writeAudit(db, { userId, action: "ACTIVITY_CREATED", entityType: "activity", entityId: id, newValue: dto });
  return dto;
}

/** Authors remove their own entries; task.view_all removes any. */
export async function deleteActivity(db: Db, organizationId: string, actor: TaskActor, id: string) {
  const conds = [eq(activities.id, id), eq(activities.organizationId, organizationId)];
  if (!actor.viewAll) conds.push(eq(activities.userId, actor.userId));
  const [row] = await db.delete(activities).where(and(...conds)).returning();
  if (!row) return false;
  await writeAudit(db, { userId: actor.userId, action: "ACTIVITY_DELETED", entityType: "activity", entityId: id, oldValue: toActivityDto(row) });
  return true;
}
