import type { AuthUser } from "./types";

async function readJson(res: Response) {
  const data: unknown = await res.json().catch(() => ({}));
  return data as Record<string, unknown>;
}

export async function fetchHealth() {
  const res = await fetch("/api/health");
  const data = await readJson(res);
  return {
    ok: Boolean(data.ok),
    database: Boolean(data.database),
    mode: (data.mode === "production" ? "production" : "demo") as "demo" | "production",
  };
}

export async function fetchMe(): Promise<AuthUser | null> {
  const res = await fetch("/api/auth/me", { credentials: "include" });
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new Error("auth_check_failed");
  const data = await readJson(res);
  const user = data.user as AuthUser | undefined;
  if (!user) return null;
  const tenant = data.tenant as { organizationName?: string } | null | undefined;
  return { ...user, organizationName: user.organizationName ?? tenant?.organizationName ?? null };
}

/** Error codes thrown by `login`: invalid_credentials · unreachable · server_error · no_organization. */
export type LoginErrorCode = "invalid_credentials" | "unreachable" | "server_error" | "no_organization";

export async function login(email: string, password: string): Promise<AuthUser> {
  let res: Response;
  try {
    res = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    throw new Error("unreachable" satisfies LoginErrorCode);
  }
  const data = await readJson(res);
  if (!res.ok) {
    const code: LoginErrorCode =
      res.status === 401 || res.status === 400
        ? "invalid_credentials"
        : data.error === "no_organization"
          ? "no_organization"
          : res.status >= 502 || (res.status >= 500 && !data.error) || data.error === "database_unavailable" || data.error === "database_unconfigured"
            ? "unreachable"
            : "server_error";
    throw new Error(code);
  }
  const user = data.user as AuthUser;
  const tenant = data.tenant as { organizationName?: string } | null | undefined;
  return { ...user, organizationName: user.organizationName ?? tenant?.organizationName ?? null };
}

export async function logout() {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
}
