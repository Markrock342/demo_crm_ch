import { CheckCircle, HourglassMedium, PaperPlaneTilt, PencilSimpleLine, Plus, XCircle, type Icon } from "@phosphor-icons/react";
import { Button } from "antd";
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { QuotationRow } from "../../api/commercial.ts";
import { useShellQuotes } from "../../shell/quoteStore.tsx";
import { useStore } from "../../store";
import {
  AiBriefCard,
  Board,
  DataTable,
  EmptyState,
  EntityCard,
  ErrorState,
  FilterBar,
  LaneCell,
  LoadingState,
  PageHeader,
  RouteTrack,
  StatusTag,
  ViewSwitch,
  readView,
  writeView,
} from "../components";
import { useAppMode } from "../hooks/useAppMode.ts";
import { useLiveQuotations } from "../hooks/useCommercial.ts";
import { useCustomerLookup } from "../hooks/useCustomerLookup.ts";
import { fmtDate, fmtMoney } from "../lib/format.ts";
import { JobsStackList } from "./JobsStackList.tsx";
import { QUOTE_TAB_STATUSES, useIsPhone } from "./jobsShared.ts";
import { CompanyMark, ContainerChip, DateChip } from "./SalesMobileList.tsx";
import { daysUntil, fmtShortDate, placeCode, type GfxTone } from "./salesUtil.ts";
import "./jobs.css";
import "./sales.css";

const QUOTE_COLUMNS: { key: string; label: string; icon: Icon; tone: GfxTone }[] = [
  { key: "draft", label: "jobs_qTabDraft", icon: PencilSimpleLine, tone: "neutral" },
  { key: "approval", label: "jobs_qTabApproval", icon: HourglassMedium, tone: "warning" },
  { key: "sent", label: "jobs_qTabSent", icon: PaperPlaneTilt, tone: "info" },
  { key: "accepted", label: "jobs_qTabAccepted", icon: CheckCircle, tone: "success" },
  { key: "closed", label: "jobs_q_tabClosed", icon: XCircle, tone: "neutral" },
];

const OPEN_STATUSES = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "SENT"];

export function QuotationsPageV2() {
  const { shell, live } = useAppMode();
  const { tx, locale } = useStore();
  const quoteStore = useShellQuotes();
  const liveQ = useLiveQuotations();
  const navigate = useNavigate();
  const { nameOf, customers } = useCustomerLookup();
  const [params, setParams] = useSearchParams();
  const phone = useIsPhone();
  const loadText = (r: QuotationRow) => (r.containerType ? `${r.containerType} × ${r.quantity}` : `× ${r.quantity}`);

  const tab = params.get("tab") && QUOTE_TAB_STATUSES[params.get("tab")!] ? params.get("tab")! : "all";
  const setTab = (v: string) => {
    const next = new URLSearchParams(params);
    if (v === "all") next.delete("tab");
    else next.set("tab", v);
    setParams(next, { replace: true });
  };
  const [view, setViewState] = useState(() => readView("quotations"));
  const setView = (v: "cards" | "list") => {
    setViewState(v);
    writeView("quotations", v);
  };
  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState<string | undefined>();

  const rows: QuotationRow[] = useMemo(
    () =>
      shell
        ? quoteStore.quotations.map((q) => ({
            id: q.id,
            quotationNumber: q.quotationNumber,
            customerId: q.customerId,
            origin: q.origin,
            destination: q.destination,
            pol: q.pol,
            pod: q.pod,
            mode: q.mode,
            containerType: q.containerType,
            quantity: q.quantity,
            currency: q.currency,
            status: q.status,
            currentRevision: q.revision,
            validUntil: q.validUntil || null,
          }))
        : (liveQ.data ?? []),
    [shell, quoteStore.quotations, liveQ.data],
  );

  const inTab = (r: QuotationRow, t: string) => t === "all" || (QUOTE_TAB_STATUSES[t] ?? []).includes(String(r.status));

  const q = search.trim().toLowerCase();
  const baseFiltered = rows.filter((r) => {
    if (customerId && r.customerId !== customerId) return false;
    if (!q) return true;
    return `${r.quotationNumber} ${nameOf(r.customerId, "")} ${r.pol} ${r.pod} ${r.origin} ${r.destination}`.toLowerCase().includes(q);
  });
  const filtered = baseFiltered.filter((r) => inTab(r, view === "cards" ? "all" : tab));
  /** Quote total(s): one amount in the quote currency, or one per charge currency when they can't be combined. */
  const amountOf = useMemo(() => {
    const m: Record<string, { amount: number; currency: string }[]> = {};
    if (shell) for (const q of quoteStore.quotations) if (q.totalSell) m[q.id] = [{ amount: q.totalSell, currency: q.currency }];
    for (const r of liveQ.data ?? []) {
      if (r.totalSell !== null && r.totalSell !== undefined) m[r.id] = [{ amount: Number(r.totalSell), currency: r.currency }];
      else if (r.totalsByCurrency && Object.keys(r.totalsByCurrency).length)
        m[r.id] = Object.entries(r.totalsByCurrency).map(([currency, v]) => ({ amount: Number(v), currency }));
    }
    return m;
  }, [shell, quoteStore.quotations, liveQ.data]);
  const amountText = (id: string) => (amountOf[id] ?? []).map((a) => fmtMoney(a.amount, a.currency, locale)).join(" + ");
  const count = (t: string) => baseFiltered.filter((r) => inTab(r, t)).length;

  const active = rows.filter((r) => ["DRAFT", "PENDING_APPROVAL", "APPROVED", "SENT"].includes(String(r.status))).length;
  const today = new Date().toISOString().slice(0, 10);

  const quoteFacts = {
    quotations: rows.length,
    draft: rows.filter((r) => r.status === "DRAFT").length,
    sent: rows.filter((r) => r.status === "SENT").length,
    accepted: rows.filter((r) => r.status === "ACCEPTED").length,
  };
  const quoteLocal = `Quotation pipeline: ${rows.length} total — ${quoteFacts.draft} draft, ${quoteFacts.sent} sent, ${quoteFacts.accepted} accepted.`;

  const quoteCard = (r: QuotationRow) => {
    const open = OPEN_STATUSES.includes(String(r.status));
    const left = daysUntil(r.validUntil);
    const expired = open && left !== null && left < 0;
    const soon = open && left !== null && left >= 0 && left <= 7;
    const customer = nameOf(r.customerId);
    const amount = amountOf[r.id];
    return (
      <EntityCard
        key={r.id}
        to={`/quotations/new?quote=${r.id}`}
        tone={expired ? "danger" : soon ? "warning" : "default"}
        media={<CompanyMark name={customer} size={36} />}
        title={<span className="cz-mono">{r.quotationNumber}</span>}
        subtitle={customer}
        footer={
          <>
            <ContainerChip type={r.containerType} qty={r.quantity} />
            {r.validUntil ? (
              <DateChip
                label={fmtShortDate(r.validUntil, locale)}
                tone={expired ? "danger" : soon ? "warning" : undefined}
                title={`${tx("jobs_qColValid")} ${fmtDate(r.validUntil, locale)}${expired ? ` · ${tx("jobs_qExpired")}` : ""}`}
              />
            ) : null}
          </>
        }
      >
        <RouteTrack
          from={r.pol || placeCode(r.origin)}
          to={r.pod || placeCode(r.destination)}
          progress={null}
          done={String(r.status) === "ACCEPTED"}
          size="sm"
        />
        {amount?.length ? (
          <span className="sales-quote-amount" title={amount.length > 1 ? tx("fd_qMixed") : tx("fd_qTotal")}>
            {amountText(r.id)}
          </span>
        ) : null}
      </EntityCard>
    );
  };

  const newButton = (
    <Link to="/quotations/new">
      <Button type="primary" icon={<Plus size={16} aria-hidden />}>
        {tx("jobs_qNew")}
      </Button>
    </Link>
  );

  if (!shell && !live) {
    return (
      <>
        <PageHeader title={tx("jobs_qTitle")} />
        <ErrorState title={tx("apiNotConfigured")} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={tx("jobs_qTitle")}
        subtitle={tx("jobs_qSub", { n: rows.length, active })}
        extra={
          <>
            <ViewSwitch value={view} onChange={setView} labels={{ cards: tx("viewCards"), list: tx("viewList") }} />
            <AiBriefCard title={tx("aiMgmtReport")} facts={quoteFacts} localFallback={quoteLocal} />
            {newButton}
          </>
        }
      >
        {rows.length ? (
          <div className="jobs-filters">
            <FilterBar
              tabs={
                view === "cards"
                  ? undefined
                  : {
                      value: tab,
                      onChange: setTab,
                      options: [
                        {
                          value: "all",
                          label: tx("jobs_qTabAll"),
                          count: count("all"),
                        },
                        {
                          value: "draft",
                          label: tx("jobs_qTabDraft"),
                          count: count("draft"),
                        },
                        {
                          value: "approval",
                          label: tx("jobs_qTabApproval"),
                          count: count("approval"),
                        },
                        {
                          value: "sent",
                          label: tx("jobs_qTabSent"),
                          count: count("sent"),
                        },
                        {
                          value: "accepted",
                          label: tx("jobs_qTabAccepted"),
                          count: count("accepted"),
                        },
                      ],
                    }
              }
              search={{
                value: search,
                onChange: setSearch,
                placeholder: tx("jobs_qSearch"),
              }}
              selects={[
                {
                  key: "customer",
                  placeholder: tx("jobs_allCustomers"),
                  value: customerId,
                  onChange: setCustomerId,
                  options: customers.map((c) => ({
                    value: c.id,
                    label: nameOf(c.id),
                  })),
                  width: 200,
                },
              ]}
              onClear={() => {
                setSearch("");
                setCustomerId(undefined);
                setTab("all");
              }}
              count={filtered.length}
            />
          </div>
        ) : null}
      </PageHeader>

      {live && liveQ.isError ? (
        <ErrorState title={tx("jobs_loadFailed")} action={<Button onClick={() => void liveQ.refetch()}>{tx("jobs_retry")}</Button>} />
      ) : !rows.length && !(live && liveQ.isLoading) ? (
        <div className="cz-table">
          <EmptyState title={tx("jobs_qEmpty")} description={tx("jobs_qEmptyDesc")} action={newButton} />
        </div>
      ) : view === "cards" ? (
        live && liveQ.isLoading ? (
          <LoadingState />
        ) : (
          <div className="sales-qboard">
            <Board
              columns={QUOTE_COLUMNS.map((c) => {
                const col = filtered.filter((r) => inTab(r, c.key));
                return {
                  key: c.key,
                  icon: c.icon,
                  tone: c.tone,
                  title: tx(c.label),
                  count: col.length,
                  children: col.length ? col.map(quoteCard) : <p className="sales-col-empty">{tx("jobs_q_colEmpty")}</p>,
                };
              })}
            />
          </div>
        )
      ) : phone ? (
        <JobsStackList
          loading={live && liveQ.isLoading}
          emptyText={tx("jobs_qNoMatch")}
          items={filtered.map((r) => ({
            key: r.id,
            title: r.quotationNumber,
            status: <StatusTag status={String(r.status)} />,
            sub: (
              <>
                <span>{nameOf(r.customerId)}</span>
                <LaneCell from={r.pol} to={r.pod} />
                {amountOf[r.id]?.length ? <strong className="cz-num">{amountText(r.id)}</strong> : null}
              </>
            ),
            onOpen: () => navigate(`/quotations/new?quote=${r.id}`),
          }))}
        />
      ) : (
        <DataTable<QuotationRow>
          rowKey="id"
          loading={live && liveQ.isLoading}
          dataSource={filtered}
          emptyText={tx("jobs_qNoMatch")}
          onRowClick={(r) => navigate(`/quotations/new?quote=${r.id}`)}
          columns={[
            {
              title: tx("jobs_qColNo"),
              key: "no",
              render: (_, r) => (
                <>
                  <span className="cz-cell-main jobs-nowrap">{r.quotationNumber}</span>
                  <span className="cz-cell-sub">{nameOf(r.customerId)}</span>
                </>
              ),
            },
            {
              title: tx("jobs_colStatus"),
              key: "status",
              render: (_, r) => <StatusTag status={String(r.status)} />,
            },
            {
              title: tx("jobs_colLane"),
              key: "lane",
              render: (_, r) => <LaneCell from={r.pol} to={r.pod} title={[r.origin, r.destination].filter(Boolean).join(" → ")} />,
            },
            {
              title: tx("jobs_qColLoad"),
              key: "load",
              render: (_, r) => <span className="jobs-vessel">{loadText(r)}</span>,
            },
            {
              title: tx("fd_qTotal"),
              key: "total",
              align: "right",
              render: (_, r) =>
                amountOf[r.id]?.length ? (
                  <span className="cz-num jobs-nowrap" title={amountOf[r.id]!.length > 1 ? tx("fd_qMixed") : undefined}>
                    {amountText(r.id)}
                  </span>
                ) : (
                  <span className="cz-muted">—</span>
                ),
            },
            {
              title: tx("jobs_qColValid"),
              key: "valid",
              render: (_, r) => {
                if (!r.validUntil) return <span className="cz-muted">—</span>;
                const expired = String(r.validUntil).slice(0, 10) < today && !["ACCEPTED", "REJECTED"].includes(String(r.status));
                return (
                  <>
                    <span className="jobs-nowrap">{fmtDate(r.validUntil, locale)}</span>
                    {expired ? <span className="cz-cell-sub jobs-text-danger">{tx("jobs_qExpired")}</span> : null}
                  </>
                );
              },
            },
          ]}
        />
      )}
    </>
  );
}
