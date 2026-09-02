import { useState } from "react";
import { AiError, aiBrief } from "../ai/client";
import { useStore } from "../store";

const depts = ["sales", "ops", "finance", "yard"] as const;

export function ReportsPage() {
  const { tx, locale, customers, boxes, flash } = useStore();
  const [dept, setDept] = useState<(typeof depts)[number]>("sales");
  const [brief, setBrief] = useState<string | null>(null);
  const [briefing, setBriefing] = useState(false);
  const [briefErr, setBriefErr] = useState<string | null>(null);

  const hold = boxes.filter((b) => b.status === "hold").length;
  const empty = boxes.filter((b) => b.status === "empty").length;
  const yard = boxes.filter((b) => b.status === "yard" || b.status === "empty" || b.status === "hold");
  const teu = yard.reduce((n, b) => n + b.teu, 0);
  const overdue = customers.filter((c) => c.arDays >= 30);
  const ar = customers.reduce((n, c) => n + c.arDays * 4200, 0);

  const cards = {
    sales: [
      { n: "¥ 2.4M", l: "salesPipe" },
      { n: "86 TEU", l: "salesWon" },
      { n: `19 ${tx("days")}`, l: "salesCycle" },
    ],
    ops: [
      { n: "93%", l: "opsOnTime" },
      { n: String(hold), l: "opsException" },
      { n: String(boxes.filter((b) => b.status === "yard").length), l: "opsDwell" },
    ],
    finance: [
      { n: `¥ ${ar.toLocaleString()}`, l: "finAr" },
      { n: "¥ 610,000", l: "finCollected" },
      { n: String(overdue.length), l: "finOverdue" },
    ],
    yard: [
      { n: `${Math.round((teu / 120) * 100)}%`, l: "yardFill" },
      { n: "18", l: "yardIn" },
      { n: "11", l: "yardOut" },
    ],
  } as const;

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
      {dept === "yard" ? <p className="meta">{tx("occupancy")} · {empty} {tx("stEmpty")}</p> : null}
    </div>
  );
}
