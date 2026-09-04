import { useParams } from "react-router-dom";
import { useShellQuotes } from "../shell/quoteStore.tsx";
import { useStore } from "../store";

export function QuotePublicShellPage() {
  const { id } = useParams();
  const { tx } = useStore();
  const { getById, setStatus } = useShellQuotes();
  const quote = id ? getById(id) : undefined;

  if (!quote) {
    return (
      <div className="login-page">
        <div className="login-shell">
          <div className="login-card quote-public">
            <p className="meta">{tx("errorLoad")}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-shell">
        <div className="login-card quote-public">
          <p className="meta">{tx("shellDataBadge")}</p>
          <h1>{quote.quotationNumber}</h1>
          <p>
            {quote.origin} → {quote.destination}
          </p>
          <p className="meta">
            {quote.pol} → {quote.pod} · {quote.mode} · {quote.containerType} × {quote.quantity}
          </p>
          <p>
            <span className="pill">{quote.status}</span>
          </p>
          <ul className="dense-list">
            {quote.charges.map((c, i) => (
              <li key={i}>
                <span>{c.description}</span>
                <strong className="num">
                  {c.sellAmount} {c.currency}
                </strong>
              </li>
            ))}
          </ul>
          <p className="cell-strong">
            {tx("colSell")}: {quote.totalSell} {quote.currency}
          </p>
          {quote.status === "SENT" ? (
            <div className="toolbar">
              <button type="button" className="btn btn-primary" onClick={() => setStatus(quote.id, "ACCEPTED")}>
                {tx("approve")}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setStatus(quote.id, "REJECTED")}>
                {tx("rejectQuote")}
              </button>
            </div>
          ) : quote.status === "ACCEPTED" ? (
            <p className="meta">{tx("quoteApproved")}</p>
          ) : quote.status === "REJECTED" ? (
            <p className="meta">{tx("quoteRejected")}</p>
          ) : (
            <p className="meta">{tx("quoteWizardHint")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
