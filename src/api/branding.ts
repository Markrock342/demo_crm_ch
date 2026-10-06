/** White-label branding: the client company's name + logo (GET /api/public/branding, no sign-in). */

export type BrandNames = { th: string | null; zh: string | null; en: string };

export type PublicBranding = {
  /** Null when the deployment shows neutral product branding (DEFAULT_ORG_ID=none / no company yet). */
  name: BrandNames | null;
  logoUrl: string | null;
};

export const EMPTY_BRANDING: PublicBranding = { name: null, logoUrl: null };

export async function fetchPublicBranding(): Promise<PublicBranding> {
  const res = await fetch("/api/public/branding", { credentials: "omit" });
  if (!res.ok) throw new Error(`api_${res.status}`);
  const data = (await res.json()) as Partial<PublicBranding>;
  return { name: data.name ?? null, logoUrl: data.logoUrl ?? null };
}

/** Company name in the UI language (th → th, zh → zh, else English), falling back to English. */
export function brandNameFor(names: BrandNames | null | undefined, locale: string): string {
  if (!names) return "";
  if (locale === "th" && names.th) return names.th;
  if (locale === "zh" && names.zh) return names.zh;
  return names.en || names.th || names.zh || "";
}
