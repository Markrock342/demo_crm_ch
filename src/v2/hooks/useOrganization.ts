import { useQuery } from "@tanstack/react-query";
import { fetchOrganization, organizationLogoUrl, type Organization } from "../../api/admin.ts";
import { useAuth } from "../../auth/AuthProvider";
import { useStore } from "../../store";

export const organizationQueryKey = ["organization"] as const;

/** Company name in the UI language (th → nameTh, zh → nameZh, else the English / legal name). */
export function organizationDisplayName(org: Pick<Organization, "nameEn" | "nameTh" | "nameZh" | "orgName"> | null | undefined, locale: string) {
  if (!org) return "";
  if (locale === "th" && org.nameTh) return org.nameTh;
  if (locale === "zh" && org.nameZh) return org.nameZh;
  return org.nameEn || org.orgName;
}

/**
 * The signed-in user's company profile (GET /api/organization).
 * `name` is localized for the app shell header; `logoUrl` is null when no logo is uploaded.
 */
export function useOrganization() {
  const { user } = useAuth();
  const { locale } = useStore();
  const query = useQuery({
    queryKey: organizationQueryKey,
    queryFn: fetchOrganization,
    enabled: Boolean(user),
    staleTime: 5 * 60 * 1000,
  });
  const organization = query.data ?? null;
  return {
    organization,
    name: organizationDisplayName(organization, locale),
    logoUrl: organizationLogoUrl(organization),
    loading: query.isLoading,
    error: query.error,
  };
}
