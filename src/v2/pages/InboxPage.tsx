import { ArrowLeft, ClipboardText, MagnifyingGlass } from "@phosphor-icons/react";
import { App, Button, Drawer, Form, Input, Popconfirm } from "antd";
import { useMemo, useState } from "react";
import { customerName, type Mail } from "../../data";
import { useStore } from "../../store";
import { useMedia } from "../../ui/useMedia";
import { AiBriefCard, EmptyState, PageHeader, Panel, PersonAvatar } from "../components";
import { AiMailPanel, MailTags } from "../components/AiMailPanel.tsx";
import { fmtMailTime } from "../lib/time.ts";
import { CaseFromMailButton } from "./cases/CaseFromMailButton.tsx";
import "./home/home.css";

type Loc = "zh" | "th" | "en";

function pick(m: Mail, field: "subject" | "body" | "draft", locale: Loc) {
  const suffix = locale === "th" ? "Th" : locale === "en" ? "En" : "Zh";
  return m[`${field}${suffix}` as keyof Mail] as string;
}

export function InboxPageV2() {
  const { tx, locale, mails, customers, sendMail, saveDraft, rejectMail, markRead, applyMailAnalysis, applyMailOps, addPastedMail } =
    useStore();
  const { message } = App.useApp();
  const loc = locale as Loc;
  const stacked = useMedia("(max-width: 900px)");
  const [q, setQ] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const [mobileReading, setMobileReading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [form] = Form.useForm<{ from: string; subject: string; body: string }>();

  const open = mails.filter((m) => m.state === "open");
  const unread = open.filter((m) => m.unread).length;

  const who = (m: Mail) => {
    const c = customers.find((x) => x.id === m.customerId);
    return c ? customerName(c, loc) : m.from;
  };

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return open.filter((m) => {
      if (!needle) return true;
      return `${m.from} ${pick(m, "subject", loc)} ${who(m)}`.toLowerCase().includes(needle);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers, loc, open, q]);

  const mail = shown.find((m) => m.id === active) ?? (stacked ? undefined : shown[0]);
  const draftText = mail ? pick(mail, "draft", loc) : "";
  const hasDraft = Boolean(draftText?.trim());
  const canApply = Boolean(mail?.extractedBoxes?.length || mail?.docsMissing?.length || mail?.suggestedStatus);

  function select(id: string) {
    setActive(id);
    setEditing(false);
    setMobileReading(true);
    markRead(id);
  }

  function next(afterId: string) {
    const rest = shown.filter((m) => m.id !== afterId);
    setActive(rest[0]?.id ?? null);
    setEditing(false);
    if (stacked) setMobileReading(false);
  }

  const timeLabel = (t: string) => fmtMailTime(t, loc);

  const facts = useMemo(() => ({ openMails: open.length, unread, needsCheck: open.filter((m) => m.needsHuman).length }), [open, unread]);
  const localBrief = `Inbox: ${open.length} open emails, ${unread} unread, ${facts.needsCheck} need a person to check.`;

  const list = (
    <Panel flush className="hm-mail-listpane">
      <div className="hm-mail-search">
        <Input
          allowClear
          prefix={<MagnifyingGlass size={16} aria-hidden />}
          placeholder={tx("home_mail_search")}
          aria-label={tx("home_mail_search")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {shown.length ? (
        <ul className="hm-mail-list">
          {shown.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className={`hm-mail-item${mail?.id === m.id ? " is-active" : ""}${m.unread ? " is-unread" : ""}`}
                aria-current={mail?.id === m.id ? "true" : undefined}
                onClick={() => select(m.id)}
              >
                <PersonAvatar name={who(m)} size={36} />
                <span className="hm-mail-main">
                  <span className="hm-mail-line1">
                    <span className="hm-mail-who">{who(m)}</span>
                    <time className="hm-mail-time">{timeLabel(m.time)}</time>
                  </span>
                  <span className="hm-mail-line2">
                    <span className="hm-mail-subject">{pick(m, "subject", loc)}</span>
                    <MailTags mail={m} />
                  </span>
                </span>
                {m.unread ? <span className="hm-unread-dot" role="img" aria-label={tx("home_notif_unread")} /> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          description={q ? tx("home_mail_no_match") : tx("home_mail_empty")}
          action={q ? undefined : <Button onClick={() => setPasteOpen(true)}>{tx("home_mail_paste")}</Button>}
        />
      )}
    </Panel>
  );

  const reading = mail ? (
    <div className="hm-mail-reading">
      <Panel className="hm-mail-letter">
        {stacked ? (
          <button type="button" className="cz-link-btn hm-mail-back" onClick={() => setMobileReading(false)}>
            <ArrowLeft size={14} aria-hidden />
            {tx("home_mail_back")}
          </button>
        ) : null}
        <h2 className="hm-mail-h">{pick(mail, "subject", loc) || mail.from}</h2>
        <p className="hm-mail-meta">
          <PersonAvatar name={who(mail)} size={28} />
          <strong>{who(mail)}</strong>
          <span>{mail.from}</span>
          <span>{timeLabel(mail.time)}</span>
        </p>
        <div className="hm-mail-body">{pick(mail, "body", loc)}</div>

        <section className="hm-mail-reply" aria-label={tx("home_mail_reply")}>
          <div className="hm-mail-reply-head">
            <h3>{tx("home_mail_reply")}</h3>
            {hasDraft && !editing ? (
              <Button
                size="small"
                type="text"
                onClick={() => {
                  setDraft(draftText);
                  setEditing(true);
                }}
              >
                {tx("home_mail_edit")}
              </Button>
            ) : null}
          </div>
          {editing ? (
            <>
              <Input.TextArea value={draft} onChange={(e) => setDraft(e.target.value)} autoSize={{ minRows: 5, maxRows: 14 }} />
              <div className="hm-mail-edit-actions">
                <Button type="text" onClick={() => setEditing(false)}>
                  {tx("home_cancel")}
                </Button>
                <Button
                  onClick={() => {
                    saveDraft(mail.id, draft);
                    setEditing(false);
                  }}
                >
                  {tx("home_mail_save_draft")}
                </Button>
              </div>
            </>
          ) : hasDraft ? (
            <div className="hm-mail-draft">{draftText}</div>
          ) : (
            <p className="hm-quiet">{tx("home_mail_no_draft")}</p>
          )}
        </section>

        <div className="hm-mail-actions">
          <Popconfirm
            title={tx("home_mail_discard_q")}
            okText={tx("home_mail_discard")}
            cancelText={tx("home_cancel")}
            okButtonProps={{ danger: true }}
            onConfirm={() => {
              rejectMail(mail.id);
              next(mail.id);
            }}
          >
            <Button type="text" danger>
              {tx("home_mail_discard")}
            </Button>
          </Popconfirm>
          <span className="hm-mail-actions-end">
            <CaseFromMailButton mail={{ id: mail.id, subject: pick(mail, "subject", loc), body: pick(mail, "body", loc), customerId: mail.customerId, from: mail.from }} />
            {canApply ? (
              <Popconfirm
                title={tx("home_mail_apply_q")}
                okText={tx("home_mail_apply")}
                cancelText={tx("home_cancel")}
                onConfirm={() => {
                  applyMailOps(mail.id);
                  message.success(tx("home_mail_applied"));
                }}
              >
                <Button>{tx("home_mail_apply")}</Button>
              </Popconfirm>
            ) : null}
            <Popconfirm
              title={tx("home_mail_send_q")}
              okText={tx("home_mail_send")}
              cancelText={tx("home_cancel")}
              disabled={!hasDraft}
              onConfirm={() => {
                sendMail(mail.id);
                next(mail.id);
              }}
            >
              <Button type="primary" disabled={!hasDraft}>
                {tx("home_mail_send")}
              </Button>
            </Popconfirm>
          </span>
        </div>
      </Panel>

      <aside className="hm-mail-ai">
        <AiMailPanel mail={mail} onResult={(r) => applyMailAnalysis(mail.id, r)} />
      </aside>
    </div>
  ) : (
    <Panel>
      <EmptyState description={shown.length ? tx("home_mail_pick") : tx("home_mail_empty")} />
    </Panel>
  );

  return (
    <>
      <PageHeader
        title={tx("navInbox")}
        subtitle={unread ? tx("home_mail_sub", { n: unread }) : tx("home_mail_sub_none")}
        extra={
          <>
            <AiBriefCard title={tx("home_ai_mail_brief")} facts={facts} localFallback={localBrief} context="inbox" />
            <Button icon={<ClipboardText size={16} />} onClick={() => setPasteOpen(true)}>
              {tx("home_mail_paste")}
            </Button>
          </>
        }
      />

      <div className="hm-mail">
        {stacked ? (mobileReading && mail ? reading : list) : (
          <>
            {list}
            {reading}
          </>
        )}
      </div>

      <Drawer
        open={pasteOpen}
        onClose={() => setPasteOpen(false)}
        title={tx("home_mail_paste_title")}
        width={480}
        destroyOnHidden
        footer={
          <div className="hm-drawer-foot">
            <Button type="text" onClick={() => setPasteOpen(false)}>
              {tx("home_cancel")}
            </Button>
            <Button type="primary" onClick={() => form.submit()}>
              {tx("home_mail_paste_add")}
            </Button>
          </div>
        }
      >
        <p className="hm-quiet hm-drawer-lead">{tx("home_mail_paste_lead")}</p>
        <Form
          form={form}
          layout="vertical"
          requiredMark
          onFinish={(v) => {
            const id = addPastedMail({ from: v.from ?? "", subject: v.subject ?? "", body: v.body, analysis: undefined });
            setActive(id);
            setMobileReading(true);
            setPasteOpen(false);
            form.resetFields();
            message.success(tx("home_mail_paste_done"));
          }}
        >
          <Form.Item name="from" label={tx("home_mail_from")}>
            <Input type="email" autoComplete="email" placeholder="name@company.com" />
          </Form.Item>
          <Form.Item name="subject" label={tx("home_mail_subject")}>
            <Input />
          </Form.Item>
          <Form.Item name="body" label={tx("home_mail_body")} rules={[{ required: true, message: tx("home_mail_body_req") }]}>
            <Input.TextArea autoSize={{ minRows: 8, maxRows: 16 }} />
          </Form.Item>
        </Form>
      </Drawer>
    </>
  );
}
