import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { fetchJobFinancials, fetchJobs, type JobFinancials, type JobRow } from "../api/commercial.ts";
import { fetchJobMilestones, patchJobMilestone, type MilestoneDto } from "../api/operations.ts";
import { demoJobPnl, demoJobs } from "../demo/commercial-demo.ts";
import {
  demoMilestonesForJob,
  enrichDemoJobs,
  filterJobsByMilestoneSummary,
  formatMilestoneDate,
} from "../demo/milestones-demo.ts";
import { customerName } from "../data.ts";
import { useAuth } from "../auth/AuthProvider.tsx";
import { useStore } from "../store.tsx";
import { DemoModuleBanner } from "../ui/DemoModuleBanner.tsx";
import { JobMilestoneList } from "../ui/JobMilestoneList.tsx";
import { PageToolbar } from "../ui/PageToolbar.tsx";

type MilestoneFilter = "all" | "at_risk" | "pending";

export function JobsPage() {
  const { tx, locale, customers } = useStore();
  const { mode, user } = useAuth();
  const [params] = useSearchParams();
  const isDemo = mode === "demo";

  const [rows, setRows] = useState<JobRow[]>([]);
  const [milestoneFilter, setMilestoneFilter] = useState<MilestoneFilter>("all");
  const [selected, setSelected] = useState<string | null>(params.get("selected") ?? demoJobs[0]?.id ?? null);
  const [tab, setTab] = useState<"overview" | "financial">("overview");
  const [financials, setFinancials] = useState<JobFinancials | null>(null);
  const [milestones, setMilestones] = useState<MilestoneDto[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const demoRows = useMemo(() => enrichDemoJobs(demoJobs), []);
  const sourceRows = isDemo ? demoRows : rows;
  const displayRows = useMemo(() => filterJobsByMilestoneSummary(sourceRows, milestoneFilter), [milestoneFilter, sourceRows]);

  const customerMap = useMemo(() => Object.fromEntries(customers.map((c) => [c.id, c])), [customers]);
  const job = displayRows.find((j) => j.id === selected) ?? displayRows[0] ?? null;

  useEffect(() => {
    if (selected || !displayRows[0]) return;
    setSelected(displayRows[0].id);
  }, [displayRows, selected]);

  useEffect(() => {
    if (isDemo || mode !== "production" || !user) return;
    void fetchJobs()
      .then(setRows)
      .catch(() => setMsg(tx("errorLoad")));
  }, [isDemo, mode, tx, user]);

  useEffect(() => {
    if (!selected || tab !== "financial") {
      setFinancials(null);
      return;
    }
    if (isDemo) {
      const p = demoJobPnl(selected);
      setFinancials({
        revenue: p.revenue,
        cost: p.cost,
        totalRevenue: p.totalRevenue,
        totalCost: p.totalCost,
        grossProfit: p.grossProfit,
        marginPct: p.marginPct,
      });
      return;
    }
    void fetchJobFinancials(selected)
      .then(setFinancials)
      .catch(() => setMsg(tx("errorLoad")));
  }, [selected, tab, tx, isDemo]);

  useEffect(() => {
    if (!selected) {
      setMilestones([]);
      return;
    }
    if (isDemo) {
      setMilestones(demoMilestonesForJob(selected));
      return;
    }
    void fetchJobMilestones(selected)
      .then(setMilestones)
      .catch(() => setMsg(tx("errorLoad")));
  }, [isDemo, selected, tx]);

  async function toggleMilestone(code: string, complete: boolean) {
    if (!selected) return;
    try {
      if (isDemo) {
        setMilestones((list) =>
          list.map((m) =>
            m.code === code ? { ...m, actualAt: complete ? new Date().toISOString() : null } : m,
          ),
        );
      } else {
        const row = await patchJobMilestone(selected, code, complete);
        setMilestones((list) => list.map((m) => (m.code === code ? row : m)));
        const refreshed = await fetchJobs();
        setRows(refreshed);
      }
    } catch {
      setMsg(tx("errorSave"));
    }
  }

  const filterCounts = useMemo(
    () => ({
      all: sourceRows.length,
      at_risk: filterJobsByMilestoneSummary(sourceRows, "at_risk").length,
      pending: filterJobsByMilestoneSummary(sourceRows, "pending").length,
    }),
    [sourceRows],
  );

  return (
    <div className="page page--workspace page--split page--jobs">
      <PageToolbar
        title={tx("jobsTitle")}
        count={displayRows.length}
        hint={isDemo ? tx("jobsDemoPreviewHint") : tx("jobsHint")}
        actions={
          isDemo ? (
            <Link to="/shipments" className="btn btn-ghost">
              {tx("navShipments")}
            </Link>
          ) : null
        }
        filters={
          <div className="filter-row" role="tablist" aria-label={tx("milestonesTitle")}>
            {(["all", "at_risk", "pending"] as const).map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={milestoneFilter === f}
                className={`filter-chip${milestoneFilter === f ? " is-on" : ""}`}
                onClick={() => setMilestoneFilter(f)}
              >
                <span>
                  {f === "all" ? tx("milestoneFilterAll") : f === "at_risk" ? tx("milestoneFilterAtRisk") : tx("milestoneFilterPending")}
                </span>
                <em>{filterCounts[f]}</em>
              </button>
            ))}
          </div>
        }
      />

      {isDemo ? <DemoModuleBanner /> : null}
      {msg ? <p className="meta">{msg}</p> : null}

      <div className="split-panels">
        <div className="panel">
          <h2>{tx("jobsList")}</h2>
          <ul className="list-plain">
            {displayRows.map((j) => (
              <li key={j.id}>
                <button type="button" className={`list-btn${selected === j.id ? " is-active" : ""}`} onClick={() => setSelected(j.id)}>
                  <strong>{j.jobNumber}</strong>
                  <span className="meta">{customerMap[j.customerId] ? customerName(customerMap[j.customerId], locale) : j.customerId}</span>
                  <span className="meta">{j.pol} → {j.pod}</span>
                  {j.nextMilestoneLabel ? (
                    <span className={`milestone-badge${j.milestoneAtRisk ? " is-risk" : ""}`}>
                      {j.nextMilestoneLabel}
                      {j.nextMilestonePlannedAt ? ` · ${formatMilestoneDate(j.nextMilestonePlannedAt)}` : ""}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel">
          {job ? (
            <>
              <div className="toolbar">
                <button type="button" className={`btn btn-ghost${tab === "overview" ? " is-active" : ""}`} onClick={() => setTab("overview")}>
                  {tx("tabOverview")}
                </button>
                <button type="button" className={`btn btn-ghost${tab === "financial" ? " is-active" : ""}`} onClick={() => setTab("financial")}>
                  {tx("tabFinancial")}
                </button>
                {!isDemo ? (
                  <Link to={`/invoices?jobId=${job.id}&customerId=${job.customerId}`} className="btn btn-primary">
                    {tx("createInvoice")}
                  </Link>
                ) : null}
              </div>

              {tab === "overview" ? (
                <>
                  <h2>{job.jobNumber}</h2>
                  <p>
                    {job.origin} → {job.destination}
                  </p>
                  <p className="meta">
                    {job.mode} · {job.status} · {job.teu} TEU
                  </p>
                  {isDemo ? <p className="meta">{tx("demoSampleData")}</p> : null}
                  <section className="block milestones-block">
                    <div className="block-head">
                      <h2>{tx("milestonesTitle")}</h2>
                    </div>
                    <JobMilestoneList items={milestones} onToggle={(code, complete) => void toggleMilestone(code, complete)} />
                  </section>
                </>
              ) : financials ? (
                <>
                  <h2>{tx("jobPnl")}</h2>
                  <div className="kpi-row">
                    <div className="kpi">
                      <span>{tx("totalRevenue")}</span>
                      <strong>{financials.totalRevenue}</strong>
                    </div>
                    {financials.totalCost ? (
                      <div className="kpi">
                        <span>{tx("totalCost")}</span>
                        <strong>{financials.totalCost}</strong>
                      </div>
                    ) : null}
                    {financials.grossProfit ? (
                      <div className="kpi">
                        <span>{tx("grossProfit")}</span>
                        <strong>{financials.grossProfit}</strong>
                      </div>
                    ) : null}
                    {financials.marginPct ? (
                      <div className="kpi">
                        <span>{tx("colMargin")}</span>
                        <strong>{financials.marginPct}%</strong>
                      </div>
                    ) : null}
                  </div>
                  <h3>{tx("revenueLines")}</h3>
                  <ul className="list-plain">
                    {financials.revenue.map((r) => (
                      <li key={r.id}>
                        {r.description} — {r.totalAmount} {r.currency}
                      </li>
                    ))}
                  </ul>
                  {financials.cost.length ? (
                    <>
                      <h3>{tx("costLines")}</h3>
                      <ul className="list-plain">
                        {financials.cost.map((r) => (
                          <li key={r.id}>
                            {r.description} — {r.totalAmount} {r.currency}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </>
              ) : (
                <p className="meta">{tx("loading")}</p>
              )}
            </>
          ) : (
            <p className="meta">{tx("selectJob")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
