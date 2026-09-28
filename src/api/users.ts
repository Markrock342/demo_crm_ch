export type OrgUser = {
  id: string;
  name: string;
  nameZh: string | null;
  nameTh: string | null;
  email: string;
  roles: string[];
};

/** Members of the signed-in user's organization. */
export async function fetchUsers(): Promise<OrgUser[]> {
  const res = await fetch("/api/users", { credentials: "include" });
  const data = (await res.json().catch(() => ({}))) as { items?: OrgUser[]; error?: string };
  if (!res.ok) throw new Error(String(data.error ?? `api_${res.status}`));
  return data.items ?? [];
}
