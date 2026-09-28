import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  createActivity,
  createTask,
  deleteActivity,
  deleteTask,
  fetchActivities,
  fetchTasks,
  setTaskDone,
  updateTask,
  type ActivityType,
  type Page,
  type TaskDto,
  type TaskInput,
  type TaskListParams,
  type TaskStatus,
} from "../../api/tasks.ts";
import { useAppMode } from "./useAppMode.ts";

export const taskKeys = {
  all: ["tasks"] as const,
  list: (p: TaskListParams) => ["tasks", "list", p] as const,
};
export const activityKeys = {
  all: ["activities"] as const,
  list: (p: Record<string, unknown>) => ["activities", "list", p] as const,
};

/** Refresh every task / activity view (lists, badges, timelines, calendar). */
export function invalidateTaskViews(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: taskKeys.all });
  void qc.invalidateQueries({ queryKey: activityKeys.all });
}

export function useTasks(params: TaskListParams, opts: { enabled?: boolean } = {}) {
  const { live } = useAppMode();
  return useQuery({
    queryKey: taskKeys.list(params),
    queryFn: () => fetchTasks(params),
    enabled: live && (opts.enabled ?? true),
    staleTime: 15_000,
  });
}

export function useActivities(params: { customerId?: string; jobId?: string; from?: string; to?: string; limit?: number }, opts: { enabled?: boolean } = {}) {
  const { live } = useAppMode();
  return useQuery({
    queryKey: activityKeys.list(params),
    queryFn: () => fetchActivities(params),
    enabled: live && (opts.enabled ?? true),
    staleTime: 15_000,
  });
}

/** Patch a task inside every cached task list (optimistic updates). */
function patchCached(qc: QueryClient, id: string, fn: (t: TaskDto) => TaskDto) {
  qc.setQueriesData<Page<TaskDto>>({ queryKey: taskKeys.all }, (old) =>
    old ? { ...old, items: old.items.map((t) => (t.id === id ? fn(t) : t)) } : old,
  );
}

export function useTaskActions() {
  const qc = useQueryClient();

  const create = useMutation({
    mutationFn: (input: TaskInput) => createTask(input),
    onSettled: () => invalidateTaskViews(qc),
  });

  const toggle = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => setTaskDone(id, done),
    onMutate: async ({ id, done }) => {
      await qc.cancelQueries({ queryKey: taskKeys.all });
      const snapshot = qc.getQueriesData<Page<TaskDto>>({ queryKey: taskKeys.all });
      const status: TaskStatus = done ? "done" : "open";
      patchCached(qc, id, (t) => ({ ...t, done, status, completedAt: done ? new Date().toISOString() : null }));
      return { snapshot };
    },
    onError: (_e, _v, ctx) => {
      for (const [key, data] of ctx?.snapshot ?? []) qc.setQueryData(key, data);
    },
    onSettled: () => invalidateTaskViews(qc),
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<TaskInput> & { status?: TaskStatus } }) => updateTask(id, patch),
    onSettled: () => invalidateTaskViews(qc),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteTask(id),
    onSettled: () => invalidateTaskViews(qc),
  });

  return { create, toggle, update, remove };
}

export function useActivityActions() {
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: (input: { type: ActivityType; body: string; customerId?: string | null; jobId?: string | null; occurredAt?: string | null }) =>
      createActivity(input),
    onSettled: () => void qc.invalidateQueries({ queryKey: activityKeys.all }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteActivity(id),
    onSettled: () => void qc.invalidateQueries({ queryKey: activityKeys.all }),
  });
  return { create, remove };
}
