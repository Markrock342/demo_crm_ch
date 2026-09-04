import { AiError, aiBrief } from "../ai/client";
import { money } from "../crm";
import { openInvoiceTotal, overdueInvoices } from "../logistics";
import { useIsShellMode } from "../shell/session.tsx";
import { useShellBilling } from "../shell/billingStore.tsx";
import { useShellSupport } from "../shell/supportStore.tsx";
import { useStore } from "../store";
import { PageToolbar } from "../ui/PageToolbar";
import { useMemo, useState } from "react";
import { uiV2 } from "../v2/config.ts";
import { ReportsPageV2 } from "../v2/pages/ReportsPage.tsx";

const depts = ["sales", "ops", "finance", "yard"] as const;

export function ReportsPage() {
  if (uiV2) return <ReportsPageV2 />;

  const shell = useIsShellMode();
  const { tx, locale, boxes, deals, invoices, flash } = useStore();
  const billing = useShellBilling();
  const support = useShellSupport();
  const [dept, setDept] = useState<(typeof depts)[number]>("sales");
  const [brief, setBrief] = useState<string | null>(null);
  const [briefing, setBriefing] = useState(false);
  const [briefErr, setBriefErr] = useState<string | null>(null);

  const hold = boxes.filter((b) => b.status === "hold").length;
  const empty = boxes.filter((b) => b.status === "empty").length;
  const yardBoxes = boxes.filter((b) => b.status === "yard" || b.status === "empty" || b.status === "hold");
  const teu = yardBoxes.reduce((n, b) => n + b.teu, 0);
  const activeBoxes = boxes.filter((b) => b.status !== "empty").length;
  const onTimePct = activeBoxes ? Math.round(((activeBoxes - hold) / activeBoxes) * 100) : 100;

  const openPipe = deals.filter((d) => d.stage !== "billed").reduce((n, d) => n + d.value, 0);
  const wonTeu = deals.filter((d) => d.stage === "won" || d.stage === "book" || d.stage === "billed").reduce((n, d) => n + d.teu, 0);
  const pending = deals.filter((d) => d.stage !== "billed");
  const cycleDays = pending.length
    ? Math.round(
        pending.reduce((n, d) => {
          const day = Number.parseInt(d.close.split("-")[1] ?? "15", 10);
          const now = new Date().getDate();
          return n + Math.max(1, day - now + 14);
        }, 0) / pending.length,
      )
    : 0;

  const arOpen = openInvoiceTotal(invoices);
  const collected = invoices.filter((i) => i.status === "paid").reduce((n, i) => n + i.amount, 0);
  const overdueN = overdueInvoices(invoices).length;
  const yardIn = boxes.filter((b) => b.status === "yard" || b.status === "hold").length;
  const yardOut = boxes.filter((b) => b.status === "sail").length;

  const cards = useMemo(
    () =>
      ({
        sales: [
          { n: money(openPipe), l: "salesPipe" },
          { n: `${wonTeu} TEU`, l: "salesWon" },
          { n: `${cycleDays} ${tx("days")}`, l: "salesCycle" },
        ],
        ops: [
          { n: `${onTimePct}%`, l: "opsOnTime" },
          { n: String(hold), l: "opsException" },
          { n: String(boxes.filter((b) => b.status === "yard").length), l: "opsDwell" },
        ],
        finance: [
          { n: money(arOpen), l: "finAr" },
          { n: money(collected), l: "finCollected" },
          { n: String(overdueN), l: "finOverdue" },
        ],
        yard: [
          { n: `${Math.min(100, Math.round((teu / 120) * 100))}%`, l: "yardFill" },
          { n: String(yardIn), l: "yardIn" },
          { n: String(yardOut), l: "yardOut" },
        ],
      }) as const,
    [arOpen, boxes, collected, cycleDays, hold, onTimePct, openPipe, overdueN, teu, tx, wonTeu, yardIn, yardOut],
  );

  function exportCsv() {
    const header = "dept,metric,value\n";
    const lines = cards[dept].map((c) => `${dept},${tx(c.l)},${c.n}`).join("\n");
    const blob = new Blob([header + lines], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `cangzhan-${dept}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    flash("csvDone");
  }

  function exportAccountingPack() {
    const inv = shell ? billing.invoices : invoices;
    const bills = shell ? support.vendorBills : [];
    const invLines = [
      "type,number,customerOrVendor,amount,currency,status,dueOrDate",
      ...inv.map((i) => {
        const num = "invoiceNumber" in i ? i.invoiceNumber : (i as { id: string }).id;
        const amt = "total" in i ? i.total : (i as { amount: number }).amount;
        const due = "dueDate" in i ? i.dueDate : "";
        const cust = "customerId" in i ? i.customerId : "";
        return `invoice,${num},${cust},${amt},${i.currency},${i.status},${due ?? ""}`;
      }),
      ...bills.map((b) => `vendor_bill,${b.billNumber},${b.vendorName},${b.amount},${b.currency},${b.status},${b.createdAt}`),
    ].join("\n");
    const blob = new Blob([invLines], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "cangzhan-accounting-pack.csv";
    a.click();
    URL.revokeObjectURL(a.href);
    flash("csvDone");
  }

  async function runBrief() {
    setBriefing(true);
    setBriefErr(null);
    try {
      const facts: Record<string, string | number | boolean> = { department: dept };
      for (const c of cards[dept]) facts[c.l] = c.n;
      const text = await aiBrief(locale, facts, "reports");
      setBrief(text.summary);
    } catch (e) {
      setBriefErr(e instanceof AiError && e.code === "missing_key" ? tx("aiNoKey") : tx("aiError"));
    } finally {
      setBriefing(false);
    }
  }

  const deptLabel = (d: (typeof depts)[number]) =>
    tx(d === "sales" ? "deptSales" : d === "ops" ? "deptOps" : d === "finance" ? "deptFinance" : "deptYard");

  return (
    <div className="page page--workspace page--reports">
      <PageToolbar
        title={tx("reportsTitle")}
        hint={tx("reportsHint")}
        actions={
          <>
            <button type="button" className="btn btn-ghost" onClick={runBrief} disabled={briefing}>
              {briefing ? tx("briefRunning") : tx("briefToday")}
            </button>
            <button type="button" className="btn btn-primary" onClick={exportCsv}>
              {tx("exportCsv")}
            </button>
            <button type="button" className="btn btn-ghost" onClick={exportAccountingPack}>
              {tx("exportAccountingPack")}
            </button>
          </>
        }
        filters={
          <div className="filter-row" role="tablist" aria-label={tx("reportsTitle")}>
            {depts.map((d) => (
              <button
                key={d}
                type="button"
                role="tab"
                aria-selected={dept === d}
                className={`filter-chip${dept === d ? " is-on" : ""}`}
                onClick={() => {
                  setDept(d);
                  setBrief(null);
                  setBriefErr(null);
                }}
              >
                {deptLabel(d)}
              </button>
            ))}
          </div>
        }
      />

      <div className="stat-strip report-metrics" aria-live="polite">
        {cards[dept].map((c) => (
          <span key={c.l} className="stat-chip stat-chip--metric">
            <strong className="num">{c.n}</strong>
            <span>{tx(c.l)}</span>
          </span>
        ))}
      </div>

      <section className="block report-insight">
        <p className="insight">
          {brief ??
            tx(
              dept === "sales"
                ? "insightSales"
                : dept === "ops"
                  ? "insightOps"
                  : dept === "finance"
                    ? "insightFin"
                    : "insightYard",
            )}
        </p>
        {briefErr ? (
          <p className="field-err" role="alert">
            {briefErr}
          </p>
        ) : null}
        {dept === "yard" ? (
          <p className="meta">
            {tx("occupancy")} · {empty} {tx("stEmpty")}
          </p>
        ) : null}
      </section>
    </div>
  );
}
