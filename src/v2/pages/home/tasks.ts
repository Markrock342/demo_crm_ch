import { useCallback, useMemo } from "react";
import type { TaskDto, TaskInput, TaskListParams, TaskPriority } from "../../../api/tasks.ts";
import { useStore } from "../../../store";
import { useTaskActions, useTasks } from "../../hooks/useTasks.ts";
import { localizeDemo } from "../../lib/demoText.ts";
import { daysAgo } from "./attention.ts";

export type DueBucket = "overdue" | "today" | "later";

export type TaskRow = {
  id: string;
  /** Title in the UI language (sample text translated; typed text as-is). */
  title: string;
  /** Title as stored — kept for search. */
  titleRaw: string;
  notes: string | null;
  done: boolean;
  due: Date | null;
  /** False when the task is due "some time that day" (stored at 00:00 local). */
  hasTime: boolean;
  bucket: DueBucket;
  priority: TaskPriority;
  high: boolean;
  customerId?: string;
  jobId?: string;
  jobNumber?: string;
  boxId?: string;
  /** Owner's user id (resolve with useUserLookup). */
  owner?: string;
  createdBy?: string;
};

export function toTaskRow(t: TaskDto, locale: string): TaskRow {
  const due = t.dueAt ? new Date(t.dueAt) : null;
  const ago = daysAgo(due);
  const bucket: DueBucket = ago === null ? "later" : ago > 0 ? "overdue" : ago === 0 ? "today" : "later";
  return {
    id: t.id,
    title: localizeDemo(t.title, locale),
    titleRaw: t.title,
    notes: t.notes,
    done: t.done,
    due,
    hasTime: Boolean(due && (due.getHours() !== 0 || due.getMinutes() !== 0)),
    bucket,
    priority: t.priority,
    high: t.priority === "high",
    customerId: t.customerId ?? undefined,
    jobId: t.jobId ?? undefined,
    jobNumber: t.jobNumber ?? undefined,
    boxId: t.containerNo ?? undefined,
    owner: t.ownerUserId ?? undefined,
    createdBy: t.createdBy ?? undefined,
  };
}

/**
 * To-dos from the API (GET /api/tasks), normalized for the home screens.
 * Default: the signed-in user's own tasks, open and done.
 */
export function useModeTasks(params: TaskListParams = { scope: "mine", status: "all" }) {
  const { locale } = useStore();
  const query = useTasks(params);
  const actions = useTaskActions();

  const tasks: TaskRow[] = useMemo(() => (query.data?.items ?? []).map((t) => toTaskRow(t, locale)), [query.data, locale]);

  const toggle = useCallback(
    (id: string) => {
      const row = query.data?.items.find((t) => t.id === id);
      actions.toggle.mutate({ id, done: !row?.done });
    },
    [actions.toggle, query.data],
  );

  const add = useCallback(
    (input: TaskInput & { high?: boolean }) => {
      const { high, ...rest } = input;
      return actions.create.mutateAsync({ ...rest, priority: rest.priority ?? (high ? "high" : "mid") });
    },
    [actions.create],
  );

  return {
    tasks,
    total: query.data?.total ?? 0,
    loading: query.isLoading,
    error: query.error,
    toggle,
    add,
    actions,
    shell: false as const,
  };
}
