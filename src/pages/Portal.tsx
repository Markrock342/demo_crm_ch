import { Link, Navigate, Outlet, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMemo, useState, type FormEvent } from "react";
import { customerName, type Customer } from "../data";
import { useShellBilling } from "../shell/billingStore.tsx";
import { useShellCrm } from "../shell/crmStore.tsx";
import { useShellJobs } from "../shell/jobStore.tsx";
import { usePortalSession } from "../shell/portalSession.tsx";
import { useShellOps } from "../shell/opsStore.tsx";
import { useShellSupport } from "../shell/supportStore.tsx";
import { useStore } from "../store";
import { PageToolbar } from "../ui/PageToolbar";

function PortalChrome({ children }: { children: React.ReactNode }) {
  const { tx, locale } = useStore();
  const portal = usePortalSession();
  const crm = useShellCrm();
  const customer = crm.customers.find((c) => c.id === portal.session?.customerId);
  return (
    <div className="page page--workspace page--portal">
      <PageToolbar
        title={tx("portalTitle")}
        hint={customer ? customerName(customer as Customer, locale) : undefined}
        actions={
          <>
            <Link className="btn btn-ghost" to="/portal/home">
              {tx("portalHome")}
            </Link>
            <Link className="btn btn-ghost" to="/portal/docs">
              {tx("navDocs")}
            </Link>
            <Link className="btn btn-ghost" to="/portal/invoices">
              {tx("navInvoices")}
            </Link>
            <button type="button" className="btn btn-ghost" onClick={() => portal.leave()}>
              {tx("portalLeave")}
            </button>
          </>
        }
      />
      {children}
    </div>
  );
}

export function PortalEnterPage() {
  const { tx, locale } = useStore();
  const crm = useShellCrm();
  const portal = usePortalSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const pre = params.get("customerId") ?? "";
  const [customerId, setCustomerId] = useState(pre || crm.customers[0]?.id || "");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);

  if (portal.session) return <Navigate to="/portal/home" replace />;

  function submit(e: FormEvent) {
    e.preventDefault();
    const c = crm.customers.find((x) => x.id === customerId);
    const fail = portal.enter(customerId, pin, c?.portalPin ?? "demo");
    if (fail) {
      setErr(tx(fail));
      return;
    }
    navigate("/portal/home");
  }

  return (
    <div className="page page--workspace page--portal-enter">
      <PageToolbar title={tx("portalTitle")} hint={tx("portalEnterHint")} />
      <form className="form form-stack" onSubmit={submit}>
        <label>
          {tx("colCustomer")}
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            {crm.customers.map((c) => (
              <option key={c.id} value={c.id}>
                {customerName(c as Customer, locale)}
              </option>
            ))}
          </select>
        </label>
        <label>
          PIN ({tx("portalPinOptional")})
          <input value={pin} onChange={(e) => setPin(e.target.value)} placeholder="demo" />
        </label>
        {err ? <p className="field-err">{err}</p> : null}
        <button type="submit" className="btn btn-primary">
          {tx("portalEnter")}
        </button>
      </form>
      <p className="meta page-foot">
        <Link to="/login">{tx("loginPickDept")}</Link>
      </p>
    </div>
  );
}

function RequirePortal({ children }: { children: React.ReactNode }) {
  const portal = usePortalSession();
  if (!portal.session) return <Navigate to="/portal" replace />;
  return <PortalChrome>{children}</PortalChrome>;
}

export function PortalHomePage() {
  const { tx } = useStore();
  const portal = usePortalSession();
  const jobs = useShellJobs();
  const rows = jobs.jobs.filter((j) => j.customerId === portal.session?.customerId);
  return (
    <RequirePortal>
      <section className="block">
        <div className="block-head">
          <h2>{tx("portalMyJobs")}</h2>
        </div>
        {rows.length === 0 ? (
          <p className="empty">{tx("emptyShellCrm")}</p>
        ) : (
          <ul className="dense-list">
            {rows.map((j) => (
              <li key={j.id}>
                <Link to={`/portal/jobs/${j.id}`}>
                  <strong>{j.jobNumber}</strong>
                  <span className="meta">
                    {j.pol}→{j.pod} · {j.status} · ETD {j.etd} / ETA {j.eta}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </RequirePortal>
  );
}

export function PortalJobPage() {
  const { id } = useParams();
  const { tx } = useStore();
  const portal = usePortalSession();
  const jobs = useShellJobs();
  const ops = useShellOps();
  const job = id ? jobs.getById(id) : undefined;
  if (!job || job.customerId !== portal.session?.customerId) {
    return (
      <RequirePortal>
        <p className="empty">{tx("errorLoad")}</p>
      </RequirePortal>
    );
  }
  const boxes = ops.boxes.filter((b) => {
    const ship = ops.shipments.find((s) => s.id === b.shipmentId);
    return ship?.jobId === job.id || b.shipmentId === job.shipmentId;
  });
  return (
    <RequirePortal>
      <section className="block">
        <div className="block-head">
          <h2>{job.jobNumber}</h2>
        </div>
        <p>
          {job.origin} → {job.destination} · {job.carrier} · {job.vessel}/{job.voyage}
        </p>
        <p className="meta">
          ETD {job.etd} · ETA {job.eta} · {job.status} · {job.billingStatus}
        </p>
        <div className="block-head">
          <h2>{tx("jobSectionContainers")}</h2>
        </div>
        <ul className="dense-list">
          {boxes.map((b) => (
            <li key={b.id}>
              <span className="mono">{b.id}</span>
              <span className="meta">
                {b.type} · {b.status}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </RequirePortal>
  );
}

export function PortalDocsPage() {
  const { tx } = useStore();
  const portal = usePortalSession();
  const jobs = useShellJobs();
  const support = useShellSupport();
  const jobIds = useMemo(
    () => new Set(jobs.jobs.filter((j) => j.customerId === portal.session?.customerId).map((j) => j.id)),
    [jobs.jobs, portal.session?.customerId],
  );
  const docs = support.docs.filter((d) => d.jobId && jobIds.has(d.jobId));
  return (
    <RequirePortal>
      <section className="block">
        <div className="block-head">
          <h2>{tx("navDocs")}</h2>
        </div>
        {docs.length === 0 ? (
          <p className="empty">{tx("emptyShellCrm")}</p>
        ) : (
          <ul className="dense-list">
            {docs.map((d) => (
              <li key={d.id}>
                {d.jobId ? (
                  <Link to={`/portal/jobs/${d.jobId}`}>
                    <strong>
                      {d.docType} {d.name}
                    </strong>
                    <span className="meta">
                      {d.status} · {jobs.getById(d.jobId)?.jobNumber}
                    </span>
                  </Link>
                ) : (
                  <>
                    <strong>
                      {d.docType} {d.name}
                    </strong>
                    <span className="meta">{d.status}</span>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </RequirePortal>
  );
}

export function PortalInvoicesPage() {
  const { tx } = useStore();
  const portal = usePortalSession();
  const billing = useShellBilling();
  const jobs = useShellJobs();
  const rows = billing.invoices.filter((i) => i.customerId === portal.session?.customerId);
  return (
    <RequirePortal>
      <section className="block">
        <div className="block-head">
          <h2>{tx("navInvoices")}</h2>
        </div>
        {rows.length === 0 ? (
          <p className="empty">{tx("emptyInvoices")}</p>
        ) : (
          <ul className="dense-list">
            {rows.map((i) => (
              <li key={i.id}>
                {i.jobId ? (
                  <Link to={`/portal/jobs/${i.jobId}`}>
                    <strong>{i.invoiceNumber}</strong>
                    <span className="meta">
                      {i.status} · {i.total} {i.currency} · {tx("colBalance")} {i.balanceDue}
                      {i.overdue ? ` · ${tx("invoiceOverdue")}` : ""}
                      {` · ${jobs.getById(i.jobId)?.jobNumber ?? ""}`}
                    </span>
                  </Link>
                ) : (
                  <>
                    <strong>{i.invoiceNumber}</strong>
                    <span className="meta">
                      {i.status} · {i.total} {i.currency} · {tx("colBalance")} {i.balanceDue}
                      {i.overdue ? ` · ${tx("invoiceOverdue")}` : ""}
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </RequirePortal>
  );
}

/** Nested outlet unused — pages are standalone. */
export function PortalLayout() {
  return <Outlet />;
}
