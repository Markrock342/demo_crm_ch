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

function PortalChrome({ children }: { children: React.ReactNode }) {
  const { tx } = useStore();
  const portal = usePortalSession();
  const crm = useShellCrm();
  const customer = crm.customers.find((c) => c.id === portal.session?.customerId);
  return (
    <div className="page page--workspace" style={{ maxWidth: 960, margin: "0 auto", padding: 16 }}>
      <header className="toolbar" style={{ marginBottom: 16 }}>
        <strong>{tx("portalTitle")}</strong>
        {customer ? <span className="meta">{customerName(customer as Customer, "en")}</span> : null}
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
      </header>
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
    <div className="page page--workspace" style={{ maxWidth: 480, margin: "40px auto", padding: 16 }}>
      <h1>{tx("portalTitle")}</h1>
      <p className="meta">{tx("portalEnterHint")}</p>
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
      <p className="meta">
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
      <h2>{tx("portalMyJobs")}</h2>
      <ul className="list-plain">
        {rows.map((j) => (
          <li key={j.id}>
            <Link to={`/portal/jobs/${j.id}`}>{j.jobNumber}</Link> · {j.pol}→{j.pod} · {j.status} · ETD {j.etd} / ETA {j.eta}
          </li>
        ))}
      </ul>
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
        <p className="meta">{tx("errorLoad")}</p>
      </RequirePortal>
    );
  }
  const boxes = ops.boxes.filter((b) => {
    const ship = ops.shipments.find((s) => s.id === b.shipmentId);
    return ship?.jobId === job.id || b.shipmentId === job.shipmentId;
  });
  return (
    <RequirePortal>
      <h2>{job.jobNumber}</h2>
      <p>
        {job.origin} → {job.destination} · {job.carrier} · {job.vessel}/{job.voyage}
      </p>
      <p className="meta">
        ETD {job.etd} · ETA {job.eta} · {job.status} · {job.billingStatus}
      </p>
      <h3>{tx("jobSectionContainers")}</h3>
      <ul className="list-plain">
        {boxes.map((b) => (
          <li key={b.id}>
            {b.id} · {b.type} · {b.status}
          </li>
        ))}
      </ul>
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
      <h2>{tx("navDocs")}</h2>
      <ul className="list-plain">
        {docs.map((d) => (
          <li key={d.id}>
            {d.docType} {d.name} · {d.status}
            {d.jobId ? (
              <>
                {" "}
                · <Link to={`/portal/jobs/${d.jobId}`}>{jobs.getById(d.jobId)?.jobNumber}</Link>
              </>
            ) : null}
          </li>
        ))}
      </ul>
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
      <h2>{tx("navInvoices")}</h2>
      <ul className="list-plain">
        {rows.map((i) => (
          <li key={i.id}>
            {i.invoiceNumber} · {i.status} · {i.total} {i.currency} · bal {i.balanceDue}
            {i.overdue ? <span className="pill pill-warn">overdue</span> : null}
            {i.jobId ? (
              <>
                {" "}
                · <Link to={`/portal/jobs/${i.jobId}`}>{jobs.getById(i.jobId)?.jobNumber}</Link>
              </>
            ) : null}
          </li>
        ))}
      </ul>
    </RequirePortal>
  );
}

/** Nested outlet unused — pages are standalone. */
export function PortalLayout() {
  return <Outlet />;
}
