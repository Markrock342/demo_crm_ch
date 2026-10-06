import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { brandNameFor, fetchPublicBranding, type PublicBranding } from "../../api/branding.ts";
import { useAuth } from "../../auth/AuthProvider";
import { useStore } from "../../store";
import { useOrganization } from "./useOrganization.ts";

export const publicBrandingQueryKey = ["public-branding"] as const;

export type Brand = {
  /** Company name in the UI language ("" = unknown → product mark). */
  name: string;
  logoUrl: string | null;
};

/** Pre-login screens: the deployment's default company (GET /api/public/branding). */
export function usePublicBranding(): Brand & { ready: boolean } {
  const { locale } = useStore();
  const q = useQuery<PublicBranding>({
    queryKey: publicBrandingQueryKey,
    queryFn: fetchPublicBranding,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  return { name: brandNameFor(q.data?.name, locale), logoUrl: q.data?.logoUrl ?? null, ready: !q.isLoading };
}

/** Signed-in app: the user's own company profile (falls back to the session's company name while loading). */
export function useAppBranding(): Brand {
  const { user } = useAuth();
  const { name, logoUrl } = useOrganization();
  return { name: name || user?.organizationName?.trim() || "", logoUrl };
}

/* ── Browser tab: title + favicon ─────────────────────────────── */

const DEFAULT_ICON = { href: "/favicon.svg", type: "image/svg+xml" };
const iconCache = new Map<string, Promise<string>>();

/**
 * Renders a logo of any shape into a square, light-backed icon (data: PNG) so wide logos stay legible
 * as a 16–32 px favicon. Same-origin logo URLs only (canvas must not be tainted).
 */
export function squareIconDataUrl(logoUrl: string, size = 64): Promise<string> {
  const hit = iconCache.get(logoUrl);
  if (hit) return hit;
  const job = new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = size;
        c.height = size;
        const g = c.getContext("2d");
        if (!g) return reject(new Error("no_canvas"));
        const r = size * 0.2;
        g.fillStyle = "#ffffff";
        g.beginPath();
        g.roundRect(0, 0, size, size, r);
        g.fill();
        const pad = size * 0.1;
        const box = size - pad * 2;
        const scale = Math.min(box / img.naturalWidth, box / img.naturalHeight);
        const w = img.naturalWidth * scale;
        const h = img.naturalHeight * scale;
        g.imageSmoothingQuality = "high";
        g.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        resolve(c.toDataURL("image/png"));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error("logo_load_failed"));
    img.src = logoUrl;
  });
  job.catch(() => iconCache.delete(logoUrl));
  iconCache.set(logoUrl, job);
  return job;
}

function setFavicon(href: string, type: string) {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  if (link.getAttribute("href") !== href) link.href = href;
  link.type = type;
}

/** Square icon for a logo URL (null while rendering / without a logo / on failure). */
export function useSquareIcon(logoUrl: string | null): string | null {
  const [icon, setIcon] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setIcon(null);
    if (logoUrl) {
      squareIconDataUrl(logoUrl)
        .then((d) => live && setIcon(d))
        .catch(() => live && setIcon(null));
    }
    return () => {
      live = false;
    };
  }, [logoUrl]);
  return icon;
}

/**
 * Tab title "<page> · <company>" (or the product name without a company) and the company logo as favicon
 * (the product favicon when no logo is uploaded).
 */
export function useBrandHead(page: string | null | undefined, brand: Brand) {
  const { tx } = useStore();
  const owner = brand.name || tx("brand");
  const title = page ? `${page} · ${owner}` : owner;
  useEffect(() => {
    document.title = title;
  }, [title]);

  const icon = useSquareIcon(brand.logoUrl);
  useEffect(() => {
    if (icon) setFavicon(icon, "image/png");
    else setFavicon(DEFAULT_ICON.href, DEFAULT_ICON.type);
  }, [icon]);
}
