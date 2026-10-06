import {
  ArrowCounterClockwise,
  Boat,
  ChatCircleDots,
  CheckCircle,
  EnvelopeSimple,
  Flag as FlagIcon,
  LinkSimple,
  NotePencil,
  PaperPlaneTilt,
  Phone,
  ShippingContainer,
  Sparkle,
  Tag,
  Ticket,
  Timer,
  UserSwitch,
  X,
  type Icon,
} from "@phosphor-icons/react";
import { App, Button, Checkbox, Input, Segmented, Select } from "antd";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  CASE_CATEGORIES,
  CASE_PRIORITIES,
  CASE_STATUSES,
  renderCanned,
  type CannedVariable,
  type CaseContact,
  type CaseDto,
  type CaseEventDto,
  type CasePatch,
  type CaseStatus,
  type LookupHit,
  type SlaTimer,
} from "../../../api/cases.ts";
import { ApiError } from "../../../api/crm.ts";
import { useStore } from "../../../store";
import { EmptyState, ErrorState, LoadingState, PageHeader, Panel, PersonAvatar } from "../../components";
import { useCan } from "../../hooks/useCan.ts";
import { useCanned, useCase, useCaseActions } from "../../hooks/useCases.ts";
import { useUserLookup } from "../../hooks/useUserLookup.ts";
import { fmtDateTime } from "../../lib/format.ts";
import { useAssigneeOptions } from "./CaseCreateDrawer.tsx";
import {
  CATEGORY_LOOK,
  CategoryIcon,
  CHANNEL_ICON,
  ChannelIcon,
  PriorityMeter,
  STATUS_LOOK,
  customerLabel,
  liveSla,
  slaText,
  useNow,
} from "./caseLook.tsx";
import { StatusLookupPanel, linkPatchFor } from "./StatusLookupPanel.tsx";
import "./cases.css";

type Tx = (k: string, v?: Record<string, string | number>) => string;
type Locale = "zh" | "th" | "en";

export function CaseDetailPage() {
  const { id } = useParams();
  const { tx, locale } = useStore();
  const { message } = App.useApp();
  const can = useCan();
  const editable = can("case.edit");
  const q = useCase(id);
  const actions = useCaseActions();
  const now = useNow(20_000);

  if (q.isLoading) return <LoadingState />;
  if (q.isError || !q.data) {
    const notFound = q.error instanceof ApiError && q.error.status === 404;
    return (
      <div className="cz-stack">
        <PageHeader title={tx("cs_title")} back={{ to: "/cases", label: tx("cs_back") }} />
        {notFound ? <EmptyState title={tx("cs_not_found")} /> : <ErrorState title={tx("cs_error")} action={<Button onClick={() => q.refetch()}>{tx("retry")}</Button>} />}
      </div>
    );
  }

  const { case: kase, events, contacts } = q.data;

  const patch = (p: CasePatch, ok = tx("cs_saved")) =>
    actions.patch.mutate(
      { id: kase.id, patch: p },
      {
        onSuccess: () => message.success(ok),
        onError: () => message.error(tx("cs_error")),
      },
    );

  const open = ["new", "in_progress", "waiting_customer"].includes(kase.status);

  return (
    <div className="cz-stack cs-detail">
      <PageHeader
        back={{ to: "/cases", label: tx("cs_back") }}
        title={kase.subject}
        subtitle={
          <span className="cs-detail-sub">
            <strong className="cz-mono">{kase.caseNo}</strong>
            <CategoryIcon category={kase.category} tx={tx} size={16} />
            <ChannelIcon channel={kase.channel} tx={tx} />
            <span>{tx("cs_opened", { time: fmtDateTime(kase.createdAt, locale as Locale) })}</span>
          </span>
        }
        extra={
          editable ? (
            open ? (
              <Button type="primary" icon={<CheckCircle size={16} />} onClick={() => patch({ status: "resolved" })} loading={actions.patch.isPending}>
                {tx("cs_resolve_btn")}
              </Button>
            ) : (
              <>
                <Button icon={<ArrowCounterClockwise size={16} />} onClick={() => patch({ status: "in_progress" })}>
                  {tx("cs_reopen")}
                </Button>
                {kase.status === "resolved" ? (
                  <Button type="primary" onClick={() => patch({ status: "closed" })}>
                    {tx("cs_close_btn")}
                  </Button>
                ) : null}
              </>
            )
          ) : null
        }
      />

      <Panel className="cs-hero">
        <StatusStepper status={kase.status} tx={tx} onPick={editable ? (s) => patch({ status: s }) : undefined} />
        <SlaTimers kase={kase} now={now} tx={tx} locale={locale as Locale} />
      </Panel>

      <div className="cs-detail-grid">
        <div className="cz-stack cs-detail-main">
          <Composer kase={kase} contacts={contacts} />
          <Panel title={tx("cs_timeline")}>
            <Timeline kase={kase} events={events} tx={tx} locale={locale as Locale} />
          </Panel>
        </div>
        <aside className="cz-stack cs-detail-side">
          <CustomerPanel kase={kase} contacts={contacts} editable={editable} onPatch={patch} />
          <ControlsPanel kase={kase} editable={editable} onPatch={patch} />
          <StatusLookupPanel
            kase={kase}
            linking={actions.patch.isPending}
            onLink={editable ? (h: LookupHit) => patch(linkPatchFor(h), tx("cs_linked")) : undefined}
          />
        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

const STEPS: CaseStatus[] = ["new", "in_progress", "waiting_customer", "resolved", "closed"];

function StatusStepper({ status, tx, onPick }: { status: CaseStatus; tx: Tx; onPick?: (s: CaseStatus) => void }) {
  const at = STEPS.indexOf(status);
  return (
    <ol className="cs-steps" aria-label={tx("cs_status")}>
      {STEPS.map((s, i) => {
        const look = STATUS_LOOK[s];
        const state = i < at ? "done" : i === at ? "now" : "next";
        const inner = (
          <>
            <span className={`cs-step-dot is-${look.tone}`}>
              <look.icon size={16} weight={state === "next" ? "regular" : "fill"} aria-hidden />
            </span>
            <span className="cs-step-label">{tx(`cs_status_${s}`)}</span>
          </>
        );
        return (
          <li key={s} className={`cs-step is-${state}`} aria-current={state === "now" ? "step" : undefined}>
            {onPick && state !== "now" ? (
              <button type="button" onClick={() => onPick(s)} title={tx(`cs_status_${s}`)}>
                {inner}
              </button>
            ) : (
              <span className="cs-step-static">{inner}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function TimerBlock({ label, icon: I, t, tx, locale, active }: { label: string; icon: Icon; t: SlaTimer; tx: Tx; locale: Locale; active: boolean }) {
  const tone = t.state === "breached" ? "danger" : t.state === "warning" ? "warning" : t.state === "met" ? "success" : t.state === "ok" ? "primary" : "neutral";
  const used = t.fractionLeft === null ? (t.state === "met" || t.state === "late" || t.state === "breached" ? 100 : 0) : Math.round((1 - t.fractionLeft) * 100);
  return (
    <div className={`cs-timer is-${tone}${active ? " is-active" : ""}`}>
      <span className="cs-timer-icon">
        <I size={20} weight="duotone" aria-hidden />
      </span>
      <span className="cs-timer-body">
        <span className="cs-timer-label">{label}</span>
        <strong className="cs-timer-value">{t.state === "none" ? "—" : slaText(tx, t)}</strong>
        <span className="cs-timer-bar" aria-hidden>
          <span style={{ width: `${used}%` }} />
        </span>
        {t.dueAt ? <span className="cs-timer-due">{fmtDateTime(t.doneAt ?? t.dueAt, locale)}</span> : null}
      </span>
    </div>
  );
}

function SlaTimers({ kase, now, tx, locale }: { kase: CaseDto; now: number; tx: Tx; locale: Locale }) {
  const sla = liveSla(kase, now);
  return (
    <div className="cs-timers">
      <TimerBlock label={tx("cs_sla_first")} icon={ChatCircleDots} t={sla.first} tx={tx} locale={locale} active={sla.active === "first"} />
      <TimerBlock label={tx("cs_sla_resolve")} icon={Timer} t={sla.resolve} tx={tx} locale={locale} active={sla.active === "resolve"} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline

const LINK_ICON: Record<string, Icon> = { job: Boat, container: ShippingContainer, booking: Ticket, customer: LinkSimple };

function Timeline({ kase, events, tx, locale }: { kase: CaseDto; events: CaseEventDto[]; tx: Tx; locale: Locale }) {
  const { nameOf } = useUserLookup();
  const cust = customerLabel(kase, locale, tx("cs_customer"));
  const label = (k: string, v: unknown) => (typeof v === "string" && v ? tx(`${k}${v}`) : "—");
  const ordered = [...events].reverse();
  return (
    <ol className="cs-timeline">
      {ordered.map((e) => {
        const who = e.userId ? nameOf(e.userId, "") : "";
        const when = fmtDateTime(e.createdAt, locale);
        if (e.type === "reply") {
          const via = String(e.data.via ?? "email");
          const failed = e.data.delivery === "failed";
          const I = via === "phone" ? Phone : via === "line" ? CHANNEL_ICON.line : EnvelopeSimple;
          const to = Array.isArray(e.data.to) ? (e.data.to as string[]).join(", ") : "";
          return (
            <li key={e.id} className="cs-tl-item is-reply">
              <div className="cs-bubble is-out">
                <header>
                  <PersonAvatar name={who} size={24} />
                  <strong>{who}</strong>
                  <span className="cs-bubble-via">
                    <I size={14} aria-hidden />
                    {tx(`cs_ev_reply_${via}`)}
                  </span>
                  {via === "email" ? (
                    <span className={`cs-delivery is-${failed ? "danger" : "success"}`}>
                      {failed ? <X size={12} weight="bold" aria-hidden /> : <PaperPlaneTilt size={12} weight="fill" aria-hidden />}
                      {tx(failed ? "cs_mail_failed" : "cs_mail_sent")}
                    </span>
                  ) : null}
                  <time>{when}</time>
                </header>
                {to ? <p className="cs-bubble-to">{`${tx("cs_to")}: ${to}`}</p> : null}
                <p className="cs-bubble-body">{e.body}</p>
              </div>
            </li>
          );
        }
        if (e.type === "comment") {
          return (
            <li key={e.id} className="cs-tl-item is-note">
              <div className="cs-note">
                <header>
                  <NotePencil size={16} weight="duotone" aria-hidden />
                  <strong>{who}</strong>
                  <span className="cs-note-tag">{tx("cs_ev_comment")}</span>
                  <time>{when}</time>
                </header>
                <p>{e.body}</p>
              </div>
            </li>
          );
        }
        if (e.type === "created") {
          return (
            <li key={e.id} className="cs-tl-item is-created">
              {kase.description ? (
                <div className="cs-bubble is-in">
                  <header>
                    <PersonAvatar name={cust} size={24} />
                    <strong>{kase.contact?.name || cust}</strong>
                    <span className="cs-bubble-via">
                      <ChannelIcon channel={kase.channel} tx={tx} size={14} />
                      {tx(`cs_ch_${kase.channel}`)}
                    </span>
                    <time>{when}</time>
                  </header>
                  <p className="cs-bubble-body">{kase.description}</p>
                </div>
              ) : null}
              <SysLine icon={Sparkle} text={`${tx("cs_ev_created")}${who ? ` · ${who}` : ""}`} when={when} />
            </li>
          );
        }
        let icon: Icon = FlagIcon;
        let text = "";
        if (e.type === "status") {
          icon = STATUS_LOOK[(e.data.to as CaseStatus) ?? "new"]?.icon ?? FlagIcon;
          text = tx("cs_ev_status", { from: label("cs_status_", e.data.from), to: label("cs_status_", e.data.to) });
        } else if (e.type === "assignment") {
          icon = UserSwitch;
          text = e.data.to ? tx("cs_ev_assigned", { name: nameOf(String(e.data.to), "—") }) : tx("cs_ev_unassigned");
        } else if (e.type === "priority") {
          icon = FlagIcon;
          text = tx("cs_ev_priority", { from: label("cs_pri_", e.data.from), to: label("cs_pri_", e.data.to) });
        } else if (e.type === "category") {
          icon = Tag;
          text = tx("cs_ev_category", { from: label("cs_cat_", e.data.from), to: label("cs_cat_", e.data.to) });
        } else if (e.type === "link") {
          const field = String(e.data.field ?? "");
          icon = LINK_ICON[field] ?? LinkSimple;
          const what = tx(`cs_${field === "customer" ? "customer" : field}`);
          text = e.data.to ? tx("cs_ev_link", { what, value: field === "customer" ? "" : String(e.data.to) }) : tx("cs_ev_unlink", { what });
        }
        return (
          <li key={e.id} className="cs-tl-item is-sys">
            <SysLine icon={icon} text={`${text}${who ? ` · ${who}` : ""}`} when={when} />
          </li>
        );
      })}
    </ol>
  );
}

function SysLine({ icon: I, text, when }: { icon: Icon; text: string; when: string }) {
  return (
    <div className="cs-sys">
      <I size={14} aria-hidden />
      <span>{text}</span>
      <time>{when}</time>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Composer: reply to the customer (email / phone / LINE) or an internal note

type Mode = "reply" | "note";
type Via = "email" | "phone" | "line";

function Composer({ kase, contacts }: { kase: CaseDto; contacts: CaseContact[] }) {
  const { tx, locale } = useStore();
  const { message } = App.useApp();
  const can = useCan();
  const actions = useCaseActions();
  const canned = useCanned();
  const defaultTo = useMemo(() => {
    const own = kase.contact?.email?.trim();
    if (own) return [own];
    const first = contacts.find((c) => c.email?.trim());
    return first ? [first.email.trim()] : [];
  }, [kase.contact, contacts]);
  const [mode, setMode] = useState<Mode>("reply");
  const [via, setVia] = useState<Via>(kase.channel === "line" ? "line" : kase.channel === "phone" || kase.channel === "walk_in" ? "phone" : "email");
  const [text, setText] = useState("");
  const [to, setTo] = useState<string[]>(defaultTo);
  const [subject, setSubject] = useState(`[${kase.caseNo}] ${kase.subject}`);
  const [wait, setWait] = useState(false);
  const [missing, setMissing] = useState<CannedVariable[]>([]);
  const [cannedId, setCannedId] = useState<string | undefined>();

  useEffect(() => setTo(defaultTo), [defaultTo]);

  if (!can("case.edit")) return null;

  const cannedOptions = [...(canned.data ?? [])]
    .sort((a, b) => Number(b.category === kase.category) - Number(a.category === kase.category))
    .map((c) => {
      const L = c.category ? CATEGORY_LOOK[c.category] : null;
      return {
        value: c.id,
        label: (
          <span className="cs-opt">
            {L ? <L.icon size={14} weight="duotone" aria-hidden /> : <ChatCircleDots size={14} aria-hidden />}
            {c.title}
          </span>
        ),
        title: c.title,
      };
    });

  async function pickCanned(id: string | undefined) {
    setCannedId(id);
    if (!id) return;
    try {
      const out = await renderCanned({ caseId: kase.id, cannedId: id, lang: locale });
      setText(out.text);
      setMissing(out.missing);
    } catch {
      message.error(tx("cs_error"));
    }
  }

  function reset() {
    setText("");
    setMissing([]);
    setCannedId(undefined);
    setWait(false);
  }

  function send() {
    const body = text.trim();
    if (!body) return;
    if (mode === "note") {
      actions.note.mutate(
        { id: kase.id, body },
        { onSuccess: () => (message.success(tx("cs_logged")), reset()), onError: () => message.error(tx("cs_error")) },
      );
      return;
    }
    actions.reply.mutate(
      {
        id: kase.id,
        input: {
          via,
          body,
          ...(via === "email" ? { to, subject } : {}),
          ...(wait ? { status: "waiting_customer" as const } : {}),
        },
      },
      {
        onSuccess: (r) => {
          if (r.mail?.status === "failed") message.warning(tx("cs_send_failed", { error: r.mail.error ?? "" }));
          else message.success(tx(via === "email" ? "cs_sent" : "cs_logged"));
          reset();
        },
        onError: (e) => {
          const code = e instanceof ApiError ? e.issues[0]?.message : undefined;
          message.error(code === "no_recipient" ? tx("cs_err_no_recipient") : code === "invalid_email" ? tx("cs_err_invalid_email") : tx("cs_error"));
        },
      },
    );
  }

  const busy = actions.reply.isPending || actions.note.isPending;

  return (
    <Panel className={`cs-composer is-${mode}`}>
      <div className="cs-composer-top">
        <Segmented
          value={mode}
          onChange={(v) => setMode(v as Mode)}
          options={[
            { value: "reply", label: <span className="cs-opt"><PaperPlaneTilt size={16} aria-hidden />{tx("cs_tab_reply")}</span> },
            { value: "note", label: <span className="cs-opt"><NotePencil size={16} aria-hidden />{tx("cs_tab_note")}</span> },
          ]}
        />
        {mode === "reply" ? (
          <Select
            allowClear
            className="cs-canned-select"
            placeholder={tx("cs_canned_pick")}
            value={cannedId}
            options={cannedOptions}
            onChange={pickCanned}
            loading={canned.isLoading}
            optionFilterProp="title"
            showSearch
          />
        ) : null}
      </div>

      {mode === "reply" ? (
        <div className="cs-composer-fields">
          <Segmented
            value={via}
            onChange={(v) => setVia(v as Via)}
            aria-label={tx("cs_reply_via")}
            options={(["email", "phone", "line"] as Via[]).map((v) => {
              const I = CHANNEL_ICON[v];
              return { value: v, label: <span className="cs-opt"><I size={16} aria-hidden />{tx(`cs_ch_${v}`)}</span> };
            })}
          />
          {via === "email" ? (
            <>
              <label className="cs-field">
                <span>{tx("cs_to")}</span>
                <Select
                  mode="tags"
                  value={to}
                  onChange={setTo}
                  tokenSeparators={[",", " ", ";"]}
                  options={contacts.filter((c) => c.email).map((c) => ({ value: c.email, label: `${c.name} · ${c.email}` }))}
                  aria-label={tx("cs_to")}
                />
              </label>
              <label className="cs-field">
                <span>{tx("cs_mail_subject")}</span>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={300} />
              </label>
            </>
          ) : null}
        </div>
      ) : null}

      <Input.TextArea
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoSize={{ minRows: 4, maxRows: 16 }}
        placeholder={tx(mode === "note" ? "cs_note_ph" : "cs_reply_ph")}
        aria-label={tx(mode === "note" ? "cs_tab_note" : "cs_tab_reply")}
        maxLength={20000}
      />
      {mode === "reply" && missing.length ? (
        <p className="cs-missing">{tx("cs_canned_missing", { list: missing.map((m) => tx(`cs_var_${m}`)).join(", ") })}</p>
      ) : null}

      <div className="cs-composer-actions">
        {mode === "reply" ? (
          <Checkbox checked={wait} onChange={(e) => setWait(e.target.checked)}>
            {tx("cs_wait_after")}
          </Checkbox>
        ) : (
          <span />
        )}
        <Button
          type="primary"
          icon={mode === "note" ? <NotePencil size={16} /> : via === "email" ? <PaperPlaneTilt size={16} /> : <CheckCircle size={16} />}
          disabled={!text.trim() || (mode === "reply" && via === "email" && !to.length)}
          loading={busy}
          onClick={send}
        >
          {mode === "note" ? tx("cs_save_note") : via === "email" ? tx("cs_send_email") : tx("cs_log_reply")}
        </Button>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Side panels

function CustomerPanel({
  kase,
  contacts,
  editable,
  onPatch,
}: {
  kase: CaseDto;
  contacts: CaseContact[];
  editable: boolean;
  onPatch: (p: CasePatch) => void;
}) {
  const { tx, locale } = useStore();
  const name = customerLabel(kase, locale);
  const contact = contacts.find((c) => c.id === kase.contactId) ?? null;
  const links: { key: "jobId" | "containerNo" | "bookingId"; icon: Icon; label: string; to?: string }[] = [];
  if (kase.jobId) links.push({ key: "jobId", icon: Boat, label: kase.jobNumber ?? "—", to: `/jobs/${kase.jobId}` });
  if (kase.containerNo) links.push({ key: "containerNo", icon: ShippingContainer, label: kase.containerNo, to: `/boxes?q=${encodeURIComponent(kase.containerNo)}` });
  if (kase.bookingId) links.push({ key: "bookingId", icon: Ticket, label: kase.bookingNumber ?? "—" });

  return (
    <Panel title={tx("cs_customer")}>
      {kase.customerId ? (
        <Link to={`/customers/${kase.customerId}`} className="cs-cust">
          <PersonAvatar name={name} size={40} />
          <strong>{name}</strong>
        </Link>
      ) : (
        <p className="cs-quiet">{tx("cs_no_customer")}</p>
      )}
      {contacts.length ? (
        <Select
          className="cs-contact-select"
          allowClear
          disabled={!editable}
          placeholder={tx("cs_contact")}
          value={kase.contactId ?? undefined}
          onChange={(v) => onPatch({ contactId: v ?? null })}
          options={contacts.map((c) => ({ value: c.id, label: c.title ? `${c.name} · ${c.title}` : c.name }))}
          aria-label={tx("cs_contact")}
        />
      ) : null}
      {contact ? (
        <ul className="cs-contact-ways">
          {contact.phone ? (
            <li>
              <a href={`tel:${contact.phone.replace(/\s+/g, "")}`}>
                <Phone size={16} aria-hidden />
                {contact.phone}
              </a>
            </li>
          ) : null}
          {contact.email ? (
            <li>
              <a href={`mailto:${contact.email}`}>
                <EnvelopeSimple size={16} aria-hidden />
                {contact.email}
              </a>
            </li>
          ) : null}
          {contact.lineId ? (
            <li>
              <span>
                <ChatCircleDots size={16} aria-hidden />
                {contact.lineId}
              </span>
            </li>
          ) : null}
        </ul>
      ) : null}
      {links.length ? (
        <div className="cs-links">
          {links.map((l) => (
            <span key={l.key} className="cs-link-chip">
              <l.icon size={14} aria-hidden />
              {l.to ? <Link to={l.to}>{l.label}</Link> : <span>{l.label}</span>}
              {editable ? (
                <button type="button" aria-label={tx("cs_ev_unlink", { what: l.label })} onClick={() => onPatch({ [l.key]: null } as CasePatch)}>
                  <X size={12} weight="bold" aria-hidden />
                </button>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}
    </Panel>
  );
}

function ControlsPanel({ kase, editable, onPatch }: { kase: CaseDto; editable: boolean; onPatch: (p: CasePatch) => void }) {
  const { tx } = useStore();
  const assignees = useAssigneeOptions();
  return (
    <Panel>
      <dl className="cs-controls">
        <dt>{tx("cs_status")}</dt>
        <dd>
          <Select
            value={kase.status}
            disabled={!editable}
            onChange={(v) => onPatch({ status: v })}
            aria-label={tx("cs_status")}
            options={CASE_STATUSES.map((s) => {
              const L = STATUS_LOOK[s];
              return { value: s, label: <span className={`cs-opt cs-tone-${L.tone}`}><L.icon size={14} weight="fill" aria-hidden />{tx(`cs_status_${s}`)}</span> };
            })}
          />
        </dd>
        <dt>{tx("cs_assignee")}</dt>
        <dd>
          <Select
            value={kase.assigneeUserId ?? undefined}
            disabled={!editable}
            allowClear
            showSearch
            optionFilterProp="title"
            placeholder={tx("cs_unassigned")}
            onChange={(v) => onPatch({ assigneeUserId: v ?? null })}
            aria-label={tx("cs_assignee")}
            options={assignees.map((a) => ({
              value: a.value,
              title: a.label,
              label: <span className="cs-opt"><PersonAvatar name={a.label} size={20} />{a.label}</span>,
            }))}
          />
        </dd>
        <dt>{tx("cs_priority")}</dt>
        <dd>
          <Select
            value={kase.priority}
            disabled={!editable}
            onChange={(v) => onPatch({ priority: v })}
            aria-label={tx("cs_priority")}
            options={CASE_PRIORITIES.map((p) => ({ value: p, label: <span className="cs-opt"><PriorityMeter priority={p} tx={tx} />{tx(`cs_pri_${p}`)}</span> }))}
          />
        </dd>
        <dt>{tx("cs_category")}</dt>
        <dd>
          <Select
            value={kase.category}
            disabled={!editable}
            onChange={(v) => onPatch({ category: v })}
            aria-label={tx("cs_category")}
            options={CASE_CATEGORIES.map((c) => {
              const L = CATEGORY_LOOK[c];
              return { value: c, label: <span className="cs-opt"><L.icon size={14} weight="duotone" aria-hidden />{tx(`cs_cat_${c}`)}</span> };
            })}
          />
        </dd>
      </dl>
    </Panel>
  );
}
