import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App } from "antd";
import { useCallback } from "react";
import { fetchCrmBundle } from "../../api/crm.ts";
import {
  createDealRow,
  createLeadRow,
  fetchDealRows,
  fetchLeadRows,
  patchDealRow,
  patchLeadRow,
  type DealInput,
  type DealRow,
  type LeadInput,
  type LeadRow,
} from "../../api/pipeline.ts";
import type { DealStage, LeadStage } from "../../crm";
import { useStore } from "../../store";
import { useAppMode } from "./useAppMode.ts";

export const pipelineKeys = {
  leads: ["pipeline", "leads"] as const,
  deals: ["pipeline", "deals"] as const,
};

/** Keep the app-wide CRM store (dashboard, customer pages) in step after a change. */
function useStoreResync() {
  const { hydrateCrm } = useStore();
  return useCallback(() => {
    void fetchCrmBundle()
      .then(hydrateCrm)
      .catch(() => {});
  }, [hydrateCrm]);
}

export function useLeadRows() {
  const { live } = useAppMode();
  return useQuery({ queryKey: pipelineKeys.leads, queryFn: fetchLeadRows, enabled: live });
}

export function useDealRows() {
  const { live } = useAppMode();
  return useQuery({ queryKey: pipelineKeys.deals, queryFn: fetchDealRows, enabled: live });
}

export function useLeadMutations() {
  const qc = useQueryClient();
  const resync = useStoreResync();
  const { message } = App.useApp();
  const { tx } = useStore();
  const done = async () => {
    await qc.invalidateQueries({ queryKey: pipelineKeys.leads });
    resync();
  };
  const fail = () => message.error(tx("fd_saveFailed"));
  const create = useMutation({ mutationFn: (v: LeadInput) => createLeadRow(v), onSuccess: done, onError: fail });
  const patch = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<LeadInput> & { stage?: LeadStage } }) => patchLeadRow(id, patch),
    // optimistic: move the card right away
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: pipelineKeys.leads });
      const prev = qc.getQueryData<LeadRow[]>(pipelineKeys.leads);
      if (prev) qc.setQueryData<LeadRow[]>(pipelineKeys.leads, prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(pipelineKeys.leads, ctx.prev);
      fail();
    },
    onSettled: done,
  });
  return { create, patch };
}

export function useDealMutations() {
  const qc = useQueryClient();
  const resync = useStoreResync();
  const { message } = App.useApp();
  const { tx } = useStore();
  const done = async () => {
    await qc.invalidateQueries({ queryKey: pipelineKeys.deals });
    resync();
  };
  const fail = () => message.error(tx("fd_saveFailed"));
  const create = useMutation({ mutationFn: (v: DealInput) => createDealRow(v), onSuccess: done, onError: fail });
  const patch = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Omit<DealInput, "customerId">> & { stage?: DealStage } }) => patchDealRow(id, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: pipelineKeys.deals });
      const prev = qc.getQueryData<DealRow[]>(pipelineKeys.deals);
      if (prev) qc.setQueryData<DealRow[]>(pipelineKeys.deals, prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(pipelineKeys.deals, ctx.prev);
      fail();
    },
    onSettled: done,
  });
  return { create, patch };
}

/** Sum of values per currency, biggest first. */
export function sumByCurrency(rows: { value: number; currency: string }[]) {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.currency || "THB", (m.get(r.currency || "THB") ?? 0) + r.value);
  return [...m.entries()].sort((a, b) => (a[0] === "THB" ? -1 : b[0] === "THB" ? 1 : b[1] - a[1]));
}
