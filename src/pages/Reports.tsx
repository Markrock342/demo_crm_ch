import { useMemo, useState } from "react";
import { AiError, aiBrief } from "../ai/client";
import { money } from "../crm";
import { openInvoiceTotal, overdueInvoices } from "../logistics";
import { useStore } from "../store";

const depts = ["sales", "ops", "finance", "yard"] as const;

export function ReportsPage() {
  const { tx, locale, boxes, deals, invoices, flash } = useStore();
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

  async function runBrief() {
    setBriefing(true);
    setBriefErr(null);
    try {
      const facts: Record<string, string | number | boolean> = { department: dept };
      for (const c of cards[dept]) facts[c.l] = c.n;
      const text = await aiBrief(locale, facts);
      setBrief(text);
    } catch (e) {
      setBriefErr(e instanceof AiError && e.code === "missing_key" ? tx("aiNoKey") : tx("aiError"));
    } finally {
      setBriefing(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{tx("reportsTitle")}</h1>
          <p>{tx("reportsHint")}</p>
        </div>
        <div className="toolbar">
          <button type="button" className="btn btn-ghost" onClick={runBrief} disabled={briefing}>
            {briefing ? tx("briefRunning") : tx("briefToday")}
          </button>
          <button type="button" className="btn btn-primary" onClick={exportCsv}>
            {tx("exportCsv")}
          </button>
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label={tx("reportsTitle")}>
        {depts.map((d) => (
          <button
            key={d}
            type="button"
            role="tab"
            aria-selected={dept === d}
            onClick={() => {
              setDept(d);
              setBrief(null);
              setBriefErr(null);
            }}
          >
            {tx(d === "sales" ? "deptSales" : d === "ops" ? "deptOps" : d === "finance" ? "deptFinance" : "deptYard")}
          </button>
        ))}
      </div>

      <section className="report-grid" aria-live="polite">
        {cards[dept].map((c) => (
          <div key={c.l}>
            <div className="num">{c.n}</div>
            <p className="lbl">{tx(c.l)}</p>
          </div>
        ))}
      </section>

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
    </div>
  );
}
