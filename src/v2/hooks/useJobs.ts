import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { jobApiAdapter } from "../../adapters/api/job.adapter.ts";
import { fetchJobCharges, fetchJobFinancials, fetchJobs, type JobRow } from "../../api/commercial.ts";
import { createJobTaskApi, fetchJobMilestones, fetchJobTasks, patchJobMilestone, patchJobTaskApi } from "../../api/operations.ts";
import { mapJobRowToShell } from "../../adapters/api/jobMapper.ts";
import type { ShellJob } from "../../ports/job.port.ts";
import { queryKeys } from "../queries/keys.ts";

export function usePatchJobMilestone(jobId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ code, complete }: { code: string; complete: boolean }) => patchJobMilestone(jobId, code, complete),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.jobs.milestones(jobId) });
    },
  });
}

export function useJobTasks(jobId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.jobs.tasks(jobId ?? ""),
    queryFn: () => fetchJobTasks(jobId!),
    enabled: Boolean(jobId),
  });
}

export function useCreateJobTask(jobId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { title: string; owner?: string; priority?: string }) => createJobTaskApi(jobId, input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.jobs.tasks(jobId) }),
  });
}

export function usePatchJobTask(jobId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, patch }: { taskId: string; patch: Partial<{ title: string; done: boolean; priority: string }> }) =>
      patchJobTaskApi(jobId, taskId, patch),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.jobs.tasks(jobId) }),
  });
}

export function useLiveJobsList(customerId?: string, milestoneFilter?: "all" | "at_risk" | "pending") {
  return useQuery({
    queryKey: queryKeys.jobs.list(customerId, milestoneFilter),
    queryFn: async () => {
      const rows = await fetchJobs(customerId, milestoneFilter);
      return rows.map((r) => mapJobRowToShell(r));
    },
  });
}

export function useLiveJobDetail(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.jobs.detail(id ?? ""),
    queryFn: () => jobApiAdapter.get(id!),
    enabled: Boolean(id),
  });
}

export function useJobFinancials(jobId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.jobs.financials(jobId ?? ""),
    queryFn: () => fetchJobFinancials(jobId!),
    enabled: Boolean(jobId),
  });
}

export function useJobCharges(jobId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.jobs.charges(jobId ?? ""),
    queryFn: () => fetchJobCharges(jobId!),
    enabled: Boolean(jobId),
  });
}

export function useJobMilestones(jobId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.jobs.milestones(jobId ?? ""),
    queryFn: () => fetchJobMilestones(jobId!),
    enabled: Boolean(jobId),
  });
}

/** Shell mode — no network; reads from provided rows. */
export function useShellJobsList(rows: ShellJob[]) {
  return {
    data: rows,
    isLoading: false,
    isError: false,
    error: null,
    refetch: async () => ({ data: rows }),
  };
}

export type { JobRow };
