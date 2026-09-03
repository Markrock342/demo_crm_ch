import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { jobStub } from "../adapters/stub/job.stub.ts";
import { customerName, type Customer } from "../data";
import { jobGrossProfit } from "../ports/job.port.ts";
import { useShellCrm } from "../shell/crmStore.tsx";
import { useShellJobs } from "../shell/jobStore.tsx";
import { useIsShellMode } from "../shell/session.tsx";
import { useStore } from "../store";
import { ClickableTableRow } from "../ui/ClickableTableRow";
import { PageToolbar } from "../ui/PageToolbar";

type StatusFilter = "all" | "OPEN" | "IN_PROGRESS" | "CLOSED";
type BillingFilter = "all" | "UNBILLED" | "INVOICED" | "PARTIAL" | "PAID";
type DateFilter = "all" | "hasEtd" | "hasEta" | "missing";

export function JobsPage() {
  const shell = useIsShellMode();
  const { tx, locale, query } = useStore();
  const crm = useShellCrm();
  const jobStore = useShellJobs();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const rows = shell ? jobStore.jobs : [];
  const [status, setStatus] = useState<StatusFilter>("all");
  const [billing, setBilling] = useState<BillingFilter>("all");
  const [delayedOnly, setDelayedOnly] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [routeQ, setRouteQ] = useState("");
  const [carrier, setCarrier] = useState("");
  const [owner, setOwner] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");

  void jobStub;

  useEffect(() => {
    const selected = params.get("selected");
    if (selected && jobStore.getById(selected)) {
      navigate(`/jobs/${selected}`, { replace: true });
    }
  }, [params, jobStore, navigate]);

  const carriers = useMemo(() => [...new Set(rows.map((j) => j.carrier).filter(Boolean))].sort(), [rows]);
  const owners = useMemo(
    () => [...new Set(rows.flatMap((j) => [j.salesOwner, j.opsOwner]).filter((x) => x.trim()))].sort(),
    [rows],
  );

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    const rq = routeQ.trim().toLowerCase();
    return rows.filter((j) => {
      if (status !== "all" && j.status !== status) return false;
      if (billing !== "all" && j.billingStatus !== billing) return false;
      if (delayedOnly && !j.delayed) return false;
      if (customerId && j.customerId !== customerId) return false;
      if (carrier && j.carrier !== carrier) return false;
      if (owner && j.salesOwner !== owner && j.opsOwner !== owner) return false;
      if (rq && !`${j.pol} ${j.pod} ${j.origin} ${j.destination}`.toLowerCase().includes(rq)) return false;
      if (dateFilter === "hasEtd" && (!j.etd || j.etd === "—")) return false;
      if (dateFilter === "hasEta" && (!j.eta || j.eta === "—")) return false;
      if (dateFilter === "missing" && j.etd && j.etd !== "—" && j.eta && j.eta !== "—") return false;
      const c = crm.customers.find((x) => x.id === j.customerId);
      const blob = `${j.jobNumber} ${j.shipper} ${j.consignee} ${j.carrier} ${j.salesOwner} ${j.opsOwner} ${j.origin} ${j.destination} ${j.pol} ${j.pod} ${c ? customerName(c as Customer, locale) : ""}`.toLowerCase();
      return !q || blob.includes(q);
    });
  }, [billing, carrier, crm.customers, customerId, dateFilter, delayedOnly, locale, owner, q, routeQ, rows, status]);

  return (
    <div className="page page--workspace">
      <PageToolbar
        title={tx("jobsTitle")}
        count={filtered.length}
        hint={shell ? tx("shellDataBadge") : tx("apiNotConfigured")}
        actions={
          shell ? (
            <Link className="btn btn-ghost" to="/quotations">
              {tx("navQuotations")}
            </Link>
          ) : (
            <button type="button" className="btn btn-ghost" disabled>
              {tx("jobConnectApi")}
            </button>
          )
        }
        filters={
          shell ? (
            <div className="filter-row" style={{ flexWrap: "wrap", gap: 8 }}>
              {(["all", "OPEN", "IN_PROGRESS", "CLOSED"] as const).map((s) => (
                <button key={s} type="button" className={`filter-chip${status === s ? " is-on" : ""}`} onClick={() => setStatus(s)}>
                  {s === "all" ? tx("filterAll") : s}
                </button>
              ))}
              {(["all", "UNBILLED", "INVOICED", "PARTIAL", "PAID"] as const).map((b) => (
                <button key={b} type="button" className={`filter-chip${billing === b ? " is-on" : ""}`} onClick={() => setBilling(b)}>
                  {b === "all" ? "AR" : b}
                </button>
              ))}
              <button type="button" className={`filter-chip${delayedOnly ? " is-on" : ""}`} onClick={() => setDelayedOnly((v) => !v)}>
                delayed
              </button>
              <select className="deal-select" value={customerId} onChange={(e) => setCustomerId(e.target.value)} aria-label={tx("colCustomer")}>
                <option value="">{tx("colCustomer")}</option>
                {crm.customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {customerName(c as Customer, locale)}
                  </option>
                ))}
              </select>
              <input
                className="inline-input"
                style={{ width: 100 }}
                placeholder="POL/POD"
                value={routeQ}
                onChange={(e) => setRouteQ(e.target.value)}
              />
              <select className="deal-select" value={carrier} onChange={(e) => setCarrier(e.target.value)}>
                <option value="">{tx("colCarrier")}</option>
                {carriers.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select className="deal-select" value={owner} onChange={(e) => setOwner(e.target.value)}>
                <option value="">{tx("jobOwnerFilter")}</option>
                {owners.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
              <select className="deal-select" value={dateFilter} onChange={(e) => setDateFilter(e.target.value as DateFilter)}>
                <option value="all">ETD/ETA</option>
                <option value="hasEtd">{tx("calEtd")}</option>
                <option value="hasEta">{tx("calEta")}</option>
                <option value="missing">{tx("jobDateMissing")}</option>
              </select>
            </div>
          ) : null
        }
      />

      {!shell ? <p className="meta">{tx("apiNotConfigured")}</p> : null}

      {shell && filtered.length === 0 ? (
        <p className="empty">
          {tx("emptyShellCrm")} <Link to="/quotations">{tx("navQuotations")}</Link>
        </p>
      ) : null}

      {shell && filtered.length > 0 ? (
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>{tx("navJobs")}</th>
                <th>{tx("colCustomer")}</th>
                <th>{tx("jobParties")}</th>
                <th>Lane</th>
                <th>{tx("colCarrier")}</th>
                <th>{tx("jobOwners")}</th>
                <th>{tx("calEtd")}</th>
                <th>{tx("calEta")}</th>
                <th>{tx("colStatus")}</th>
                <th>AR</th>
                <th>{tx("jobGrossProfit")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((j) => {
                const c = crm.customers.find((x) => x.id === j.customerId);
                return (
                  <ClickableTableRow key={j.id} onActivate={() => navigate(`/jobs/${j.id}`)}>
                    <td className="cell-strong mono">
                      {j.jobNumber}
                      {j.delayed ? <span className="pill pill-warn">delay</span> : null}
                    </td>
                    <td>{c ? customerName(c as Customer, locale) : j.customerId}</td>
                    <td className="meta">
                      {j.shipper} / {j.consignee}
                    </td>
                    <td className="mono">
                      {j.pol}→{j.pod}
                    </td>
                    <td>{j.carrier}</td>
                    <td className="meta">
                      {j.salesOwner || "—"} / {j.opsOwner || "—"}
                    </td>
                    <td className="mono">{j.etd}</td>
                    <td className="mono">{j.eta}</td>
                    <td>
                      <span className="pill">{j.status}</span>
                    </td>
                    <td>
                      <span className="pill">{j.billingStatus}</span>
                    </td>
                    <td className="num">
                      {jobGrossProfit(j)} {j.currency}
                    </td>
                  </ClickableTableRow>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
