import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  addCaseNote,
  createCanned,
  createCase,
  deleteCanned,
  fetchCanned,
  fetchCase,
  fetchCases,
  fetchCaseStats,
  fetchSlaPolicy,
  lookupShipments,
  patchCanned,
  patchCase,
  replyToCase,
  saveSlaPolicy,
  type CannedInput,
  type CaseInput,
  type CaseListParams,
  type CasePatch,
  type ReplyInput,
  type SlaPolicy,
} from "../../api/cases.ts";
import { useAppMode } from "./useAppMode.ts";

export const caseKeys = {
  all: ["cases"] as const,
  list: (p: CaseListParams) => ["cases", "list", p] as const,
  stats: ["cases", "stats"] as const,
  detail: (id: string) => ["cases", "detail", id] as const,
  canned: ["cases", "canned"] as const,
  sla: ["cases", "sla"] as const,
  lookup: (q: string) => ["cases", "lookup", q] as const,
};

export function invalidateCases(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: caseKeys.all });
}

export function useCases(params: CaseListParams, opts: { enabled?: boolean } = {}) {
  const { live } = useAppMode();
  return useQuery({
    queryKey: caseKeys.list(params),
    queryFn: () => fetchCases(params),
    enabled: live && (opts.enabled ?? true),
    staleTime: 15_000,
    refetchInterval: 60_000,
    placeholderData: (prev) => prev,
  });
}

export function useCaseStats() {
  const { live } = useAppMode();
  return useQuery({ queryKey: caseKeys.stats, queryFn: fetchCaseStats, enabled: live, staleTime: 15_000, refetchInterval: 60_000 });
}

export function useCase(id: string | undefined) {
  const { live } = useAppMode();
  return useQuery({ queryKey: caseKeys.detail(id ?? ""), queryFn: () => fetchCase(id!), enabled: live && Boolean(id), staleTime: 5_000 });
}

export function useCanned() {
  const { live } = useAppMode();
  return useQuery({ queryKey: caseKeys.canned, queryFn: fetchCanned, enabled: live, staleTime: 60_000 });
}

export function useSlaPolicy(enabled = true) {
  const { live } = useAppMode();
  return useQuery({ queryKey: caseKeys.sla, queryFn: fetchSlaPolicy, enabled: live && enabled, staleTime: 60_000 });
}

export function useShipmentLookup(q: string) {
  const { live } = useAppMode();
  const needle = q.trim();
  return useQuery({
    queryKey: caseKeys.lookup(needle),
    queryFn: () => lookupShipments(needle),
    enabled: live && needle.length >= 2,
    staleTime: 30_000,
  });
}

export function useCaseActions() {
  const qc = useQueryClient();
  const done = () => invalidateCases(qc);
  return {
    create: useMutation({ mutationFn: (input: CaseInput) => createCase(input), onSuccess: done }),
    patch: useMutation({ mutationFn: ({ id, patch }: { id: string; patch: CasePatch }) => patchCase(id, patch), onSuccess: done }),
    note: useMutation({ mutationFn: ({ id, body }: { id: string; body: string }) => addCaseNote(id, body), onSuccess: done }),
    reply: useMutation({ mutationFn: ({ id, input }: { id: string; input: ReplyInput }) => replyToCase(id, input), onSuccess: done }),
    createCanned: useMutation({ mutationFn: (input: CannedInput) => createCanned(input), onSuccess: done }),
    patchCanned: useMutation({ mutationFn: ({ id, patch }: { id: string; patch: Partial<CannedInput> }) => patchCanned(id, patch), onSuccess: done }),
    deleteCanned: useMutation({ mutationFn: (id: string) => deleteCanned(id), onSuccess: done }),
    saveSla: useMutation({ mutationFn: (p: Partial<SlaPolicy>) => saveSlaPolicy(p), onSuccess: done }),
  };
}
