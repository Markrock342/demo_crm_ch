import { Link, Navigate, NavLink, useLocation, useNavigate, useParams } from "react-router-dom";
import { TEST_PORTAL, testAccountsEnabled } from "../auth/testAccounts";
import { useState, type FormEvent, type ReactNode } from "react";
import { Alert, Button, Input } from "antd";
import { Boat, CheckCircle, ShippingContainer, SignOut } from "@phosphor-icons/react";
import type { Locale } from "../i18n";
import { usePortalSession, type PortalSession } from "../shell/portalSession.tsx";
import { useStore } from "../store";
import { localizeDemo } from "../v2/lib/demoText.ts";
import { usePortalDocs, usePortalInvoices, usePortalJobs } from "../v2/hooks/usePortal.ts";
import {
  CardGrid,
  DataTable,
  Donut,
  EmptyState,
  EntityCard,
  IconBadge,
  Legend,
  LoadingState,
  PageHeader,
  Panel,
  progressBetween,
  RouteTrack,
  StageFlow,
  type StageKey,
  StatusTag,
} from "../v2/components";
import { useMedia } from "../ui/useMedia";
import { fmtDate, fmtMoney } from "../v2/lib/format.ts";
import { LangPicker } from "../ui/LangPicker";
import "../v2/pages/public.css";

/* ── Shipment model ──────────────────────────────────────────── */

const STEP_KEYS = ["pub_step_booked", "pub_step_departed", "pub_step_arrived", "pub_step_delivered"] as const;
const DONE_STATUSES = new Set(["CLOSED", "COMPLETED", "DELIVERED", "DONE"]);

type PortalJob = {
  id: string;
  jobNumber: string;
  origin: string;
  destination: string;
  pol: string;
  pod: string;
  status: string;
  etd: string | null;
  eta: string | null;
  carrier: string | null;
  vessel: string | null;
  equipment: string | null;
  shipper: string | null;
  consignee: string | null;
  /** 0 booked · 1 departed · 2 arrived · 3 delivered */
  stage: number;
  /** When each step happened, else null. */
  stepDates: (string | null)[];
};

/** "18 Sep" — short date for compact tracks. */
function fmtShort(v: string | null | undefined, locale: Locale) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  const tag = locale === "zh" ? "zh-CN" : locale === "th" ? "th-TH-u-ca-gregory" : "en-GB";
  return new Intl.DateTimeFormat(tag, { day: "numeric", month: "short" }).format(d);
}

function isPast(v: string | null | undefined) {
  if (!v) return false;
  const d = new Date(v);
  return !Number.isNaN(d.getTime()) && d.getTime() <= Date.now();
}

function str(v: unknown): string | null {
  return v === null || v === undefined || v === "" ? null : String(v);
}

function useCustomerJobs(): { jobs: PortalJob[]; loading: boolean; error: boolean; retry: () => void } {
  const portal = usePortalSession();
  const portalJobs = usePortalJobs(Boolean(portal.session), portal.session?.customerId);
  const jobs = (portalJobs.data ?? []).map((raw) => {
    const j = raw as typeof raw & Record<string, unknown>;
    const status = String(j.status ?? "").toUpperCase();
    const etd = str(j.etd);
    const eta = str(j.eta);
    const stage = DONE_STATUSES.has(status) ? 3 : isPast(eta) ? 2 : isPast(etd) ? 1 : 0;
    const count = Number(j.containerCount ?? 0);
    const type = str(j.containerType);
    return {
      id: String(j.id),
      jobNumber: String(j.jobNumber ?? j.id),
      origin: String(j.origin ?? j.pol ?? ""),
      destination: String(j.destination ?? j.pod ?? ""),
      pol: String(j.pol ?? ""),
      pod: String(j.pod ?? ""),
      status,
      etd,
      eta,
      carrier: str(j.carrier),
      vessel: [str(j.vessel), str(j.voyage)].filter(Boolean).join(" / ") || null,
      equipment: type ? (count ? `${type} × ${count}` : type) : null,
      shipper: str(j.shipper),
      consignee: str(j.consignee),
      stage,
      stepDates: [null, stage >= 1 ? etd : null, stage >= 2 ? eta : null, null],
    } satisfies PortalJob;
  });
  return { jobs, loading: portalJobs.isLoading, error: portalJobs.isError, retry: () => void portalJobs.refetch() };
}

function portalCustomerName(c: PortalSession | null, locale: Locale) {
  if (!c) return "";
  if (locale === "zh") return c.nameZh || c.nameEn;
  if (locale === "th") return c.nameTh || c.nameEn || c.nameZh;
  return c.nameEn || c.nameZh;
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  const { tx } = useStore();
  return (
    <Alert
      type="warning"
      showIcon
      message={tx("pub_load_error")}
      action={
        <Button size="small" onClick={onRetry}>
          {tx("pub_login_retry")}
        </Button>
      }
    />
  );
}

/** Portal's four steps mapped onto the shared six-stage flow. */
const STAGE_OF_STEP = [0, 2, 3, 5];
const FLOW_KEYS: StageKey[] = ["booked", "gatein", "sailed", "arrived", "customs", "delivered"];

function useStageLabels() {
  const { tx } = useStore();
  return Object.fromEntries(FLOW_KEYS.map((k) => [k, tx(`stage_${k}`)])) as Record<StageKey, string>;
}

/** Route picture: ship waits at origin, moves between ETD and ETA, ticks at the end. */
function jobRoute(job: PortalJob, locale: Locale) {
  const progress = job.stage >= 2 ? 100 : job.stage === 1 ? Math.max(6, progressBetween(job.etd, job.eta) ?? 50) : 6;
  return {
    from: job.pol || job.origin,
    to: job.pod || job.destination,
    progress,
    done: job.stage >= 2,
    fromDate: job.etd ? `ETD ${fmtShort(job.etd, locale)}` : undefined,
    toDate: job.eta ? `ETA ${fmtShort(job.eta, locale)}` : undefined,
  };
}

/* ── Frame ───────────────────────────────────────────────────── */

function PortalChrome({ children }: { children: ReactNode }) {
  const { tx, locale, setLocale } = useStore();
  const portal = usePortalSession();
  const customerLabel = portalCustomerName(portal.session, locale);
  const { pathname } = useLocation();
  const narrow = useMedia("(max-width: 760px)");

  async function leave() {
    await portal.leave();
  }

  return (
    <div className="pub-portal">
      <header className="pub-portal-bar">
        <div className="pub-portal-bar-in">
          <Link to="/portal/home" className="pub-portal-id">
            <span className="pub-mark is-sm" aria-hidden>
              栈
            </span>
            <span className="pub-portal-id-text">
              <strong>{tx("pub_portal_brand")}</strong>
              {customerLabel ? <span>{customerLabel}</span> : null}
            </span>
          </Link>
          <nav className="pub-portal-nav" aria-label={tx("pub_portal_brand")}>
            <NavLink to="/portal/home" className={({ isActive }) => (isActive || pathname.startsWith("/portal/jobs") ? "active" : "")}>
              {tx("pub_portal_nav_shipments")}
            </NavLink>
            <NavLink to="/portal/docs">{tx("pub_portal_nav_docs")}</NavLink>
            <NavLink to="/portal/invoices">{tx("pub_portal_nav_invoices")}</NavLink>
          </nav>
          <div className="pub-portal-tools">
            <LangPicker value={locale} onChange={setLocale} compact={narrow} />
            <Button
              type="text"
              icon={<SignOut size={18} aria-hidden />}
              aria-label={tx("pub_portal_leave")}
              title={narrow ? tx("pub_portal_leave") : undefined}
              onClick={() => void leave()}
            >
              {narrow ? null : tx("pub_portal_leave")}
            </Button>
          </div>
        </div>
      </header>
      <main className="pub-portal-main">
        {children}
      </main>
    </div>
  );
}

export function PortalEnterPage() {
  const { tx, locale, setLocale } = useStore();
  const portal = usePortalSession();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (portal.loading) return <LoadingState tip={tx("pub_loading")} />;
  if (portal.session) return <Navigate to="/portal/home" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    await enter(email, code);
  }

  async function enter(mail: string, pin: string) {
    setErr(null);
    setLoading(true);
    try {
      await portal.login(mail.trim(), pin.trim());
      navigate("/portal/home");
    } catch (ex) {
      const c = ex instanceof Error ? ex.message : "";
      setErr(
        tx(
          c === "invalid_credentials"
            ? "pub_portal_bad_pin"
            : c === "too_many_attempts"
              ? "pub_portal_locked"
              : c === "unreachable"
                ? "pub_login_no_api"
                : "pub_login_server_error",
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="pub-center">
      <div className="pub-card">
        <header className="pub-card-head">
          <div className="pub-card-brand">
            <span className="pub-mark" aria-hidden>
              栈
            </span>
            <LangPicker value={locale} onChange={setLocale} />
          </div>
          <h1>{tx("pub_portal_enter_title")}</h1>
          <p>{tx("pub_portal_enter_sub")}</p>
        </header>
        <form className="pub-form portal-login" onSubmit={(e) => void submit(e)}>
          <label className="pub-field">
            <span>{tx("pub_portal_email")}</span>
            <Input
              size="large"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
              required
            />
          </label>
          <label className="pub-field">
            <span>{tx("pub_portal_pin")}</span>
            <Input
              size="large"
              name="access-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder={tx("pub_portal_pin_hint")}
              autoComplete="one-time-code"
              autoCapitalize="characters"
              spellCheck={false}
              required
            />
          </label>
          {err ? <Alert type="error" showIcon message={err} role="alert" /> : null}
          <Button type="primary" htmlType="submit" size="large" block loading={loading}>
            {loading ? tx("pub_portal_busy") : tx("pub_portal_enter")}
          </Button>
        </form>
        {testAccountsEnabled ? (
          <button
            type="button"
            className="pub-test-btn"
            disabled={loading}
            onClick={() => {
              setEmail(TEST_PORTAL.email);
              setCode(TEST_PORTAL.code);
              void enter(TEST_PORTAL.email, TEST_PORTAL.code);
            }}
          >
            <span className="pub-test-text">
              <strong>{tx("test_portal_fill")}</strong>
              <span>
                {TEST_PORTAL.email} · {TEST_PORTAL.code}
              </span>
            </span>
          </button>
        ) : null}
        <div className="pub-card-foot">
          <Link to="/login">{tx("pub_portal_staff_link")}</Link>
        </div>
      </div>
    </div>
  );
}

function RequirePortal({ children }: { children: ReactNode }) {
  const portal = usePortalSession();
  const { tx } = useStore();
  if (portal.loading) return <LoadingState tip={tx("pub_loading")} />;
  if (!portal.session) return <Navigate to="/portal" replace />;
  return <PortalChrome>{children}</PortalChrome>;
}

const STEP_TONE = ["info", "progress", "progress", "success"] as const;

function StepTag({ job }: { job: PortalJob }) {
  const { tx } = useStore();
  return <StatusTag status={STEP_KEYS[job.stage]} label={tx(STEP_KEYS[job.stage])} tone={STEP_TONE[job.stage]} />;
}

function ShipmentCard({ job, locale }: { job: PortalJob; locale: Locale }) {
  const labels = useStageLabels();
  return (
    <EntityCard
      to={`/portal/jobs/${job.id}`}
      media={<IconBadge icon={job.stage >= 3 ? CheckCircle : Boat} tone={job.stage >= 3 ? "success" : "primary"} />}
      title={job.jobNumber}
      subtitle={job.equipment ?? job.vessel ?? undefined}
      badge={<StepTag job={job} />}
      footer={<StageFlow current={STAGE_OF_STEP[job.stage]} labels={labels} size="sm" />}
    >
      <RouteTrack {...jobRoute(job, locale)} />
    </EntityCard>
  );
}

export function PortalHomePage() {
  const { tx, locale } = useStore();
  const { jobs, loading, error, retry } = useCustomerJobs();
  const active = jobs.filter((j) => j.stage < 3);
  const done = jobs.filter((j) => j.stage >= 3);

  return (
    <RequirePortal>
      <div className="cz-stack">
        <PageHeader
          title={tx("pub_portal_home_title")}
        />
        {loading ? (
          <LoadingState tip={tx("pub_loading")} />
        ) : error ? (
          <LoadError onRetry={retry} />
        ) : jobs.length === 0 ? (
          <Panel>
            <EmptyState title={tx("pub_portal_empty_title")} description={tx("pub_portal_empty_desc")} />
          </Panel>
        ) : (
          <>
            {active.length ? (
              <section className="pub-group">
                <h2 className="pub-group-head">
                  <IconBadge icon={Boat} tone="primary" size={32} />
                  {tx("pub_portal_group_active")}
                  <span className="pub-group-count">{active.length}</span>
                </h2>
                <CardGrid min={360}>
                  {active.map((j) => (
                    <ShipmentCard key={j.id} job={j} locale={locale} />
                  ))}
                </CardGrid>
              </section>
            ) : null}
            {done.length ? (
              <section className="pub-group">
                <h2 className="pub-group-head">
                  <IconBadge icon={CheckCircle} tone="success" size={32} />
                  {tx("pub_portal_group_done")}
                  <span className="pub-group-count">{done.length}</span>
                </h2>
                <CardGrid min={360}>
                  {done.map((j) => (
                    <ShipmentCard key={j.id} job={j} locale={locale} />
                  ))}
                </CardGrid>
              </section>
            ) : null}
          </>
        )}
      </div>
    </RequirePortal>
  );
}

export function PortalJobPage() {
  const { id } = useParams();
  const { tx, locale } = useStore();
  const portal = usePortalSession();
  const { jobs, loading, error, retry } = useCustomerJobs();
  const portalDocs = usePortalDocs(Boolean(portal.session), portal.session?.customerId);
  const labels = useStageLabels();
  const narrow = useMedia("(max-width: 640px)");
  const job = jobs.find((j) => j.id === id);
  const back = { to: "/portal/home", label: tx("pub_job_back") };

  if (loading) {
    return (
      <RequirePortal>
        <LoadingState tip={tx("pub_loading")} />
      </RequirePortal>
    );
  }

  if (error) {
    return (
      <RequirePortal>
        <LoadError onRetry={retry} />
      </RequirePortal>
    );
  }

  if (!job) {
    return (
      <RequirePortal>
        <div className="cz-stack">
          <PageHeader title={tx("pub_job_not_found")} back={back} />
          <Panel>
            <EmptyState
              title={tx("pub_job_not_found")}
              description={tx("pub_job_not_found_desc")}
              action={
                <Link to="/portal/home">
                  <Button type="primary">{tx("pub_job_back")}</Button>
                </Link>
              }
            />
          </Panel>
        </div>
      </RequirePortal>
    );
  }

  const docs = (portalDocs.data ?? []).filter((d) => (d as typeof d & { jobId?: string | null }).jobId === job.id);
  const stepDate = (i: number) => (job.stepDates[i] ? fmtShort(job.stepDates[i], locale) : undefined);
  const flowDates: Partial<Record<StageKey, string>> = {
    booked: stepDate(0),
    sailed: stepDate(1) ?? (job.etd ? `ETD ${fmtShort(job.etd, locale)}` : undefined),
    arrived: stepDate(2) ?? (job.eta ? `ETA ${fmtShort(job.eta, locale)}` : undefined),
    delivered: stepDate(3),
  };
  const facts: [string, string | null][] = [
    [tx("pub_carrier"), job.carrier],
    [tx("pub_vessel"), job.vessel],
    [tx("pub_equipment"), job.equipment],
    [tx("pub_shipper"), job.shipper],
    [tx("pub_consignee"), job.consignee],
  ];

  return (
    <RequirePortal>
      <div className="cz-stack">
        <PageHeader title={job.jobNumber} back={back} extra={<StepTag job={job} />} />
        <Panel>
          <div className="pub-job-hero" aria-label={tx("pub_job_progress")}>
            <RouteTrack
              {...jobRoute(job, locale)}
              fromName={job.origin && job.origin !== job.pol ? job.origin : undefined}
              toName={job.destination && job.destination !== job.pod ? job.destination : undefined}
              size={narrow ? "md" : "lg"}
            />
            <StageFlow current={STAGE_OF_STEP[job.stage]} labels={labels} dates={flowDates} size="lg" />
          </div>
        </Panel>
        <Panel title={tx("pub_job_details")}>
          <dl className="pub-facts">
            {facts
              .filter(([, v]) => v && v !== "—")
              .map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>
                    {k === tx("pub_equipment") ? (
                      <span className="pub-equip">
                        <ShippingContainer size={20} weight="duotone" aria-hidden />
                        {v}
                      </span>
                    ) : (
                      v
                    )}
                  </dd>
                </div>
              ))}
          </dl>
        </Panel>
        {docs.length ? (
          <Panel title={tx("pub_docs_title")} flush>
            <DocTable rows={docs.map((d) => ({ id: d.id, kind: d.kind, name: d.name, status: d.status, jobNumber: job.jobNumber }))} />
          </Panel>
        ) : null}
      </div>
    </RequirePortal>
  );
}

/* ── Documents ───────────────────────────────────────────────── */

type DocLine = { id: string; kind: string; name: string; status: string; jobNumber?: string };

const DOC_TONE: Record<string, "success" | "warning" | "danger"> = { ok: "success", wait: "warning", late: "danger" };

function DocTable({ rows }: { rows: DocLine[] }) {
  const { tx, locale } = useStore();
  const kindLabel = (k: string) => {
    const key = `pub_kind_${String(k).toUpperCase()}`;
    const v = tx(key);
    return v === key ? k : v;
  };
  const hasJob = rows.some((r) => r.jobNumber);
  return (
    <DataTable<DocLine>
      rowKey="id"
      dataSource={rows}
      pageSize={20}
      columns={[
        {
          title: tx("pub_col_doc"),
          key: "doc",
          render: (_, r) => (
            <>
              <span className="cz-cell-main">{kindLabel(r.kind)}</span>
              <span className="cz-cell-sub">{localizeDemo(r.name, locale)}</span>
            </>
          ),
        },
        ...(hasJob
          ? [{ title: tx("pub_col_job"), key: "job", render: (_: unknown, r: DocLine) => r.jobNumber ?? "—" }]
          : []),
        {
          title: tx("pub_col_status"),
          key: "status",
          width: 160,
          render: (_, r) => {
            const s = String(r.status).toLowerCase();
            return DOC_TONE[s] ? (
              <StatusTag status={s} label={tx(`pub_doc_${s}`)} tone={DOC_TONE[s]} />
            ) : (
              <StatusTag status={r.status} />
            );
          },
        },
      ]}
    />
  );
}

export function PortalDocsPage() {
  const { tx } = useStore();
  const portal = usePortalSession();
  const portalDocs = usePortalDocs(Boolean(portal.session), portal.session?.customerId);
  const docs: DocLine[] = (portalDocs.data ?? []).map((d) => ({ id: d.id, kind: d.kind, name: d.name, status: d.status }));

  return (
    <RequirePortal>
      <div className="cz-stack">
        <PageHeader title={tx("pub_docs_title")} subtitle={tx("pub_docs_sub")} />
        {portalDocs.isLoading ? (
          <LoadingState tip={tx("pub_loading")} />
        ) : portalDocs.isError ? (
          <LoadError onRetry={() => void portalDocs.refetch()} />
        ) : docs.length === 0 ? (
          <Panel>
            <EmptyState title={tx("pub_docs_empty_title")} description={tx("pub_docs_empty_desc")} />
          </Panel>
        ) : (
          <Panel flush>
            <DocTable rows={docs} />
          </Panel>
        )}
      </div>
    </RequirePortal>
  );
}

/* ── Invoices ────────────────────────────────────────────────── */

type InvoiceLine = {
  id: string;
  invoiceNumber: string;
  status: string;
  total: number;
  balanceDue: number;
  currency: string;
  dueDate: string | null;
  jobNumber: string | null;
  overdue: boolean;
};

export function PortalInvoicesPage() {
  const { tx, locale } = useStore();
  const portal = usePortalSession();
  const portalInv = usePortalInvoices(Boolean(portal.session), portal.session?.customerId);
  const { jobs } = useCustomerJobs();
  const mobile = useMedia("(max-width: 640px)");
  const jobNo = (id?: string | null) => (id ? (jobs.find((j) => j.id === id)?.jobNumber ?? null) : null);

  const rows: InvoiceLine[] = (portalInv.data ?? []).map((raw) => {
    const i = raw as typeof raw & Record<string, unknown>;
    const due = str(i.dueDate);
    const balance = Number(i.balanceDue ?? 0);
    return {
      id: String(i.id),
      invoiceNumber: String(i.invoiceNumber ?? i.id),
      status: String(i.status ?? ""),
      total: Number(i.total ?? 0),
      balanceDue: balance,
      currency: String(i.currency ?? "USD"),
      dueDate: due,
      jobNumber: jobNo(str(i.jobId)),
      overdue: balance > 0 && isPast(due),
    };
  });

  const dueByCurrency = new Map<string, number>();
  for (const r of rows) if (r.balanceDue > 0) dueByCurrency.set(r.currency, (dueByCurrency.get(r.currency) ?? 0) + r.balanceDue);
  const dueText = [...dueByCurrency].map(([cur, amt]) => fmtMoney(amt, cur, locale)).join(" + ");

  /** Money mix for the donut, in the currency most invoices use. */
  const curCount = new Map<string, number>();
  for (const r of rows) curCount.set(r.currency, (curCount.get(r.currency) ?? 0) + 1);
  const mainCur = [...curCount].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "USD";
  const inCur = rows.filter((r) => r.currency === mainCur);
  const paidAmt = inCur.reduce((a, r) => a + Math.max(0, r.total - r.balanceDue), 0);
  const overdueAmt = inCur.filter((r) => r.overdue).reduce((a, r) => a + r.balanceDue, 0);
  const openAmt = inCur.filter((r) => !r.overdue).reduce((a, r) => a + r.balanceDue, 0);
  const mix = [
    { value: paidAmt, tone: "success" as const, label: tx("pub_inv_paid") },
    { value: openAmt, tone: "warning" as const, label: tx("pub_inv_open") },
    { value: overdueAmt, tone: "danger" as const, label: tx("pub_inv_overdue") },
  ];

  return (
    <RequirePortal>
      <div className="cz-stack">
        <PageHeader
          title={tx("pub_inv_title")}
          subtitle={rows.length ? (dueText ? tx("pub_inv_sub_due", { amount: dueText }) : tx("pub_inv_sub_clear")) : undefined}
        />
        {portalInv.isLoading ? (
          <LoadingState tip={tx("pub_loading")} />
        ) : portalInv.isError ? (
          <LoadError onRetry={() => void portalInv.refetch()} />
        ) : rows.length === 0 ? (
          <Panel>
            <EmptyState title={tx("pub_inv_empty_title")} description={tx("pub_inv_empty_desc")} />
          </Panel>
        ) : (
          <>
            <Panel>
              <div className="pub-inv-mix">
                <Donut
                  parts={mix}
                  size={148}
                  center={<span className="pub-inv-center">{fmtMoney(openAmt + overdueAmt, mainCur, locale)}</span>}
                  caption={tx("pub_inv_due_caption")}
                />
                <Legend items={mix.map((m) => ({ tone: m.tone, label: m.label, value: fmtMoney(m.value, mainCur, locale) }))} />
              </div>
            </Panel>
            {mobile ? (
            <Panel flush>
              <ul className="pub-rows">
                {rows.map((r) => (
                  <li key={r.id}>
                    <span className="cz-cell-main">{r.invoiceNumber}</span>
                    <span className="pub-row-end">
                      <StatusTag status={r.overdue ? "OVERDUE" : r.status} />
                    </span>
                    <span className="cz-cell-sub">
                      {tx("pub_col_due")} {fmtDate(r.dueDate, locale)}
                    </span>
                    <span className={r.balanceDue > 0 ? "pub-row-end cz-num cz-cell-main" : "pub-row-end cz-num cz-muted"}>
                      {fmtMoney(r.balanceDue > 0 ? r.balanceDue : r.total, r.currency, locale)}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : (
            <Panel flush>
              <DataTable<InvoiceLine>
                rowKey="id"
                dataSource={rows}
                pageSize={20}
                scroll={{ x: 640 }}
                columns={[
                  {
                    title: tx("pub_col_invoice"),
                    key: "no",
                    render: (_, r) => (
                      <>
                        <span className="cz-cell-main">{r.invoiceNumber}</span>
                        {r.jobNumber ? <span className="cz-cell-sub">{r.jobNumber}</span> : null}
                    </>
                  ),
                },
                {
                  title: tx("pub_col_status"),
                  key: "status",
                  render: (_, r) => <StatusTag status={r.overdue ? "OVERDUE" : r.status} />,
                },
                {
                  title: tx("pub_col_due"),
                  key: "due",
                  render: (_, r) => fmtDate(r.dueDate, locale),
                },
                {
                  title: tx("pub_col_total"),
                  key: "total",
                  align: "right",
                  render: (_, r) => <span className="cz-num">{fmtMoney(r.total, r.currency, locale)}</span>,
                },
                {
                  title: tx("pub_col_balance"),
                  key: "balance",
                  align: "right",
                  render: (_, r) => (
                    <span className={r.balanceDue > 0 ? "cz-num cz-cell-main" : "cz-num cz-muted"}>
                      {fmtMoney(r.balanceDue, r.currency, locale)}
                    </span>
                  ),
                },
              ]}
            />
          </Panel>
          )}
          </>
        )}
      </div>
    </RequirePortal>
  );
}

/** Nested outlet unused — pages are standalone. */
export function PortalLayout() {
  return null;
}
