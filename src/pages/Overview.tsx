import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { aiBrief } from "../ai/client";
import { customerName, type Customer } from "../data";
import { jobGrossProfit } from "../ports/job.port.ts";
import { useShellBilling } from "../shell/billingStore.tsx";
import { useShellCrm } from "../shell/crmStore.tsx";
import { useShellJobs } from "../shell/jobStore.tsx";
import { useShellOps } from "../shell/opsStore.tsx";
import { useIsShellMode } from "../shell/session.tsx";
import { useShellSupport } from "../shell/supportStore.tsx";
import { useStore } from "../store";
import { jobDateIsToday } from "../lib/dates.ts";
import { PageToolbar } from "../ui/PageToolbar";

function arAgingBuckets(invoices: { balanceDue: number; dueDate?: string; status: string }[]) {
  const today = new Date().toISOString().slice(0, 10);
  const buckets = { b0: 0, b30: 0, b60: 0 };
  for (const i of invoices) {
    if (i.balanceDue <= 0) continue;
    const due = i.dueDate || today;
    const days = Math.floor((Date.parse(today) - Date.parse(due)) / 86400000);
    if (days <= 30) buckets.b0 += i.balanceDue;
    else if (days <= 60) buckets.b30 += i.balanceDue;
    else buckets.b60 += i.balanceDue;
  }
  return buckets;
}

import { uiV2 } from "../v2/config.ts";
import { OverviewPageV2 } from "../v2/pages/OverviewPage.tsx";

export function OverviewPage() {
  if (uiV2) return <OverviewPageV2 />;
  const shell = useIsShellMode();
  const { tx, locale } = useStore();
  const jobs = useShellJobs();
  const ops = useShellOps();
  const billing = useShellBilling();
  const support = useShellSupport();
  const crm = useShellCrm();
  const [mgmtReport, setMgmtReport] = useState<string | null>(null);
  const [reportBusy, setReportBusy] = useState(false);

  const activeJobs = jobs.jobs.filter((j) => j.status !== "CLOSED");
  const delayed = jobs.jobs.filter((j) => j.delayed);
  const missingDocs = support.docs.filter((d) => d.status === "late" || d.status === "wait");
  const outstanding = billing.invoices.filter((i) => i.balanceDue > 0);
  const teu = ops.boxes.reduce((n, b) => n + b.teu, 0);
  const inTransitTeu = ops.boxes.filter((b) => b.status === "in_transit" || b.status === "loaded").reduce((n, b) => n + b.teu, 0);
  const departing = jobs.jobs.filter((j) => jobDateIsToday(j.etd)).length;
  const arriving = jobs.jobs.filter((j) => jobDateIsToday(j.eta)).length;
  const gpMonth = jobs.jobs.reduce((n, j) => n + jobGrossProfit(j), 0);
  const aging = useMemo(() => arAgingBuckets(billing.invoices), [billing.invoices]);

  const byCustomer = useMemo(() => {
    const map = new Map<string, number>();
    for (const j of jobs.jobs) map.set(j.customerId, (map.get(j.customerId) ?? 0) + jobGrossProfit(j));
    return [...map.entries()]
      .map(([id, gp]) => ({ id, gp, c: crm.customers.find((x) => x.id === id) }))
      .sort((a, b) => b.gp - a.gp)
      .slice(0, 5);
  }, [crm.customers, jobs.jobs]);

  const byRoute = useMemo(() => {
    const map = new Map<string, number>();
    for (const j of jobs.jobs) {
      const key = `${j.pol}→${j.pod}`;
      map.set(key, (map.get(key) ?? 0) + jobGrossProfit(j));
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [jobs.jobs]);

  const bySales = useMemo(() => {
    const map = new Map<string, number>();
    for (const j of jobs.jobs) {
      const key = j.salesOwner || "—";
      map.set(key, (map.get(key) ?? 0) + jobGrossProfit(j));
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [jobs.jobs]);

  const exceptionPreview = useMemo(() => {
    const rows: { id: string; label: string; meta: string; to: string }[] = [];
    for (const j of delayed.slice(0, 3)) {
      rows.push({ id: `d-${j.id}`, label: j.jobNumber, meta: "ETA delayed", to: `/jobs/${j.id}` });
    }
    for (const d of missingDocs.slice(0, 3)) {
      rows.push({
        id: d.id,
        label: `${d.docType} · ${d.name}`,
        meta: d.status,
        to: d.jobId ? `/jobs/${d.jobId}` : "/docs?missing=1",
      });
    }
    return rows;
  }, [delayed, missingDocs]);

  async function runMgmtReport() {
    setReportBusy(true);
    const local = `Ops: ${activeJobs.length} active jobs, ${delayed.length} delayed, ${inTransitTeu} TEU in transit. Docs missing/wait: ${missingDocs.length}. AR open: ${outstanding.length} (0–30: ${aging.b0}, 31–60: ${aging.b30}, 61+: ${aging.b60}).`;
    try {
      const summary = await aiBrief(locale as "zh" | "th" | "en", {
        activeJobs: activeJobs.length,
        delayed: delayed.length,
        missingDocs: missingDocs.length,
        outstanding: outstanding.length,
        inTransitTeu,
        ar0_30: aging.b0,
        ar31_60: aging.b30,
        ar61: aging.b60,
      });
      setMgmtReport(summary || local);
    } catch (e) {
      void e;
      setMgmtReport(local);
    } finally {
      setReportBusy(false);
    }
  }

  if (!shell) {
    return (
      <div className="page page--workspace">
        <PageToolbar title={tx("navOverview")} hint={tx("apiNotConfigured")} />
        <p className="meta">{tx("apiNotConfigured")}</p>
        <Link to="/login">{tx("loginPickDept")}</Link>
      </div>
    );
  }

  return (
    <div className="page page--workspace">
      <PageToolbar
        title={tx("navOverview")}
        hint={`${tx("shellDataBadge")} · LogisticsOS`}
        actions={
          <>
            <button type="button" className="btn btn-ghost" disabled={reportBusy} onClick={() => void runMgmtReport()}>
              {reportBusy ? tx("runningGemini") : tx("aiMgmtReport")}
            </button>
            <Link className="btn btn-ghost" to="/exceptions">
              {tx("navExceptions")}
            </Link>
            <Link className="btn btn-primary" to="/jobs">
              {tx("navJobs")}
            </Link>
          </>
        }
      />
      {mgmtReport ? (
        <p className="meta panel" style={{ whiteSpace: "pre-wrap" }}>
          {mgmtReport}
        </p>
      ) : null}

      <section className="panel">
        <h2>{tx("arAging")}</h2>
        <div className="stat-row">
          <div>
            <span className="meta">0–30</span>
            <strong className="num">{aging.b0}</strong>
          </div>
          <div>
            <span className="meta">31–60</span>
            <strong className="num">{aging.b30}</strong>
          </div>
          <div>
            <span className="meta">61+</span>
            <strong className="num">{aging.b60}</strong>
          </div>
        </div>
      </section>

      <section className="kpis" aria-label={tx("navOverview")}>
        <div className="kpi-lead">
          <div className="num">{activeJobs.length}</div>
          <div className="lbl">{tx("dashActiveJobs")}</div>
        </div>
        <div className="kpi">
          <div className="num">{departing}</div>
          <div className="lbl">{tx("dashDeparting")}</div>
        </div>
        <div className="kpi">
          <div className="num">{arriving}</div>
          <div className="lbl">{tx("dashArriving")}</div>
        </div>
        <div className="kpi">
          <div className="num">{delayed.length}</div>
          <div className="lbl">{tx("dashDelayed")}</div>
        </div>
        <div className="kpi">
          <div className="num">{inTransitTeu}</div>
          <div className="lbl">{tx("dashInTransitTeu")}</div>
        </div>
        <div className="kpi">
          <div className="num">{missingDocs.length}</div>
          <div className="lbl">{tx("dashMissingDocs")}</div>
        </div>
        <div className="kpi">
          <div className="num">{outstanding.length}</div>
          <div className="lbl">{tx("dashOutstandingAr")}</div>
        </div>
        <div className="kpi">
          <div className="num">{teu}</div>
          <div className="lbl">TEU</div>
        </div>
        <div className="kpi">
          <div className="num">{gpMonth}</div>
          <div className="lbl">{tx("dashGpMonth")}</div>
        </div>
      </section>

      <section className="panel">
        <h2>{tx("exceptionsTitle")}</h2>
        <p className="meta">
          <Link to="/exceptions">{tx("exceptionOpenCenter")}</Link>
        </p>
        {exceptionPreview.length === 0 ? (
          <p className="empty">{tx("emptyShellCrm")}</p>
        ) : (
          <ul className="list-plain">
            {exceptionPreview.map((e) => (
              <li key={e.id}>
                <Link to={e.to}>
                  <strong>{e.label}</strong>
                </Link>{" "}
                <span className="meta">{e.meta}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="job-detail-grid">
        <section className="panel">
          <h2>{tx("profitByCustomer")}</h2>
          <ul className="list-plain">
            {byCustomer.map((r) => (
              <li key={r.id}>
                {r.c ? customerName(r.c as Customer, locale) : r.id}: <strong>{r.gp}</strong>
              </li>
            ))}
          </ul>
        </section>
        <section className="panel">
          <h2>{tx("profitByRoute")}</h2>
          <ul className="list-plain">
            {byRoute.map(([route, gp]) => (
              <li key={route}>
                {route}: <strong>{gp}</strong>
              </li>
            ))}
          </ul>
        </section>
        <section className="panel">
          <h2>{tx("profitBySales")}</h2>
          <ul className="list-plain">
            {bySales.map(([name, gp]) => (
              <li key={name}>
                {name}: <strong>{gp}</strong>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
