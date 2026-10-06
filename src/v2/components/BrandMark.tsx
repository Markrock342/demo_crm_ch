import { useEffect, useState } from "react";
import "./brand.css";

/** First letter for a monogram: skips spaces, digits, punctuation and Thai leading vowels (เ แ โ ใ ไ). */
export function brandInitial(name: string | null | undefined): string {
  for (const ch of Array.from(name?.trim() ?? "")) {
    if (/[เ-ไ]/.test(ch)) continue;
    if (/\p{L}/u.test(ch)) return ch.toLocaleUpperCase();
  }
  return "";
}

type Props = {
  /** Company name (current language) — used for the monogram and the image's alt text. */
  name: string;
  logoUrl: string | null;
  /** Height in px (the chip is square unless `fit="auto"` and the logo is wide). */
  size?: number;
  shape?: "square" | "circle";
  /** "auto": a wide logo widens the chip (up to 2.4× its height) instead of shrinking inside a square. */
  fit?: "square" | "auto";
  /** Widest chip for `fit="auto"`, as a multiple of its height. */
  maxRatio?: number;
  /** Reports the logo's width / height once it has loaded. */
  onRatio?: (ratio: number) => void;
  /** Decorative (next to a visible name) → empty alt. */
  decorative?: boolean;
  className?: string;
};

/**
 * The client company's mark: its logo on a light chip (so dark logos stay visible on the dark sidebar),
 * else a monogram from the company name, else the product mark 栈.
 */
export function BrandMark({ name, logoUrl, size = 36, shape = "square", fit = "square", maxRatio = 2.4, onRatio, decorative, className }: Props) {
  const [broken, setBroken] = useState(false);
  const [ratio, setRatio] = useState(1);
  useEffect(() => {
    setBroken(false);
    setRatio(1);
  }, [logoUrl]);

  const showLogo = Boolean(logoUrl) && !broken;
  const width = showLogo && fit === "auto" ? Math.round(size * Math.min(Math.max(ratio, 1), maxRatio)) : size;
  const radius = Math.max(6, Math.round(size * 0.22));
  const cls = ["cz-bm", shape === "circle" ? "is-circle" : "", showLogo ? "has-logo" : "", className ?? ""].filter(Boolean).join(" ");

  if (showLogo) {
    return (
      <span className={cls} style={{ width, height: size, borderRadius: radius, padding: Math.max(3, Math.round(size * 0.1)) }}>
        <img
          src={logoUrl!}
          alt={decorative ? "" : name}
          draggable={false}
          onLoad={(e) => {
            const im = e.currentTarget;
            if (!im.naturalWidth || !im.naturalHeight) return;
            setRatio(im.naturalWidth / im.naturalHeight);
            onRatio?.(im.naturalWidth / im.naturalHeight);
          }}
          onError={() => setBroken(true)}
        />
      </span>
    );
  }
  const letter = brandInitial(name) || "栈";
  return (
    <span className={cls} style={{ width: size, height: size, borderRadius: radius, fontSize: Math.round(size * 0.5) }} aria-hidden={decorative || undefined} role={decorative ? undefined : "img"} aria-label={decorative ? undefined : name || letter}>
      {letter}
    </span>
  );
}
