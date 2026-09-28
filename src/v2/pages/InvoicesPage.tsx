import {
  CalendarCheck,
  CheckCircle,
  Clock,
  DotsThree,
  FilePdf,
  FileText,
  HandCoins,
  PaperPlaneTilt,
  PencilSimpleLine,
  Receipt,
  Wallet,
  WarningCircle,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Drawer, Dropdown, Form, Input, InputNumber, Popconfirm, Select, Space } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  billingNotePdfUrl,
  createBillingNote as apiCreateBillingNote,
  fetchBillingNotes,
  invoicePdfUrl,
  issueInvoice as apiIssueInvoice,
  recordPayment as apiRecordPayment,
} from "../../api/commercial.ts";
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
import { useLiveInvoices } from "../hooks/useCommercial.ts";
import { useCustomerLookup } from "../hooks/useCustomerLookup.ts";
import { fmtDate, fmtMoney } from "../lib/format.ts";
import { LiveInvoiceDrawer } from "./finance/createDrawers.tsx";
import { DueCell, JobLink, MobileList, daysUntil, fmtTotals, noCents, sumByCurrency, useJobLookup, useModeNote } from "./finance/financeKit.tsx";
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
};

type View = "all" | "draft" | "open" | "overdue" | "paid";

const isOpen = (r: Row) => r.balance > 0 && (r.status === "ISSUED" || r.status === "PARTIALLY_PAID" || r.status === "PARTIAL");
const isOverdue = (r: Row) => isOpen(r) && (daysUntil(r.dueDate) ?? 0) < 0;
const isSoon = (r: Row) => {
  const d = daysUntil(r.dueDate);
  return isOpen(r) && d !== null && d >= 0 && d <= 7;
};
const isCounted = (r: Row) => r.status !== "DRAFT" && r.status !== "VOID" && r.status !== "CANCELLED";

type BillingNote = { id: string; billingNumber: string; customerId?: string; grandTotal: number; currency: string; createdAt?: string };

const PAID_PREVIEW = 6;

export function InvoicesPageV2() {
  const { shell, live } = useAppMode();
  const { tx, locale } = useStore();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const billing = useShellBilling();
  const shellJobs = useShellJobs();
  const liveInv = useLiveInvoices();
  const { nameOf, customers } = useCustomerLookup();
  const { numberOf } = useJobLookup();
  const modeNote = useModeNote();
  const [params, setParams] = useSearchParams();

  const view = (params.get("view") as View) || "all";
  const jobIdFilter = params.get("jobId") ?? "";
  const [q, setQ] = useState("");
  const [customerFilter, setCustomerFilter] = useState<string | undefined>();
  const [selected, setSelected] = useState<string[]>([]);
  const [payFor, setPayFor] = useState<Row | null>(null);
  const [draftOpen, setDraftOpen] = useState(false);
  const [layout, setLayoutState] = useState(() => readView("invoices"));
  const [curPick, setCurPick] = useState<string | undefined>();
  const [showAllPaid, setShowAllPaid] = useState(false);

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

  const rows: Row[] = useMemo(() => {
    if (shell)
      return billing.invoices.map((i) => ({
        id: i.id,
        invoiceNumber: i.invoiceNumber,
        customerId: i.customerId,
        jobId: i.jobId ?? null,
        total: i.total,
        balance: i.balanceDue,
        currency: i.currency,
        status: i.status,
        dueDate: i.dueDate ?? null,
      }));
    return (liveInv.data ?? []).map((i) => ({
      id: i.id,
      invoiceNumber: i.invoiceNumber,
      customerId: i.customerId,
      jobId: i.jobId,
      total: parseFloat(i.total) || 0,
      balance: parseFloat(i.balanceDue) || 0,
      currency: i.currency,
      status: i.status,
      dueDate: i.dueDate || null,
    }));
  }, [shell, billing.invoices, liveInv.data]);

  const scoped = jobIdFilter ? rows.filter((r) => r.jobId === jobIdFilter) : rows;

  const counts = {
    all: scoped.length,
    draft: scoped.filter((r) => r.status === "DRAFT").length,
    open: scoped.filter(isOpen).length,
    overdue: scoped.filter(isOverdue).length,
    paid: scoped.filter((r) => r.status === "PAID").length,
  };

  const needle = q.trim().toLowerCase();
  const filtered = scoped.filter((r) => {
    if (view === "draft" && r.status !== "DRAFT") return false;
    if (view === "open" && !isOpen(r)) return false;
    if (view === "overdue" && !isOverdue(r)) return false;
    if (view === "paid" && r.status !== "PAID") return false;
    if (customerFilter && r.customerId !== customerFilter) return false;
    if (needle) {
      const hay = `${r.invoiceNumber} ${nameOf(r.customerId, "")} ${numberOf(r.jobId) ?? ""}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  // ── Money summary ──
  const openRows = scoped.filter(isOpen);
  const overdueRows = scoped.filter(isOverdue);
  const weekRows = openRows.filter(isSoon);
  const bal = (list: Row[]) => fmtTotals(sumByCurrency(list, (r) => r.balance, (r) => r.currency), locale, fmtMoney(0, "USD", locale));

  const currencies = useMemo(() => {
    const m = sumByCurrency(scoped.filter(isCounted), (r) => r.total, (r) => r.currency);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  }, [scoped]);
  const cur = curPick && currencies.includes(curPick) ? curPick : (currencies[0] ?? "USD");
  const money = (n: number) => fmtMoney(n, cur, locale).replace(/\.00$/, "");
  const inCur = scoped.filter((r) => isCounted(r) && r.currency === cur);
  const sumOf = (list: Row[], f: (r: Row) => number) => list.reduce((n, r) => n + f(r), 0);
  const paidAmt = sumOf(inCur, (r) => Math.max(0, r.total - r.balance));
  const overdueAmt = sumOf(inCur.filter(isOverdue), (r) => r.balance);
  const dueAmt = sumOf(inCur.filter((r) => isOpen(r) && !isOverdue(r)), (r) => r.balance);
  const billed = paidAmt + overdueAmt + dueAmt;
  const collectedPct = billed ? Math.round((paidAmt / billed) * 100) : 0;
  const agingDefs: { key: string; tone: Tone; test: (d: number) => boolean }[] = [
    { key: "notDue", tone: "primary", test: (d) => d >= 0 },
    { key: "d1_30", tone: "warning", test: (d) => d < 0 && d >= -30 },
    { key: "d31_60", tone: "accent", test: (d) => d < -30 && d >= -60 },
    { key: "d60", tone: "danger", test: (d) => d < -60 },
  ];
  const aging = agingDefs.map((b) => ({
    tone: b.tone,
    label: tx(`fin_age_${b.key}`),
    value: sumOf(inCur.filter((r) => isOpen(r) && b.test(daysUntil(r.dueDate) ?? 0)), (r) => r.balance),
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
    const picked = rows.filter((r) => ids.includes(r.id));
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
    } catch (e) {
      message.error(tx("fin_actionFailed", { err: e instanceof Error ? e.message : "" }));
    }
  }

  const selectedRows = rows.filter((r) => selected.includes(r.id));
  const mixedCustomers = new Set(selectedRows.map((r) => r.customerId)).size > 1;

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
          <span className="cz-cell-sub">{nameOf(r.customerId, tx("fin_unknownCustomer"))}</span>
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
          <Dropdown trigger={["click"]} menu={moreMenu(r)}>
            <Button size="small" type="text" aria-label={tx("fin_moreActions")} icon={<DotsThree size={18} weight="bold" />} />
          </Dropdown>
        </Space>
      ),
    },
  ];

  const aiFacts = {
    invoices: rows.length,
    openInvoices: openRows.length,
    overdueInvoices: overdueRows.length,
    drafts: counts.draft,
    outstanding: bal(openRows),
  };
  const aiLocal = `AR: ${rows.length} invoices, ${openRows.length} open (${bal(openRows)}), ${overdueRows.length} overdue, ${counts.draft} drafts.`;

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

  // ── Card groups (by urgency) ──
  const byDue = (a: Row, b: Row) => (daysUntil(a.dueDate) ?? 9999) - (daysUntil(b.dueDate) ?? 9999);
  const groups: { key: string; icon: typeof Wallet; tone: Tone; title: string; rows: Row[] }[] = [
    { key: "overdue", icon: WarningCircle, tone: "danger", title: tx("fin_tabOverdue"), rows: filtered.filter(isOverdue).sort(byDue) },
    { key: "soon", icon: Clock, tone: "warning", title: tx("fin_statDueWeek"), rows: filtered.filter(isSoon).sort(byDue) },
    {
      key: "open",
      icon: Wallet,
      tone: "primary",
      title: tx("fin_tabOpen"),
      rows: filtered.filter((r) => isOpen(r) && !isOverdue(r) && !isSoon(r)).sort(byDue),
    },
    { key: "draft", icon: PencilSimpleLine, tone: "neutral", title: tx("fin_tabDraft"), rows: filtered.filter((r) => r.status === "DRAFT") },
    { key: "paid", icon: CheckCircle, tone: "success", title: tx("fin_tabPaid"), rows: filtered.filter((r) => r.status === "PAID") },
  ];

  const card = (r: Row) => {
    const overdue = isOverdue(r);
    const soon = isSoon(r);
    const draft = r.status === "DRAFT";
    const paid = r.status === "PAID" || (!draft && r.balance <= 0);
    const custName = nameOf(r.customerId, tx("fin_unknownCustomer"));
    const received = Math.max(0, r.total - r.balance);
    return (
      <EntityCard
        key={r.id}
        tone={overdue ? "danger" : soon ? "warning" : "default"}
        media={<PersonAvatar name={custName} size={40} />}
        title={r.invoiceNumber}
        subtitle={custName}
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

  const summary = (
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
          <Tile icon={Wallet} tone="primary" value={noCents(bal(openRows))} label={tx("fin_statOutstanding")} to="/invoices?view=open" visual={<span className="fin-tile-n">{tx("fin_nInvoices", { n: openRows.length })}</span>} />
          <Tile
            icon={WarningCircle}
            tone={overdueRows.length ? "danger" : "neutral"}
            value={noCents(bal(overdueRows))}
            label={tx("fin_statOverdue")}
            to="/invoices?view=overdue"
            visual={<span className="fin-tile-n">{tx("fin_nInvoices", { n: overdueRows.length })}</span>}
          />
          <Tile
            icon={Clock}
            tone={weekRows.length ? "warning" : "neutral"}
            value={noCents(bal(weekRows))}
            label={tx("fin_statDueWeek")}
            to="/invoices?view=open"
            visual={<span className="fin-tile-n">{tx("fin_nInvoices", { n: weekRows.length })}</span>}
          />
          <Tile icon={FileText} tone="neutral" value={String(counts.draft)} label={tx("fin_statDrafts")} to="/invoices?view=draft" />
        </TileRow>
      </PageHeader>

      {billed > 0 ? summary : null}

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
        selects={[
          {
            key: "customer",
            placeholder: tx("fin_allCustomers"),
            value: customerFilter,
            onChange: setCustomerFilter,
            options: [...new Set(rows.map((r) => r.customerId))].map((id) => ({ value: id, label: nameOf(id, tx("fin_unknownCustomer")) })),
            width: 200,
          },
        ]}
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
        count={filtered.length}
        extra={
          <>
            {jobIdFilter ? <span className="fin-chip">{tx("fin_forJob", { no: numberOf(jobIdFilter) ?? "—" })}</span> : null}
            <ViewSwitch value={layout} onChange={setLayout} labels={{ cards: tx("viewCards"), list: tx("viewList") }} />
          </>
        }
      />

      {layout === "cards" ? (
        hasCards ? (
          groups
            .filter((g) => g.rows.length)
            .map((g) => {
              const limited = g.key === "paid" && !showAllPaid && g.rows.length > PAID_PREVIEW;
              const list = limited ? g.rows.slice(0, PAID_PREVIEW) : g.rows;
              return (
                <section key={g.key} className="fin-group" aria-label={g.title}>
                  <GroupHead
                    icon={g.icon}
                    tone={g.tone}
                    title={g.title}
                    count={g.rows.length}
                    extra={
                      g.key === "paid" && g.rows.length > PAID_PREVIEW ? (
                        <button type="button" className="cz-link-btn" onClick={() => setShowAllPaid((v) => !v)}>
                          {showAllPaid ? tx("fin_showLess") : tx("fin_showAll", { n: g.rows.length })}
                        </button>
                      ) : null
                    }
                  />
                  <CardGrid min={300}>{list.map(card)}</CardGrid>
                </section>
              );
            })
        ) : (
          <div className="fin-empty-line">
            <span>{rows.length ? tx("noResults") : tx("fin_emptyInvoices")}</span>
            {rows.length ? null : primary}
          </div>
        )
      ) : (
        <>
          {selected.length ? (
            <div className="fin-bulk" role="region" aria-label={tx("fin_selection")}>
              <span>{tx("fin_nSelected", { n: selected.length })}</span>
              {mixedCustomers ? <span className="fin-bulk-warn">{tx("fin_noteSameCustomer")}</span> : null}
              <Space wrap>
                <Button onClick={() => setSelected([])} type="text">
                  {tx("fin_clearSelection")}
                </Button>
                <Button type="primary" icon={<Receipt size={16} />} disabled={mixedCustomers} loading={bnMut.isPending} onClick={() => void createNote(selected)}>
                  {tx("fin_makeNote")}
                </Button>
              </Space>
            </div>
          ) : null}

          <MobileList
            empty={rows.length ? tx("noResults") : tx("fin_emptyInvoices")}
            items={filtered.map((r) => ({
              key: r.id,
              title: r.invoiceNumber,
              status: isOverdue(r) ? <StatusTag status="OVERDUE" /> : <StatusTag status={r.status} tone={r.status === "PARTIALLY_PAID" ? "warning" : undefined} />,
              sub: `${nameOf(r.customerId, tx("fin_unknownCustomer"))} · ${fmtDate(r.dueDate, locale)}`,
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
            loading={live && liveInv.isLoading}
            columns={columns}
            dataSource={filtered}
            rowSelection={{
              selectedRowKeys: selected,
              onChange: (keys) => setSelected(keys as string[]),
              getCheckboxProps: (r) => ({ disabled: r.status === "DRAFT", "aria-label": r.invoiceNumber }),
            }}
            emptyText={rows.length ? tx("noResults") : tx("fin_emptyInvoices")}
            emptyAction={rows.length ? undefined : primary}
          />
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
