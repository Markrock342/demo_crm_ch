import { EnvelopeSimple, FilePdf, PaperPlaneTilt, WarningCircle } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, App, Button, Drawer, Form, Input, Select, Tooltip } from "antd";
import { useEffect, useState } from "react";
import { fetchDocEmailDraft, sendDocEmail, SecmailError, type DocKind, type OutboundMail } from "../../../api/secmail.ts";
import { useStore } from "../../../store";
import { IconBadge, StatusTag } from "../../components";
import { useCan } from "../../hooks/useCan.ts";
import { fmtDateTime } from "../../lib/format.ts";
import type { Locale } from "../../../i18n";
import { IconAction } from "./financeVisuals.tsx";

const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;

type Values = { to: string[]; cc: string[]; subject: string; body: string };

/**
 * "Send by email" for an invoice or billing note: a button (link or icon) that opens a drawer with
 * recipients prefilled from the customer's contacts, editable subject/message, the PDF attached,
 * and the send history.
 */
export function SendDocEmail({ kind, id, number, variant = "link" }: { kind: DocKind; id: string; number: string; variant?: "link" | "icon" }) {
  const { tx } = useStore();
  const can = useCan();
  const [open, setOpen] = useState(false);
  if (!can(kind === "invoice" ? "invoice.issue" : "billing.create")) return null;
  const label = `${tx("sm_sendEmail")} ${number}`;
  return (
    <>
      {variant === "icon" ? (
        <IconAction icon={EnvelopeSimple} label={label} onClick={() => setOpen(true)} />
      ) : (
        <Button size="small" type="link" className="fin-pdf" icon={<EnvelopeSimple size={16} aria-hidden />} aria-label={label} onClick={() => setOpen(true)} data-testid="send-doc-email">
          {tx("sm_sendEmail")}
        </Button>
      )}
      {open ? <SendDocEmailDrawer kind={kind} id={id} number={number} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function SendDocEmailDrawer({ kind, id, number, onClose }: { kind: DocKind; id: string; number: string; onClose: () => void }) {
  const { tx, locale } = useStore();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm<Values>();
  const [failure, setFailure] = useState<string | null>(null);
  const draft = useQuery({ queryKey: ["secmail", "draft", kind, id], queryFn: () => fetchDocEmailDraft(kind, id) });

  useEffect(() => {
    if (draft.data) form.setFieldsValue({ to: draft.data.to, cc: [], subject: draft.data.subject, body: draft.data.body });
  }, [draft.data, form]);

  const send = useMutation({
    mutationFn: (v: Values) => sendDocEmail(kind, id, v),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["secmail", "draft", kind, id] });
      message.success(res.outbound.transport === "sandbox" ? tx("sm_sentSandbox") : tx("sm_sent"));
      onClose();
    },
    onError: (e: Error) => {
      void qc.invalidateQueries({ queryKey: ["secmail", "draft", kind, id] });
      if (e instanceof SecmailError && e.issues.length) {
        form.setFields(e.issues.filter((i) => ["to", "cc", "subject", "body"].includes(i.path)).map((i) => ({ name: i.path as keyof Values, errors: [i.message] })));
      }
      setFailure(e instanceof SecmailError && e.detail ? e.detail : e.message);
    },
  });

  const emailsRule = (required: boolean) => ({
    validator: (_: unknown, v: string[] | undefined) => {
      const list = v ?? [];
      if (required && !list.length) return Promise.reject(new Error(tx("sm_toRequired")));
      const bad = list.filter((x) => !EMAIL_RE.test(x.trim()));
      return bad.length ? Promise.reject(new Error(`${tx("sm_invalidEmail")}: ${bad.join(", ")}`)) : Promise.resolve();
    },
  });

  const contactOptions = (draft.data?.to ?? []).map((e) => ({ value: e, label: e }));
  const history = draft.data?.history ?? [];

  return (
    <Drawer
      open
      onClose={onClose}
      width={520}
      rootClassName="sm-drawer"
      title={
        <span className="fin-panel-title">
          <IconBadge icon={EnvelopeSimple} tone="primary" size={30} />
          {number}
        </span>
      }
      styles={{ wrapper: { maxWidth: "100vw" } }}
      extra={null}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button type="text" onClick={onClose}>
            {tx("sm_cancel")}
          </Button>
          <Button type="primary" icon={<PaperPlaneTilt size={16} />} loading={send.isPending} disabled={!draft.data} onClick={() => form.submit()} data-testid="send-doc-email-submit">
            {tx("sm_send")}
          </Button>
        </div>
      }
    >
      {draft.isError ? <Alert type="error" showIcon message={tx("sm_failed")} /> : null}
      {failure ? <Alert type="error" showIcon icon={<WarningCircle size={18} />} message={tx("sm_failed")} description={failure} style={{ marginBottom: 16 }} closable onClose={() => setFailure(null)} /> : null}
      {draft.data && !draft.data.to.length ? <Alert type="info" showIcon message={tx("sm_noContacts")} style={{ marginBottom: 16 }} /> : null}

      <Form<Values>
        form={form}
        layout="vertical"
        disabled={!draft.data || send.isPending}
        requiredMark={false}
        onFinish={(v) => {
          setFailure(null);
          send.mutate({ to: v.to.map((x) => x.trim()), cc: (v.cc ?? []).map((x) => x.trim()), subject: v.subject, body: v.body });
        }}
      >
        <Form.Item name="to" label={tx("sm_to")} rules={[emailsRule(true)]}>
          <Select mode="tags" tokenSeparators={[",", ";", " "]} options={contactOptions} placeholder={tx("sm_addEmail")} open={contactOptions.length ? undefined : false} aria-label={tx("sm_to")} />
        </Form.Item>
        <Form.Item name="cc" label={tx("sm_cc")} rules={[emailsRule(false)]}>
          <Select mode="tags" tokenSeparators={[",", ";", " "]} open={false} placeholder={tx("sm_addEmail")} aria-label={tx("sm_cc")} />
        </Form.Item>
        <Form.Item name="subject" label={tx("sm_subject")} rules={[{ required: true, whitespace: true, message: tx("sm_required") }]}>
          <Input maxLength={300} />
        </Form.Item>
        <Form.Item name="body" label={tx("sm_message")} rules={[{ required: true, whitespace: true, message: tx("sm_required") }]}>
          <Input.TextArea autoSize={{ minRows: 6, maxRows: 14 }} maxLength={10000} />
        </Form.Item>
      </Form>

      {draft.data ? (
        <div className="sm-attach" aria-label={tx("sm_attachment")}>
          <FilePdf size={22} weight="duotone" aria-hidden />
          <span className="cz-mono">{draft.data.attachment}</span>
        </div>
      ) : null}

      {history.length ? (
        <div className="sm-history">
          <div className="cz-cell-sub" style={{ marginBottom: 6 }}>
            {tx("sm_history")}
          </div>
          <ul>
            {history.map((h) => (
              <HistoryRow key={h.id} h={h} locale={locale} />
            ))}
          </ul>
        </div>
      ) : null}
      <style>{CSS}</style>
    </Drawer>
  );
}

function HistoryRow({ h, locale }: { h: OutboundMail; locale: string }) {
  const { tx } = useStore();
  const ok = h.status === "sent";
  return (
    <li>
      <StatusTag status={ok ? "DONE" : "OVERDUE"} label={ok ? tx("sm_statusSent") : tx("sm_statusFailed")} tone={ok ? "success" : "danger"} />
      {h.transport === "sandbox" ? <StatusTag status="TEST" label={tx("sm_test")} tone="neutral" /> : null}
      <span className="sm-history-to" title={h.to.join(", ")}>
        {h.to.join(", ")}
      </span>
      <span className="cz-cell-sub">{fmtDateTime(h.sentAt ?? h.createdAt, locale as Locale)}</span>
      {!ok && h.error ? (
        <Tooltip title={h.error}>
          <WarningCircle size={16} className="sm-history-err" aria-label={h.error} />
        </Tooltip>
      ) : null}
    </li>
  );
}

const CSS = `
.sm-attach{display:flex;align-items:center;gap:8px;padding:10px 12px;border:1px solid var(--line);border-radius:var(--radius);color:var(--danger);margin-bottom:16px;overflow:hidden}
.sm-attach .cz-mono{color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sm-history ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.sm-history li{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
.sm-history-to{flex:1 1 140px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sm-history-err{color:var(--danger)}
`;
