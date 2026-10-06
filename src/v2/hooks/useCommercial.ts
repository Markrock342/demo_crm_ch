import { useQuery } from "@tanstack/react-query";
import { fetchCrmDocs } from "../../api/comms.ts";
import { fetchInvoices, fetchQuotations, searchRates, type InvoiceRow, type QuotationRow } from "../../api/commercial.ts";
import { fetchContainers } from "../../api/operations.ts";
import { fetchCrmBundleFor } from "../../api/crm.ts";
import { fetchMails } from "../../api/comms.ts";
import { queryKeys } from "../queries/keys.ts";
import { useAppMode } from "./useAppMode.ts";
import { useCan } from "./useCan.ts";
import { useModules } from "./useModules.ts";

export function useCrmBundle() {
  const { live } = useAppMode();
  const mods = useModules();
  return useQuery({
    queryKey: queryKeys.crm.bundle,
    queryFn: () => fetchCrmBundleFor({ sales: mods.modules.sales }),
    enabled: live && mods.ready,
  });
}

export function useLiveRates(params: Record<string, string>, enabled = true) {
  const can = useCan();
  return useQuery({
    queryKey: queryKeys.rates.search(params),
    queryFn: () => searchRates(params),
    enabled: enabled && can("rate.view_sell") && Object.values(params).some(Boolean),
  });
}

export function useLiveQuotations(customerId?: string) {
  const { live } = useAppMode();
  const can = useCan();
  const mods = useModules();
  return useQuery({
    queryKey: queryKeys.quotations.list(customerId),
    queryFn: () => fetchQuotations(customerId),
    enabled: live && can("quotation.view") && mods.ready && mods.modules.sales,
  });
}

export function useLiveInvoices(customerId?: string) {
  const { live } = useAppMode();
  const can = useCan();
  const mods = useModules();
  return useQuery({
    queryKey: queryKeys.invoices.list(customerId),
    queryFn: () => fetchInvoices(customerId),
    enabled: live && can("invoice.view") && mods.ready && mods.modules.finance,
  });
}

export function useJobContainers(jobId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.containers.byJob(jobId ?? ""),
    queryFn: () => fetchContainers({ jobId: jobId! }),
    enabled: Boolean(jobId),
  });
}

export function useCustomerDocs(customerId: string | undefined) {
  const mods = useModules();
  return useQuery({
    queryKey: queryKeys.docs.byCustomer(customerId ?? ""),
    queryFn: () => fetchCrmDocs(customerId),
    enabled: Boolean(customerId) && mods.ready && mods.modules.docs,
  });
}

export function useCustomerMails(customerId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.mails.byCustomer(customerId ?? ""),
    queryFn: () => fetchMails(customerId),
    enabled: Boolean(customerId),
  });
}

export type { InvoiceRow, QuotationRow };
