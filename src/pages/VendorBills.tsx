import { useState, type FormEvent } from "react";
import { useShellSupport } from "../shell/supportStore.tsx";
import { useIsShellMode } from "../shell/session.tsx";
import { useStore } from "../store";
import { PageToolbar } from "../ui/PageToolbar";

export function VendorBillsPage() {
  const shell = useIsShellMode();
  const { tx } = useStore();
  const support = useShellSupport();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ vendorName: "", amount: 500, currency: "USD" });
  const [msg, setMsg] = useState<string | null>(null);

  const bills = shell ? support.vendorBills : [];

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!shell) return;
    support.addVendorBill(form);
    setForm({ vendorName: "", amount: 500, currency: "USD" });
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
            <button type="button" className="btn btn-primary" onClick={() => setOpen((v) => !v)}>
              {tx("createVendorBill")}
            </button>
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
            <input value={form.vendorName} onChange={(e) => setForm({ ...form, vendorName: e.target.value })} required />
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
