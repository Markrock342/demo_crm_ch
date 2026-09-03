import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { jobStub } from "../adapters/stub/job.stub.ts";
import { customerName, type Customer } from "../data";
import { useShellBilling } from "../shell/billingStore.tsx";
import { useShellCrm } from "../shell/crmStore.tsx";
import { useShellJobs } from "../shell/jobStore.tsx";
import { useShellOps } from "../shell/opsStore.tsx";
import { useIsShellMode } from "../shell/session.tsx";
import { useStore } from "../store";
import { PageToolbar } from "../ui/PageToolbar";

export function JobsPage() {
  const shell = useIsShellMode();
  const { tx, locale } = useStore();
  const crm = useShellCrm();
  const jobStore = useShellJobs();
  const ops = useShellOps();
  const billing = useShellBilling();
  const customers = crm.customers;
  const rows = shell ? jobStore.jobs : [];
  const [selected, setSelected] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  void jobStub;

  const customerMap = useMemo(() => Object.fromEntries(customers.map((c) => [c.id, c])), [customers]);
  const job = selected ? rows.find((j) => j.id === selected) ?? null : rows[0] ?? null;

  return (
    <div className="page page--workspace page--split">
      <PageToolbar
        title={tx("jobsTitle")}
        count={rows.length}
        hint={shell ? tx("shellDataBadge") : tx("apiNotConfigured")}
        actions={
          <button type="button" className="btn btn-ghost" disabled title={tx("loginRemoteTodo")}>
            {tx("jobConnectApi")}
          </button>
        }
      />
      {msg ? <p className="meta">{msg}</p> : null}

      {!shell ? <p className="meta">{tx("apiNotConfigured")}</p> : null}

      <div className="split-panels">
        <div className="panel">
          <h2>{tx("navJobs")}</h2>
          {rows.length === 0 ? (
            <p className="empty">
              {tx("emptyShellCrm")}{" "}
              {shell ? <Link to="/quotations">{tx("navQuotations")}</Link> : null}
            </p>
          ) : (
            <ul className="list-plain">
              {rows.map((j) => (
                <li key={j.id}>
                  <button type="button" className={`list-btn${job?.id === j.id ? " is-active" : ""}`} onClick={() => setSelected(j.id)}>
                    <strong>{j.jobNumber}</strong>
                    <span className="meta">
                      {customerMap[j.customerId] ? customerName(customerMap[j.customerId] as Customer, locale) : j.customerId}
                    </span>
                    <span className="pill">{j.status}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="panel">
          {job && shell ? (
            <>
              <h2>{job.jobNumber}</h2>
              <p>
                {job.origin} → {job.destination} · {job.pol} → {job.pod}
              </p>
              <p className="meta">
                {job.containerType} × {job.quantity} · {job.totalSell} {job.currency}
              </p>
              <h3>{tx("colStage")}</h3>
              <ul className="list-plain">
                {job.milestones.map((m) => (
                  <li key={m.code}>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={Boolean(m.actualAt)}
                        onChange={(e) => jobStore.toggleMilestone(job.id, m.code, e.target.checked)}
                      />
                      <span>
                        {m.label}
                        {m.actualAt ? ` · ${m.actualAt.slice(0, 10)}` : ""}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <ul className="list-plain">
                {job.charges.map((c, i) => (
                  <li key={i}>
                    {c.description} — {c.amount} {c.currency}
                  </li>
                ))}
              </ul>
              <div className="toolbar">
                {!job.shipmentId ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      const sid = ops.createShipmentFromJob({
                        jobId: job.id,
                        customerId: job.customerId,
                        pol: job.pol,
                        pod: job.pod,
                        teu: job.quantity * 2,
                      });
                      jobStore.attachShipment(job.id, sid);
                      setMsg(tx("bookingCreated"));
                    }}
                  >
                    {tx("createShellShipment")}
                  </button>
                ) : (
                  <Link className="btn btn-ghost" to="/shipments">
                    {tx("navShipments")}
                  </Link>
                )}
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    const fail = billing.createFromJob(job);
                    if (fail) {
                      setMsg(tx(fail));
                      return;
                    }
                    setMsg(tx("invoiceCreated"));
                  }}
                >
                  {tx("invoiceFromJob")}
                </button>
                <Link className="btn btn-ghost" to="/invoices">
                  {tx("navInvoices")}
                </Link>
              </div>
            </>
          ) : (
            <p className="meta">{shell ? tx("selectQuotation") : tx("apiNotConfigured")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
