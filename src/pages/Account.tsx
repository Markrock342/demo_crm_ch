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
        <p className="meta">{tx("apiNotConfigured")}</p>
        <Link to="/customers">{tx("navCustomers")}</Link>
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
    <div className="page page--workspace">
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

      <div className="filter-row" role="tablist">
        {tabs.map((t) => (
          <button key={t} type="button" role="tab" className={`filter-chip${tab === t ? " is-on" : ""}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <>
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
          <div className="kpi-row">
            <div className="kpi">
              <span>{tx("customerActiveJobs")}</span>
              <strong>{activeJobs.length}</strong>
            </div>
            <div className="kpi">
              <span>{tx("customerClosedJobs")}</span>
              <strong>{closedJobs.length}</strong>
            </div>
            <div className="kpi">
              <span>AR</span>
              <strong>{openAr.length}</strong>
            </div>
            <div className="kpi">
              <span>{tx("jobGrossProfit")}</span>
              <strong>{gpSum}</strong>
            </div>
          </div>
        </>
      ) : null}

      {tab === "people" ? (
        <ul className="list-plain">
          {people.map((p) => (
            <li key={p.id}>
              {p.name} · {p.role || p.title} · {p.email}
            </li>
          ))}
        </ul>
      ) : null}

      {tab === "quotes" ? (
        <ul className="list-plain">
          {qRows.map((q) => (
            <li key={q.id}>
              <Link to={`/quotations?id=${q.id}`}>{q.quotationNumber}</Link> · {q.status} · rev {q.revision} · {q.totalSell}{" "}
              {q.currency}
            </li>
          ))}
        </ul>
      ) : null}

      {tab === "jobs" ? (
        <ul className="list-plain">
          {jRows.map((j) => (
            <li key={j.id}>
              <Link to={`/jobs/${j.id}`}>{j.jobNumber}</Link> · {j.status} · {j.billingStatus} · GP {jobGrossProfit(j)}
            </li>
          ))}
        </ul>
      ) : null}

      {tab === "invoices" ? (
        <ul className="list-plain">
          {invRows.map((i) => (
            <li key={i.id}>
              <Link to={`/invoices?jobId=${i.jobId ?? ""}`}>{i.invoiceNumber}</Link> · {i.status} · bal {i.balanceDue}
              {i.overdue ? <span className="pill pill-warn">overdue</span> : null}
              {i.jobId ? (
                <>
                  {" "}
                  · <Link to={`/jobs/${i.jobId}`}>{tx("navJobs")}</Link>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {tab === "docs" ? (
        <ul className="list-plain">
          {docRows.map((d) => (
            <li key={d.id}>
              {d.docType} {d.name} · {d.status}
              {d.jobId ? (
                <>
                  {" "}
                  · <Link to={`/jobs/${d.jobId}`}>{d.jobId}</Link>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
