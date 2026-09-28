import { useQuery } from "@tanstack/react-query";
import { fetchPortalDocs, fetchPortalInvoices, fetchPortalJobs } from "../../api/portal.ts";

/** Portal data is scoped by the portal cookie; `enabled` = a portal session exists. */
export function usePortalJobs(enabled: boolean, customerId?: string) {
  return useQuery({ queryKey: ["portal", customerId, "jobs"], queryFn: fetchPortalJobs, enabled });
}

export function usePortalInvoices(enabled: boolean, customerId?: string) {
  return useQuery({ queryKey: ["portal", customerId, "invoices"], queryFn: fetchPortalInvoices, enabled });
}

export function usePortalDocs(enabled: boolean, customerId?: string) {
  return useQuery({ queryKey: ["portal", customerId, "docs"], queryFn: fetchPortalDocs, enabled });
}
