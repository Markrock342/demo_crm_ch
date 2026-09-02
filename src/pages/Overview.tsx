import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AiError, aiBrief } from "../ai/client";
import { activityI18n, dealStageI18n, dealStages, money, priI18n } from "../crm";
import { customerName } from "../data";
import { useStore } from "../store";
import { AiBriefChat } from "../ui/AiBriefChat";

export function OverviewPage() {
  const { tx, locale, boxes, customers, mails, deals, tasks, docs, activities } = useStore();
  const navigate = useNavigate();
  const teu = boxes.filter((b) => b.status === "yard" || b.status === "empty" || b.status === "hold").reduce((n, b) => n + b.teu, 0);
  const hold = boxes.filter((b) => b.status === "hold").length;
  const openMail = mails.filter((m) => m.state === "open").length;
  const openPipe = deals.filter((d) => d.stage !== "billed").reduce((n, d) => n + d.value, 0);
  const wonTeu = deals.filter((d) => d.stage === "won" || d.stage === "book" || d.stage === "billed").reduce((n, d) => n + d.teu, 0);
  const openTasks = tasks.filter((t) => !t.done);
  const shortDocs = docs.filter((d) => d.status !== "ok");
  const [brief, setBrief] = useState<string | null>(null);
  const [briefing, setBriefing] = useState(false);
  const [briefErr, setBriefErr] = useState<string | null>(null);

  async function runBrief() {
    setBriefing(true);
    setBriefErr(null);
    try {
      const text = await aiBrief(locale, {
        openPipelineYuan: openPipe,
        wonTeu,
        openTasks: openTasks.length,
        papersShort: shortDocs.length,
        teuOnYard: teu,
        holdPapers: hold,
        openMail,
        lane: "Thailand to China, Laem Chabang to Yantian and Ningbo",
      });
      setBrief(text);
    } catch (e) {
      setBriefErr(e instanceof AiError && e.code === "missing_key" ? tx("aiNoKey") : tx("aiError"));
    } finally {
      setBriefing(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{tx("navOverview")}</h1>
          <p>{tx("laneHint")}</p>
        </div>
        <div className="toolbar">
          <Link className="btn btn-primary" to="/boxes?status=hold">
            {tx("primaryDash")}
          </Link>
        </div>
      </div>

      <AiBriefChat brief={brief} busy={briefing} error={briefErr} onRun={runBrief} />

      <section className="kpis" aria-label={tx("navOverview")}>
        <div className="kpi-lead">
          <div className="num">{money(openPipe)}</div>
          <div className="lbl">{tx("dashOpenDeals")}</div>
        </div>
        <div className="kpi">
          <div className="num">{wonTeu}</div>
          <div className="lbl">{tx("dashWonTeu")}</div>
        </div>
        <div className="kpi">
          <div className="num">{openTasks.length}</div>
          <div className="lbl">{tx("dashTasks")}</div>
        </div>
        <div className="kpi">
          <div className="num">{shortDocs.length}</div>
          <div className="lbl">{tx("dashDocs")}</div>
        </div>
      </section>

      <div className="pipe-strip" aria-label={tx("navPipeline")}>
        {dealStages.map((st) => {
          const col = deals.filter((d) => d.stage === st);
          return (
            <button key={st} type="button" className="pipe-cell" onClick={() => navigate("/pipeline")}>
              <span>{tx(dealStageI18n[st])}</span>
              <strong className="num">{col.length}</strong>
              <em className="num">{money(col.reduce((n, d) => n + d.value, 0))}</em>
            </button>
          );
        })}
      </div>

      <div className="split">
        <section className="block">
          <div className="page-head">
            <h2>{tx("todayTitle")}</h2>
            <Link to="/tasks">{tx("viewAll")}</Link>
          </div>
          <p className="hint">{tx("todayHint")}</p>
          <div className="tasks">
            {openTasks.slice(0, 6).map((t) => (
              <Link className="task" key={t.id} to={t.customerId ? `/customers/${t.customerId}` : "/tasks"}>
                <span className="task-name">
                  <span className={`dot pri-${t.priority}`} aria-hidden />
                  {t.title}
                </span>
                <time>
                  {tx(priI18n[t.priority])} · {t.due}
                </time>
              </Link>
            ))}
          </div>
        </section>

        <section className="block">
          <div className="page-head">
            <h2>{tx("tabTimeline")}</h2>
            <Link to="/inbox">{tx("navInbox")}</Link>
          </div>
          <ol className="timeline">
            {activities.slice(0, 6).map((a) => {
              const c = a.customerId ? customers.find((x) => x.id === a.customerId) : undefined;
              return (
                <li key={a.id}>
                  <time>{a.at}</time>
                  <span className="pill">{tx(activityI18n[a.type])}</span>
                  <p>{a.body}</p>
                  <span className="meta">{c ? customerName(c, locale) : a.user}</span>
                </li>
              );
            })}
          </ol>
        </section>
      </div>

      <section className="block">
        <div className="page-head">
          <h2>{tx("recentBoxes")}</h2>
          <Link to="/boxes">{tx("viewAll")}</Link>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{tx("colBox")}</th>
                <th>{tx("colCustomer")}</th>
                <th>{tx("colType")}</th>
                <th>{tx("colDir")}</th>
                <th>{tx("colStatus")}</th>
                <th className="num">{tx("colEta")}</th>
              </tr>
            </thead>
            <tbody>
              {boxes.slice(0, 6).map((b) => {
                const c = customers.find((x) => x.id === b.customerId);
                return (
                  <tr
                    key={b.id}
                    tabIndex={0}
                    onClick={() => navigate(`/boxes?q=${b.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") navigate(`/boxes?q=${b.id}`);
                    }}
                  >
                    <td className="mono">{b.id}</td>
                    <td>{c ? customerName(c, locale) : "—"}</td>
                    <td>{b.type}</td>
                    <td>{tx(b.dir === "in" ? "inboundShort" : "outboundShort")}</td>
                    <td>
                      <span className={`pill pill-${b.status}`}>{tx(`st${cap(b.status)}`)}</span>
                    </td>
                    <td className="num">{b.eta}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
