import { useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { customerName, type Customer } from "../data";
import { jobGrossProfit } from "../ports/job.port.ts";
import { useShellBilling } from "../shell/billingStore.tsx";
import { useShellCrm } from "../shell/crmStore.tsx";
import { useShellJobs } from "../shell/jobStore.tsx";
import { useShellQuotes } from "../shell/quoteStore.tsx";
import { useIsShellMode } from "../shell/session.tsx";
import { useShellSupport } from "../shell/supportStore.tsx";
import { useStore } from "../store";
import { PageToolbar } from "../ui/PageToolbar";

const tabs = ["overview", "people", "quotes", "jobs", "invoices", "docs"] as const;
type Tab = (typeof tabs)[number];

const tabLabelKey: Record<Tab, string> = {
  overview: "tabOverview",
  people: "accountTabPeople",
  quotes: "tabQuotes",
  jobs: "tabJobsCommercial",
  invoices: "tabInvoicesCommercial",
  docs: "navDocs",
};

/** Shell-mode Customer 360 — no src/api. */
export function AccountPage() {
  const shell = useIsShellMode();
  const { id } = useParams();
  const { tx, locale } = useStore();
  const crm = useShellCrm();
  const quotes = useShellQuotes();
  const jobs = useShellJobs();
  const billing = useShellBilling();
  const support = useShellSupport();
  const [tab, setTab] = useState<Tab>("overview");

  if (!shell) {
    return (
      <div className="page page--workspace">
        <PageToolbar title={tx("navCustomers")} />
        <p className="empty">{tx("apiNotConfigured")}</p>
        <p className="page-foot">
          <Link to="/customers">{tx("navCustomers")}</Link>
        </p>
      </div>
    );
  }

  const customer = crm.customers.find((c) => c.id === id);
  if (!customer) return <Navigate to="/customers" replace />;

  const people = crm.contacts.filter((p) => p.customerId === customer.id);
  const qRows = quotes.quotations.filter((q) => q.customerId === customer.id);
  const jRows = jobs.jobs.filter((j) => j.customerId === customer.id);
  const activeJobs = jRows.filter((j) => j.status !== "CLOSED");
  const closedJobs = jRows.filter((j) => j.status === "CLOSED");
  const invRows = billing.invoices.filter((i) => i.customerId === customer.id);
  const docRows = support.docs.filter((d) => jRows.some((j) => j.id === d.jobId));
  const openAr = invRows.filter((i) => i.balanceDue > 0);
  const gpSum = jRows.reduce((n, j) => n + jobGrossProfit(j), 0);

  return (
    <div className="page page--workspace page--account">
      <PageToolbar
        title={customerName(customer as Customer, locale)}
        hint={`${tx("shellDataBadge")} · ${customer.laneZh}`}
        actions={
          <>
            <Link className="btn btn-ghost" to={`/portal?customerId=${customer.id}`}>
              {tx("portalOpenPreview")}
            </Link>
            <Link className="btn btn-ghost" to="/customers">
              {tx("navCustomers")}
            </Link>
          </>
        }
      />

      <div className="filter-row account-tabs account-tabs--commercial" role="tablist">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={`filter-chip${tab === t ? " is-on" : ""}`}
            onClick={() => setTab(t)}
          >
            {tx(tabLabelKey[t])}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <section className="block">
          <dl className="job-dl">
            <div>
              <dt>{tx("customerTaxId")}</dt>
              <dd>{customer.taxId || "—"}</dd>
            </div>
            <div>
              <dt>{tx("customerBillingAddress")}</dt>
              <dd>{customer.billingAddress || "—"}</dd>
            </div>
            <div>
              <dt>{tx("customerCreditTerm")}</dt>
              <dd>{customer.creditTerm || "—"}</dd>
            </div>
            <div>
              <dt>{tx("customerCreditLimit")}</dt>
              <dd>{customer.creditLimit != null ? customer.creditLimit : "—"}</dd>
            </div>
            <div>
              <dt>{tx("colOwner")}</dt>
              <dd>{customer.owner}</dd>
            </div>
          </dl>
          <div className="stat-strip commercial-summary" aria-label={tx("tabOverview")}>
            <span className="stat-chip stat-chip--metric">
              <strong className="num">{activeJobs.length}</strong>
              <span>{tx("customerActiveJobs")}</span>
            </span>
            <span className="stat-chip">
              <strong className="num">{closedJobs.length}</strong>
              <span>{tx("customerClosedJobs")}</span>
            </span>
            <span className="stat-chip">
              <strong className="num">{openAr.length}</strong>
              <span>{tx("dashOutstandingAr")}</span>
            </span>
            <span className="stat-chip">
              <strong className="num">{gpSum}</strong>
              <span>{tx("jobGrossProfit")}</span>
            </span>
          </div>
        </section>
      ) : null}

      {tab === "people" ? (
        people.length === 0 ? (
          <p className="empty">{tx("emptyShellCrm")}</p>
        ) : (
          <ul className="dense-list">
            {people.map((p) => (
              <li key={p.id}>
                <span>
                  <strong>{p.name}</strong>
                  <span className="meta">
                    {" "}
                    · {p.role || p.title} · {p.email}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {tab === "quotes" ? (
        qRows.length === 0 ? (
          <p className="empty">{tx("emptyQuotations")}</p>
        ) : (
          <ul className="dense-list">
            {qRows.map((q) => (
              <li key={q.id}>
                <Link to={`/quotations?id=${q.id}`}>
                  <strong>{q.quotationNumber}</strong>
                  <span className="meta">
                    {q.status} · {tx("quoteRev")} {q.revision} · {q.totalSell} {q.currency}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {tab === "jobs" ? (
        jRows.length === 0 ? (
          <p className="empty">{tx("emptyShellCrm")}</p>
        ) : (
          <ul className="dense-list">
            {jRows.map((j) => (
              <li key={j.id}>
                <Link to={`/jobs/${j.id}`}>
                  <strong>{j.jobNumber}</strong>
                  <span className="meta">
                    {j.status} · {j.billingStatus} · {tx("jobGrossProfit")} {jobGrossProfit(j)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {tab === "invoices" ? (
        invRows.length === 0 ? (
          <p className="empty">{tx("emptyInvoices")}</p>
        ) : (
          <ul className="dense-list">
            {invRows.map((i) => (
              <li key={i.id}>
                <Link to={`/invoices?jobId=${i.jobId ?? ""}`}>
                  <strong>{i.invoiceNumber}</strong>
                  <span className="meta">
                    {i.status} · {tx("colBalance")} {i.balanceDue}
                    {i.overdue ? ` · ${tx("invoiceOverdue")}` : ""}
                    {i.jobId ? ` · ${tx("navJobs")}` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {tab === "docs" ? (
        docRows.length === 0 ? (
          <p className="empty">{tx("emptyShellCrm")}</p>
        ) : (
          <ul className="dense-list">
            {docRows.map((d) => (
              <li key={d.id}>
                {d.jobId ? (
                  <Link to={`/jobs/${d.jobId}`}>
                    <strong>
                      {d.docType} {d.name}
                    </strong>
                    <span className="meta">{d.status}</span>
                  </Link>
                ) : (
                  <>
                    <strong>
                      {d.docType} {d.name}
                    </strong>
                    <span className="meta">{d.status}</span>
                  </>
                )}
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
