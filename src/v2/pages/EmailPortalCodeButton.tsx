import { CheckCircle, EnvelopeSimple } from "@phosphor-icons/react";
import { App, Button } from "antd";
import { useState } from "react";
import { emailPortalCode, SecmailError } from "../../api/secmail.ts";
import { useStore } from "../../store";

/** Shown next to a freshly issued portal access code: e-mails it to every contact of the customer. */
export function EmailPortalCodeButton({ customerId, code, count }: { customerId: string; code: string; count: number }) {
  const { tx } = useStore();
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string[] | null>(null);

  async function send() {
    setBusy(true);
    try {
      const res = await emailPortalCode(customerId, code);
      setSentTo(res.sent);
      message.success(`${tx("sm_codeEmailed")} · ${res.sent.length}`);
      if (res.failed.length) message.warning(`${tx("sm_failed")}: ${res.failed.map((f) => f.to).join(", ")}`);
    } catch (e) {
      const err = e as SecmailError;
      message.error(err.message === "no_recipient" ? tx("sm_codeNoContacts") : `${tx("sm_failed")}${err.detail ? ` — ${err.detail}` : ""}`);
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <span className="cp-portal-hint" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--success)" }} data-testid="portal-code-emailed">
        <CheckCircle size={18} weight="fill" aria-hidden />
        {tx("sm_codeEmailed")} · {sentTo.length}
      </span>
    );
  }
  return (
    <Button icon={<EnvelopeSimple size={16} />} loading={busy} disabled={!count} onClick={() => void send()} data-testid="portal-code-email">
      {tx("sm_emailCode")}
    </Button>
  );
}
