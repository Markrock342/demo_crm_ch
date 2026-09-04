import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useState, type FormEvent } from "react";
import { customerName, type Customer } from "../data";
import { useShellBilling } from "../shell/billingStore.tsx";
import { useShellCrm } from "../shell/crmStore.tsx";
import { useShellJobs } from "../shell/jobStore.tsx";
import { usePortalSession } from "../shell/portalSession.tsx";
import { useShellSupport } from "../shell/supportStore.tsx";
import { useStore } from "../store";
import { useAppMode } from "../v2/hooks/useAppMode.ts";
import { portalLogin, portalLogout } from "../api/portal.ts";
import { useCrmBundle } from "../v2/hooks/useCommercial.ts";
import { usePortalDocs, usePortalInvoices, usePortalJobs } from "../v2/hooks/usePortal.ts";

function PortalChrome({ children }: { children: React.ReactNode }) {
  const { tx } = useStore();
  const { live } = useAppMode();
  const portal = usePortalSession();
  const crm = useShellCrm();
  const bundle = useCrmBundle();
  const customers = live ? (bundle.data?.customers ?? []) : crm.customers;
  const customer = customers.find((c) => c.id === portal.session?.customerId);

  async function leave() {
    if (live) {
      try {
        await portalLogout();
      } catch {
        /* cookie may already be cleared */
      }
    }
    portal.leave();
  }

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
        <button type="button" className="btn btn-ghost" onClick={() => void leave()}>
          {tx("portalLeave")}
        </button>
      </header>
      {children}
    </div>
  );
}

export function PortalEnterPage() {
  const { tx, locale } = useStore();
  const { live } = useAppMode();
  const crm = useShellCrm();
  const bundle = useCrmBundle();
  const portal = usePortalSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const customers = live ? (bundle.data?.customers ?? []) : crm.customers;
  const pre = params.get("customerId") ?? "";
  const [customerId, setCustomerId] = useState(pre || customers[0]?.id || "");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (portal.session) return <Navigate to="/portal/home" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (live) {
      setLoading(true);
      try {
        await portalLogin(customerId, pin || undefined);
        portal.enterFromApi(customerId);
        navigate("/portal/home");
      } catch {
        setErr(tx("portalBadPin"));
      } finally {
        setLoading(false);
      }
      return;
    }
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
            {customers.map((c) => (
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
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? "…" : tx("portalEnter")}
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
  const { live } = useAppMode();
  const portal = usePortalSession();
  const jobsShell = useShellJobs();
  const portalJobs = usePortalJobs(Boolean(portal.session));
  const rows = live
    ? (portalJobs.data ?? []).map((j) => ({
        id: String(j.id),
        jobNumber: String(j.jobNumber ?? j.id),
        pol: String(j.pol ?? ""),
        pod: String(j.pod ?? ""),
        status: String(j.status ?? ""),
        etd: String(j.etd ?? "—"),
        eta: String(j.eta ?? "—"),
      }))
    : jobsShell.jobs.filter((j) => j.customerId === portal.session?.customerId);
  return (
    <RequirePortal>
      <h2>{tx("portalMyJobs")}</h2>
      {live && portalJobs.isLoading ? <p className="meta">Loading…</p> : null}
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
  const { live } = useAppMode();
  const portal = usePortalSession();
  const jobsShell = useShellJobs();
  const portalJobs = usePortalJobs(Boolean(portal.session));

  if (live) {
    const job = (portalJobs.data ?? []).find((j) => j.id === id);
    if (!job) {
      return (
        <RequirePortal>
          <p className="meta">{tx("errorLoad")}</p>
        </RequirePortal>
      );
    }
    return (
      <RequirePortal>
        <h2>{job.jobNumber}</h2>
        <p>
          {job.origin ?? job.pol} → {job.destination ?? job.pod} · {job.carrier ?? "—"}
        </p>
        <p className="meta">
          ETD {job.etd ?? "—"} · ETA {job.eta ?? "—"} · {job.status}
        </p>
      </RequirePortal>
    );
  }

  const job = id ? jobsShell.getById(id) : undefined;
  if (!job || job.customerId !== portal.session?.customerId) {
    return (
      <RequirePortal>
        <p className="meta">{tx("errorLoad")}</p>
      </RequirePortal>
    );
  }
  return (
    <RequirePortal>
      <h2>{job.jobNumber}</h2>
      <p>
        {job.origin} → {job.destination} · {job.carrier ?? "—"}
      </p>
      <p className="meta">
        ETD {job.etd} · ETA {job.eta} · {job.status}
      </p>
    </RequirePortal>
  );
}

export function PortalDocsPage() {
  const { tx } = useStore();
  const { live } = useAppMode();
  const portal = usePortalSession();
  const support = useShellSupport();
  const jobsShell = useShellJobs();
  const portalDocs = usePortalDocs(Boolean(portal.session));
  type DocLine = { id: string; label: string; name: string; status: string };
  const docs: DocLine[] = live
    ? (portalDocs.data ?? []).map((d) => ({
        id: d.id,
        label: d.kind,
        name: d.name,
        status: d.status,
      }))
    : support.docs
        .filter((d) => d.jobId && jobsShell.jobs.some((j) => j.id === d.jobId && j.customerId === portal.session?.customerId))
        .map((d) => ({ id: d.id, label: d.docType, name: d.name, status: d.status }));
  return (
    <RequirePortal>
      <h2>{tx("navDocs")}</h2>
      {live && portalDocs.isLoading ? <p className="meta">Loading…</p> : null}
      <ul className="list-plain">
        {docs.map((d) => (
          <li key={d.id}>
            {d.label} {d.name} · {d.status}
          </li>
        ))}
      </ul>
    </RequirePortal>
  );
}

export function PortalInvoicesPage() {
  const { tx } = useStore();
  const { live } = useAppMode();
  const portal = usePortalSession();
  const billing = useShellBilling();
  const portalInv = usePortalInvoices(Boolean(portal.session));
  const rows = live
    ? (portalInv.data ?? []).map((i) => ({
        id: String(i.id),
        invoiceNumber: String(i.invoiceNumber ?? i.id),
        status: String(i.status ?? ""),
        total: String(i.total ?? ""),
        currency: String(i.currency ?? ""),
        balanceDue: String(i.balanceDue ?? ""),
        jobId: i.jobId ? String(i.jobId) : undefined,
      }))
    : billing.invoices.filter((i) => i.customerId === portal.session?.customerId);
  return (
    <RequirePortal>
      <h2>{tx("navInvoices")}</h2>
      {live && portalInv.isLoading ? <p className="meta">Loading…</p> : null}
      <ul className="list-plain">
        {rows.map((i) => (
          <li key={i.id}>
            {i.invoiceNumber} · {i.status} · {i.total} {i.currency} · bal {i.balanceDue}
          </li>
        ))}
      </ul>
    </RequirePortal>
  );
}

/** Nested outlet unused — pages are standalone. */
export function PortalLayout() {
  return null;
}
