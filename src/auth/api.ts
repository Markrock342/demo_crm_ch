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
  if (res.status === 401) return null;
  if (!res.ok) throw new Error("auth_check_failed");
  const data = await readJson(res);
  return (data.user as AuthUser) ?? null;
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(String(data.error ?? "login_failed"));
  return data.user as AuthUser;
}

export async function logout() {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
}
