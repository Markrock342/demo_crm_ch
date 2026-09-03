import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useIsShellMode } from "../shell/session.tsx";
import { useShellSupport, type ShellVendorType } from "../shell/supportStore.tsx";
import { useStore } from "../store";
import { PageToolbar } from "../ui/PageToolbar";

const TYPES: ShellVendorType[] = ["shipping_line", "trucking", "customs", "depot", "warehouse", "other"];

export function VendorsPage() {
  const shell = useIsShellMode();
  const { tx } = useStore();
  const support = useShellSupport();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", vendorType: "shipping_line" as ShellVendorType, creditTerm: "Net 30" });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!shell) return;
    support.addVendor(form);
    setForm({ name: "", vendorType: "shipping_line", creditTerm: "Net 30" });
    setOpen(false);
  }

  if (!shell) {
    return (
      <div className="page page--workspace">
        <PageToolbar title={tx("navVendors")} hint={tx("apiNotConfigured")} />
      </div>
    );
  }

  return (
    <div className="page page--workspace">
      <PageToolbar
        title={tx("navVendors")}
        count={support.vendors.length}
        hint={tx("shellDataBadge")}
        actions={
          <>
            <Link className="btn btn-ghost" to="/vendor-bills">
              {tx("navVendorBills")}
            </Link>
            <button type="button" className="btn btn-primary" onClick={() => setOpen((v) => !v)}>
              {tx("vendorCreate")}
            </button>
          </>
        }
      />
      {open ? (
        <form className="form form-stack" onSubmit={submit}>
          <label>
            {tx("colTitle")}
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label>
            Type
            <select value={form.vendorType} onChange={(e) => setForm({ ...form, vendorType: e.target.value as ShellVendorType })}>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label>
            {tx("customerCreditTerm")}
            <input value={form.creditTerm} onChange={(e) => setForm({ ...form, creditTerm: e.target.value })} />
          </label>
          <button type="submit" className="btn btn-primary">
            {tx("save")}
          </button>
        </form>
      ) : null}
      <div className="table-shell">
        <table className="data-table">
          <thead>
            <tr>
              <th>{tx("colTitle")}</th>
              <th>Type</th>
              <th>{tx("customerCreditTerm")}</th>
            </tr>
          </thead>
          <tbody>
            {support.vendors.map((v) => (
              <tr key={v.id}>
                <td className="cell-strong">{v.name}</td>
                <td>
                  <span className="pill">{v.vendorType}</span>
                </td>
                <td>{v.creditTerm || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
