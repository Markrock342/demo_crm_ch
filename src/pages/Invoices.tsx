import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  billingNotePdfUrl,
  createBillingNote,
  createInvoiceFromJob,
  fetchArSummary,
  fetchBillingNotes,
  fetchInvoices,
  fetchJobCharges,
  issueInvoice,
  recordPayment,
  type InvoiceRow,
} from "../api/commercial.ts";
import { demoAr, demoBillingNotes, demoInvoices } from "../demo/commercial-demo.ts";
import { customerName } from "../data.ts";
import { useAuth } from "../auth/AuthProvider.tsx";
import { useStore } from "../store.tsx";
import { DemoModuleBanner } from "../ui/DemoModuleBanner.tsx";

export function InvoicesPage() {
  const { tx, locale, customers } = useStore();
  const { mode, user } = useAuth();
  const isDemo = mode === "demo";
  const [params] = useSearchParams();
  const jobId = params.get("jobId");
  const customerIdParam = params.get("customerId");

  const [invoices, setInvoices] = useState<InvoiceRow[]>(isDemo ? demoInvoices : []);
  const [billingNotes, setBillingNotes] = useState<Array<{ id: string; billingNumber: string; grandTotal: string; currency: string }>>(
    isDemo ? demoBillingNotes : [],
  );
  const [ar, setAr] = useState<Record<string, string> | null>(isDemo ? demoAr : null);
  const [charges, setCharges] = useState<Array<{ id: string; description: string; totalAmount: string; invoiced: boolean }>>([]);
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
  const [payForm, setPayForm] = useState({ amount: "", invoiceId: "" });
  const [msg, setMsg] = useState<string | null>(null);

  const customerMap = useMemo(() => Object.fromEntries(customers.map((c) => [c.id, c])), [customers]);

  const load = useCallback(async () => {
    if (isDemo) {
      setInvoices(demoInvoices);
      setBillingNotes(demoBillingNotes);
      setAr(demoAr);
      return;
    }
    if (mode !== "production" || !user) return;
    setInvoices(await fetchInvoices());
    setBillingNotes(await fetchBillingNotes());
    if (user.permissions.includes("report.finance.view")) {
      setAr((await fetchArSummary()) as Record<string, string>);
    }
  }, [isDemo, mode, user]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!jobId || isDemo || mode !== "production") return;
    void fetchJobCharges(jobId).then(setCharges);
  }, [jobId, isDemo, mode]);

  async function act(fn: () => Promise<unknown>, okKey: string) {
    try {
      await fn();
      setMsg(tx(okKey));
      await load();
    } catch {
      setMsg(tx("errorSave"));
    }
  }

  async function createInvoice() {
    if (!jobId || !customerIdParam) return;
    const ids = charges.filter((c) => !c.invoiced).map((c) => c.id);
    if (!ids.length) return;
    await act(() => createInvoiceFromJob({ jobId, customerId: customerIdParam, chargeIds: ids }), "invoiceCreated");
  }

  async function createBn() {
    if (!selectedInvoices.length) return;
    const cust = invoices.find((i) => selectedInvoices.includes(i.id))?.customerId;
    if (!cust) return;
    const result = (await createBillingNote({ customerId: cust, invoiceIds: selectedInvoices })) as { id: string };
    setMsg(tx("billingNoteCreated"));
    window.open(billingNotePdfUrl(result.id), "_blank");
    await load();
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{tx("invoicesTitle")}</h1>
          <p>{isDemo ? tx("invoicesDemoPreviewHint") : tx("invoicesHint")}</p>
        </div>
      </div>

      {isDemo ? <DemoModuleBanner /> : null}
      {msg ? <p className="meta">{msg}</p> : null}

      {ar ? (
        <div className="kpi-row">
          <div className="kpi"><span>{tx("arTotal")}</span><strong>{ar.total}</strong></div>
          <div className="kpi"><span>1–30d</span><strong>{ar.d1_30}</strong></div>
          <div className="kpi"><span>31–60d</span><strong>{ar.d31_60}</strong></div>
          <div className="kpi"><span>90+d</span><strong>{ar.d90plus}</strong></div>
        </div>
      ) : null}

      {isDemo ? <p className="meta">{tx("demoSampleData")}</p> : null}

      {!isDemo && jobId && charges.length ? (
        <div className="panel">
          <h2>{tx("createInvoiceFromJob")}</h2>
          <ul className="list-plain">
            {charges.map((c) => (
              <li key={c.id}>{c.description} — {c.totalAmount} {c.invoiced ? tx("invoiced") : ""}</li>
            ))}
          </ul>
          <button type="button" className="btn btn-primary" onClick={() => void createInvoice()}>
            {tx("createInvoice")}
          </button>
        </div>
      ) : null}

      <div className="table-wrap">
        <table className="ledger">
          <thead>
            <tr>
              {!isDemo ? <th /> : null}
              <th>{tx("colInvoice")}</th>
              <th>{tx("colCustomer")}</th>
              <th>{tx("colTotal")}</th>
              <th>{tx("colBalance")}</th>
              <th>{tx("colStatus")}</th>
              {!isDemo ? <th /> : null}
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id}>
                {!isDemo ? (
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedInvoices.includes(inv.id)}
                      onChange={(e) =>
                        setSelectedInvoices((s) => (e.target.checked ? [...s, inv.id] : s.filter((x) => x !== inv.id)))
                      }
                    />
                  </td>
                ) : null}
                <td>{inv.invoiceNumber}</td>
                <td>{customerMap[inv.customerId] ? customerName(customerMap[inv.customerId], locale) : inv.customerId}</td>
                <td className="mono">{inv.total} {inv.currency}</td>
                <td className="mono">{inv.balanceDue}</td>
                <td><span className="pill">{inv.status}</span></td>
                {!isDemo ? (
                  <td>
                    {inv.status === "DRAFT" ? (
                      <button type="button" className="btn btn-ghost" onClick={() => void act(() => issueInvoice(inv.id), "invoiceIssued")}>
                        {tx("issueInvoice")}
                      </button>
                    ) : null}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!isDemo ? (
        <>
          <div className="toolbar">
            <button type="button" className="btn btn-primary" disabled={!selectedInvoices.length} onClick={() => void createBn()}>
              {tx("createBillingNote")}
            </button>
          </div>

          {billingNotes.length ? (
            <div className="panel">
              <h2>{tx("billingNotes")}</h2>
              <ul className="list-plain">
                {billingNotes.map((bn) => (
                  <li key={bn.id}>
                    {bn.billingNumber} — {bn.grandTotal} {bn.currency}
                    <a className="btn btn-ghost" href={billingNotePdfUrl(bn.id)} target="_blank" rel="noreferrer">
                      PDF
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="panel">
            <h2>{tx("recordPayment")}</h2>
            <div className="form pipe-form">
              <label>
                {tx("colInvoice")}
                <select value={payForm.invoiceId} onChange={(e) => setPayForm({ ...payForm, invoiceId: e.target.value })}>
                  <option value="">—</option>
                  {invoices.filter((i) => i.status === "ISSUED" || i.status === "PARTIALLY_PAID").map((i) => (
                    <option key={i.id} value={i.id}>{i.invoiceNumber} ({i.balanceDue})</option>
                  ))}
                </select>
              </label>
              <label>
                {tx("colAmount")}
                <input value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} />
              </label>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() =>
                  void act(async () => {
                    const inv = invoices.find((i) => i.id === payForm.invoiceId);
                    if (!inv) return;
                    await recordPayment({
                      customerId: inv.customerId,
                      amount: payForm.amount,
                      currency: inv.currency,
                      method: "BANK_TRANSFER",
                      allocations: [{ invoiceId: inv.id, amount: payForm.amount }],
                    });
                  }, "paymentRecorded")
                }
              >
                {tx("recordPayment")}
              </button>
            </div>
          </div>
        </>
      ) : billingNotes.length ? (
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
    </div>
  );
}
