import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { fetchInvoices, fetchJobs, fetchQuotations, type InvoiceRow, type JobRow, type QuotationRow } from "../api/commercial.ts";
import { dealStageI18n, money, priI18n } from "../crm";
import { demoInvoices, demoJobs, demoQuotations } from "../demo/commercial-demo.ts";
import { cityName, customerName, laneName } from "../data";
import { useAuth } from "../auth/AuthProvider";
import { useStore } from "../store";
import { PageToolbar } from "../ui/PageToolbar";

const crmTabs = ["overview", "people", "mail", "tasks"] as const;
const commercialTabs = ["quotes", "jobs", "invoices", "docs"] as const;
type CrmTab = (typeof crmTabs)[number];
type CommercialTab = (typeof commercialTabs)[number];
type AccountTab = CrmTab | CommercialTab;

const crmTabKey: Record<CrmTab, string> = {
  overview: "tabOverview",
  people: "tabPeople",
  mail: "tabMail",
  tasks: "tabTasks",
};

const commercialTabKey: Record<CommercialTab, string> = {
  quotes: "tabQuotes",
  jobs: "tabJobsCommercial",
  invoices: "tabInvoicesCommercial",
  docs: "tabDocs",
};

export function AccountPage() {
  const { id } = useParams();
  const s = useStore();
  const { tx, locale, addNote, toggleTask } = s;
  const { mode, user } = useAuth();
  const isDemo = mode === "demo";
  const customer = s.customers.find((c) => c.id === id);
  const [tab, setTab] = useState<AccountTab>("overview");
  const [note, setNote] = useState("");
  const [quotes, setQuotes] = useState<QuotationRow[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [commercialLoading, setCommercialLoading] = useState(false);
  const [commercialError, setCommercialError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setCommercialError(null);
    if (isDemo) {
      setQuotes(demoQuotations.filter((q) => q.customerId === id));
      setJobs(demoJobs.filter((j) => j.customerId === id));
      setInvoices(demoInvoices.filter((i) => i.customerId === id));
      return;
    }
    if (!user) return;
    setCommercialLoading(true);
    void Promise.all([fetchQuotations(id), fetchJobs(id), fetchInvoices(id)])
      .then(([q, j, inv]) => {
        setQuotes(q);
        setJobs(j);
        setInvoices(inv);
        setCommercialError(null);
      })
      .catch(() => {
        setQuotes([]);
        setJobs([]);
        setInvoices([]);
        setCommercialError(tx("errorLoadCommercial"));
      })
      .finally(() => setCommercialLoading(false));
  }, [id, isDemo, user, tx]);

  if (!customer) return <Navigate to="/customers" replace />;

  const people = s.contacts.filter((p) => p.customerId === customer.id);
  const boxes = s.boxes.filter((b) => b.customerId === customer.id);
  const mails = s.mails.filter((m) => m.customerId === customer.id);
  const deals = s.deals.filter((d) => d.customerId === customer.id);
  const tasks = s.tasks.filter((t) => t.customerId === customer.id);
  const docs = s.docs.filter((d) => d.customerId === customer.id);
  const primary = people.find((p) => p.primary) ?? people[0];

  function onNote(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    addNote(id, note);
    setNote("");
  }

  const crmCounts: Partial<Record<CrmTab, number>> = {
    people: people.length,
    mail: mails.length,
    tasks: tasks.length,
  };

  const commercialCounts: Record<CommercialTab, number> = {
    quotes: quotes.length,
    jobs: jobs.length,
    invoices: invoices.length,
    docs: docs.length,
  };

  return (
    <div className="page page--workspace page--account">
      <PageToolbar
        title={customerName(customer, locale)}
        hint={`${cityName(customer, locale)} · ${laneName(customer, locale)} · ${tx("colOwner")} ${customer.owner} · ${tx("colAr")} ${customer.arDays}`}
        actions={
          <Link className="btn btn-primary" to="/inbox">
            {tx("openMail")}
          </Link>
        }
        filters={
          <>
            <Link className="crumb crumb-inline" to="/customers">
              ← {tx("backBook")}
            </Link>
            <div className="filter-row account-tabs" role="tablist" aria-label="CRM">
              {crmTabs.map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  className={`filter-chip${tab === t ? " is-on" : ""}`}
                  onClick={() => setTab(t)}
                >
                  <span>{tx(crmTabKey[t])}</span>
                  {crmCounts[t] != null && crmCounts[t]! > 0 ? <em>{crmCounts[t]}</em> : null}
                </button>
              ))}
            </div>
            <p className="filter-strip-label">{tx("commercialStrip")}</p>
            <div className="filter-row account-tabs account-tabs--commercial" role="tablist" aria-label={tx("commercialStrip")}>
              {commercialTabs.map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  className={`filter-chip${tab === t ? " is-on" : ""}`}
                  onClick={() => setTab(t)}
                >
                  <span>{tx(commercialTabKey[t])}</span>
                  {commercialCounts[t] > 0 ? <em>{commercialCounts[t]}</em> : null}
                </button>
              ))}
            </div>
          </>
        }
      />
      {commercialLoading ? <p className="meta" role="status">{tx("loadingCommercial")}</p> : null}
      {commercialError ? (
        <p className="empty" role="alert">
          {commercialError}
        </p>
      ) : null}

      {tab === "overview" ? (
        <div className="split">
          <section className="block">
            <div className="block-head">
              <h2>{tx("tabOverview")}</h2>
              <Link to="/boxes">{tx("viewAllBoxes")}</Link>
            </div>
            <dl className="fact">
              <dt>{tx("primaryContact")}</dt>
              <dd>{primary ? `${primary.name} · ${primary.phone}` : "—"}</dd>
              <dt>{tx("colBoxes")}</dt>
              <dd className="num">{boxes.length}</dd>
              <dt>{tx("dashOpenDeals")}</dt>
              <dd className="num">{money(deals.filter((d) => d.stage !== "billed").reduce((n, d) => n + d.value, 0))}</dd>
            </dl>
            <div className="stat-strip commercial-summary">
              <span className="stat-chip stat-chip--metric">
                <strong className="num">{quotes.length}</strong>
                <span>{tx("tabQuotes")}</span>
              </span>
              <span className="stat-chip stat-chip--metric">
                <strong className="num">{jobs.length}</strong>
                <span>{tx("tabJobsCommercial")}</span>
              </span>
              <span className="stat-chip stat-chip--metric">
                <strong className="num">{invoices.length}</strong>
                <span>{tx("tabInvoicesCommercial")}</span>
              </span>
            </div>
            <form className="note-form" onSubmit={onNote}>
              <label>
                {tx("addNote")}
                <textarea value={note} onChange={(e) => setNote(e.target.value)} required />
              </label>
              <button type="submit" className="btn btn-primary">
                {tx("save")}
              </button>
            </form>
          </section>
          <section className="block">
            <div className="block-head">
              <h2>{tx("navPipeline")}</h2>
            </div>
            {deals.length === 0 ? <p className="empty">{tx("emptyPipe")}</p> : null}
            <ul className="plain">
              {deals.map((d) => (
                <li key={d.id}>
                  <strong>{d.title}</strong>
                  <span>
                    {tx(dealStageI18n[d.stage])} · {money(d.value)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : null}

      {tab === "people" ? (
        people.length === 0 ? (
          <p className="empty">{tx("emptyPeople")}</p>
        ) : (
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{tx("name")}</th>
                  <th>{tx("colTitle")}</th>
                  <th>{tx("colEmail")}</th>
                  <th>{tx("colPhone")}</th>
                  <th>{tx("colWechat")}</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.id}>
                    <td className="cell-strong">
                      {p.name}
                      {p.primary ? <span className="pill pill-hold">{tx("primaryContact")}</span> : null}
                    </td>
                    <td>{p.title}</td>
                    <td>{p.email}</td>
                    <td className="mono">{p.phone}</td>
                    <td className="mono">{p.wechat}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      {tab === "mail" ? (
        mails.length === 0 ? (
          <p className="empty">{tx("emptyInbox")}</p>
        ) : (
          <ul className="plain ledger-list">
            {mails.map((m) => (
              <li key={m.id}>
                <Link to="/inbox">{locale === "th" ? m.subjectTh : locale === "en" ? m.subjectEn : m.subjectZh}</Link>
                <span>
                  {m.from} · {m.time}
                </span>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {tab === "tasks" ? (
        tasks.length === 0 ? (
          <p className="empty">{tx("emptyTasks")}</p>
        ) : (
          <ul className="task-list">
            {tasks.map((t) => (
              <li key={t.id} className={`task-card pri-${t.priority} ${t.done ? "is-done" : ""}`}>
                <div className="task-main">
                  <label className="check">
                    <input type="checkbox" checked={t.done} onChange={() => toggleTask(t.id)} />
                    <span>{t.title}</span>
                  </label>
                  <div className="task-meta">
                    <span className={`task-pri pri-${t.priority}`}>{tx(priI18n[t.priority])}</span>
                    <time className="num">{t.due}</time>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {tab === "quotes" ? (
        quotes.length === 0 ? (
          <p className="empty">{tx("emptyCommercial")}</p>
        ) : (
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{tx("navQuotations")}</th>
                  <th>{tx("colLane")}</th>
                  <th>{tx("colStatus")}</th>
                  <th className="num">{tx("colTeu")}</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => (
                  <tr key={q.id}>
                    <td className="cell-strong">
                      <Link to={`/quotations`}>{q.quotationNumber}</Link>
                    </td>
                    <td>
                      {q.pol} → {q.pod}
                    </td>
                    <td>
                      <span className="pill pill-yard">{q.status}</span>
                    </td>
                    <td className="num">{q.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      {tab === "jobs" ? (
        jobs.length === 0 ? (
          <p className="empty">{tx("emptyCommercial")}</p>
        ) : (
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{tx("navJobs")}</th>
                  <th>{tx("colLane")}</th>
                  <th>{tx("colStatus")}</th>
                  <th className="num">TEU</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id}>
                    <td className="cell-strong">
                      <Link to={`/jobs?selected=${j.id}`}>{j.jobNumber}</Link>
                    </td>
                    <td>
                      {j.pol} → {j.pod}
                    </td>
                    <td>
                      <span className="pill pill-yard">{j.status}</span>
                    </td>
                    <td className="num">{j.teu}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      {tab === "invoices" ? (
        invoices.length === 0 ? (
          <p className="empty">{tx("emptyCommercial")}</p>
        ) : (
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{tx("colInvoice")}</th>
                  <th className="num">{tx("colTotal")}</th>
                  <th className="num">{tx("colBalance")}</th>
                  <th>{tx("colStatus")}</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="cell-strong">
                      <Link to="/invoices">{inv.invoiceNumber}</Link>
                    </td>
                    <td className="num">
                      {inv.total} {inv.currency}
                    </td>
                    <td className="num">
                      {inv.balanceDue} {inv.currency}
                    </td>
                    <td>
                      <span className="pill pill-clear">{inv.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      {tab === "docs" ? (
        docs.length === 0 ? (
          <p className="empty">{tx("emptyDocs")}</p>
        ) : (
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{tx("colFile")}</th>
                  <th>{tx("colKind")}</th>
                  <th>{tx("colBox")}</th>
                  <th>{tx("colStatus")}</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id}>
                    <td className="cell-strong">{d.name}</td>
                    <td className="mono">{d.kind}</td>
                    <td className="mono">{d.boxId}</td>
                    <td>
                      <span className={`pill pill-${d.status === "ok" ? "clear" : d.status === "late" ? "hold" : "yard"}`}>
                        {d.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}
    </div>
  );
}
