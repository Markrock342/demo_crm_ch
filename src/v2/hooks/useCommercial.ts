import { useQuery } from "@tanstack/react-query";
import { fetchCrmDocs } from "../../api/comms.ts";
import { fetchInvoices, fetchQuotations, searchRates, type InvoiceRow, type QuotationRow } from "../../api/commercial.ts";
import { fetchContainers } from "../../api/operations.ts";
import { fetchCrmBundle } from "../../api/crm.ts";
import { fetchMails } from "../../api/comms.ts";
import { queryKeys } from "../queries/keys.ts";
import { useAppMode } from "./useAppMode.ts";

export function useCrmBundle() {
  const { live } = useAppMode();
  return useQuery({
    queryKey: queryKeys.crm.bundle,
    queryFn: fetchCrmBundle,
    enabled: live,
  });
}

export function useLiveRates(params: Record<string, string>, enabled = true) {
  return useQuery({
    queryKey: queryKeys.rates.search(params),
    queryFn: () => searchRates(params),
    enabled: enabled && Object.values(params).some(Boolean),
  });
}

export function useLiveQuotations(customerId?: string) {
  const { live } = useAppMode();
  return useQuery({
    queryKey: queryKeys.quotations.list(customerId),
    queryFn: () => fetchQuotations(customerId),
    enabled: live,
  });
}

export function useLiveInvoices(customerId?: string) {
  const { live } = useAppMode();
  return useQuery({
    queryKey: queryKeys.invoices.list(customerId),
    queryFn: () => fetchInvoices(customerId),
    enabled: live,
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
  return useQuery({
    queryKey: queryKeys.docs.byCustomer(customerId ?? ""),
    queryFn: () => fetchCrmDocs(customerId),
    enabled: Boolean(customerId),
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
