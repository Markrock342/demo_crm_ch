import {
  AddressBook,
  ArrowRight,
  Buildings,
  CalendarCheck,
  CheckSquare,
  ClockCounterClockwise,
  Cube,
  EnvelopeSimple,
  FileText,
  Files,
  Flag,
  Funnel,
  Gear,
  HandCoins,
  LockKey,
  MagnifyingGlass,
  Receipt,
  SignIn,
  SignOut,
  Storefront,
  Target,
  Truck,
  UserCircle,
  Wallet,
  type Icon,
} from "@phosphor-icons/react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Button, DatePicker, Input, Pagination, Select } from "antd";
import type { Dayjs } from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchAuditFacets, fetchAuditLogs, type AuditRow } from "../../api/secmail.ts";
import type { Locale } from "../../i18n";
import { useStore } from "../../store";
import { EmptyState, ErrorState, IconBadge, LoadingState, Panel, PersonAvatar, type GraphicTone } from "../../v2/components";
import { fmtDateTime } from "../../v2/lib/format.ts";
import "./audit.css";

const TYPE_LOOK: Record<string, { icon: Icon; path?: (id: string) => string }> = {
  customer: { icon: Buildings, path: (id) => `/customers/${encodeURIComponent(id)}` },
  contact: { icon: AddressBook, path: () => "/contacts" },
  lead: { icon: Target, path: () => "/leads" },
  opportunity: { icon: Funnel, path: () => "/pipeline" },
  quotation: { icon: FileText, path: () => "/quotations" },
  booking: { icon: CalendarCheck, path: () => "/jobs" },
  job: { icon: Truck, path: (id) => `/jobs/${encodeURIComponent(id)}` },
  job_task: { icon: CheckSquare, path: () => "/tasks" },
  task: { icon: CheckSquare, path: () => "/tasks" },
  job_milestone: { icon: Flag },
  container: { icon: Cube, path: () => "/boxes" },
  invoice: { icon: Receipt, path: () => "/invoices" },
  billing_note: { icon: Files, path: () => "/invoices" },
  payment: { icon: HandCoins, path: () => "/invoices" },
  vendor: { icon: Storefront, path: () => "/vendors" },
  vendor_bill: { icon: Wallet, path: () => "/vendor-bills" },
  user: { icon: UserCircle, path: () => "/settings#settings-users" },
  organization: { icon: Buildings, path: () => "/settings#settings-company" },
  mail: { icon: EnvelopeSimple, path: () => "/inbox" },
  system: { icon: Gear },
};

type Verb = "created" | "updated" | "deleted" | "signIn" | "signOut" | "locked" | "emailed" | "emailFailed" | "sent" | "approved" | "issued" | "paid" | "signed" | "password" | "completed" | "other";

const VERB_LOOK: Record<Verb, { tone: GraphicTone; icon?: Icon }> = {
  created: { tone: "success" },
  updated: { tone: "info" },
  deleted: { tone: "danger" },
  signIn: { tone: "neutral", icon: SignIn },
  signOut: { tone: "neutral", icon: SignOut },
  locked: { tone: "danger", icon: LockKey },
  emailed: { tone: "primary", icon: EnvelopeSimple },
  emailFailed: { tone: "danger", icon: EnvelopeSimple },
  sent: { tone: "primary" },
  approved: { tone: "success" },
  issued: { tone: "primary" },
  paid: { tone: "success" },
  signed: { tone: "success" },
  password: { tone: "warning", icon: LockKey },
  completed: { tone: "success" },
  other: { tone: "neutral" },
};

/** Maps raw action codes (INVOICE_CREATED, USER_LOGIN, …) to a small set of human verbs. */
export function verbOf(action: string): Verb {
  const a = action.toUpperCase();
  if (a.includes("LOGIN_LOCKED")) return "locked";
  if (a.includes("LOGOUT")) return "signOut";
  if (a.includes("LOGIN")) return "signIn";
  if (a === "MAIL_FAILED") return "emailFailed";
  if (a === "MAIL_SENT") return "emailed";
  if (a.includes("PASSWORD")) return "password";
  if (/DELET|REMOV|REVOK|UNDONE|DEACTIVAT/.test(a)) return "deleted";
  if (/CREAT|IMPORT|REACTIVAT|\bADD/.test(a)) return "created";
  if (/SIGNED|ACCEPT/.test(a)) return "signed";
  if (/APPROV/.test(a)) return "approved";
  if (/ISSUE/.test(a)) return "issued";
  if (/PAID|PAYMENT/.test(a)) return "paid";
  if (/COMPLET/.test(a)) return "completed";
  if (/SENT|SEND/.test(a)) return "sent";
  if (/UPDAT|CHANGE|EDIT|PATCH|SET|REOPEN/.test(a)) return "updated";
  return "other";
}

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const PAGE_SIZE = 20;

export function AuditSection() {
  const { tx } = useStore();
  const [q, setQ] = useState("");
  const [userId, setUserId] = useState<string | undefined>();
  const [entityType, setEntityType] = useState<string | undefined>();
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [page, setPage] = useState(1);
  const search = useDebounced(q.trim());

  const query = {
    q: search || undefined,
    userId,
    entityType,
    from: range?.[0]?.format("YYYY-MM-DD"),
    to: range?.[1]?.format("YYYY-MM-DD"),
    page,
    pageSize: PAGE_SIZE,
  };
  useEffect(() => setPage(1), [search, userId, entityType, range]);

  const facets = useQuery({ queryKey: ["audit", "facets"], queryFn: fetchAuditFacets, staleTime: 60_000 });
  const logs = useQuery({ queryKey: ["audit", "logs", query], queryFn: () => fetchAuditLogs(query), placeholderData: keepPreviousData });

  const typeLabel = (t: string) => {
    const k = `sm_et_${t}`;
    const s = tx(k);
    return s === k ? t.replace(/[_.]/g, " ") : s;
  };

  const userOptions = useMemo(() => (facets.data?.users ?? []).map((u) => ({ value: u.id, label: u.name || u.email })), [facets.data]);
  const typeOptions = useMemo(
    () => (facets.data?.entityTypes ?? []).map((t) => ({ value: t, label: typeLabel(t) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [facets.data, tx],
  );

  const title = (
    <span className="fin-panel-title">
      <IconBadge icon={ClockCounterClockwise} tone="neutral" size={30} />
      {tx("sm_audit")}
    </span>
  );

  return (
    <div id="settings-audit" className="adm-anchor">
      <Panel title={title}>
        <div className="aud-filters">
          <Input
            allowClear
            prefix={<MagnifyingGlass size={16} aria-hidden />}
            placeholder={tx("sm_search")}
            aria-label={tx("sm_search")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="aud-search"
          />
          <Select allowClear showSearch optionFilterProp="label" placeholder={tx("sm_allUsers")} aria-label={tx("sm_allUsers")} options={userOptions} value={userId} onChange={setUserId} className="aud-select" />
          <Select allowClear showSearch optionFilterProp="label" placeholder={tx("sm_allTypes")} aria-label={tx("sm_allTypes")} options={typeOptions} value={entityType} onChange={setEntityType} className="aud-select" />
          <DatePicker.RangePicker value={range} onChange={(v) => setRange(v as [Dayjs | null, Dayjs | null] | null)} className="aud-range" allowEmpty={[true, true]} />
        </div>

        {logs.isLoading ? (
          <LoadingState />
        ) : logs.isError ? (
          <ErrorState title={tx("sm_failed")} action={<Button onClick={() => void logs.refetch()}>{tx("retry")}</Button>} />
        ) : !logs.data?.items.length ? (
          <EmptyState title={tx("sm_empty")} />
        ) : (
          <>
            <ol className="aud-list" data-testid="audit-list" aria-busy={logs.isFetching}>
              {logs.data.items.map((r) => (
                <AuditItem key={r.id} r={r} typeLabel={typeLabel} />
              ))}
            </ol>
            <div className="aud-foot">
              <span className="cz-muted">
                {logs.data.total.toLocaleString()} {tx("sm_total")}
              </span>
              <Pagination size="small" current={page} pageSize={PAGE_SIZE} total={logs.data.total} onChange={setPage} showSizeChanger={false} simple={{ readOnly: true }} />
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}

function AuditItem({ r, typeLabel }: { r: AuditRow; typeLabel: (t: string) => string }) {
  const { tx, locale } = useStore();
  const [expanded, setExpanded] = useState(false);
  const verb = verbOf(r.action);
  const look = VERB_LOOK[verb];
  const type = TYPE_LOOK[r.entityType];
  const TypeIcon = look.icon ?? type?.icon ?? Gear;
  const href = r.entityId && type?.path ? type.path(r.entityId) : null;
  const label = r.entityLabel || r.entityId || "";
  const shown = expanded ? r.changes : r.changes.slice(0, 3);

  const record = (
    <>
      <span className="aud-type">{typeLabel(r.entityType)}</span>
      {label ? <strong className="aud-label">{label}</strong> : null}
    </>
  );

  return (
    <li className={`aud-item is-${look.tone}`}>
      <IconBadge icon={TypeIcon} tone={look.tone} size={34} />
      <div className="aud-main">
        <div className="aud-line">
          <span className={`aud-verb is-${look.tone}`} title={r.action}>
            {tx(`sm_act_${verb}`)}
          </span>
          {href ? (
            <Link to={href} className="aud-record" aria-label={`${tx("sm_open")} ${typeLabel(r.entityType)} ${label}`}>
              {record}
              <ArrowRight size={12} aria-hidden />
            </Link>
          ) : (
            <span className="aud-record">{record}</span>
          )}
        </div>
        {shown.length ? (
          <ul className="aud-changes" aria-label={tx("sm_details")}>
            {shown.map((c) => (
              <li key={c.field}>
                <span className="aud-field">{c.field}</span>
                {c.from !== undefined ? <span className="aud-from">{c.from ?? "—"}</span> : null}
                {c.from !== undefined && c.to !== undefined ? <ArrowRight size={10} aria-hidden /> : null}
                {c.to !== undefined ? <span className="aud-to">{c.to ?? "—"}</span> : null}
              </li>
            ))}
            {r.changes.length > 3 ? (
              <li>
                <button type="button" className="aud-more" onClick={() => setExpanded((x) => !x)} aria-expanded={expanded}>
                  {expanded ? "−" : `+${r.changes.length - 3}`}
                </button>
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
      <div className="aud-meta">
        <span className="aud-who">
          {r.user ? <PersonAvatar name={r.user.name || r.user.email} size={22} /> : <IconBadge icon={Gear} tone="neutral" size={22} />}
          <span className="aud-who-name">{r.user ? r.user.name || r.user.email : tx("sm_system")}</span>
        </span>
        <time dateTime={r.at} className="cz-muted">
          {fmtDateTime(r.at, locale as Locale)}
        </time>
      </div>
    </li>
  );
}
