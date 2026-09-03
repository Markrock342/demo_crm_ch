import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { customerName, type Customer } from "../data";
import { useShellCrm } from "../shell/crmStore.tsx";
import { useShellQuotes } from "../shell/quoteStore.tsx";
import { useStore } from "../store";
import { PageToolbar } from "../ui/PageToolbar";

export function QuoteWizardPage() {
  const { tx, locale } = useStore();
  const crm = useShellCrm();
  const quotes = useShellQuotes();
  const navigate = useNavigate();
  const customers = crm.customers;
  const [form, setForm] = useState({
    customerId: customers[0]?.id ?? "",
    origin: "Shanghai",
    destination: "Laem Chabang",
    pol: "CNSHA",
    pod: "THLCH",
    mode: "FCL",
    containerType: "40HC",
    quantity: 1,
    currency: "USD",
    chargeDesc: "Ocean freight",
    chargeAmount: 1200,
    validUntil: "",
    terms: "",
  });
  const [err, setErr] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const customerId = form.customerId || customers[0]?.id || "";
    if (!customerId) {
      setErr(tx("quoteNeedCustomer"));
      return;
    }
    const fail = quotes.createDraft({
      customerId,
      origin: form.origin,
      destination: form.destination,
      pol: form.pol,
      pod: form.pod,
      mode: form.mode,
      containerType: form.containerType,
      quantity: form.quantity,
      currency: form.currency,
      charges: [{ description: form.chargeDesc, sellAmount: form.chargeAmount, currency: form.currency }],
      validUntil: form.validUntil,
      termsAndConditions: form.terms,
    });
    if (fail) {
      setErr(tx(fail));
      return;
    }
    navigate("/quotations");
  }

  return (
    <div className="page page--workspace">
      <PageToolbar
        title={tx("quoteWizardTitle")}
        hint={tx("quoteWizardHint")}
        actions={
          <Link className="btn btn-ghost" to="/quotations">
            {tx("cancel")}
          </Link>
        }
      />

      {customers.length === 0 ? (
        <p className="meta">
          {tx("quoteNeedCustomer")}{" "}
          <Link to="/customers">{tx("shellCreateCustomer")}</Link>
        </p>
      ) : (
        <form className="form form-stack" onSubmit={submit}>
          {err ? (
            <p className="field-err" role="alert">
              {err}
            </p>
          ) : null}
          <label>
            {tx("colCustomer")}
            <select value={form.customerId || customers[0]?.id || ""} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {customerName(c as Customer, locale)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Origin
            <input value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} required />
          </label>
          <label>
            Destination
            <input value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} required />
          </label>
          <label>
            POL
            <input value={form.pol} onChange={(e) => setForm({ ...form, pol: e.target.value })} />
          </label>
          <label>
            POD
            <input value={form.pod} onChange={(e) => setForm({ ...form, pod: e.target.value })} />
          </label>
          <label>
            {tx("colTeu")} / qty
            <input type="number" min={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} />
          </label>
          <label>
            {tx("colTitle")}
            <input value={form.chargeDesc} onChange={(e) => setForm({ ...form, chargeDesc: e.target.value })} required />
          </label>
          <label>
            {tx("colSell")}
            <input type="number" min={0} value={form.chargeAmount} onChange={(e) => setForm({ ...form, chargeAmount: Number(e.target.value) })} />
          </label>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              {tx("save")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
