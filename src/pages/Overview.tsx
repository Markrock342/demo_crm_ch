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

export function OverviewPage() {
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
  const todayKey = "09-04";
  const departing = jobs.jobs.filter((j) => j.etd === todayKey || j.etd.endsWith("-04")).length;
  const arriving = jobs.jobs.filter((j) => j.eta === todayKey || j.eta.endsWith("-04")).length;
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
      rows.push({ id: `d-${j.id}`, label: j.jobNumber, meta: tx("etaDelayed"), to: `/jobs/${j.id}` });
    }
    for (const d of missingDocs.slice(0, 3)) {
      const statusLabel =
        d.status === "late" ? tx("docStatusLate") : d.status === "wait" ? tx("docStatusWait") : d.status;
      rows.push({
        id: d.id,
        label: `${d.docType} · ${d.name}`,
        meta: statusLabel,
        to: d.jobId ? `/jobs/${d.jobId}` : "/docs?missing=1",
      });
    }
    return rows;
  }, [delayed, missingDocs, tx]);

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
        <PageToolbar title={tx("navOverview")} />
        <p className="empty">{tx("apiNotConfigured")}</p>
        <p className="page-foot">
          <Link to="/login">{tx("loginPickDept")}</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="page page--workspace page--overview">
      <PageToolbar
        title={tx("navOverview")}
        hint={tx("shellDataBadge")}
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
        <p className="meta overview-report" style={{ whiteSpace: "pre-wrap" }}>
          {mgmtReport}
        </p>
      ) : null}

      <div className="stat-strip" aria-label={tx("navOverview")}>
        <span className="stat-chip stat-chip--metric">
          <strong className="num">{activeJobs.length}</strong>
          <span>{tx("dashActiveJobs")}</span>
        </span>
        <span className="stat-chip">
          <strong className="num">{departing}</strong>
          <span>{tx("dashDeparting")}</span>
        </span>
        <span className="stat-chip">
          <strong className="num">{arriving}</strong>
          <span>{tx("dashArriving")}</span>
        </span>
        <span className="stat-chip">
          <strong className="num">{delayed.length}</strong>
          <span>{tx("dashDelayed")}</span>
        </span>
        <span className="stat-chip">
          <strong className="num">{inTransitTeu}</strong>
          <span>{tx("dashInTransitTeu")}</span>
        </span>
        <span className="stat-chip">
          <strong className="num">{teu}</strong>
          <span>{tx("dashTeuTotal")}</span>
        </span>
        <span className="stat-chip">
          <strong className="num">{missingDocs.length}</strong>
          <span>{tx("dashMissingDocs")}</span>
        </span>
        <span className="stat-chip">
          <strong className="num">{outstanding.length}</strong>
          <span>{tx("dashOutstandingAr")}</span>
        </span>
        <span className="stat-chip">
          <strong className="num">{gpMonth}</strong>
          <span>{tx("dashGpMonth")}</span>
        </span>
      </div>

      <div className="stat-strip stat-strip--secondary" aria-label={tx("arAging")}>
        <span className="filter-strip-label">{tx("arAging")}</span>
        <span className="stat-chip">
          <strong className="num">{aging.b0}</strong>
          <span>0–30</span>
        </span>
        <span className="stat-chip">
          <strong className="num">{aging.b30}</strong>
          <span>31–60</span>
        </span>
        <span className="stat-chip">
          <strong className="num">{aging.b60}</strong>
          <span>61+</span>
        </span>
      </div>

      <section className="block">
        <div className="block-head">
          <h2>{tx("exceptionsTitle")}</h2>
          <Link className="btn btn-ghost btn-slim" to="/exceptions">
            {tx("exceptionOpenCenter")}
          </Link>
        </div>
        {exceptionPreview.length === 0 ? (
          <p className="empty">{tx("emptyExceptions")}</p>
        ) : (
          <ul className="dense-list">
            {exceptionPreview.map((e) => (
              <li key={e.id}>
                <Link to={e.to}>
                  <strong>{e.label}</strong>
                  <span className="meta">{e.meta}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="rank-grid">
        <section className="block">
          <div className="block-head">
            <h2>{tx("profitByCustomer")}</h2>
          </div>
          <ul className="dense-list">
            {byCustomer.map((r) => (
              <li key={r.id}>
                <span>{r.c ? customerName(r.c as Customer, locale) : r.id}</span>
                <strong className="num">{r.gp}</strong>
              </li>
            ))}
          </ul>
        </section>
        <section className="block">
          <div className="block-head">
            <h2>{tx("profitByRoute")}</h2>
          </div>
          <ul className="dense-list">
            {byRoute.map(([route, gp]) => (
              <li key={route}>
                <span className="mono">{route}</span>
                <strong className="num">{gp}</strong>
              </li>
            ))}
          </ul>
        </section>
        <section className="block">
          <div className="block-head">
            <h2>{tx("profitBySales")}</h2>
          </div>
          <ul className="dense-list">
            {bySales.map(([name, gp]) => (
              <li key={name}>
                <span>{name}</span>
                <strong className="num">{gp}</strong>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
