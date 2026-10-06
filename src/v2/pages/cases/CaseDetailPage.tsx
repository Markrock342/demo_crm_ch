import {
  ArrowBendDownLeft,
  ArrowCounterClockwise,
  Boat,
  ChatCircleDots,
  CheckCircle,
  DownloadSimple,
  EnvelopeSimple,
  FloppyDisk,
  Flag as FlagIcon,
  Image as ImageIcon,
  Info,
  LinkSimple,
  MapPin,
  Microphone,
  NotePencil,
  PaperPlaneTilt,
  Paperclip,
  Phone,
  ShippingContainer,
  Sparkle,
  Sticker,
  Tag,
  Ticket,
  Timer,
  UserSwitch,
  VideoCamera,
  WarningCircle,
  X,
  type Icon,
} from "@phosphor-icons/react";
import { App, Button, Checkbox, Input, Segmented, Select, Tooltip } from "antd";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  CASE_CATEGORIES,
  CASE_PRIORITIES,
  CASE_STATUSES,
  caseMediaUrl,
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
import { useBusinessUnits } from "../../hooks/useBusinessUnits.ts";
import { useCan } from "../../hooks/useCan.ts";
import { useCanned, useCase, useCaseActions } from "../../hooks/useCases.ts";
import { useCustomerLookup } from "../../hooks/useCustomerLookup.ts";
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
import { LineAvatar, LineBadge, UnitChip } from "./UnitChip.tsx";
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
            {kase.businessUnit ? <UnitChip unit={kase.businessUnit} size="sm" /> : null}
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
          {kase.line ? (
            <>
              {/* A LINE chat reads top-down like the phone app: oldest first, reply box under the newest message. */}
              <Panel
                className="cs-chat-panel"
                title={
                  <span className="cs-opt">
                    <LineBadge size={18} />
                    {tx("cs_line_chat")}
                  </span>
                }
                extra={<span className="cs-quiet">{kase.line.channelName}</span>}
              >
                <Timeline kase={kase} events={events} tx={tx} locale={locale as Locale} chat />
              </Panel>
              <Composer key={kase.id} kase={kase} contacts={contacts} />
            </>
          ) : (
            <>
              <Composer key={kase.id} kase={kase} contacts={contacts} />
              <Panel title={tx("cs_timeline")}>
                <Timeline kase={kase} events={events} tx={tx} locale={locale as Locale} />
              </Panel>
            </>
          )}
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

function Timeline({ kase, events, tx, locale, chat = false }: { kase: CaseDto; events: CaseEventDto[]; tx: Tx; locale: Locale; chat?: boolean }) {
  const { nameOf } = useUserLookup();
  const cust = customerLabel(kase, locale, tx("cs_customer"));
  const label = (k: string, v: unknown) => (typeof v === "string" && v ? tx(`${k}${v}`) : "—");
  // Chat: oldest first (true time order); on a timestamp tie the "case opened" line goes first.
  const ordered = chat
    ? [...events].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || Number(b.type === "created") - Number(a.type === "created"),
      )
    : [...events].reverse();
  const lineName = kase.line?.displayName || kase.contact?.name || cust || tx("cs_line_user");
  const scroller = useRef<HTMLOListElement>(null);
  const last = events.length ? events[events.length - 1].id : "";
  const pinned = useRef(true);
  // Chat view: keep the newest message in sight (on open, when a message arrives, and as photos load)
  // unless the person has scrolled up to read older messages.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!chat || !el) return;
    pinned.current = true;
    el.scrollTop = el.scrollHeight;
  }, [chat, last]);
  useEffect(() => {
    const el = scroller.current;
    if (!chat || !el) return;
    const onScroll = () => {
      pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };
    // Photos, fonts and avatars settle after the first paint — follow them down while pinned.
    const ro = new ResizeObserver(() => {
      if (pinned.current) el.scrollTop = el.scrollHeight;
    });
    for (const child of Array.from(el.children)) ro.observe(child);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", onScroll);
    };
  }, [chat, events.length]);
  return (
    <ol className={`cs-timeline${chat ? " is-chat" : ""}`} ref={scroller}>
      {ordered.map((e) => {
        const who = e.userId ? nameOf(e.userId, "") : "";
        const when = fmtDateTime(e.createdAt, locale);
        if (e.type === "inbound") {
          return (
            <li key={e.id} className="cs-tl-item is-inbound">
              <div className="cs-chat-row is-in">
                <LineAvatar name={lineName} pictureUrl={kase.line?.pictureUrl} size={32} mark={false} />
                <div className="cs-bubble is-in is-chat">
                  <header>
                    <strong>{lineName}</strong>
                    <time>{when}</time>
                  </header>
                  <InboundContent caseId={kase.id} e={e} tx={tx} />
                </div>
              </div>
            </li>
          );
        }
        if (e.type === "reply" && e.data.via === "line") {
          return (
            <li key={e.id} className="cs-tl-item is-reply">
              <div className="cs-chat-row is-out">
                <div className="cs-bubble is-out is-chat">
                  <header>
                    <strong>{who || tx("cs_title")}</strong>
                    <time>{when}</time>
                    <LineDelivery e={e} tx={tx} />
                  </header>
                  <p className="cs-bubble-body">{e.body}</p>
                </div>
                <PersonAvatar name={who} size={32} />
              </div>
            </li>
          );
        }
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
          const sysText = !e.userId && kase.line ? tx("cs_ev_created_line", { channel: kase.line.channelName }) : `${tx("cs_ev_created")}${who ? ` · ${who}` : ""}`;
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
              <SysLine icon={Sparkle} text={sysText} when={when} />
            </li>
          );
        }
        let icon: Icon = FlagIcon;
        let text = "";
        if (e.type === "status" && e.data.auto === "customer_replied") {
          icon = ArrowBendDownLeft;
          text = tx("cs_ev_auto_replied", { to: label("cs_status_", e.data.to) });
        } else if (e.type === "status") {
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

const KIND_ICON: Record<string, Icon> = {
  image: ImageIcon,
  video: VideoCamera,
  audio: Microphone,
  sticker: Sticker,
  file: Paperclip,
  location: MapPin,
  other: ChatCircleDots,
};

/** What the customer sent on LINE: text, a photo thumbnail, a player, or an icon + label for the rest. */
function InboundContent({ caseId, e, tx }: { caseId: string; e: CaseEventDto; tx: Tx }) {
  const kind = typeof e.data.kind === "string" && e.data.kind in KIND_ICON ? e.data.kind : e.body ? "text" : "other";
  const media = e.data.media && typeof e.data.media === "object" ? (e.data.media as { mime?: string; size?: number }) : null;
  const url = media ? caseMediaUrl(caseId, e.id) : null;
  if (kind === "text") return <p className="cs-bubble-body">{e.body}</p>;
  if (kind === "image" && url) {
    return (
      <a className="cs-media-thumb" href={url} target="_blank" rel="noreferrer" title={tx("cs_media_open")}>
        <img src={url} alt={tx("cs_kind_image")} loading="lazy" />
      </a>
    );
  }
  if (kind === "video" && url) return <video className="cs-media-video" src={url} controls preload="metadata" aria-label={tx("cs_kind_video")} />;
  if (kind === "audio" && url) return <audio className="cs-media-audio" src={url} controls preload="none" aria-label={tx("cs_kind_audio")} />;
  const I = KIND_ICON[kind] ?? ChatCircleDots;
  const text = kind === "location" || kind === "file" ? e.body : null;
  return (
    <p className="cs-kind">
      <span className="cs-kind-icon">
        <I size={18} weight="duotone" aria-hidden />
      </span>
      <span className="cs-kind-text">{text || tx(`cs_kind_${kind}`)}</span>
      {url ? (
        <a className="cs-kind-act" href={url} download aria-label={tx("cs_media_download")} title={tx("cs_media_download")}>
          <DownloadSimple size={16} weight="bold" aria-hidden />
        </a>
      ) : kind === "location" && e.body ? (
        <a
          className="cs-kind-act"
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.body)}`}
          target="_blank"
          rel="noreferrer"
          aria-label={tx("cs_map_open")}
          title={tx("cs_map_open")}
        >
          <MapPin size={16} weight="bold" aria-hidden />
        </a>
      ) : null}
    </p>
  );
}

/** Delivery of a staff reply pushed to LINE: sent / failed (with reason) / only logged (OA not connected). */
function LineDelivery({ e, tx }: { e: CaseEventDto; tx: Tx }) {
  const d = e.data.delivery;
  if (d === "sent") {
    return (
      <Tooltip title={tx("cs_line_delivered")}>
        <span className="cs-dlv is-success" role="img" aria-label={tx("cs_line_delivered")}>
          <CheckCircle size={16} weight="fill" />
        </span>
      </Tooltip>
    );
  }
  if (d === "failed") {
    const err = typeof e.data.error === "string" && e.data.error ? e.data.error : "";
    return (
      <Tooltip title={err ? `${tx("cs_line_delivery_failed")}: ${err}` : tx("cs_line_delivery_failed")}>
        <span className="cs-delivery is-danger" tabIndex={0}>
          <WarningCircle size={13} weight="fill" aria-hidden />
          {tx("cs_line_delivery_failed")}
        </span>
      </Tooltip>
    );
  }
  if (d === "not_connected") {
    return (
      <Tooltip title={tx("cs_line_not_connected")}>
        <span className="cs-delivery is-neutral" tabIndex={0}>
          <FloppyDisk size={13} aria-hidden />
          {tx("cs_line_saved_only")}
        </span>
      </Tooltip>
    );
  }
  return null;
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
  const [via, setVia] = useState<Via>(
    kase.line || kase.channel === "line" ? "line" : kase.channel === "phone" || kase.channel === "walk_in" ? "phone" : "email",
  );
  const toLine = via === "line" && Boolean(kase.line?.connected);
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
          else if (r.line?.delivery === "failed") message.warning(tx("cs_line_failed", { error: r.line.error ?? "" }));
          else if (r.line?.delivery === "not_connected") message.info(tx("cs_line_not_connected"));
          else if (r.line?.delivery === "sent") message.success(tx("cs_line_sent"));
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
          {via === "line" && kase.line ? (
            <p className="cs-line-hint">
              <LineAvatar name={kase.line.displayName || tx("cs_line_user")} pictureUrl={kase.line.pictureUrl} size={24} />
              <span>{tx("cs_line_reply_in", { channel: kase.line.channelName })}</span>
            </p>
          ) : null}
          {via === "line" && kase.line && !kase.line.connected ? (
            <p className="cs-line-off">
              <FloppyDisk size={14} aria-hidden />
              <span>{tx("cs_line_off_note")}</span>
            </p>
          ) : null}
          {via === "line" && !kase.line ? <p className="cs-quiet">{tx("cs_line_reply_log")}</p> : null}
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
          icon={mode === "note" ? <NotePencil size={16} /> : via === "email" || toLine ? <PaperPlaneTilt size={16} /> : <CheckCircle size={16} />}
          disabled={!text.trim() || (mode === "reply" && via === "email" && !to.length)}
          loading={busy}
          onClick={send}
        >
          {mode === "note" ? tx("cs_save_note") : via === "email" ? tx("cs_send_email") : toLine ? tx("cs_send_line") : tx("cs_log_reply")}
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
  onPatch: (p: CasePatch, ok?: string) => void;
}) {
  const { tx, locale } = useStore();
  const { customers, nameOf } = useCustomerLookup();
  const name = customerLabel(kase, locale);
  const customerOptions = useMemo(
    () => customers.map((c) => ({ value: c.id, label: nameOf(c.id) })).sort((a, b) => a.label.localeCompare(b.label)),
    [customers, nameOf],
  );
  const contact = contacts.find((c) => c.id === kase.contactId) ?? null;
  const links: { key: "jobId" | "containerNo" | "bookingId"; icon: Icon; label: string; to?: string }[] = [];
  if (kase.jobId) links.push({ key: "jobId", icon: Boat, label: kase.jobNumber ?? "—", to: `/jobs/${kase.jobId}` });
  if (kase.containerNo) links.push({ key: "containerNo", icon: ShippingContainer, label: kase.containerNo, to: `/boxes?q=${encodeURIComponent(kase.containerNo)}` });
  if (kase.bookingId) links.push({ key: "bookingId", icon: Ticket, label: kase.bookingNumber ?? "—" });

  return (
    <Panel title={tx("cs_customer")}>
      {kase.line ? (
        <div className="cs-line-who">
          <LineAvatar name={kase.line.displayName || tx("cs_line_user")} pictureUrl={kase.line.pictureUrl} size={40} />
          <span className="cs-line-who-text">
            <strong>{kase.line.displayName || tx("cs_line_user")}</strong>
            <LineBadge label={kase.line.channelName} />
          </span>
        </div>
      ) : null}
      {kase.customerId ? (
        <Link to={`/customers/${kase.customerId}`} className="cs-cust">
          <PersonAvatar name={name} size={40} />
          <strong>{name}</strong>
        </Link>
      ) : editable ? (
        <div className={`cs-link-cust${kase.line ? " is-prominent" : ""}`}>
          <span className="cs-link-cust-label">
            <LinkSimple size={16} weight="bold" aria-hidden />
            {tx("cs_link_customer")}
            {kase.line ? (
              <Tooltip title={tx("cs_link_customer_tip")}>
                <span className="cs-tip" tabIndex={0} role="img" aria-label={tx("cs_link_customer_tip")}>
                  <Info size={15} aria-hidden />
                </span>
              </Tooltip>
            ) : null}
          </span>
          <Select
            showSearch
            optionFilterProp="label"
            placeholder={tx("cs_link_customer_ph")}
            options={customerOptions}
            value={undefined}
            onChange={(v: string) => onPatch({ customerId: v }, tx("cs_linked"))}
            aria-label={tx("cs_link_customer")}
          />
        </div>
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
  const { units } = useBusinessUnits();
  const current = kase.businessUnit;
  // Keep an archived unit selectable/visible while it is still on the case.
  const unitList = current && !units.some((u) => u.id === current.id) ? [...units, current] : units;
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
        <dt>{tx("cs_unit")}</dt>
        <dd>
          <Select
            value={kase.businessUnitId ?? undefined}
            disabled={!editable}
            allowClear
            placeholder={<span className="cs-unit-none">{tx("cs_unit_none")}</span>}
            onChange={(v) => onPatch({ businessUnitId: v ?? null })}
            aria-label={tx("cs_unit")}
            options={unitList.map((u) => ({ value: u.id, title: u.name, label: <UnitChip unit={u} size="sm" /> }))}
          />
        </dd>
      </dl>
    </Panel>
  );
}
