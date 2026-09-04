import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { quoteStub } from "../adapters/stub/quote.stub.ts";
import { customerName, type Customer } from "../data";
import { useShellCrm } from "../shell/crmStore.tsx";
import { useShellJobs } from "../shell/jobStore.tsx";
import { useShellQuotes } from "../shell/quoteStore.tsx";
import { useIsShellMode } from "../shell/session.tsx";
import { useStore } from "../store";
import { PageToolbar } from "../ui/PageToolbar";

import { uiV2 } from "../v2/config.ts";
import { QuotationsPageV2 } from "../v2/pages/QuotationsPage.tsx";

export function QuotationsPage() {
  if (uiV2) return <QuotationsPageV2 />;
  const shell = useIsShellMode();
  const { tx, locale } = useStore();
  const crm = useShellCrm();
  const quoteStore = useShellQuotes();
  const jobs = useShellJobs();
  const navigate = useNavigate();
  const customers = crm.customers;
  const rows = shell ? quoteStore.quotations : [];
  const [selected, setSelected] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  void quoteStub;

  const customerMap = useMemo(() => Object.fromEntries(customers.map((c) => [c.id, c])), [customers]);
  const detail = selected ? quoteStore.quotations.find((q) => q.id === selected) ?? null : rows[0] ?? null;
  const activeId = detail?.id ?? null;
  const hasJob = detail ? jobs.jobs.some((j) => j.quotationId === detail.id) : false;

  function pick(id: string) {
    setSelected(id);
    setMsg(null);
  }

  return (
    <div className="page page--workspace page--split">
      <PageToolbar
        title={tx("quotationsTitle")}
        count={rows.length}
        hint={shell ? `${tx("shellDataBadge")} · ${tx("quoteWizardHint")}` : tx("quotationsDemoHint")}
        actions={
          shell ? (
            <Link className="btn btn-primary" to="/quotations/new">
              {tx("quoteWizardTitle")}
            </Link>
          ) : null
        }
      />
      {msg ? <p className="meta">{msg}</p> : null}

      <div className="split-panels">
        <div className="panel">
          <h2>{tx("quotationsList")}</h2>
          {rows.length === 0 ? (
            <p className="empty">{tx("emptyQuotations")}</p>
          ) : (
            <ul className="pick-list">
              {rows.map((q) => (
                <li key={q.id}>
                  <button type="button" className={`list-btn${activeId === q.id ? " is-active" : ""}`} onClick={() => pick(q.id)}>
                    <strong>{q.quotationNumber}</strong>
                    <span className="meta">
                      {customerMap[q.customerId] ? customerName(customerMap[q.customerId] as Customer, locale) : q.customerId}
                    </span>
                    <span className={`pill ${q.status === "ACCEPTED" ? "pill-ok" : ""}`}>{q.status}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="panel">
          {detail && shell ? (
            <>
              <h2>{detail.quotationNumber}</h2>
              <p>
                {detail.origin} → {detail.destination} · {detail.pol} → {detail.pod}
              </p>
              <p className="meta">
                {detail.mode} · {detail.containerType} × {detail.quantity} · {detail.status} · {tx("quoteRev")}{" "}
                {detail.revision ?? 1}
              </p>
              <p className="meta">
                {tx("quoteValidFrom")}: {detail.validFrom || "—"} · {tx("quoteValidUntil")}: {detail.validUntil || "—"}
              </p>
              <div className="stat-strip">
                <span className="stat-chip stat-chip--metric">
                  <strong className="num">
                    {detail.totalSell} {detail.currency}
                  </strong>
                  <span>{tx("colSell")}</span>
                </span>
              </div>
              <ul className="dense-list">
                {detail.charges.map((c, i) => (
                  <li key={i}>
                    <span>{c.description}</span>
                    <strong className="num">
                      {c.sellAmount} {c.currency}
                    </strong>
                  </li>
                ))}
              </ul>
              <div className="toolbar">
                {detail.status === "DRAFT" ? (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      quoteStore.setStatus(detail.id, "PENDING_APPROVAL");
                      setMsg(tx("quoteSubmitted"));
                    }}
                  >
                    {tx("quoteSubmitApproval")}
                  </button>
                ) : null}
                {detail.status === "PENDING_APPROVAL" ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      quoteStore.setStatus(detail.id, "SENT");
                      setMsg(tx("quoteSent"));
                    }}
                  >
                    {tx("quoteMarkSent")}
                  </button>
                ) : null}
                {detail.status === "SENT" || detail.status === "DRAFT" || detail.status === "PENDING_APPROVAL" ? (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      quoteStore.setStatus(detail.id, "EXPIRED");
                      setMsg(tx("quoteExpired"));
                    }}
                  >
                    {tx("quoteMarkExpired")}
                  </button>
                ) : null}
                {detail.status !== "ACCEPTED" ? (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      quoteStore.bumpRevision(detail.id);
                      setMsg(tx("quoteRevisionBumped"));
                    }}
                  >
                    {tx("quoteBumpRevision")}
                  </button>
                ) : null}
                {detail.status === "SENT" || detail.status === "ACCEPTED" || detail.status === "REJECTED" ? (
                  <Link className="btn btn-ghost" to={`/q/shell/${detail.id}`} target="_blank" rel="noopener noreferrer">
                    {tx("quoteOpenPreview")}
                  </Link>
                ) : null}
                {detail.status === "ACCEPTED" && !hasJob ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      const r = jobs.createFromQuoteId(detail);
                      if (r.error) {
                        setMsg(tx(r.error));
                        return;
                      }
                      setMsg(tx("jobCreated"));
                      if (r.id) navigate(`/jobs/${r.id}`);
                      else navigate("/jobs");
                    }}
                  >
                    {tx("createJobFromQuote")}
                  </button>
                ) : null}
                {hasJob ? (
                  <Link className="btn btn-ghost" to={`/jobs/${jobs.jobs.find((j) => j.quotationId === detail.id)?.id ?? ""}`}>
                    {tx("navJobs")}
                  </Link>
                ) : null}
                <button type="button" className="btn btn-ghost" disabled title={tx("loginRemoteTodo")}>
                  {tx("quoteConnectApi")}
                </button>
              </div>
            </>
          ) : (
            <p className="meta">{shell ? tx("selectQuotation") : tx("apiNotConfigured")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
