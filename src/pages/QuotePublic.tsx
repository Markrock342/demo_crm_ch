import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { Alert, Button, Checkbox, Input, Popconfirm, type InputRef } from "antd";
import { CheckCircle, Printer, ShippingContainer, WarningCircle, XCircle } from "@phosphor-icons/react";
import { fetchPublicQuote, signPublicQuote } from "../api/commercial.ts";
import { useStore } from "../store.tsx";
import { LangPicker } from "../ui/LangPicker";
import { LoadingState, RouteTrack } from "../v2/components";
import { fmtDate, fmtMoney } from "../v2/lib/format.ts";
import "../v2/pages/public.css";

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

/** Page frame for public quote pages: brand + language + optional print. */
export function QuoteFrame({ children, printable }: { children: ReactNode; printable?: boolean }) {
  const { tx, locale, setLocale } = useStore();
  return (
    <div className="pub-quote">
      <div className="pub-quote-bar pub-no-print">
        <span className="pub-sheet-from" style={printable ? { visibility: "hidden" } : undefined}>
          <span className="pub-mark is-sm" aria-hidden>
            栈
          </span>
          <span className="pub-sheet-from-text">
            <strong>{tx("brand")}</strong>
          </span>
        </span>
        <span className="pub-quote-bar-tools">
          {printable ? (
            <Button icon={<Printer size={16} aria-hidden />} onClick={() => window.print()}>
              {tx("pub_q_print")}
            </Button>
          ) : null}
          <LangPicker value={locale} onChange={setLocale} />
        </span>
      </div>
      <div className="pub-quote-stack">{children}</div>
    </div>
  );
}

export function QuoteResult({ tone, title, desc, meta }: { tone: "success" | "neutral" | "warning"; title: string; desc?: string; meta?: string }) {
  const Icon = tone === "success" ? CheckCircle : tone === "warning" ? WarningCircle : XCircle;
  return (
    <section className={`pub-result is-${tone}`} role="status">
      <Icon size={48} weight="fill" aria-hidden />
      <h1>{title}</h1>
      {meta ? <span className="cz-mono">{meta}</span> : null}
      {desc ? <p>{desc}</p> : null}
    </section>
  );
}

type SheetProps = {
  number: string;
  revision?: number;
  validUntil?: string | null;
  origin: string;
  destination: string;
  pol: string;
  pod: string;
  mode: string;
  equipment: string | null;
  containerType?: string | null;
  quantity?: number;
  charges: Array<{ description: string; amount: number | string; currency: string }>;
  total: number | string;
  currency: string;
  terms?: string | null;
  badge?: ReactNode;
};

/** Printable quotation document. */
export function QuoteSheet(p: SheetProps) {
  const { tx, locale } = useStore();
  return (
    <article className="pub-sheet">
      <header className="pub-sheet-head">
        <div className="pub-sheet-from">
          <span className="pub-mark" aria-hidden>
            栈
          </span>
          <span className="pub-sheet-from-text">
            <strong>{tx("brand")}</strong>
            <span>{tx("brandRoman")}</span>
          </span>
        </div>
        <div className="pub-sheet-title">
          <h1>{tx("pub_q_doc")}</h1>
          <span className="cz-mono">{p.number}</span>
          {p.revision !== undefined ? <span>{tx("pub_q_rev", { n: p.revision })}</span> : null}
          {p.badge}
        </div>
      </header>

      <section className="pub-sheet-hero" aria-label={tx("pub_q_route")}>
        <div className="pub-sheet-hero-route">
          <RouteTrack
            from={p.pol}
            to={p.pod}
            fromName={p.origin && p.origin !== p.pol ? p.origin : undefined}
            toName={p.destination && p.destination !== p.pod ? p.destination : undefined}
            progress={5}
            size="lg"
          />
          <div className="pub-sheet-chips">
            {p.mode ? <span className="pub-chip">{p.mode}</span> : null}
            {p.containerType ? (
              <span className="pub-boxes" aria-label={`${p.containerType} × ${p.quantity ?? 1}`}>
                <span className="pub-boxes-icons" aria-hidden>
                  {Array.from({ length: Math.min(Math.max(p.quantity ?? 1, 1), 6) }, (_, i) => (
                    <ShippingContainer key={i} size={26} weight="duotone" />
                  ))}
                </span>
                <strong>
                  {p.containerType} × {p.quantity ?? 1}
                </strong>
              </span>
            ) : p.equipment ? (
              <span className="pub-chip">{p.equipment}</span>
            ) : null}
          </div>
        </div>
        <div className="pub-sheet-price">
          <span>{tx("pub_q_total")}</span>
          <strong>{fmtMoney(p.total, p.currency, locale)}</strong>
          {p.validUntil ? (
            <em>
              {tx("pub_q_valid")} {fmtDate(p.validUntil, locale)}
            </em>
          ) : null}
        </div>
      </section>

      <table className="pub-charges" aria-label={tx("pub_q_charges")}>
        <thead>
          <tr>
            <th scope="col">{tx("pub_q_col_item")}</th>
            <th scope="col" className="num">
              {tx("pub_q_col_amount")}
            </th>
          </tr>
        </thead>
        <tbody>
          {p.charges.map((c, i) => (
            <tr key={i}>
              <td>{c.description}</td>
              <td className="num">{fmtMoney(c.amount, c.currency, locale)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>{tx("pub_q_total")}</td>
            <td className="num">{fmtMoney(p.total, p.currency, locale)}</td>
          </tr>
        </tfoot>
      </table>

      {p.terms ? (
        <section className="pub-sheet-terms">
          <h2>{tx("pub_q_terms")}</h2>
          {p.terms}
        </section>
      ) : null}
    </article>
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function QuotePublicPage() {
  const { token } = useParams();
  const { tx } = useStore();
  const [quote, setQuote] = useState<PublicQuote | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<"ACCEPTED" | "REJECTED" | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [form, setForm] = useState({ signerName: "", signerEmail: "", signerCompany: "", acceptedTerms: false });
  const nameRef = useRef<InputRef>(null);
  const emailRef = useRef<InputRef>(null);

  useEffect(() => {
    if (!token) return;
    void fetchPublicQuote(token)
      .then((q) => setQuote(q as PublicQuote))
      .catch(() => setLoadErr(true));
  }, [token]);

  async function send(decision: "ACCEPTED" | "REJECTED") {
    if (!token) return;
    setErr(null);
    setBusy(decision);
    try {
      await signPublicQuote(token, {
        ...form,
        signatureMethod: "TYPED",
        decision,
        acceptedTerms: form.acceptedTerms,
      });
      setDone(decision);
    } catch {
      setErr(tx("pub_q_save_error"));
    } finally {
      setBusy(null);
    }
  }

  function onAccept(e: FormEvent) {
    e.preventDefault();
    void send("ACCEPTED");
  }

  /** Decline still needs a name and a valid email (server requires them). */
  function signerReady() {
    const name = nameRef.current?.input;
    const email = emailRef.current?.input;
    if (!form.signerName.trim()) {
      name?.reportValidity();
      return false;
    }
    if (!EMAIL_RE.test(form.signerEmail.trim())) {
      email?.reportValidity();
      return false;
    }
    return true;
  }

  if (loadErr || !token) {
    return (
      <QuoteFrame>
        <QuoteResult tone="warning" title={tx("pub_q_error_title")} desc={tx("pub_q_error_desc")} />
      </QuoteFrame>
    );
  }

  if (!quote) {
    return (
      <QuoteFrame>
        <LoadingState tip={tx("pub_loading")} />
      </QuoteFrame>
    );
  }

  if (done) {
    return (
      <QuoteFrame>
        {done === "ACCEPTED" ? (
          <QuoteResult tone="success" title={tx("pub_q_accepted_title")} desc={tx("pub_q_accepted_desc")} meta={quote.quotationNumber} />
        ) : (
          <QuoteResult tone="neutral" title={tx("pub_q_declined_title")} desc={tx("pub_q_declined_desc")} meta={quote.quotationNumber} />
        )}
      </QuoteFrame>
    );
  }

  return (
    <QuoteFrame printable>
      <QuoteSheet
        number={quote.quotationNumber}
        revision={quote.revisionNumber}
        validUntil={quote.validUntil}
        origin={quote.origin}
        destination={quote.destination}
        pol={quote.pol}
        pod={quote.pod}
        mode={quote.mode}
        equipment={quote.containerType ? `${quote.containerType} × ${quote.quantity}` : null}
        containerType={quote.containerType}
        quantity={quote.quantity}
        charges={quote.charges.map((c) => ({ description: c.description, amount: c.sellAmount, currency: c.currency }))}
        total={quote.totalSell}
        currency={quote.currency}
        terms={quote.termsAndConditions}
      />

      <section className="pub-respond pub-no-print" aria-labelledby="pub-respond-title">
        <h2 id="pub-respond-title">{tx("pub_q_respond")}</h2>
        <form className="pub-form" onSubmit={onAccept}>
          <div className="pub-respond-grid">
            <label className="pub-field">
              <span>
                {tx("pub_q_signer_name")} <span className="cz-muted">*</span>
              </span>
              <Input
                ref={nameRef}
                size="large"
                required
                autoComplete="name"
                value={form.signerName}
                onChange={(e) => setForm({ ...form, signerName: e.target.value })}
              />
            </label>
            <label className="pub-field">
              <span>
                {tx("pub_q_signer_email")} <span className="cz-muted">*</span>
              </span>
              <Input
                ref={emailRef}
                size="large"
                type="email"
                required
                autoComplete="email"
                value={form.signerEmail}
                onChange={(e) => setForm({ ...form, signerEmail: e.target.value })}
              />
            </label>
            <label className="pub-field">
              <span>{tx("pub_q_signer_company")}</span>
              <Input
                size="large"
                autoComplete="organization"
                value={form.signerCompany}
                onChange={(e) => setForm({ ...form, signerCompany: e.target.value })}
              />
            </label>
          </div>
          <Checkbox
            checked={form.acceptedTerms}
            onChange={(e) => setForm({ ...form, acceptedTerms: e.target.checked })}
            required
          >
            {tx("pub_q_confirm")}
          </Checkbox>
          {err ? <Alert type="error" showIcon message={err} role="alert" /> : null}
          <div className="pub-respond-actions">
            <Popconfirm
              title={tx("pub_q_decline_confirm")}
              okText={tx("pub_q_decline_ok")}
              cancelText={tx("pub_q_cancel")}
              okButtonProps={{ danger: true }}
              open={declineOpen}
              onOpenChange={(open) => setDeclineOpen(open && signerReady())}
              onConfirm={() => {
                setDeclineOpen(false);
                void send("REJECTED");
              }}
            >
              <Button size="large" danger type="text" loading={busy === "REJECTED"} disabled={busy !== null}>
                {tx("pub_q_decline")}
              </Button>
            </Popconfirm>
            <Button
              type="primary"
              htmlType="submit"
              size="large"
              icon={<CheckCircle size={18} aria-hidden />}
              loading={busy === "ACCEPTED"}
              disabled={busy !== null || !form.acceptedTerms}
            >
              {tx("pub_q_accept")}
            </Button>
          </div>
        </form>
      </section>
    </QuoteFrame>
  );
}
