/** First-run tour progress, stored per user on the server (GET/PUT/DELETE /api/onboarding). */
export type OnboardingState = { completed: Record<string, string> };

export async function fetchOnboarding(): Promise<OnboardingState> {
  const res = await fetch("/api/onboarding", { credentials: "include" });
  const data = (await res.json().catch(() => ({}))) as Partial<OnboardingState> & { error?: string };
  if (!res.ok) throw new Error(String(data.error ?? `api_${res.status}`));
  return { completed: data.completed ?? {} };
}

export async function completeTour(tourKey: string): Promise<void> {
  const res = await fetch(`/api/onboarding/${encodeURIComponent(tourKey)}`, { method: "PUT", credentials: "include" });
  if (!res.ok) throw new Error(`api_${res.status}`);
}
