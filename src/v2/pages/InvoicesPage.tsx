import {
  CalendarCheck,
  CheckCircle,
  Clock,
  DotsThree,
  DownloadSimple,
  FilePdf,
  FileText,
  HandCoins,
  PaperPlaneTilt,
  PencilSimpleLine,
  Receipt,
  Wallet,
  WarningCircle,
} from "@phosphor-icons/react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Drawer, Dropdown, Form, Input, InputNumber, Popconfirm, Select, Space } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  billingNotePdfUrl,
  createBillingNote as apiCreateBillingNote,
  fetchBillingNotes,
  invoicePdfUrl,
  issueInvoice as apiIssueInvoice,
  recordPayment as apiRecordPayment,
} from "../../api/commercial.ts";
import { bulkIssueInvoices, fetchInvoicesPage, invoicesCsvUrl, type InvoiceGroup, type InvoicePageRow, type InvoiceView } from "../../api/lists.ts";
import { useShellBilling } from "../../shell/billingStore.tsx";
import { useShellJobs } from "../../shell/jobStore.tsx";
import { useStore } from "../../store";
import {
  AiBriefCard,
  CardGrid,
  DataTable,
  Donut,
  EntityCard,
  FilterBar,
  Legend,
  PageHeader,
  Panel,
  PersonAvatar,
  SegmentBar,
  StatusTag,
  Tile,
  TileRow,
  ViewSwitch,
  readView,
  writeView,
} from "../components";
import { useAppMode } from "../hooks/useAppMode.ts";
import { useCan } from "../hooks/useCan.ts";
import { useCustomerLookup } from "../hooks/useCustomerLookup.ts";
import { fmtDate, fmtMoney } from "../lib/format.ts";
import { LiveInvoiceDrawer } from "./finance/createDrawers.tsx";
import { SendDocEmail } from "./finance/SendDocEmail.tsx";
import { DueCell, JobLink, MobileList, daysUntil, fmtTotals, noCents, useModeNote } from "./finance/financeKit.tsx";
import { CustomerFilter } from "./scale/CustomerFilter.tsx";
import { ListPager, LoadMore } from "./scale/ListPager.tsx";
import { useDebounced } from "./scale/useDebounced.ts";
import "./scale/scale.css";
import { BigMoney, CurrencyPick, DueChip, GroupHead, IconAction, type Tone } from "./finance/financeVisuals.tsx";

type Row = {
  id: string;
  invoiceNumber: string;
  customerId: string;
  jobId: string | null;
  total: number;
  balance: number;
  currency: string;
  status: string;
  dueDate: string | null;
  /** From the list API (lookups only preload the first customers / jobs). */
  customerLabel?: string;
  jobNumber?: string | null;
  group?: InvoiceGroup | "other";
};

type View = InvoiceView;
/** Server-side paging: table page size, cards per urgency group (+ "load more"). */
const PAGE = 50;
const PER_GROUP = 12;

const isOpen = (r: Row) => r.balance > 0 && (r.status === "ISSUED" || r.status === "PARTIALLY_PAID" || r.status === "PARTIAL");
const isOverdue = (r: Row) => isOpen(r) && (daysUntil(r.dueDate) ?? 0) < 0;
const isSoon = (r: Row) => {
  const d = daysUntil(r.dueDate);
  return isOpen(r) && d !== null && d >= 0 && d <= 7;
};

type BillingNote = { id: string; billingNumber: string; customerId?: string; grandTotal: number; currency: string; createdAt?: string };


export function InvoicesPageV2() {
  const { shell, live } = useAppMode();
  const { tx, locale } = useStore();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const billing = useShellBilling();
  const shellJobs = useShellJobs();
  const can = useCan();
  const { nameOf, customers } = useCustomerLookup();
  const modeNote = useModeNote();
  const [params, setParams] = useSearchParams();

  const view = (params.get("view") as View) || "all";
  const jobIdFilter = params.get("jobId") ?? "";
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim(), 300);
  const [customerFilter, setCustomerFilter] = useState<string | undefined>();
  const [customerFilterLabel, setCustomerFilterLabel] = useState<string | undefined>();
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedRows, setSelectedRows] = useState<Record<string, Row>>({});
  const [payFor, setPayFor] = useState<Row | null>(null);
  const [draftOpen, setDraftOpen] = useState(false);
  const [layout, setLayoutState] = useState(() => readView("invoices"));
  const [curPick, setCurPick] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const [extra, setExtra] = useState<Partial<Record<InvoiceGroup, Row[]>>>({});
  const [moreBusy, setMoreBusy] = useState<InvoiceGroup | null>(null);

  const setLayout = (v: "cards" | "list") => {
    setLayoutState(v);
    writeView("invoices", v);
  };

  const setView = (v: string) => {
    const next = new URLSearchParams(params);
    if (v === "all") next.delete("view");
    else next.set("view", v);
    setParams(next, { replace: true });
    setSelected([]);
  };

  const filters = { view, q: dq, customerId: customerFilter, jobId: jobIdFilter || undefined };
  const filterKey = JSON.stringify(filters);
  useEffect(() => {
    setPage(1);
    setExtra({});
    setSelected([]);
    setSelectedRows({});
  }, [filterKey, layout]);

  const cardsQ = useQuery({
    queryKey: ["invoices", "page", "cards", filterKey],
    queryFn: () => fetchInvoicesPage({ ...filters, perGroup: PER_GROUP }),
    enabled: live && layout === "cards",
    placeholderData: keepPreviousData,
  });
  const listQ = useQuery({
    queryKey: ["invoices", "page", "list", filterKey, page],
    queryFn: () => fetchInvoicesPage({ ...filters, limit: PAGE, offset: (page - 1) * PAGE }),
    enabled: live && layout === "list",
    placeholderData: keepPreviousData,
  });
  const data = layout === "cards" ? cardsQ.data : listQ.data;
  const loadingList = live && (listQ.isLoading || (listQ.isFetching && listQ.isPlaceholderData));

  const serverName = (i: InvoicePageRow) =>
    (locale === "th" ? i.customerNameTh : locale === "en" ? i.customerNameEn : i.customerNameZh) || i.customerNameEn || i.customerNameTh || i.customerNameZh || "";
  const toRow = (i: InvoicePageRow): Row => ({
    id: i.id,
    invoiceNumber: i.invoiceNumber,
    customerId: i.customerId,
    jobId: i.jobId,
    total: parseFloat(i.total) || 0,
    balance: parseFloat(i.balanceDue) || 0,
    currency: i.currency,
    status: i.status,
    dueDate: i.dueDate || null,
    customerLabel: nameOf(i.customerId, "") || serverName(i) || undefined,
    jobNumber: i.jobNumber,
    group: i.group,
  });
  const rows: Row[] = useMemo(() => (data?.items ?? []).map(toRow), [data, nameOf, locale]); // eslint-disable-line react-hooks/exhaustive-deps
  const custName = (r: Row) => r.customerLabel || nameOf(r.customerId, tx("fin_unknownCustomer"));
  const jobNos = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of [...rows, ...Object.values(extra).flat(), ...Object.values(selectedRows)]) if (r?.jobId && r.jobNumber) m.set(r.jobId, r.jobNumber);
    return m;
  }, [rows, extra, selectedRows]);
  const numberOf = (id: string | null | undefined) => (id ? jobNos.get(id) : undefined);

  const counts = data?.counts ?? { all: 0, draft: 0, open: 0, overdue: 0, paid: 0 };
  const summary = data?.summary;
  const hasAny = counts.all > 0;

  // ── Money summary (computed in SQL over every invoice in scope) ──
  const toMap = (list: { currency: string; amount: number }[] | undefined) => new Map((list ?? []).map((m) => [m.currency, m.amount]));
  const bal = (list: { currency: string; amount: number }[] | undefined) => fmtTotals(toMap(list), locale, fmtMoney(0, "USD", locale));
  const openCount = summary?.open.count ?? 0;
  const overdueCount = summary?.overdue.count ?? 0;
  const weekCount = summary?.week.count ?? 0;

  const currencies = (summary?.currencies ?? []).map((c) => c.currency);
  const cur = curPick && currencies.includes(curPick) ? curPick : (currencies[0] ?? "USD");
  const money = (n: number) => fmtMoney(n, cur, locale).replace(/\.00$/, "");
  const curSum = summary?.currencies.find((c) => c.currency === cur);
  const paidAmt = curSum?.paid ?? 0;
  const overdueAmt = curSum?.overdue ?? 0;
  const dueAmt = curSum?.due ?? 0;
  const billed = paidAmt + overdueAmt + dueAmt;
  const collectedPct = billed ? Math.round((paidAmt / billed) * 100) : 0;
  const agingDefs: { key: "notDue" | "d1_30" | "d31_60" | "d60"; tone: Tone }[] = [
    { key: "notDue", tone: "primary" },
    { key: "d1_30", tone: "warning" },
    { key: "d31_60", tone: "accent" },
    { key: "d60", tone: "danger" },
  ];
  const aging = agingDefs.map((b) => ({
    tone: b.tone,
    label: tx(`fin_age_${b.key}`),
    value: curSum?.aging[b.key] ?? 0,
  }));

  // ── Mutations (live) ──
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["invoices"] });
    void qc.invalidateQueries({ queryKey: ["fin", "billing-notes"] });
    void qc.invalidateQueries({ queryKey: ["jobs"] });
  };
  const issueMut = useMutation({ mutationFn: apiIssueInvoice, onSuccess: invalidate });
  const payMut = useMutation({ mutationFn: apiRecordPayment, onSuccess: invalidate });
  const bnMut = useMutation({ mutationFn: apiCreateBillingNote, onSuccess: invalidate });
  const bulkIssueMut = useMutation({ mutationFn: bulkIssueInvoices, onSuccess: invalidate });

  const liveNotes = useQuery({ queryKey: ["fin", "billing-notes"], queryFn: () => fetchBillingNotes(), enabled: live });
  const notes: BillingNote[] = shell
    ? billing.billingNotes.map((b) => ({ ...b }))
    : (liveNotes.data ?? []).map((b) => ({ ...b, grandTotal: parseFloat(b.grandTotal) || 0 }));

  async function issue(r: Row) {
    try {
      if (shell) {
        billing.issueInvoice(r.id);
        if (r.jobId) shellJobs.setBillingStatus(r.jobId, "INVOICED");
      } else {
        await issueMut.mutateAsync(r.id);
      }
      message.success(tx("fin_issued", { no: r.invoiceNumber }));
    } catch (e) {
      message.error(tx("fin_actionFailed", { err: e instanceof Error ? e.message : "" }));
    }
  }

  async function createNote(ids: string[]) {
    const picked = ids.map((id) => selectedRows[id] ?? rows.find((r) => r.id === id)).filter((r): r is Row => Boolean(r));
    if (!picked.length) return;
    const cust = picked[0]!.customerId;
    if (picked.some((r) => r.customerId !== cust)) {
      message.warning(tx("fin_noteSameCustomer"));
      return;
    }
    try {
      if (shell) {
        const err = billing.createBillingNote(ids);
        if (err) throw new Error(tx(err));
      } else {
        await bnMut.mutateAsync({ customerId: cust, invoiceIds: ids });
      }
      message.success(tx("fin_noteCreated"));
      setSelected([]);
      setSelectedRows({});
    } catch (e) {
      message.error(tx("fin_actionFailed", { err: e instanceof Error ? e.message : "" }));
    }
  }

  const picked = selected.map((id) => selectedRows[id]).filter((r): r is Row => Boolean(r));
  const mixedCustomers = new Set(picked.map((r) => r.customerId)).size > 1;
  const pickedDrafts = picked.filter((r) => r.status === "DRAFT");

  async function issueSelected() {
    try {
      const res = await bulkIssueMut.mutateAsync(pickedDrafts.map((r) => r.id));
      message.success(
        [tx("sc_issuedN", { n: res.issued.length }), res.skipped.length ? tx("sc_skippedN", { n: res.skipped.length }) : ""].filter(Boolean).join(" · "),
      );
      setSelected([]);
      setSelectedRows({});
    } catch (e) {
      message.error(tx("fin_actionFailed", { err: e instanceof Error ? e.message : "" }));
    }
  }

  async function loadMoreGroup(g: InvoiceGroup, shown: number) {
    setMoreBusy(g);
    try {
      const res = await fetchInvoicesPage({ ...filters, group: g, limit: PER_GROUP * 2, offset: shown });
      // Same order as the grouped query (open first by due date).
      setExtra((e) => ({ ...e, [g]: [...(e[g] ?? []), ...res.items.map(toRow)] }));
    } finally {
      setMoreBusy(null);
    }
  }

  const moreMenu = (r: Row) => ({
    items: [
      ...(r.status !== "DRAFT" ? [{ key: "note", icon: <Receipt size={16} />, label: tx("fin_makeNoteOne"), onClick: () => void createNote([r.id]) }] : []),
      ...(r.jobId && numberOf(r.jobId) ? [{ key: "job", label: tx("fin_openJob"), onClick: () => navigate(`/jobs/${r.jobId}`) }] : []),
      { key: "cust", label: tx("fin_openCustomer"), onClick: () => navigate(`/customers/${r.customerId}`) },
    ],
  });

  const columns: ColumnsType<Row> = [
    {
      title: tx("fin_colInvoice"),
      key: "no",
      render: (_, r) => (
        <>
          <span className="cz-cell-main">{r.invoiceNumber}</span>
          <span className="cz-cell-sub">{custName(r)}</span>
        </>
      ),
    },
    { title: tx("fin_colJob"), key: "job", render: (_, r) => <JobLink id={r.jobId} numberOf={numberOf} /> },
    {
      title: tx("fin_colStatus"),
      key: "status",
      render: (_, r) =>
        isOverdue(r) ? <StatusTag status="OVERDUE" /> : <StatusTag status={r.status} tone={r.status === "PARTIALLY_PAID" ? "warning" : undefined} />,
    },
    { title: tx("fin_colDue"), key: "due", render: (_, r) => <DueCell date={r.dueDate} open={isOpen(r)} /> },
    {
      title: tx("fin_colBalance"),
      key: "balance",
      align: "right",
      render: (_, r) => (
        <span className="cz-num">
          <span className={r.balance > 0 ? "fin-amount" : "cz-muted"}>{fmtMoney(r.balance, r.currency, locale)}</span>
          {r.balance !== r.total ? <span className="cz-cell-sub">{tx("fin_ofTotal", { total: fmtMoney(r.total, r.currency, locale) })}</span> : null}
        </span>
      ),
    },
    {
      title: <span className="sr-only">{tx("fin_colActions")}</span>,
      key: "actions",
      align: "right",
      render: (_, r) => (
        <Space size={4} className="fin-row-actions">
          {r.status === "DRAFT" ? (
            <Popconfirm
              title={tx("fin_issueConfirm", { no: r.invoiceNumber })}
              description={tx("fin_issueConfirmHint")}
              okText={tx("fin_issue")}
              cancelText={tx("fin_cancel")}
              onConfirm={() => issue(r)}
            >
              <Button size="small" type="link" loading={issueMut.isPending && issueMut.variables === r.id}>
                {tx("fin_issue")}
              </Button>
            </Popconfirm>
          ) : null}
          {isOpen(r) ? (
            <Button size="small" type="link" onClick={() => setPayFor(r)}>
              {tx("fin_recordPayment")}
            </Button>
          ) : null}
          {live ? (
            <a className="fin-pdf" href={invoicePdfUrl(r.id)} target="_blank" rel="noreferrer" aria-label={`${tx("be_invoicePdf")} ${r.invoiceNumber}`}>
              <FilePdf size={16} aria-hidden /> PDF
            </a>
          ) : null}
          {live && r.status !== "DRAFT" ? <SendDocEmail kind="invoice" id={r.id} number={r.invoiceNumber} /> : null}
          <Dropdown trigger={["click"]} menu={moreMenu(r)}>
            <Button size="small" type="text" aria-label={tx("fin_moreActions")} icon={<DotsThree size={18} weight="bold" />} />
          </Dropdown>
        </Space>
      ),
    },
  ];

  const aiFacts = {
    invoices: counts.all,
    openInvoices: openCount,
    overdueInvoices: overdueCount,
    drafts: counts.draft,
    outstanding: bal(summary?.open.balance),
  };
  const aiLocal = `AR: ${counts.all} invoices, ${openCount} open (${bal(summary?.open.balance)}), ${overdueCount} overdue, ${counts.draft} drafts.`;

  const primary = (
    <Button type="primary" onClick={() => setDraftOpen(true)} disabled={shell && !customers.length}>
      {tx("fin_newDraft")}
    </Button>
  );

  if (!shell && !live) {
    return (
      <div className="cz-stack fin-page">
        <PageHeader title={tx("fin_invoicesTitle")} subtitle={tx("apiNotConfigured")} />
      </div>
    );
  }

  // ── Card groups (by urgency): first PER_GROUP per group from the server, "load more" for the rest ──
  const groupCounts = cardsQ.data?.groupCounts;
  const groupDefs: { key: InvoiceGroup; icon: typeof Wallet; tone: Tone; title: string }[] = [
    { key: "overdue", icon: WarningCircle, tone: "danger", title: tx("fin_tabOverdue") },
    { key: "soon", icon: Clock, tone: "warning", title: tx("fin_statDueWeek") },
    { key: "open", icon: Wallet, tone: "primary", title: tx("fin_tabOpen") },
    { key: "draft", icon: PencilSimpleLine, tone: "neutral", title: tx("fin_tabDraft") },
    { key: "paid", icon: CheckCircle, tone: "success", title: tx("fin_tabPaid") },
  ];
  const groups = groupDefs.map((g) => ({
    ...g,
    rows: [...rows.filter((r) => r.group === g.key), ...(extra[g.key] ?? [])],
    total: groupCounts?.[g.key] ?? 0,
  }));

  const card = (r: Row) => {
    const overdue = isOverdue(r);
    const soon = isSoon(r);
    const draft = r.status === "DRAFT";
    const paid = r.status === "PAID" || (!draft && r.balance <= 0);
    const cname = custName(r);
    const received = Math.max(0, r.total - r.balance);
    return (
      <EntityCard
        key={r.id}
        tone={overdue ? "danger" : soon ? "warning" : "default"}
        media={<PersonAvatar name={cname} size={40} />}
        title={r.invoiceNumber}
        subtitle={cname}
        badge={draft ? <StatusTag status="DRAFT" /> : <DueChip date={r.dueDate} open={isOpen(r)} paid={paid} />}
        footer={
          <>
            <span className="fin-card-job">
              {r.jobId && numberOf(r.jobId) ? <JobLink id={r.jobId} numberOf={numberOf} /> : null}
            </span>
            <span className="fin-card-actions">
              {draft ? (
                <Popconfirm
                  title={tx("fin_issueConfirm", { no: r.invoiceNumber })}
                  description={tx("fin_issueConfirmHint")}
                  okText={tx("fin_issue")}
                  cancelText={tx("fin_cancel")}
                  onConfirm={() => issue(r)}
                >
                  <span>
                    <IconAction icon={PaperPlaneTilt} primary label={`${tx("fin_issue")} ${r.invoiceNumber}`} loading={issueMut.isPending && issueMut.variables === r.id} />
                  </span>
                </Popconfirm>
              ) : null}
              {isOpen(r) ? <IconAction icon={HandCoins} primary label={`${tx("fin_recordPayment")} ${r.invoiceNumber}`} onClick={() => setPayFor(r)} /> : null}
              {live ? <IconAction icon={FilePdf} label={`${tx("be_invoicePdf")} ${r.invoiceNumber}`} href={invoicePdfUrl(r.id)} /> : null}
              {live && !draft ? <SendDocEmail kind="invoice" id={r.id} number={r.invoiceNumber} variant="icon" /> : null}
              {!draft ? <IconAction icon={Receipt} label={tx("fin_makeNoteOne")} onClick={() => void createNote([r.id])} /> : null}
              <Dropdown trigger={["click"]} menu={moreMenu(r)}>
                <Button className="fin-iconbtn" type="text" aria-label={tx("fin_moreActions")} icon={<DotsThree size={20} weight="bold" />} />
              </Dropdown>
            </span>
          </>
        }
      >
        <div className="fin-inv-money">
          <BigMoney text={fmtMoney(paid ? r.total : r.balance, r.currency, locale)} tone={overdue ? "danger" : paid ? "muted" : "default"} />
          {!paid && received > 0 ? <span className="fin-inv-of">{tx("fin_ofTotal", { total: fmtMoney(r.total, r.currency, locale) })}</span> : null}
        </div>
        {draft ? null : <SegmentBar
          height={8}
          parts={[
            { value: received, tone: "success", label: tx("fin_legendPaid") },
            { value: Math.max(0, r.balance), tone: overdue ? "danger" : draft ? "neutral" : soon ? "warning" : "primary", label: tx("fin_colBalance") },
          ]}
        />}
      </EntityCard>
    );
  };

  const summaryPanel = (
    <Panel
      title={tx("fin_moneyTitle")}
      extra={<CurrencyPick value={cur} options={currencies} onChange={setCurPick} />}
    >
      <div className="fin-money">
        <div className="fin-money-donut">
          <Donut
            size={132}
            center={`${collectedPct}%`}
            caption={tx("fin_collected")}
            parts={[
              { value: paidAmt, tone: "success", label: tx("fin_legendPaid") },
              { value: dueAmt, tone: "primary", label: tx("fin_legendDue") },
              { value: overdueAmt, tone: "danger", label: tx("fin_tabOverdue") },
            ]}
          />
          <Legend
            items={[
              { tone: "success", label: tx("fin_legendPaid"), value: money(paidAmt) },
              { tone: "primary", label: tx("fin_legendDue"), value: money(dueAmt) },
              { tone: "danger", label: tx("fin_tabOverdue"), value: money(overdueAmt) },
            ]}
          />
        </div>
        <div className="fin-money-aging">
          <h3 className="fin-mini-title">
            <CalendarCheck size={16} aria-hidden /> {tx("fin_chartAging")}
          </h3>
          <SegmentBar height={16} parts={aging} />
          <Legend items={aging.map((a) => ({ tone: a.tone, label: a.label, value: money(a.value) }))} />
        </div>
      </div>
    </Panel>
  );

  const hasCards = groups.some((g) => g.rows.length);
  const fromJobBtn = (
    <Link to="/jobs">
      <Button>{tx("fin_fromJob")}</Button>
    </Link>
  );

  return (
    <div className="cz-stack fin-page">
      <PageHeader
        title={tx("fin_invoicesTitle")}
        subtitle={modeNote || undefined}
        extra={
          <>
            <AiBriefCard title={tx("fin_aiTitle")} facts={aiFacts} localFallback={aiLocal} />
            <Link to="/jobs">
              <Button>{tx("fin_fromJob")}</Button>
            </Link>
            {primary}
          </>
        }
      >
        <TileRow>
          <Tile icon={Wallet} tone="primary" value={noCents(bal(summary?.open.balance))} label={tx("fin_statOutstanding")} to="/invoices?view=open" visual={<span className="fin-tile-n">{tx("fin_nInvoices", { n: openCount })}</span>} />
          <Tile
            icon={WarningCircle}
            tone={overdueCount ? "danger" : "neutral"}
            value={noCents(bal(summary?.overdue.balance))}
            label={tx("fin_statOverdue")}
            to="/invoices?view=overdue"
            visual={<span className="fin-tile-n">{tx("fin_nInvoices", { n: overdueCount })}</span>}
          />
          <Tile
            icon={Clock}
            tone={weekCount ? "warning" : "neutral"}
            value={noCents(bal(summary?.week.balance))}
            label={tx("fin_statDueWeek")}
            to="/invoices?view=open"
            visual={<span className="fin-tile-n">{tx("fin_nInvoices", { n: weekCount })}</span>}
          />
          <Tile icon={FileText} tone="neutral" value={String(counts.draft)} label={tx("fin_statDrafts")} to="/invoices?view=draft" />
        </TileRow>
      </PageHeader>

      {billed > 0 ? summaryPanel : null}

      <FilterBar
        tabs={{
          value: view,
          onChange: setView,
          options: [
            { value: "all", label: tx("fin_tabAll"), count: counts.all },
            { value: "draft", label: tx("fin_tabDraft"), count: counts.draft },
            { value: "open", label: tx("fin_tabOpen"), count: counts.open },
            { value: "overdue", label: tx("fin_tabOverdue"), count: counts.overdue },
            { value: "paid", label: tx("fin_tabPaid"), count: counts.paid },
          ],
        }}
        search={{ value: q, onChange: setQ, placeholder: tx("fin_searchInvoices") }}
        onClear={() => {
          setQ("");
          setCustomerFilter(undefined);
          setView("all");
          if (jobIdFilter) {
            const next = new URLSearchParams(params);
            next.delete("jobId");
            setParams(next, { replace: true });
          }
        }}
        count={data ? data.total : undefined}
        extra={
          <>
            {jobIdFilter ? <span className="fin-chip">{tx("fin_forJob", { no: numberOf(jobIdFilter) ?? "—" })}</span> : null}
            <CustomerFilter
              value={customerFilter}
              label={customerFilterLabel ?? (customerFilter ? nameOf(customerFilter, "") : undefined)}
              placeholder={tx("fin_allCustomers")}
              onChange={(id, name) => {
                setCustomerFilter(id);
                setCustomerFilterLabel(name);
              }}
            />
            {live && can("invoice.view") ? (
              <Button
                href={invoicesCsvUrl({ ...filters, lang: locale })}
                icon={<DownloadSimple size={16} aria-hidden />}
                aria-label={tx("sc_exportFiltered")}
                title={tx("sc_exportFiltered")}
              />
            ) : null}
            <ViewSwitch value={layout} onChange={setLayout} labels={{ cards: tx("viewCards"), list: tx("viewList") }} />
          </>
        }
      />

      {layout === "cards" ? (
        hasCards ? (
          groups
            .filter((g) => g.rows.length)
            .map((g) => (
              <section key={g.key} className="fin-group" aria-label={g.title}>
                <GroupHead icon={g.icon} tone={g.tone} title={g.title} count={g.total} />
                <CardGrid min={300}>{g.rows.map(card)}</CardGrid>
                <LoadMore left={g.total - g.rows.length} loading={moreBusy === g.key} onClick={() => void loadMoreGroup(g.key, g.rows.length)} />
              </section>
            ))
        ) : (
          <div className="fin-empty-line">
            <span>{hasAny ? tx("noResults") : tx("fin_emptyInvoices")}</span>
            {hasAny ? null : primary}
          </div>
        )
      ) : (
        <>
          {selected.length ? (
            <div className="fin-bulk" role="region" aria-label={tx("fin_selection")}>
              <span>{tx("fin_nSelected", { n: selected.length })}</span>
              {mixedCustomers ? <span className="fin-bulk-warn">{tx("fin_noteSameCustomer")}</span> : null}
              <Space wrap>
                <Button onClick={() => { setSelected([]); setSelectedRows({}); }} type="text">
                  {tx("fin_clearSelection")}
                </Button>
                {live ? (
                  <Button icon={<DownloadSimple size={16} aria-hidden />} href={invoicesCsvUrl({ ids: selected, lang: locale })}>
                    {tx("sc_exportSelected")}
                  </Button>
                ) : null}
                {live && can("invoice.issue") && pickedDrafts.length ? (
                  <Popconfirm
                    title={tx("sc_issueConfirm", { n: pickedDrafts.length })}
                    description={tx("fin_issueConfirmHint")}
                    okText={tx("fin_issue")}
                    cancelText={tx("fin_cancel")}
                    onConfirm={() => issueSelected()}
                  >
                    <Button icon={<PaperPlaneTilt size={16} aria-hidden />} loading={bulkIssueMut.isPending}>
                      {tx("sc_issueSelected")} ({pickedDrafts.length})
                    </Button>
                  </Popconfirm>
                ) : null}
                {can("billing.create") ? (
                  <Button
                    type="primary"
                    icon={<Receipt size={16} />}
                    disabled={mixedCustomers || pickedDrafts.length > 0}
                    loading={bnMut.isPending}
                    onClick={() => void createNote(selected)}
                  >
                    {tx("fin_makeNote")}
                  </Button>
                ) : null}
              </Space>
            </div>
          ) : null}

          <MobileList
            empty={hasAny ? tx("noResults") : tx("fin_emptyInvoices")}
            items={rows.map((r) => ({
              key: r.id,
              title: r.invoiceNumber,
              status: isOverdue(r) ? <StatusTag status="OVERDUE" /> : <StatusTag status={r.status} tone={r.status === "PARTIALLY_PAID" ? "warning" : undefined} />,
              sub: `${custName(r)} · ${fmtDate(r.dueDate, locale)}`,
              value: fmtMoney(r.balance, r.currency, locale),
              action:
                r.status === "DRAFT" ? (
                  <Popconfirm title={tx("fin_issueConfirm", { no: r.invoiceNumber })} okText={tx("fin_issue")} cancelText={tx("fin_cancel")} onConfirm={() => issue(r)}>
                    <Button size="small">{tx("fin_issue")}</Button>
                  </Popconfirm>
                ) : isOpen(r) ? (
                  <Button size="small" onClick={() => setPayFor(r)}>
                    {tx("fin_recordPayment")}
                  </Button>
                ) : undefined,
            }))}
          />

          <DataTable<Row>
            className="fin-desktop-table"
            rowKey="id"
            loading={loadingList}
            columns={columns}
            dataSource={rows}
            pagination={false}
            rowSelection={{
              selectedRowKeys: selected,
              preserveSelectedRowKeys: true,
              onChange: (keys, picked) => {
                setSelected(keys as string[]);
                setSelectedRows((prev) => {
                  const next: Record<string, Row> = {};
                  for (const k of keys as string[]) {
                    const r = prev[k] ?? picked.find((x) => x?.id === k);
                    if (r) next[k] = r;
                  }
                  return next;
                });
              },
              getCheckboxProps: (r) => ({ disabled: false, "aria-label": r.invoiceNumber }),
            }}
            emptyText={hasAny ? tx("noResults") : tx("fin_emptyInvoices")}
            emptyAction={hasAny ? undefined : fromJobBtn}
          />
          <ListPager page={page} pageSize={PAGE} total={data?.total ?? 0} onChange={setPage} />
        </>
      )}

      {notes.length ? (
        <Panel title={tx("fin_notesTitle")} flush>
          <ul className="fin-notes">
            {notes.map((n) => (
              <li key={n.id}>
                <Receipt size={20} className="fin-note-icon" aria-hidden />
                <div>
                  <span className="cz-cell-main">{n.billingNumber}</span>
                  <span className="cz-cell-sub">
                    {n.customerId ? nameOf(n.customerId, "") : ""}
                    {n.createdAt ? ` · ${fmtDate(n.createdAt, locale)}` : ""}
                  </span>
                </div>
                <span className="cz-num fin-strong">{fmtMoney(n.grandTotal, n.currency, locale)}</span>
                {live ? (
                  <a className="fin-pdf" href={billingNotePdfUrl(n.id)} target="_blank" rel="noreferrer">
                    <FilePdf size={16} aria-hidden /> PDF
                  </a>
                ) : null}
                {live ? <SendDocEmail kind="billing_note" id={n.id} number={n.billingNumber} /> : null}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <PaymentDrawer
        row={payFor}
        onClose={() => setPayFor(null)}
        busy={payMut.isPending}
        onSubmit={async ({ amount, method, reference }) => {
          if (!payFor) return;
          try {
            if (shell) {
              const err = billing.recordPayment({ invoiceId: payFor.id, amount });
              if (err) throw new Error(tx(err));
              if (payFor.jobId) shellJobs.setBillingStatus(payFor.jobId, payFor.balance - amount <= 0 ? "PAID" : "PARTIAL");
            } else {
              await payMut.mutateAsync({
                customerId: payFor.customerId,
                amount: String(amount),
                currency: payFor.currency,
                method,
                reference: reference || undefined,
                allocations: [{ invoiceId: payFor.id, amount: String(amount) }],
              });
            }
            message.success(tx("fin_paymentSaved"));
            setPayFor(null);
          } catch (e) {
            message.error(tx("fin_actionFailed", { err: e instanceof Error ? e.message : "" }));
          }
        }}
      />

      {live ? <LiveInvoiceDrawer open={draftOpen} onClose={() => setDraftOpen(false)} defaultJobId={jobIdFilter || undefined} /> : null}

      {shell ? (
        <DraftDrawer
          open={draftOpen}
          onClose={() => setDraftOpen(false)}
          customers={customers.map((c) => ({ value: c.id, label: nameOf(c.id) }))}
          onSubmit={(v) => {
            const err = billing.createDraftInvoice(v);
            if (err) {
              message.error(tx(err));
              return;
            }
            message.success(tx("fin_draftCreated"));
            setDraftOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function PaymentDrawer({
  row,
  onClose,
  onSubmit,
  busy,
}: {
  row: Row | null;
  onClose: () => void;
  onSubmit: (v: { amount: number; method: string; reference: string }) => void;
  busy: boolean;
}) {
  const { tx, locale } = useStore();
  const { nameOf } = useCustomerLookup();
  const [form] = Form.useForm();
  return (
    <Drawer
      open={Boolean(row)}
      onClose={onClose}
      title={tx("fin_recordPayment")}
      width={440}
      destroyOnClose
      footer={
        <div className="fin-drawer-foot">
          <Button type="text" onClick={onClose}>
            {tx("fin_cancel")}
          </Button>
          <Button type="primary" loading={busy} onClick={() => form.submit()}>
            {tx("fin_savePayment")}
          </Button>
        </div>
      }
    >
      {row ? (
        <>
          <dl className="fin-summary">
            <div>
              <dt>{tx("fin_colInvoice")}</dt>
              <dd>{row.invoiceNumber}</dd>
            </div>
            <div>
              <dt>{tx("fin_customer")}</dt>
              <dd>{nameOf(row.customerId)}</dd>
            </div>
            <div>
              <dt>{tx("fin_colBalance")}</dt>
              <dd className="fin-strong">{fmtMoney(row.balance, row.currency, locale)}</dd>
            </div>
          </dl>
          <Form
            form={form}
            layout="vertical"
            requiredMark
            initialValues={{ amount: row.balance, method: "BANK_TRANSFER", reference: "" }}
            onFinish={(v) => onSubmit({ amount: Number(v.amount), method: v.method, reference: v.reference ?? "" })}
          >
            <Form.Item
              name="amount"
              label={tx("fin_amountReceived", { cur: row.currency })}
              rules={[
                { required: true, message: tx("fin_amountRequired") },
                {
                  validator: (_, v) =>
                    Number(v) > 0 && Number(v) <= row.balance + 0.0001 ? Promise.resolve() : Promise.reject(new Error(tx("fin_amountRange"))),
                },
              ]}
            >
              <InputNumber min={0} step={100} style={{ width: "100%" }} addonAfter={row.currency} />
            </Form.Item>
            <Form.Item name="method" label={tx("fin_method")} rules={[{ required: true }]}>
              <Select
                options={[
                  { value: "BANK_TRANSFER", label: tx("fin_methodTransfer") },
                  { value: "CASH", label: tx("fin_methodCash") },
                  { value: "CHEQUE", label: tx("fin_methodCheque") },
                ]}
              />
            </Form.Item>
            <Form.Item name="reference" label={tx("fin_reference")}>
              <Input placeholder={tx("fin_referencePh")} />
            </Form.Item>
          </Form>
        </>
      ) : null}
    </Drawer>
  );
}

function DraftDrawer({
  open,
  onClose,
  onSubmit,
  customers,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (v: { customerId: string; total: number; currency: string }) => void;
  customers: { value: string; label: string }[];
}) {
  const { tx } = useStore();
  const [form] = Form.useForm();
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={tx("fin_newDraft")}
      width={440}
      destroyOnClose
      footer={
        <div className="fin-drawer-foot">
          <Button type="text" onClick={onClose}>
            {tx("fin_cancel")}
          </Button>
          <Button type="primary" onClick={() => form.submit()}>
            {tx("fin_save")}
          </Button>
        </div>
      }
    >
      <p className="cz-muted fin-drawer-lead">{tx("fin_newDraftHint")}</p>
      <Form
        form={form}
        layout="vertical"
        initialValues={{ customerId: customers[0]?.value, total: 1000, currency: "USD" }}
        onFinish={(v) => onSubmit({ customerId: v.customerId, total: Number(v.total), currency: v.currency })}
      >
        <Form.Item name="customerId" label={tx("fin_customer")} rules={[{ required: true }]}>
          <Select showSearch optionFilterProp="label" options={customers} />
        </Form.Item>
        <Form.Item name="total" label={tx("fin_colTotal")} rules={[{ required: true, message: tx("fin_amountRequired") }]}>
          <InputNumber min={0} step={100} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item name="currency" label={tx("fin_currency")} rules={[{ required: true }]}>
          <Select
            options={[
              { value: "USD", label: "USD" },
              { value: "THB", label: "THB" },
              { value: "CNY", label: "CNY" },
            ]}
          />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
