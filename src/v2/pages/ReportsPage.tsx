import {
  ArrowRight,
  Boat,
  CheckCircle,
  Cube,
  DownloadSimple,
  FileText,
  Handshake,
  Path,
  Percent,
  Receipt,
  Truck,
  UsersThree,
  Wallet,
  WarningCircle,
  type Icon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { App, Button, Segmented } from "antd";
import { useMemo, useState } from "react";
import { fetchInvoices, fetchJobReportSummary, fetchVendorBills } from "../../api/commercial.ts";
import { fetchInvoicesPage } from "../../api/lists.ts";
import { useStore } from "../../store";
import { AiBriefCard, BarList, Donut, Flag, Legend, PageHeader, Panel, PersonAvatar, SegmentBar, Tile, TileRow } from "../components";
import { useAppMode } from "../hooks/useAppMode.ts";
import { useLiveQuotations } from "../hooks/useCommercial.ts";
import { useCan } from "../hooks/useCan.ts";
import { useCustomerLookup } from "../hooks/useCustomerLookup.ts";
import { fmtMoney, fmtNumber } from "../lib/format.ts";
import { fmtTotals, noCents, useModeNote } from "./finance/financeKit.tsx";
import { CurrencyPick, type Tone } from "./finance/financeVisuals.tsx";

const depts = ["finance", "sales", "ops"] as const;
type Dept = (typeof depts)[number];

type Datum = { label: string; value: number; tone: Tone };

/** A metric tile that also feeds the CSV export. */
type Metric = { label: string; value: string; icon: Icon; tone: Tone; to?: string; hint?: string };

type Quote = { status: string; customerId: string };

function countBy<T>(list: T[], key: (t: T) => string, weight: (t: T) => number = () => 1) {
  const m = new Map<string, number>();
  for (const t of list) {
    const k = key(t);
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + weight(t));
  }
  return m;
}

function downloadCsv(name: string, text: string) {
  const blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

const csvCell = (v: string | number) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const CYCLE: Tone[] = ["primary", "info", "accent", "warning", "neutral", "success"];

function statusTone(status: string, i: number): Tone {
  const s = status.toUpperCase();
  if (/(DELIVER|CLOSED|COMPLET|ACCEPT|PAID|DONE)/.test(s)) return "success";
  if (/(DELAY|HOLD|EXCEPT|REJECT|OVERDUE|LATE)/.test(s)) return "danger";
  if (/(EXPIRE)/.test(s)) return "neutral";
  if (/(PENDING|UNBILLED|WAIT)/.test(s)) return "warning";
  if (/(SAIL|TRANSIT|ARRIV|INVOICED|SENT)/.test(s)) return "primary";
  if (/(BOOK|GATE|DRAFT)/.test(s)) return "info";
  return CYCLE[i % CYCLE.length]!;
}

/** Donut + legend (counts) — composition of one thing at a glance. */
function DonutBlock({ data, caption }: { data: Datum[]; caption: string }) {
  const { tx, locale } = useStore();
  const total = data.reduce((n, d) => n + d.value, 0);
  if (!total) return <div className="fin-chart-empty">{tx("fin_chartEmpty")}</div>;
  return (
    <div className="fin-donut-block">
      <Donut size={140} parts={data} center={fmtNumber(total, locale)} caption={caption} />
      <div className="fin-legend-col">
        <Legend items={data.filter((d) => d.value).map((d) => ({ tone: d.tone, label: d.label, value: fmtNumber(d.value, locale) }))} />
      </div>
    </div>
  );
}

export function ReportsPageV2() {
  const { live } = useAppMode();
  const { tx, locale } = useStore();
  const { message } = App.useApp();
  const can = useCan();
  const liveQuotes = useLiveQuotations();
  const canInv = live && can("invoice.view");
  // Server-side aggregates — nothing here downloads the full job / invoice lists.
  const invPage = useQuery({ queryKey: ["reports", "invoice-summary"], queryFn: () => fetchInvoicesPage({ limit: 1 }), enabled: canInv });
  const openInv = useQuery({ queryKey: ["reports", "open-invoices"], queryFn: () => fetchInvoicesPage({ view: "open", limit: 500 }), enabled: canInv });
  const jobSum = useQuery({ queryKey: ["reports", "jobs-summary"], queryFn: fetchJobReportSummary, enabled: live });
  const { nameOf } = useCustomerLookup();
  const modeNote = useModeNote();
  const [dept, setDept] = useState<Dept>("finance");
  const [curPick, setCurPick] = useState<string | undefined>();
  const [packBusy, setPackBusy] = useState(false);

  const statusLabel = (s: string) => {
    const k = `status_${s.toUpperCase()}`;
    const v = tx(k);
    return v === k ? s.replace(/_/g, " ").toLowerCase() : v;
  };

  const quotes: Quote[] = useMemo(() => (liveQuotes.data ?? []).map((q) => ({ status: q.status, customerId: q.customerId })), [liveQuotes.data]);

  // ── Finance ──
  const summary = invPage.data?.summary;
  const currencies = (summary?.currencies ?? []).map((c) => c.currency);
  const mainCurrency = curPick && currencies.includes(curPick) ? curPick : (currencies[0] ?? "USD");
  const agingBuckets: { key: "notDue" | "d1_30" | "d31_60" | "d60"; tone: Tone }[] = [
    { key: "notDue", tone: "primary" },
    { key: "d1_30", tone: "warning" },
    { key: "d31_60", tone: "accent" },
    { key: "d60", tone: "danger" },
  ];
  const mainAging = summary?.currencies.find((c) => c.currency === mainCurrency)?.aging;
  const aging: Datum[] = agingBuckets.map((b) => ({ label: tx(`fin_age_${b.key}`), tone: b.tone, value: mainAging?.[b.key] ?? 0 }));
  const billingOrder = ["UNBILLED", "INVOICED", "PARTIAL", "PAID"];
  const billingCounts = new Map(Object.entries(jobSum.data?.byBilling ?? {}));
  const byBilling: Datum[] = billingOrder.map((s, i) => ({ label: statusLabel(s), value: billingCounts.get(s) ?? 0, tone: statusTone(s, i) }));
  const topDebtors = [
    ...countBy(
      (openInv.data?.items ?? []).filter((i) => i.currency === mainCurrency),
      (i) => i.customerId,
      (i) => parseFloat(i.balanceDue) || 0,
    ).entries(),
  ]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const moneyMap = (list: { currency: string; amount: number }[] | undefined) => new Map((list ?? []).map((m) => [m.currency, m.amount]));
  const overdueCount = summary?.overdue.count ?? 0;
  const moneyFmt = (n: number) => fmtMoney(n, mainCurrency, locale).replace(/\.00$/, "");

  // ── Sales ──
  const quoteStatusOrder = ["DRAFT", "PENDING_APPROVAL", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"];
  const qCounts = countBy(quotes, (q) => q.status);
  const byQuoteStatus: Datum[] = [
    ...quoteStatusOrder.filter((s) => qCounts.has(s)),
    ...[...qCounts.keys()].filter((s) => !quoteStatusOrder.includes(s)),
  ].map((s, i) => ({ label: statusLabel(s), value: qCounts.get(s) ?? 0, tone: statusTone(s, i) }));
  const topCustomers = [...countBy(quotes, (q) => q.customerId).entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const accepted = qCounts.get("ACCEPTED") ?? 0;
  const decided = accepted + (qCounts.get("REJECTED") ?? 0) + (qCounts.get("EXPIRED") ?? 0);
  const winRate = decided ? Math.round((accepted / decided) * 100) : null;

  // ── Ops ──
  const jCounts = new Map(Object.entries(jobSum.data?.byStatus ?? {}).filter(([s]) => s));
  const byJobStatus: Datum[] = [...jCounts.entries()].sort((a, b) => b[1] - a[1]).map(([s, n], i) => ({ label: statusLabel(s), value: n, tone: statusTone(s, i) }));
  const lanes: [string, number][] = (jobSum.data?.lanes ?? []).map((l) => [`${l.pol}|${l.pod}`, l.containers]);
  const laneLabel = (key: string) => {
    const [pol, pod] = key.split("|");
    return (
      <span className="fin-lane-label" aria-label={`${pol} → ${pod}`}>
        <Flag code={pol} size={18} />
        {pol}
        <ArrowRight size={12} aria-hidden />
        <Flag code={pod} size={18} />
        {pod}
      </span>
    );
  };
  const custLabel = (id: string) => {
    const n = nameOf(id, tx("fin_unknownCustomer"));
    return (
      <span className="fin-cust-label">
        <PersonAvatar name={n} size={24} />
        <span>{n}</span>
      </span>
    );
  };
  const jobTotal = jobSum.data?.total ?? 0;
  const containers = jobSum.data?.containers ?? 0;
  const closedJobs = [...jCounts.entries()].filter(([s]) => ["CLOSED", "DELIVERED", "COMPLETED"].includes(s.toUpperCase())).reduce((n, [, c]) => n + c, 0);

  const statsByDept: Record<Dept, Metric[]> = {
    finance: [
      {
        label: tx("fin_statOutstanding"),
        value: fmtTotals(moneyMap(summary?.open.balance), locale, moneyFmt(0)),
        icon: Wallet,
        tone: "primary",
        to: "/invoices?view=open",
      },
      {
        label: tx("fin_statOverdue"),
        value: fmtTotals(moneyMap(summary?.overdue.balance), locale, moneyFmt(0)),
        hint: overdueCount ? tx("fin_nInvoices", { n: overdueCount }) : undefined,
        icon: WarningCircle,
        tone: overdueCount ? "danger" : "neutral",
        to: "/invoices?view=overdue",
      },
      { label: tx("fin_repUnbilledJobs"), value: fmtNumber(billingCounts.get("UNBILLED") ?? 0, locale), icon: Receipt, tone: "warning", to: "/jobs" },
      { label: tx("fin_statDrafts"), value: fmtNumber(invPage.data?.counts.draft ?? 0, locale), icon: FileText, tone: "neutral", to: "/invoices?view=draft" },
    ],
    sales: [
      { label: tx("fin_repQuotes"), value: fmtNumber(quotes.length, locale), icon: FileText, tone: "primary", to: "/quotations" },
      { label: tx("fin_repAccepted"), value: fmtNumber(accepted, locale), icon: Handshake, tone: "success" },
      { label: tx("fin_repWinRate"), value: winRate === null ? "—" : `${winRate}%`, icon: Percent, tone: "accent", hint: tx("fin_repWinRateHint") },
      { label: tx("fin_repActiveCustomers"), value: fmtNumber(new Set(quotes.map((q) => q.customerId)).size, locale), icon: UsersThree, tone: "info", to: "/customers" },
    ],
    ops: [
      { label: tx("fin_repJobs"), value: fmtNumber(jobTotal, locale), icon: Truck, tone: "primary", to: "/jobs" },
      { label: tx("fin_repOpenJobs"), value: fmtNumber(jobTotal - closedJobs, locale), icon: Boat, tone: "info" },
      { label: tx("fin_repContainers"), value: fmtNumber(containers, locale), icon: Cube, tone: "accent", to: "/containers" },
      { label: tx("fin_repLanes"), value: fmtNumber(jobSum.data?.laneCount ?? 0, locale), icon: Path, tone: "neutral" },
    ],
  };

  const facts = useMemo(() => {
    const f: Record<string, string | number> = { department: dept };
    for (const s of statsByDept[dept]) f[s.label] = String(s.value);
    return f;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dept, JSON.stringify(statsByDept[dept].map((s) => s.value))]);
  const localFallback = statsByDept[dept].map((s) => `${s.label}: ${String(s.value)}`).join(" · ");

  function exportCsv() {
    const lines = [["department", "metric", "value"], ...statsByDept[dept].map((s) => [dept, s.label, String(s.value)])];
    downloadCsv(`cangzhan-${dept}.csv`, lines.map((l) => l.map(csvCell).join(",")).join("\n"));
    message.success(tx("fin_csvDone"));
  }

  /** Full invoice + vendor-bill list, fetched only when the pack is exported. */
  async function exportAccountingPack() {
    setPackBusy(true);
    try {
      const [invoices, bills] = await Promise.all([canInv ? fetchInvoices() : Promise.resolve([]), fetchVendorBills().catch(() => [])]);
      const lines = [
        ["type", "number", "customerOrVendor", "amount", "balance", "currency", "status", "dueOrDate"],
        ...invoices.map((i) => [
          "invoice",
          i.invoiceNumber,
          nameOf(i.customerId, i.customerId),
          parseFloat(i.total) || 0,
          parseFloat(i.balanceDue) || 0,
          i.currency,
          i.status,
          i.dueDate || "",
        ]),
        ...bills.map((b) => ["vendor_bill", b.billNumber, b.vendorId, b.total, "", b.currency, b.status, b.dueDate ?? ""]),
      ];
      downloadCsv("cangzhan-accounting-pack.csv", lines.map((l) => l.map((x) => csvCell(x as string | number)).join(",")).join("\n"));
      message.success(tx("fin_csvDone"));
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setPackBusy(false);
    }
  }

  const count = (n: number) => fmtNumber(n, locale);

  const agingTotal = aging.reduce((n, a) => n + a.value, 0);

  return (
    <div className="cz-stack fin-page">
      <PageHeader
        title={tx("fin_reportsTitle")}
        subtitle={modeNote || undefined}
        extra={
          <>
            <AiBriefCard title={tx("fin_aiTitle")} facts={facts} localFallback={localFallback} context="reports" />
            <Button icon={<DownloadSimple size={16} />} loading={packBusy} onClick={() => void exportAccountingPack()}>
              {tx("fin_exportPack")}
            </Button>
            <Button type="primary" icon={<DownloadSimple size={16} />} onClick={exportCsv}>
              {tx("fin_exportCsv")}
            </Button>
          </>
        }
      >
        <Segmented
          value={dept}
          onChange={(v) => setDept(v as Dept)}
          options={depts.map((d) => ({ value: d, label: tx(`fin_dept_${d}`) }))}
          style={{ width: "fit-content" }}
        />
        <TileRow>
          {statsByDept[dept].map((m) => (
            <Tile
              key={m.label}
              icon={m.icon}
              tone={m.tone}
              value={noCents(m.value)}
              label={m.label}
              to={m.to}
              visual={m.hint ? <span className="fin-tile-n">{m.hint}</span> : undefined}
            />
          ))}
        </TileRow>
      </PageHeader>

      {dept === "finance" ? (
        <div className="fin-dash">
          <Panel title={tx("fin_chartAging")} extra={<CurrencyPick value={mainCurrency} options={currencies} onChange={setCurPick} />}>
            {agingTotal ? (
              <div className="fin-money-aging">
                <SegmentBar height={18} parts={aging} />
                <div className="fin-legend-col">
                  <Legend items={aging.map((a) => ({ tone: a.tone, label: a.label, value: moneyFmt(a.value) }))} />
                </div>
              </div>
            ) : (
              <div className="fin-chart-empty">
                <span className="fin-ok">
                  <CheckCircle size={18} weight="fill" aria-hidden /> {tx("fin_noBalance")}
                </span>
              </div>
            )}
          </Panel>
          <Panel title={tx("fin_chartBilling")}>
            <DonutBlock data={byBilling} caption={tx("fin_axisJobs")} />
          </Panel>
          <Panel title={tx("fin_chartTopDebtors")}>
            {topDebtors.length ? (
              <BarList
                tone="primary"
                items={topDebtors.map(([id, v]) => ({ label: custLabel(id), value: v, to: `/customers/${id}` }))}
                format={moneyFmt}
              />
            ) : (
              <div className="fin-chart-empty">{tx("fin_chartEmpty")}</div>
            )}
          </Panel>
        </div>
      ) : null}

      {dept === "sales" ? (
        <div className="fin-dash">
          <Panel title={tx("fin_chartQuoteStatus")}>
            <DonutBlock data={byQuoteStatus} caption={tx("fin_axisQuotes")} />
          </Panel>
          <Panel title={tx("fin_chartTopCustomers")}>
            {topCustomers.length ? (
              <BarList items={topCustomers.map(([id, n]) => ({ label: custLabel(id), value: n, to: `/customers/${id}` }))} format={count} />
            ) : (
              <div className="fin-chart-empty">{tx("fin_chartEmpty")}</div>
            )}
          </Panel>
        </div>
      ) : null}

      {dept === "ops" ? (
        <div className="fin-dash">
          <Panel title={tx("fin_chartJobStatus")}>
            <DonutBlock data={byJobStatus} caption={tx("fin_axisJobs")} />
          </Panel>
          <Panel title={tx("fin_chartLanes")}>
            {lanes.length ? (
              <BarList tone="info" items={lanes.map(([k, n]) => ({ label: laneLabel(k), value: n }))} format={(n) => `${count(n)} ${tx("fin_boxUnit")}`} />
            ) : (
              <div className="fin-chart-empty">{tx("fin_chartEmpty")}</div>
            )}
          </Panel>
        </div>
      ) : null}
    </div>
  );
}
