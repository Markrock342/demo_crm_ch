import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { fetchPublicQuote, signPublicQuote } from "../api/commercial.ts";
import { useStore } from "../store.tsx";

type PublicQuote = {
  quotationNumber: string;
  revisionNumber: number;
  origin: string;
  destination: string;
  pol: string;
  pod: string;
  mode: string;
  containerType: string | null;
  quantity: number;
  currency: string;
  validUntil: string | null;
  termsAndConditions: string | null;
  charges: Array<{ description: string; sellAmount: string; currency: string }>;
  totalSell: string;
};

export function QuotePublicPage() {
  const { token } = useParams();
  const { tx } = useStore();
  const [quote, setQuote] = useState<PublicQuote | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [form, setForm] = useState({ signerName: "", signerEmail: "", signerCompany: "", acceptedTerms: false });

  useEffect(() => {
    if (!token) return;
    void fetchPublicQuote(token)
      .then((q) => setQuote(q as PublicQuote))
      .catch(() => setErr(tx("errorLoad")));
  }, [token, tx]);

  async function submit(e: FormEvent, decision: "ACCEPTED" | "REJECTED") {
    e.preventDefault();
    if (!token) return;
    try {
      await signPublicQuote(token, {
        ...form,
        signatureMethod: "TYPED",
        decision,
        acceptedTerms: form.acceptedTerms,
      });
      setDone(decision);
    } catch {
      setErr(tx("errorSave"));
    }
  }

  if (err) {
    return (
      <div className="login-page">
        <p>{err}</p>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="login-page">
        <p>{tx("loading")}</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>{done === "ACCEPTED" ? tx("quoteAccepted") : tx("quoteRejected")}</h1>
          <p className="meta">{quote.quotationNumber}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card quote-public">
        <header>
          <h1>{tx("quotationReview")}</h1>
          <p className="meta">
            {quote.quotationNumber} Rev.{quote.revisionNumber}
          </p>
        </header>
        <p>
          {quote.origin} → {quote.destination}
        </p>
        <p className="meta">
          {quote.pol} → {quote.pod} · {quote.mode} · {quote.containerType} × {quote.quantity}
        </p>
        <ul className="list-plain">
          {quote.charges.map((c, i) => (
            <li key={i}>
              {c.description}: {c.sellAmount} {c.currency}
            </li>
          ))}
        </ul>
        <p>
          <strong>{tx("grandTotal")}:</strong> {quote.totalSell} {quote.currency}
        </p>
        <form className="form" onSubmit={(e) => void submit(e, "ACCEPTED")}>
          <label>
            {tx("signerName")}
            <input required value={form.signerName} onChange={(e) => setForm({ ...form, signerName: e.target.value })} />
          </label>
          <label>
            {tx("signerEmail")}
            <input type="email" required value={form.signerEmail} onChange={(e) => setForm({ ...form, signerEmail: e.target.value })} />
          </label>
          <label>
            {tx("signerCompany")}
            <input value={form.signerCompany} onChange={(e) => setForm({ ...form, signerCompany: e.target.value })} />
          </label>
          <label className="check">
            <input type="checkbox" checked={form.acceptedTerms} onChange={(e) => setForm({ ...form, acceptedTerms: e.target.checked })} required />
            {tx("acceptTerms")}
          </label>
          <div className="toolbar">
            <button type="submit" className="btn btn-primary">
              {tx("acceptSign")}
            </button>
            <button type="button" className="btn btn-ghost" onClick={(e) => void submit(e as unknown as FormEvent, "REJECTED")}>
              {tx("reject")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
