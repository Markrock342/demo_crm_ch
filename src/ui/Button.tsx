import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "ghost" | "danger" | "slim" | "draft";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  busy?: boolean;
  children: ReactNode;
};

export function Button({ variant = "ghost", busy, className, children, disabled, type = "button", ...rest }: Props) {
  const slim = variant === "slim";
  const tone = slim ? "ghost" : variant === "draft" ? "draft" : variant;
  const cls = ["btn", `btn-${tone}`, slim ? "btn-slim" : "", busy ? "is-busy" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");
  return (
    <button type={type} className={cls} disabled={disabled || busy} aria-busy={busy || undefined} {...rest}>
      {busy ? <span className="btn-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}
