/** Company modules (Settings › Modules). Mirrors server/domain/modules.ts. */

export const MODULE_KEYS = ["sales", "cs", "tracking", "docs", "yard", "finance", "automation"] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];
export type ModuleSet = Record<ModuleKey, boolean>;
export type ModulePreset = "full" | "marketing_cs";

export const ALL_MODULES_ON: ModuleSet = { sales: true, cs: true, tracking: true, docs: true, yard: true, finance: true, automation: true };

export type ModulesState = { modules: ModuleSet; preset: ModulePreset | null };

async function call<T>(method: string, body?: unknown): Promise<T> {
  const res = await fetch("/api/organization/modules", {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(String(data.error ?? `api_${res.status}`));
  return data as T;
}

export const fetchModules = () => call<ModulesState>("GET");
export const applyModulePreset = (preset: ModulePreset) => call<ModulesState>("PATCH", { preset });
export const setModules = (modules: Partial<ModuleSet>) => call<ModulesState>("PATCH", { modules });
