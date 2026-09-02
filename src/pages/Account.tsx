import { useState, type FormEvent } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { activityI18n, dealStageI18n, money, priI18n } from "../crm";
import { cityName, customerName, laneName, yardName } from "../data";
import { useStore } from "../store";
import { PageToolbar } from "../ui/PageToolbar";

const tabs = ["overview", "people", "boxes", "mail", "tasks", "docs", "timeline"] as const;
type Tab = (typeof tabs)[number];

const tabKey: Record<Tab, string> = {
  overview: "tabOverview",
  people: "tabPeople",
  boxes: "tabBoxes",
  mail: "tabMail",
  tasks: "tabTasks",
  docs: "tabDocs",
  timeline: "tabTimeline",
};

export function AccountPage() {
  const { id } = useParams();
  const s = useStore();
  const { tx, locale, addNote, toggleTask } = s;
  const customer = s.customers.find((c) => c.id === id);
  const [tab, setTab] = useState<Tab>("overview");
  const [note, setNote] = useState("");

  if (!customer) return <Navigate to="/customers" replace />;

  const people = s.contacts.filter((p) => p.customerId === customer.id);
  const boxes = s.boxes.filter((b) => b.customerId === customer.id);
  const mails = s.mails.filter((m) => m.customerId === customer.id);
  const deals = s.deals.filter((d) => d.customerId === customer.id);
  const tasks = s.tasks.filter((t) => t.customerId === customer.id);
  const docs = s.docs.filter((d) => d.customerId === customer.id);
  const acts = s.activities.filter((a) => a.customerId === customer.id);
  const primary = people.find((p) => p.primary) ?? people[0];

  function onNote(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    addNote(id, note);
    setNote("");
  }

  const tabCounts: Partial<Record<Tab, number>> = {
    people: people.length,
    boxes: boxes.length,
    mail: mails.length,
    tasks: tasks.length,
    docs: docs.length,
    timeline: acts.length,
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
            <div className="filter-row account-tabs" role="tablist">
              {tabs.map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  className={`filter-chip${tab === t ? " is-on" : ""}`}
                  onClick={() => setTab(t)}
                >
                  <span>{tx(tabKey[t])}</span>
                  {tabCounts[t] != null && tabCounts[t]! > 0 ? <em>{tabCounts[t]}</em> : null}
                </button>
              ))}
            </div>
          </>
        }
      />

      {tab === "overview" ? (
        <div className="split">
          <section className="block">
            <div className="block-head">
              <h2>{tx("tabOverview")}</h2>
            </div>
            <dl className="fact">
              <dt>{tx("primaryContact")}</dt>
              <dd>{primary ? `${primary.name} · ${primary.phone}` : "—"}</dd>
              <dt>{tx("colBoxes")}</dt>
              <dd className="num">{boxes.length}</dd>
              <dt>{tx("dashOpenDeals")}</dt>
              <dd className="num">{money(deals.filter((d) => d.stage !== "billed").reduce((n, d) => n + d.value, 0))}</dd>
            </dl>
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

      {tab === "boxes" ? (
        boxes.length === 0 ? (
          <p className="empty">{tx("noMatch")}</p>
        ) : (
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{tx("colBox")}</th>
                  <th>{tx("colType")}</th>
                  <th>{tx("colStatus")}</th>
                  <th>{tx("colYard")}</th>
                  <th className="num">{tx("colEta")}</th>
                </tr>
              </thead>
              <tbody>
                {boxes.map((b) => (
                  <tr key={b.id}>
                    <td className="mono cell-strong">{b.id}</td>
                    <td>{b.type}</td>
                    <td>
                      <span className={`pill pill-${b.status}`}>{tx(`st${b.status.charAt(0).toUpperCase()}${b.status.slice(1)}`)}</span>
                    </td>
                    <td>{yardName(b, locale)}</td>
                    <td className="num">{b.eta}</td>
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

      {tab === "timeline" ? (
        acts.length === 0 ? (
          <p className="empty">{tx("noMatch")}</p>
        ) : (
          <ol className="timeline">
            {acts.map((a) => (
              <li key={a.id}>
                <time>{a.at}</time>
                <span className="pill">{tx(activityI18n[a.type])}</span>
                <p>{a.body}</p>
                <span className="meta">{a.user}</span>
              </li>
            ))}
          </ol>
        )
      ) : null}
    </div>
  );
}
