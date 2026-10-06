import {
  Boat,
  ClockCountdown,
  Coins,
  FileText,
  Headset,
  Star,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Button, Tabs, Tooltip, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { mapJobRowToShell } from "../adapters/api/jobMapper.ts";
import { fetchInvoicesPage, fetchJobsPage } from "../api/lists.ts";
import { apiDeleteContact, apiUpdateContact, fetchCustomer } from "../api/crm.ts";
import { useAuth } from "../auth/AuthProvider";
import type { Contact, CrmDoc } from "../crm";
import {
  cityName,
  customerName,
  laneName,
  type Customer,
  type Mail,
} from "../data";
import type { ShellJob } from "../ports/job.port.ts";
import { useShellBilling } from "../shell/billingStore.tsx";
import { useShellCrm } from "../shell/crmStore.tsx";
import { useShellJobs } from "../shell/jobStore.tsx";
import { useShellQuotes } from "../shell/quoteStore.tsx";
import { useIsShellMode } from "../shell/session.tsx";
import { useShellSupport } from "../shell/supportStore.tsx";
import { useStore } from "../store";
import { useMedia } from "../ui/useMedia";
import {
  AiBriefCard,
  CardGrid,
  DataTable,
  Donut,
  EmptyState,
  EntityCard,
  LaneCell,
  Legend,
  LoadingState,
  PageHeader,
  Panel,
  PersonAvatar,
  RouteTrack,
  SegmentBar,
  StatusTag,
  Tile,
  TileRow,
  progressBetween,
  type Tone,
} from "../v2/components";
import { useAppMode } from "../v2/hooks/useAppMode.ts";
import {
  useCustomerDocs,
  useCustomerMails,
  useLiveQuotations,
} from "../v2/hooks/useCommercial.ts";
import { useCan } from "../v2/hooks/useCan.ts";
import { useModules } from "../v2/hooks/useModules.ts";
import { useCustomerLookup } from "../v2/hooks/useCustomerLookup.ts";
import { useUserLookup } from "../v2/hooks/useUserLookup.ts";
import { CustomerFormDrawer, customerDetailKey, useRefreshCrm } from "../v2/pages/CustomerForm.tsx";
import { BillingPanel, CompanyPanel, ContactCards, PortalAccessPanel, ShippingPanel } from "../v2/pages/CustomerProfilePanels.tsx";
import { CustomerActivityTab } from "../v2/pages/home/ActivityTimeline.tsx";
import { fmtDate, fmtMoney } from "../v2/lib/format.ts";
import { useDemoText } from "../v2/lib/useDemoText.ts";
import { queryKeys } from "../v2/queries/keys.ts";
import {
  CompanyMark,
  ContainerChip,
  LaneRoute,
  SalesMobileList,
  type MobileRow,
} from "../v2/pages/SalesMobileList.tsx";
import { agingOf } from "../v2/pages/salesData.ts";
import { fmtAmount, fmtCompact, fmtShortDate } from "../v2/pages/salesUtil.ts";
import "../v2/pages/sales.css";

type Tab = "jobs" | "activity" | "quotes" | "invoices" | "docs" | "mail" | "contacts";

type CustomerRow = Customer & {
  arDays?: number;
  taxId?: string;
  billingAddress?: string;
  creditTerm?: string;
  creditLimit?: number;
};

type QuoteItem = {
  id: string;
  number: string;
  status: string;
  pol: string;
  pod: string;
  validUntil: string | null;
  total: number | null;
  currency: string;
};

type InvoiceItem = {
  id: string;
  number: string;
  status: string;
  jobId: string | null;
  dueDate: string | null;
  total: number;
  balance: number;
  currency: string;
  overdue: boolean;
};

type DocItem = {
  id: string;
  name: string;
  kind: string;
  status: "ok" | "wait" | "late";
  ref: string;
};

const OPEN_QUOTE = new Set(["DRAFT", "PENDING_APPROVAL", "APPROVED", "SENT"]);
const DOC_TONE: Record<DocItem["status"], Tone> = {
  ok: "success",
  wait: "warning",
  late: "danger",
};
const MAIL_TONE: Record<string, Tone> = {
  open: "warning",
  sent: "success",
  rejected: "neutral",
};
const INVOICE_TONE: Record<string, Tone> = { PARTIALLY_PAID: "warning" };

/** Customer 360 — works in demo (shell) and live API mode. */
export function AccountPage() {
  const shell = useIsShellMode();
  const { live } = useAppMode();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const store = useStore();
  const { tx, locale } = store;
  const dt = useDemoText();
  const crm = useShellCrm();
  const quotesShell = useShellQuotes();
  const jobsShell = useShellJobs();
  const billing = useShellBilling();
  const support = useShellSupport();
  const lookup = useCustomerLookup();
  const mobile = useMedia("(max-width: 640px)");
  const [tab, setTab] = useState<Tab>("jobs");
  const [editOpen, setEditOpen] = useState(false);
  const { user } = useAuth();
  const staff = useUserLookup();
  const refreshCrm = useRefreshCrm();
  const canEdit = live && Boolean(user?.permissions?.includes("customer.edit"));
  const detailQ = useQuery({
    queryKey: customerDetailKey(id),
    queryFn: () => fetchCustomer(id),
    enabled: live && Boolean(id),
    retry: (n, e) => !(e instanceof Error && e.message === "not_found") && n < 2,
  });
  const detail = detailQ.data;

  const liveId = live ? id : undefined;
  const can = useCan();
  // Company modules: no invoice / document / quotation parts when those modules are off.
  const mods = useModules();
  const financeOn = mods.ready && mods.modules.finance;
  const hiddenTabs = new Set<string>([
    ...(financeOn ? [] : ["invoices"]),
    ...(mods.ready && mods.modules.docs ? [] : ["docs"]),
    ...(mods.ready && mods.modules.sales ? [] : ["quotes"]),
  ]);
  // Header actions: new case (customer service) / new quotation (sales), each only when its module is on.
  const caseOn = mods.ready && mods.modules.cs && can("case.edit");
  const quoteOn = mods.ready && mods.modules.sales && can("quotation.create");
  // This customer's jobs / invoices from the paged list APIs (newest 500 rows; counts come from SQL).
  const jobsPage = useQuery({
    queryKey: [...queryKeys.jobs.list(id), "page"],
    queryFn: () => fetchJobsPage({ customerId: id, limit: 500 }),
    enabled: live && Boolean(id),
  });
  const jobsLiveData = useMemo(() => jobsPage.data?.items.map((r) => mapJobRowToShell(r)), [jobsPage.data]);
  const jobsLive = { data: jobsLiveData, isLoading: jobsPage.isLoading };
  const quotesLive = useLiveQuotations(id);
  const invoicesLive = useQuery({
    queryKey: [...queryKeys.invoices.list(id), "page"],
    queryFn: async () => (await fetchInvoicesPage({ customerId: id, limit: 500 })).items,
    enabled: live && Boolean(id) && can("invoice.view") && financeOn,
  });
  const docsLive = useCustomerDocs(liveId);
  const mailsLive = useCustomerMails(liveId);

  const customer = (
    shell
      ? crm.customers.find((c) => c.id === id)
      : (detail ??
        store.customers.find((c) => c.id === id) ??
        lookup.customers.find((c) => c.id === id))
  ) as CustomerRow | undefined;

  const people = ((detail ? detail.contacts : shell ? crm.contacts : store.contacts) as Contact[])
    .filter((p) => p.customerId === id)
    .slice()
    .sort((a, b) => Number(b.primary) - Number(a.primary));

  async function contactAction(run: () => Promise<unknown>, done: string) {
    try {
      await run();
      message.success(tx(done));
      await detailQ.refetch();
      await refreshCrm().catch(() => undefined);
    } catch {
      message.error(tx("cust_saveFailed"));
    }
  }

  const jobs: ShellJob[] = useMemo(
    () =>
      shell
        ? jobsShell.jobs.filter((j) => j.customerId === id)
        : (jobsLive.data ?? []),
    [shell, jobsShell.jobs, jobsLive.data, id],
  );

  const quotes: QuoteItem[] = useMemo(
    () =>
      shell
        ? quotesShell.quotations
            .filter((q) => q.customerId === id)
            .map((q) => ({
              id: q.id,
              number: q.quotationNumber,
              status: q.status,
              pol: q.pol && q.pol !== "—" ? q.pol : q.origin,
              pod: q.pod && q.pod !== "—" ? q.pod : q.destination,
              validUntil: q.validUntil,
              total: q.totalSell,
              currency: q.currency,
            }))
        : (quotesLive.data ?? []).map((q) => ({
            id: q.id,
            number: q.quotationNumber,
            status: q.status,
            pol: q.pol || q.origin,
            pod: q.pod || q.destination,
            validUntil: q.validUntil,
            total: null,
            currency: q.currency,
          })),
    [shell, quotesShell.quotations, quotesLive.data, id],
  );

  const invoices: InvoiceItem[] = useMemo(() => {
    const now = Date.now();
    return shell
      ? billing.invoices
          .filter((i) => i.customerId === id)
          .map((i) => ({
            id: i.id,
            number: i.invoiceNumber,
            status: i.status,
            jobId: i.jobId ?? null,
            dueDate: i.dueDate ?? null,
            total: i.total,
            balance: i.balanceDue,
            currency: i.currency,
            overdue: Boolean(i.overdue),
          }))
      : (invoicesLive.data ?? []).map((i) => {
          const balance = Number(i.balanceDue) || 0;
          return {
            id: i.id,
            number: i.invoiceNumber,
            status: i.status,
            jobId: i.jobId,
            dueDate: i.dueDate,
            total: Number(i.total) || 0,
            balance,
            currency: i.currency,
            overdue:
              balance > 0 &&
              Boolean(i.dueDate) &&
              new Date(i.dueDate).getTime() < now,
          };
        });
  }, [shell, billing.invoices, invoicesLive.data, id]);

  const docs: DocItem[] = useMemo(() => {
    if (shell) {
      const jobIds = new Set(jobs.map((j) => j.id));
      return support.docs
        .filter((d) => d.jobId && jobIds.has(d.jobId))
        .map((d) => ({
          id: d.id,
          name: d.name,
          kind: d.docType,
          status: d.status,
          ref: jobs.find((j) => j.id === d.jobId)?.jobNumber ?? d.boxId ?? "",
        }));
    }
    return ((docsLive.data ?? []) as CrmDoc[]).map((d) => ({
      id: d.id,
      name: d.name,
      kind: d.kind,
      status: d.status,
      ref: d.boxId,
    }));
  }, [shell, support.docs, jobs, docsLive.data]);

  const mails: Mail[] = useMemo(
    () =>
      shell
        ? store.mails.filter((m) => m.customerId === id)
        : (mailsLive.data ?? []),
    [shell, store.mails, mailsLive.data, id],
  );

  if (!customer) {
    if (!shell && (detailQ.isLoading || lookup.loading || (store.customers.length === 0 && live)))
      return <LoadingState />;
    return (
      <div className="cz-stack">
        <PageHeader
          title={tx("sales_customerNotFound")}
          back={{ to: "/customers", label: tx("sales_backCustomers") }}
        />
        <Panel>
          <EmptyState
            title={tx("sales_customerNotFound")}
            description={tx("sales_customerNotFoundHint")}
            action={
              <Button onClick={() => navigate("/customers")}>
                {tx("sales_backCustomers")}
              </Button>
            }
          />
        </Panel>
      </div>
    );
  }

  const name = customerName(customer, locale);
  const lane = laneName(customer, locale);
  const city = cityName(customer, locale);
  const activeJobs = jobs.filter((j) => j.status !== "CLOSED");
  const activeJobCount = jobsPage.data ? jobsPage.data.counts.OPEN + jobsPage.data.counts.IN_PROGRESS : activeJobs.length;
  const openQuotes = quotes.filter((q) => OPEN_QUOTE.has(q.status));
  const openInv = invoices.filter((i) => i.balance > 0);
  const overdueInv = openInv.filter((i) => i.overdue);
  const balanceCurrency = openInv[0]?.currency ?? "USD";
  const balance = openInv
    .filter((i) => i.currency === balanceCurrency)
    .reduce((n, i) => n + i.balance, 0);

  const aging = { current: 0, late: 0, veryLate: 0 };
  for (const i of openInv)
    if (i.currency === balanceCurrency)
      aging[agingOf(i.balance, i.dueDate)] += i.balance;
  const agingParts = [
    {
      value: aging.current,
      tone: "success" as const,
      label: tx("sales_arCurrent"),
    },
    { value: aging.late, tone: "warning" as const, label: tx("sales_arLate") },
    {
      value: aging.veryLate,
      tone: "danger" as const,
      label: tx("sales_arVeryLate"),
    },
  ];
  const arDays = customer.arDays ?? 0;
  const arTone = arDays >= 60 ? "danger" : arDays >= 30 ? "warning" : "success";

  const tiles = (
    <TileRow>
      <Tile
        icon={Boat}
        tone="primary"
        value={activeJobCount}
        label={tx("sales_statActiveJobs")}
      />
      <Tile
        icon={FileText}
        tone="info"
        value={openQuotes.length}
        label={tx("sales_statOpenQuotes")}
      />
      {financeOn ? <Tile
        icon={Coins}
        tone={overdueInv.length ? "danger" : "success"}
        value={
          openInv.length ? fmtCompact(balance, balanceCurrency, locale) : "—"
        }
        label={tx("sales_statBalance")}
        visual={
          openInv.length ? (
            <SegmentBar parts={agingParts} height={6} />
          ) : undefined
        }
      /> : null}
      {financeOn ? <Tile
        icon={ClockCountdown}
        tone={arDays > 0 ? arTone : "neutral"}
        value={arDays > 0 ? tx("sales_days", { n: arDays }) : "—"}
        label={tx("sales_statArDays")}
      /> : null}
    </TileRow>
  );

  const jobCard = (j: ShellJob) => {
    const etd = j.etd && j.etd !== "—" ? j.etd : null;
    const eta = j.eta && j.eta !== "—" ? j.eta : null;
    const done = j.status === "CLOSED";
    return (
      <EntityCard
        key={j.id}
        to={`/jobs/${j.id}`}
        tone={j.delayed && !done ? "danger" : "default"}
        title={<span className="cz-mono">{j.jobNumber}</span>}
        badge={<StatusTag status={j.status} />}
        footer={
          <>
            <ContainerChip type={j.containerType} qty={j.quantity} />
            <span className="sales-grow" />
            <StatusTag status={j.billingStatus} />
          </>
        }
      >
        <RouteTrack
          from={j.pol || j.origin}
          to={j.pod || j.destination}
          progress={progressBetween(etd, eta)}
          fromDate={etd ? fmtShortDate(etd, locale) : undefined}
          toDate={eta ? fmtShortDate(eta, locale) : undefined}
          delayed={j.delayed}
          done={done}
          size="sm"
        />
      </EntityCard>
    );
  };

  /** Table on desktop, stacked rows on phones. */
  function list<T extends { id: string }>(opts: {
    rows: T[];
    columns: ColumnsType<T>;
    mobileRow: (r: T) => Omit<MobileRow, "key">;
    empty: string;
    emptyAction?: ReactNode;
    loading?: boolean;
    onRowClick?: (r: T) => void;
  }) {
    if (opts.loading) return <LoadingState />;
    const empty = (
      <EmptyState description={opts.empty} action={opts.emptyAction} />
    );
    if (mobile) {
      return (
        <SalesMobileList
          empty={empty}
          rows={opts.rows.map((r) => ({
            key: r.id,
            ...opts.mobileRow(r),
            onClick: opts.onRowClick ? () => opts.onRowClick!(r) : undefined,
          }))}
        />
      );
    }
    return (
      <DataTable<T>
        rowKey="id"
        columns={opts.columns}
        dataSource={opts.rows}
        onRowClick={opts.onRowClick}
        emptyText={opts.empty}
        emptyAction={opts.emptyAction}
        pageSize={10}
      />
    );
  }

  const quoteCols: ColumnsType<QuoteItem> = [
    {
      title: tx("sales_colQuoteNo"),
      key: "no",
      render: (_, q) => (
        <>
          <span className="cz-cell-main cz-mono">{q.number}</span>
          <span className="cz-cell-sub">
            <LaneCell from={q.pol} to={q.pod} />
          </span>
        </>
      ),
    },
    {
      title: tx("sales_colStatus"),
      key: "st",
      render: (_, q) => <StatusTag status={q.status} />,
    },
    {
      title: tx("sales_colValidUntil"),
      key: "valid",
      render: (_, q) => (
        <span className="cz-muted">{fmtDate(q.validUntil, locale)}</span>
      ),
    },
    ...(shell
      ? [
          {
            title: tx("sales_colTotal"),
            key: "total",
            align: "right" as const,
            className: "cz-num",
            render: (_: unknown, q: QuoteItem) =>
              fmtMoney(q.total, q.currency, locale),
          },
        ]
      : []),
  ];

  const invoiceCols: ColumnsType<InvoiceItem> = [
    {
      title: tx("sales_colInvoiceNo"),
      key: "no",
      render: (_, i) => (
        <span className="cz-cell-main cz-mono">{i.number}</span>
      ),
    },
    {
      title: tx("sales_colStatus"),
      key: "st",
      render: (_, i) =>
        i.overdue ? (
          <StatusTag status="OVERDUE" />
        ) : (
          <StatusTag status={i.status} tone={INVOICE_TONE[i.status]} />
        ),
    },
    {
      title: tx("sales_colDue"),
      key: "due",
      render: (_, i) => (
        <span className={i.overdue ? "sales-ar-bad" : "cz-muted"}>
          {fmtDate(i.dueDate, locale)}
        </span>
      ),
    },
    {
      title: tx("sales_colTotal"),
      key: "total",
      align: "right",
      className: "cz-num",
      render: (_, i) => (
        <span className="cz-muted">
          {fmtMoney(i.total, i.currency, locale)}
        </span>
      ),
    },
    {
      title: tx("sales_colBalance"),
      key: "bal",
      align: "right",
      className: "cz-num",
      render: (_, i) =>
        i.balance > 0 ? (
          fmtMoney(i.balance, i.currency, locale)
        ) : (
          <span className="cz-muted">—</span>
        ),
    },
  ];

  const docCols: ColumnsType<DocItem> = [
    {
      title: tx("sales_colDoc"),
      key: "name",
      render: (_, d) => (
        <>
          <span className="cz-cell-main">{dt(d.name)}</span>
          <span className="cz-cell-sub">{d.kind}</span>
        </>
      ),
    },
    {
      title: tx("sales_colStatus"),
      key: "st",
      render: (_, d) => (
        <StatusTag
          status={d.status}
          label={tx(`sales_doc_${d.status}`)}
          tone={DOC_TONE[d.status]}
        />
      ),
    },
    {
      title: tx("sales_colRef"),
      key: "ref",
      render: (_, d) => (
        <span className="cz-mono cz-muted">{d.ref || "—"}</span>
      ),
    },
  ];

  const mailSubject = (m: Mail) =>
    (locale === "th"
      ? m.subjectTh
      : locale === "en"
        ? m.subjectEn
        : m.subjectZh) || m.subjectEn;
  const mailCols: ColumnsType<Mail> = [
    {
      title: tx("sales_colSubject"),
      key: "subj",
      render: (_, m) => (
        <>
          <span className={m.unread ? "cz-cell-main" : undefined}>
            {mailSubject(m)}
          </span>
          <span className="cz-cell-sub">{m.from}</span>
        </>
      ),
    },
    {
      title: tx("sales_colStatus"),
      key: "st",
      render: (_, m) => (
        <StatusTag
          status={m.state}
          label={tx(`sales_mail_${m.state}`)}
          tone={MAIL_TONE[m.state]}
        />
      ),
    },
  ];

  const primaryMark = (p: Contact) =>
    p.primary ? (
      <Tooltip title={tx("sales_primary")}>
        <Star
          size={14}
          weight="fill"
          className="sales-primary-star"
          aria-label={tx("sales_primary")}
        />
      </Tooltip>
    ) : null;
  const contactCols: ColumnsType<Contact> = [
    {
      title: tx("sales_colName"),
      key: "name",
      render: (_, p) => (
        <>
          <span className="cz-cell-main">
            {dt(p.name)} {primaryMark(p)}
          </span>
          <span className="cz-cell-sub">{dt(p.title) || "—"}</span>
        </>
      ),
    },
    {
      title: tx("sales_colEmail"),
      dataIndex: "email",
      render: (v: string) =>
        v ? (
          <a href={`mailto:${v}`}>{v}</a>
        ) : (
          <span className="cz-muted">—</span>
        ),
    },
    {
      title: tx("sales_colPhone"),
      dataIndex: "phone",
      render: (v: string) =>
        v ? (
          <a className="sales-plain-link" href={`tel:${v.replace(/\s+/g, "")}`}>
            {v}
          </a>
        ) : (
          <span className="cz-muted">—</span>
        ),
    },
    {
      title: tx("sales_colWechat"),
      dataIndex: "wechat",
      render: (v: string) => <span className="cz-muted">{v || "—"}</span>,
    },
  ];

  const tabLabel = (key: string, n: number) => (
    <span className="cz-seg-label">
      {tx(key)}
      <span className="cz-seg-count">{n}</span>
    </span>
  );

  const quoteHref = `/quotations/new?customerId=${encodeURIComponent(customer.id)}`;
  const tabItems = [
    {
      key: "jobs",
      label: tabLabel("sales_tabJobs", jobs.length),
      children:
        live && jobsLive.isLoading ? (
          <LoadingState />
        ) : jobs.length === 0 ? (
          <EmptyState
            description={tx("sales_emptyJobs")}
            action={<Button onClick={() => navigate(quoteHref)}>{tx("sales_newQuote")}</Button>}
          />
        ) : (
          <div className="sales-tab-cards">
            <CardGrid min={280}>{jobs.map(jobCard)}</CardGrid>
          </div>
        ),
    },
    {
      key: "activity",
      label: <span className="cz-seg-label">{tx("tk_act_title")}</span>,
      children: <CustomerActivityTab customerId={customer.id} />,
    },
    {
      key: "quotes",
      label: tabLabel("sales_tabQuotes", quotes.length),
      children: list({
        rows: quotes,
        columns: quoteCols,
        loading: live && quotesLive.isLoading,
        empty: tx("sales_emptyQuotes"),
        emptyAction: (
          <Button onClick={() => navigate(quoteHref)}>
            {tx("sales_newQuote")}
          </Button>
        ),
        onRowClick: (q) => navigate(`/quotations?id=${q.id}`),
        mobileRow: (q) => ({
          title: <span className="cz-mono">{q.number}</span>,
          status: <StatusTag status={q.status} />,
          sub: <LaneCell from={q.pol} to={q.pod} />,
          aside: fmtShortDate(q.validUntil, locale),
        }),
      }),
    },
    {
      key: "invoices",
      label: tabLabel("sales_tabInvoices", invoices.length),
      children: list({
        rows: invoices,
        columns: invoiceCols,
        loading: live && invoicesLive.isLoading,
        empty: tx("sales_emptyInvoices"),
        onRowClick: (i) =>
          navigate(i.jobId ? `/invoices?jobId=${i.jobId}` : "/invoices"),
        mobileRow: (i) => ({
          title: <span className="cz-mono">{i.number}</span>,
          status: i.overdue ? (
            <StatusTag status="OVERDUE" />
          ) : (
            <StatusTag status={i.status} tone={INVOICE_TONE[i.status]} />
          ),
          sub: fmtDate(i.dueDate, locale),
          aside:
            i.balance > 0 ? fmtMoney(i.balance, i.currency, locale) : undefined,
        }),
      }),
    },
    {
      key: "docs",
      label: tabLabel("sales_tabDocs", docs.length),
      children: list({
        rows: docs,
        columns: docCols,
        loading: live && docsLive.isLoading,
        empty: tx("sales_emptyDocs"),
        mobileRow: (d) => ({
          title: dt(d.name),
          status: (
            <StatusTag
              status={d.status}
              label={tx(`sales_doc_${d.status}`)}
              tone={DOC_TONE[d.status]}
            />
          ),
          sub: [d.kind, d.ref].filter(Boolean).join(" · "),
        }),
      }),
    },
    {
      key: "mail",
      label: tabLabel("sales_tabMail", mails.length),
      children: list({
        rows: mails,
        columns: mailCols,
        loading: live && mailsLive.isLoading,
        empty: tx("sales_emptyMail"),
        onRowClick: () => navigate("/inbox"),
        mobileRow: (m) => ({
          title: mailSubject(m),
          status: (
            <StatusTag
              status={m.state}
              label={tx(`sales_mail_${m.state}`)}
              tone={MAIL_TONE[m.state]}
            />
          ),
          sub: m.from,
        }),
      }),
    },
    {
      key: "contacts",
      label: tabLabel("sales_tabContacts", people.length),
      children:
        live && detail ? (
          people.length ? (
            <ContactCards
              contacts={people}
              canEdit={canEdit}
              onSetPrimary={(p) => void contactAction(() => apiUpdateContact(p.id, { primary: true }), "cust_primarySet")}
              onDelete={(p) => void contactAction(() => apiDeleteContact(p.id), "cust_contactDeleted")}
              footer={
                canEdit ? (
                  <Button onClick={() => setEditOpen(true)}>{tx("cust_addContact")}</Button>
                ) : undefined
              }
            />
          ) : (
            <EmptyState
              description={tx("sales_emptyContacts")}
              action={canEdit ? <Button onClick={() => setEditOpen(true)}>{tx("cust_addContact")}</Button> : undefined}
            />
          )
        ) : (
          list({
            rows: people,
            columns: contactCols,
            empty: tx("sales_emptyContacts"),
            emptyAction: (
              <Button onClick={() => navigate("/contacts?new=1")}>
                {tx("sales_newContact")}
              </Button>
            ),
            mobileRow: (p) => ({
              title: (
                <>
                  {dt(p.name)} {primaryMark(p)}
                </>
              ),
              sub: [dt(p.title), p.phone].filter(Boolean).join(" · "),
            }),
          })
        ),
    },
  ];

  const details: [string, ReactNode][] = (
    [
      [tx("sales_taxId"), customer.taxId],
      [tx("sales_billingAddress"), customer.billingAddress],
      [tx("sales_creditTerm"), customer.creditTerm],
      [
        tx("sales_creditLimit"),
        customer.creditLimit != null
          ? fmtAmount(customer.creditLimit, "THB", locale)
          : undefined,
      ],
    ] as [string, ReactNode][]
  ).filter(([, v]) => v !== undefined && v !== null && v !== "" && v !== "—");
  const mainContact = people[0];
  const hasAr = openInv.length > 0;
  const hasSide = details.length > 0 || Boolean(mainContact) || hasAr || Boolean(detail);
  const ownerLabel = detail?.ownerUserId ? staff.nameOf(detail.ownerUserId, customer.owner) : customer.owner;
  const openEdit = canEdit && detail ? () => setEditOpen(true) : undefined;
  const arPanel = hasAr ? (
    <Panel title={tx("sales_arTitle")}>
      <div className="sales-ar">
        <Donut
          parts={agingParts}
          size={156}
          center={fmtCompact(balance, balanceCurrency, locale)}
          caption={tx("sales_statBalance")}
        />
        <Legend
          items={agingParts.map((p) => ({
            tone: p.tone,
            label: p.label,
            value: p.value ? fmtCompact(p.value, balanceCurrency, locale) : "—",
          }))}
        />
      </div>
    </Panel>
  ) : null;

  const tabsPanel = (
    <Panel flush className="sales-tabs-panel">
      <Tabs
        className="sales-tabs"
        activeKey={tab}
        onChange={(k) => setTab(k as Tab)}
        items={tabItems.filter((t) => !hiddenTabs.has(t.key))}
      />
    </Panel>
  );

  const facts = {
    customer: name,
    lane,
    activeJobs: activeJobCount,
    openQuotes: openQuotes.length,
    openInvoices: openInv.length,
    overdueInvoices: overdueInv.length,
    balanceDue: `${balance} ${balanceCurrency}`,
    arDays: customer.arDays ?? 0,
  };

  return (
    <div className="cz-stack sales-page">
      <PageHeader
        back={{ to: "/customers", label: tx("sales_backCustomers") }}
        title={
          <span className="sales-hero-title">
            <CompanyMark name={name} size={48} />
            {name}
          </span>
        }
        subtitle={
          <span className="sales-account-sub">
            <span className="sales-inline-person">
              <PersonAvatar name={ownerLabel} size={20} />
              {dt(ownerLabel)}
            </span>
            {city && city !== "—" ? <span>{city}</span> : null}
            {detail?.status && detail.status !== "active" ? (
              <StatusTag status={detail.status} label={tx(`cust_st_${detail.status}`)} tone={detail.status === "on_hold" ? "warning" : "neutral"} />
            ) : null}
          </span>
        }
        extra={
          <>
            {shell ? (
              <Button
                onClick={() => navigate(`/portal?customerId=${customer.id}`)}
              >
                {tx("sales_openPortal")}
              </Button>
            ) : null}
            <AiBriefCard
              title={tx("aiMgmtReport")}
              facts={facts}
              localFallback={`${name}: ${activeJobCount} active jobs, ${openQuotes.length} open quotations, ${openInv.length} open invoices.`}
            />
            {openEdit ? (
              <Button onClick={openEdit} data-testid="customer-edit">
                {tx("cust_editBtn")}
              </Button>
            ) : null}
            {caseOn ? (
              <Button type={quoteOn ? "default" : "primary"} icon={<Headset size={16} aria-hidden />} onClick={() => navigate(`/cases?new=1&customerId=${encodeURIComponent(customer.id)}`)}>
                {tx("md_new_case")}
              </Button>
            ) : null}
            {quoteOn ? (
              <Button type="primary" onClick={() => navigate(quoteHref)}>
                {tx("sales_newQuote")}
              </Button>
            ) : null}
          </>
        }
      >
        <div className="sales-hero">
          <div className="sales-hero-lane">
            <LaneRoute lane={lane} size="lg" />
          </div>
          {tiles}
        </div>
      </PageHeader>

      {hasSide ? (
        <div className="cz-split">
          {tabsPanel}
          <div className="cz-stack">
            {arPanel}
            {detail ? (
              <>
                <CompanyPanel c={detail} />
                <BillingPanel c={detail} onEdit={openEdit} />
                <ShippingPanel c={detail} onEdit={openEdit} />
                <PortalAccessPanel c={detail} canEdit={canEdit} onChanged={() => void detailQ.refetch()} />
              </>
            ) : null}
            {!detail && (details.length || mainContact) ? (
              <Panel
                title={
                  details.length ? tx("sales_companyInfo") : tx("sales_primary")
                }
              >
                {details.length ? (
                  <dl className="sales-dl">
                    {details.map(([k, v]) => (
                      <div key={k}>
                        <dt>{k}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                {mainContact ? (
                  <div
                    className={
                      details.length ? "sales-primary-contact" : undefined
                    }
                  >
                    {details.length ? (
                      <span className="sales-dl-label">
                        {tx("sales_primary")}
                      </span>
                    ) : null}
                    <ul className="sales-people">
                      <li>
                        <strong>{dt(mainContact.name)}</strong>
                        {mainContact.title ? (
                          <span className="cz-muted">{dt(mainContact.title)}</span>
                        ) : null}
                        {mainContact.email ? (
                          <a href={`mailto:${mainContact.email}`}>
                            {mainContact.email}
                          </a>
                        ) : null}
                        {mainContact.phone ? (
                          <a
                            className="sales-plain-link"
                            href={`tel:${mainContact.phone.replace(/\s+/g, "")}`}
                          >
                            {mainContact.phone}
                          </a>
                        ) : null}
                      </li>
                    </ul>
                  </div>
                ) : null}
              </Panel>
            ) : null}
          </div>
        </div>
      ) : (
        tabsPanel
      )}
      {detail ? (
        <CustomerFormDrawer
          open={editOpen}
          onClose={() => setEditOpen(false)}
          customer={detail}
          onSaved={() => {
            setEditOpen(false);
            void detailQ.refetch();
          }}
        />
      ) : null}
    </div>
  );
}
