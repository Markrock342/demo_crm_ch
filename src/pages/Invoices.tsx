import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { billingStub } from "../adapters/stub/billing.stub.ts";
import { customerName, type Customer } from "../data";
import { useShellBilling } from "../shell/billingStore.tsx";
import { useShellCrm } from "../shell/crmStore.tsx";
import { useIsShellMode } from "../shell/session.tsx";
import { useStore } from "../store";
import { PageToolbar } from "../ui/PageToolbar";

export function InvoicesPage() {
  const shell = useIsShellMode();
  const { tx, locale } = useStore();
  const crm = useShellCrm();
  const billing = useShellBilling();
  const customers = crm.customers;
  const invoices = shell ? billing.invoices : [];
  const billingNotes = shell ? billing.billingNotes : [];
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
  const [draft, setDraft] = useState({ customerId: "", total: 1000, currency: "USD" });
  const [payForm, setPayForm] = useState({ invoiceId: "", amount: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [openDraft, setOpenDraft] = useState(false);

  void billingStub;

  const customerMap = useMemo(() => Object.fromEntries(customers.map((c) => [c.id, c])), [customers]);

  function createDraft(e: FormEvent) {
    e.preventDefault();
    const customerId = draft.customerId || customers[0]?.id || "";
    const err = billing.createDraftInvoice({ customerId, total: draft.total, currency: draft.currency });
    if (err) {
      setMsg(tx(err));
      return;
    }
    setMsg(tx("invoiceCreated"));
    setOpenDraft(false);
  }

  function createBn() {
    const err = billing.createBillingNote(selectedInvoices);
    if (err) {
      setMsg(tx(err));
      return;
    }
    setMsg(tx("billingNoteCreated"));
    setSelectedInvoices([]);
  }

  function pay() {
    const err = billing.recordPayment({ invoiceId: payForm.invoiceId, amount: Number(payForm.amount) });
    if (err) {
      setMsg(tx(err));
      return;
    }
    setMsg(tx("paymentRecorded"));
    setPayForm({ invoiceId: "", amount: "" });
  }

  return (
    <div className="page page--workspace">
      <PageToolbar
        title={tx("invoicesTitle")}
        count={invoices.length}
        hint={shell ? tx("billingShellHint") : tx("invoicesDemoPreviewHint")}
        actions={
          shell ? (
            <button type="button" className="btn btn-primary" onClick={() => setOpenDraft((v) => !v)} disabled={customers.length === 0}>
              {tx("createDraftInvoice")}
            </button>
          ) : null
        }
      />
      {msg ? <p className="meta">{msg}</p> : null}

      {!shell ? <p className="meta">{tx("apiNotConfigured")}</p> : null}

      {shell && customers.length === 0 ? (
        <p className="meta">
          {tx("quoteNeedCustomer")} <Link to="/customers">{tx("shellCreateCustomer")}</Link>
        </p>
      ) : null}

      {shell && openDraft ? (
        <form className="form form-stack" onSubmit={createDraft}>
          <label>
            {tx("colCustomer")}
            <select value={draft.customerId || customers[0]?.id || ""} onChange={(e) => setDraft({ ...draft, customerId: e.target.value })}>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {customerName(c as Customer, locale)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {tx("colTotal")}
            <input type="number" min={0} value={draft.total} onChange={(e) => setDraft({ ...draft, total: Number(e.target.value) })} />
          </label>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              {tx("save")}
            </button>
          </div>
        </form>
      ) : null}

      {invoices.length === 0 ? (
        <p className="empty">{tx("emptyInvoices")}</p>
      ) : (
        <div className="table-shell">
          <table className="data-table ledger">
            <thead>
              <tr>
                {shell ? <th /> : null}
                <th>{tx("colInvoice")}</th>
                <th>{tx("colCustomer")}</th>
                <th>{tx("colTotal")}</th>
                <th>{tx("colBalance")}</th>
                <th>{tx("colStatus")}</th>
                {shell ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  {shell ? (
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedInvoices.includes(inv.id)}
                        disabled={inv.status === "DRAFT"}
                        onChange={(e) =>
                          setSelectedInvoices((s) => (e.target.checked ? [...s, inv.id] : s.filter((x) => x !== inv.id)))
                        }
                      />
                    </td>
                  ) : null}
                  <td>{inv.invoiceNumber}</td>
                  <td>{customerMap[inv.customerId] ? customerName(customerMap[inv.customerId] as Customer, locale) : inv.customerId}</td>
                  <td className="mono">
                    {inv.total} {inv.currency}
                  </td>
                  <td className="mono">{inv.balanceDue}</td>
                  <td>
                    <span className="pill">{inv.status}</span>
                  </td>
                  {shell ? (
                    <td>
                      {inv.status === "DRAFT" ? (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => {
                            billing.issueInvoice(inv.id);
                            setMsg(tx("invoiceIssued"));
                          }}
                        >
                          {tx("issueShellInvoice")}
                        </button>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {shell ? (
        <>
          <div className="toolbar">
            <button type="button" className="btn btn-primary" disabled={!selectedInvoices.length} onClick={createBn}>
              {tx("createShellBillingNote")}
            </button>
            <button type="button" className="btn btn-ghost" disabled title={tx("loginRemoteTodo")}>
              {tx("billingConnectApi")}
            </button>
          </div>

          {billingNotes.length ? (
            <div className="panel">
              <h2>{tx("billingNotes")}</h2>
              <ul className="list-plain">
                {billingNotes.map((bn) => (
                  <li key={bn.id}>
                    {bn.billingNumber} — {bn.grandTotal} {bn.currency}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="panel">
            <h2>{tx("recordShellPayment")}</h2>
            <div className="form pipe-form">
              <label>
                {tx("colInvoice")}
                <select value={payForm.invoiceId} onChange={(e) => setPayForm({ ...payForm, invoiceId: e.target.value })}>
                  <option value="">—</option>
                  {invoices
                    .filter((i) => i.status === "ISSUED" || i.status === "PARTIALLY_PAID")
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.invoiceNumber} ({i.balanceDue})
                      </option>
                    ))}
                </select>
              </label>
              <label>
                {tx("colAmount")}
                <input value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} />
              </label>
              <button type="button" className="btn btn-primary" onClick={pay}>
                {tx("recordShellPayment")}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
