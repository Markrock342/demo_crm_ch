import { CheckCircle, Circle } from "@phosphor-icons/react";
import { passwordChecks } from "../../api/admin.ts";
import { useStore } from "../../store";

/** Live checklist under a new-password field. */
export function PasswordRules({ value, email }: { value: string; email?: string | null }) {
  const { tx } = useStore();
  const c = passwordChecks(value, email);
  const items: [boolean, string][] = [
    [c.length, tx("adm_ruleLength")],
    [c.letterDigit, tx("adm_ruleLetterDigit")],
    [c.notEmail && value.length > 0, tx("adm_ruleNotEmail")],
  ];
  return (
    <ul className="adm-rules" aria-live="polite">
      {items.map(([ok, label]) => (
        <li key={label} className={ok ? "is-ok" : undefined}>
          {ok ? <CheckCircle size={16} weight="fill" aria-hidden /> : <Circle size={16} aria-hidden />}
          {label}
        </li>
      ))}
    </ul>
  );
}
