import { and, asc, desc, eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { jobTasks } from "../db/schema/job-tasks.js";
import { getJob } from "./operations.service.js";

export type JobTaskDto = {
  id: string;
  jobId: string;
  title: string;
  dueAt: string | null;
  owner: string;
  priority: string;
  done: boolean;
};

function toDto(row: typeof jobTasks.$inferSelect): JobTaskDto {
  return {
    id: row.id,
    jobId: row.jobId,
    title: row.title,
    dueAt: row.dueAt ? row.dueAt.toISOString() : null,
    owner: row.owner,
    priority: row.priority,
    done: row.done,
  };
}

export async function listJobTasks(db: Db, organizationId: string, jobId: string) {
  const job = await getJob(db, organizationId, jobId);
  if (!job) return [];
  const rows = await db
    .select()
    .from(jobTasks)
    .where(and(eq(jobTasks.organizationId, organizationId), eq(jobTasks.jobId, jobId)))
    .orderBy(asc(jobTasks.done), desc(jobTasks.updatedAt));
  return rows.map(toDto);
}

export async function createJobTask(
  db: Db,
  organizationId: string,
  input: { jobId: string; title: string; owner?: string; priority?: string; dueAt?: string | null },
) {
  const job = await getJob(db, organizationId, input.jobId);
  if (!job) throw new Error("job_not_found");
  const id = `jt${Date.now()}`;
  const [row] = await db
    .insert(jobTasks)
    .values({
      id,
      organizationId,
      jobId: input.jobId,
      title: input.title,
      owner: input.owner ?? "",
      priority: input.priority ?? "mid",
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
    })
    .returning();
  return toDto(row);
}

export async function updateJobTask(
  db: Db,
  organizationId: string,
  jobId: string,
  taskId: string,
  patch: Partial<{ title: string; owner: string; priority: string; done: boolean; dueAt: string | null }>,
) {
  const job = await getJob(db, organizationId, jobId);
  if (!job) return null;
  const [row] = await db
    .update(jobTasks)
    .set({
      ...patch,
      dueAt: patch.dueAt === undefined ? undefined : patch.dueAt ? new Date(patch.dueAt) : null,
      updatedAt: new Date(),
    })
    .where(and(eq(jobTasks.id, taskId), eq(jobTasks.jobId, jobId), eq(jobTasks.organizationId, organizationId)))
    .returning();
  return row ? toDto(row) : null;
}
