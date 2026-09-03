import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useShellJobs } from "../shell/jobStore.tsx";
import { useIsShellMode } from "../shell/session.tsx";
import { useShellSupport } from "../shell/supportStore.tsx";
import { useStore } from "../store";
import { PageToolbar } from "../ui/PageToolbar";

export function VendorBillsPage() {
  const shell = useIsShellMode();
  const { tx } = useStore();
  const support = useShellSupport();
  const jobs = useShellJobs();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ vendorId: "", amount: 500, currency: "USD", jobId: "" });
  const [msg, setMsg] = useState<string | null>(null);

  const bills = shell ? support.vendorBills : [];

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!shell || !form.vendorId) return;
    support.addVendorBill({
      vendorId: form.vendorId,
      amount: form.amount,
      currency: form.currency,
      jobId: form.jobId || undefined,
    });
    setForm({ vendorId: "", amount: 500, currency: "USD", jobId: "" });
    setOpen(false);
    setMsg(tx("vendorBillCreated"));
  }

  return (
    <div className="page page--workspace">
      <PageToolbar
        title={tx("vendorBillsTitle")}
        count={bills.length}
        hint={shell ? `${tx("shellDataBadge")} · stub` : tx("apiNotConfigured")}
        actions={
          shell ? (
            <>
              <Link className="btn btn-ghost" to="/vendors">
                {tx("navVendors")}
              </Link>
              <button type="button" className="btn btn-primary" onClick={() => setOpen((v) => !v)} disabled={!support.vendors.length}>
                {tx("createVendorBill")}
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-ghost" disabled>
              {tx("billingConnectApi")}
            </button>
          )
        }
      />
      {msg ? <p className="meta">{msg}</p> : null}
      {!shell ? <p className="meta">{tx("apiNotConfigured")}</p> : null}

      {open && shell ? (
        <form className="form form-stack" onSubmit={submit}>
          <label>
            Vendor
            <select value={form.vendorId} onChange={(e) => setForm({ ...form, vendorId: e.target.value })} required>
              <option value="">—</option>
              {support.vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {tx("navJobs")}
            <select value={form.jobId} onChange={(e) => setForm({ ...form, jobId: e.target.value })}>
              <option value="">—</option>
              {jobs.jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.jobNumber}
                </option>
              ))}
            </select>
          </label>
          <label>
            {tx("colAmount")}
            <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
          </label>
          <button type="submit" className="btn btn-primary">
            {tx("save")}
          </button>
        </form>
      ) : null}

      {shell && bills.length === 0 ? <p className="empty">{tx("emptyShellCrm")}</p> : null}

      {shell && bills.length > 0 ? (
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>{tx("colInvoice")}</th>
                <th>Vendor</th>
                <th>{tx("navJobs")}</th>
                <th>{tx("colTotal")}</th>
                <th>{tx("colStatus")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {bills.map((b) => (
                <tr key={b.id}>
                  <td className="mono">{b.billNumber}</td>
                  <td>{b.vendorName}</td>
                  <td>{b.jobId ? <Link to={`/jobs/${b.jobId}`}>{jobs.getById(b.jobId)?.jobNumber ?? b.jobId}</Link> : "—"}</td>
                  <td className="mono">
                    {b.amount} {b.currency}
                  </td>
                  <td>
                    <span className="pill">{b.status}</span>
                  </td>
                  <td>
                    {b.status === "DRAFT" ? (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => {
                          support.approveVendorBill(b.id);
                          setMsg(tx("vendorBillApproved"));
                        }}
                      >
                        {tx("approveVendorBill")}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
