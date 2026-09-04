import { useQuery } from "@tanstack/react-query";
import { fetchPortalDocs, fetchPortalInvoices, fetchPortalJobs } from "../../api/portal.ts";
import { useAppMode } from "./useAppMode.ts";

export function usePortalJobs(enabled: boolean) {
  const { live } = useAppMode();
  return useQuery({
    queryKey: ["portal", "jobs"],
    queryFn: fetchPortalJobs,
    enabled: enabled && live,
  });
}

export function usePortalInvoices(enabled: boolean) {
  const { live } = useAppMode();
  return useQuery({
    queryKey: ["portal", "invoices"],
    queryFn: fetchPortalInvoices,
    enabled: enabled && live,
  });
}

export function usePortalDocs(enabled: boolean) {
  const { live } = useAppMode();
  return useQuery({
    queryKey: ["portal", "docs"],
    queryFn: fetchPortalDocs,
    enabled: enabled && live,
  });
}
