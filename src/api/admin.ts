/** Admin essentials: my account, user management, company profile. */

export const ROLE_CODES = [
  "SUPER_ADMIN",
  "MANAGEMENT",
  "SALES",
  "PRICING",
  "MARKETING",
  "CUSTOMER_SERVICE",
  "OPERATIONS",
  "ACCOUNTING",
  "VIEWER",
] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

export type AdminUser = {
  id: string;
  name: string;
  nameZh: string | null;
  nameTh: string | null;
  email: string;
  roles: string[];
  orgRole: string;
  active: boolean;
  createdAt?: string;
};

export type Account = {
  id: string;
  email: string;
  name: string;
  nameZh: string | null;
  nameTh: string | null;
  roles: string[];
  passwordChangedAt: string | null;
};

export type Organization = {
  id: string;
  slug: string;
  orgName: string;
  nameEn: string;
  nameTh: string | null;
  nameZh: string | null;
  taxId: string | null;
  branchType: "head_office" | "branch";
  branchCode: string | null;
  addressEn: string | null;
  addressTh: string | null;
  addressZh: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  hasLogo: boolean;
  logoUpdatedAt: string | null;
  bankName: string | null;
  bankBranch: string | null;
  bankAccountName: string | null;
  bankAccountNo: string | null;
  bankSwift: string | null;
  defaultCurrency: string;
  invoiceFooter: string | null;
  quotationFooter: string | null;
  updatedAt: string | null;
};

export type OrganizationPatch = Partial<
  Omit<Organization, "id" | "slug" | "orgName" | "hasLogo" | "logoUpdatedAt" | "updatedAt">
>;

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: "include",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(String(data.error ?? `api_${res.status}`));
  return data;
}

// ---- My account
export const fetchAccount = () => call<{ account: Account }>("GET", "/api/account").then((d) => d.account);
export const updateAccount = (body: { name: string; nameZh?: string | null; nameTh?: string | null }) =>
  call<{ account: Account }>("PATCH", "/api/account", body).then((d) => d.account);
export const changePassword = (currentPassword: string, newPassword: string) =>
  call<{ ok: true }>("POST", "/api/account/password", { currentPassword, newPassword });

// ---- Users (admin)
export const fetchAdminUsers = () => call<{ items: AdminUser[] }>("GET", "/api/users?all=1").then((d) => d.items);
export type NewUser = { email: string; name: string; nameZh?: string | null; nameTh?: string | null; role: RoleCode; password?: string | null };
export const createUser = (body: NewUser) => call<{ user: AdminUser; tempPassword: string | null }>("POST", "/api/users", body);
export type UserPatch = { name?: string; nameZh?: string | null; nameTh?: string | null; role?: RoleCode; active?: boolean };
export const updateUser = (id: string, body: UserPatch) =>
  call<{ user: AdminUser }>("PATCH", `/api/users/${encodeURIComponent(id)}`, body).then((d) => d.user);
export const resetUserPassword = (id: string, password?: string | null) =>
  call<{ tempPassword: string | null }>("POST", `/api/users/${encodeURIComponent(id)}/reset-password`, { password: password || null });

// ---- Organization
export const fetchOrganization = () => call<{ organization: Organization }>("GET", "/api/organization").then((d) => d.organization);
export const updateOrganization = (body: OrganizationPatch) =>
  call<{ organization: Organization }>("PATCH", "/api/organization", body).then((d) => d.organization);
export const removeOrganizationLogo = () =>
  call<{ organization: Organization }>("DELETE", "/api/organization/logo").then((d) => d.organization);

export async function uploadOrganizationLogo(file: File): Promise<Organization> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/organization/logo", { method: "POST", credentials: "include", body: form });
  const data = (await res.json().catch(() => ({}))) as { organization?: Organization; error?: string };
  if (!res.ok || !data.organization) throw new Error(String(data.error ?? `api_${res.status}`));
  return data.organization;
}

export function organizationLogoUrl(org: Pick<Organization, "hasLogo" | "logoUpdatedAt"> | null | undefined): string | null {
  if (!org?.hasLogo) return null;
  return `/api/organization/logo?v=${encodeURIComponent(org.logoUpdatedAt ?? "")}`;
}

/** Client-side mirror of the server's password rules (server stays authoritative). */
export function passwordChecks(password: string, email?: string | null) {
  const local = email?.split("@")[0]?.toLowerCase();
  return {
    length: password.length >= 8,
    letterDigit: /\p{L}/u.test(password) && /\d/.test(password),
    notEmail: !(local && local.length >= 4 && password.toLowerCase().includes(local)),
  };
}
