import {
  Binoculars,
  Briefcase,
  Calculator,
  Handshake,
  Headset,
  ShieldCheck,
  Tag,
  Truck,
  type Icon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import type { RoleCode } from "../../api/admin.ts";
import type { GraphicTone } from "../../v2/components";

export function Row({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="fin-setting-row">
      <div>
        <p className="fin-setting-label">{label}</p>
        {hint ? <p className="fin-setting-hint">{hint}</p> : null}
      </div>
      <div className="fin-setting-value">{children}</div>
    </div>
  );
}

export const ROLE_LOOK: Record<RoleCode, { icon: Icon; tone: GraphicTone }> = {
  SUPER_ADMIN: { icon: ShieldCheck, tone: "primary" },
  MANAGEMENT: { icon: Briefcase, tone: "accent" },
  SALES: { icon: Handshake, tone: "info" },
  PRICING: { icon: Tag, tone: "warning" },
  CUSTOMER_SERVICE: { icon: Headset, tone: "success" },
  OPERATIONS: { icon: Truck, tone: "success" },
  ACCOUNTING: { icon: Calculator, tone: "accent" },
  VIEWER: { icon: Binoculars, tone: "neutral" },
};

export function roleLook(code: string | undefined) {
  return ROLE_LOOK[(code ?? "VIEWER") as RoleCode] ?? ROLE_LOOK.VIEWER;
}

/** Role pill: icon + label, colored by department. */
export function RolePill({ code, label }: { code: string; label: string }) {
  const { icon: I, tone } = roleLook(code);
  return (
    <span className={`adm-role-pill is-${tone}`}>
      <I size={14} weight="bold" aria-hidden />
      {label}
    </span>
  );
}

const KNOWN = new Set([
  "wrong_password",
  "password_unchanged",
  "password_too_short",
  "password_too_long",
  "password_needs_letter_and_digit",
  "password_too_common",
  "password_contains_email",
  "email_taken",
  "last_admin",
  "cannot_deactivate_self",
  "user_not_found",
  "invalid_body",
  "forbidden",
  "logo_too_large",
  "logo_invalid_type",
]);

/** Server error code → readable text. */
export function errorText(tx: (k: string) => string, e: unknown) {
  const code = e instanceof Error ? e.message : String(e ?? "");
  return KNOWN.has(code) ? tx(`adm_err_${code}`) : tx("adm_err_generic");
}

/** Server password error codes shown under the password field instead of a toast. */
export function isPasswordError(e: unknown) {
  const code = e instanceof Error ? e.message : "";
  return code.startsWith("password_") || code === "wrong_password";
}
