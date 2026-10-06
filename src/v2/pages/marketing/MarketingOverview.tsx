import {
  ArrowDown,
  Buildings,
  CheckCircle,
  ClockCountdown,
  Coins,
  Funnel,
  Info,
  ListPlus,
  PaperPlaneTilt,
  Timer,
  Trophy,
  UserPlus,
} from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Tooltip } from "antd";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { fetchAtRisk, type AtRiskRow, type FunnelKey, type MarketingOverview as Overview } from "../../../api/marketing.ts";
import { useStore } from "../../../store";
import { Donut, EmptyState, IconBadge, Legend, Panel, PersonAvatar, SegmentBar, Tile, TileRow } from "../../components";
import { useTaskActions } from "../../hooks/useTasks.ts";
import { fmtNumber } from "../../lib/format.ts";
import { customerName, fmtCompactMoney, fmtPct, LanePair, monthLabel, moneyLines, ownerName, SOURCE_ICON, type Tone } from "./mkShared.tsx";

const FUNNEL: { key: FunnelKey; icon: typeof Funnel; tone: Tone; to: string }[] = [
  { key: "leads", icon: UserPlus, tone: "primary", to: "/leads" },
  { key: "qualified", icon: Funnel, tone: "primary", to: "/leads" },
  { key: "sent", icon: PaperPlaneTilt, tone: "info", to: "/quotations?tab=sent" },
  { key: "accepted", icon: CheckCircle, tone: "info", to: "/quotations?tab=accepted" },
  { key: "jobs", icon: Trophy, tone: "success", to: "/jobs" },
];

const STAGE_TONE: Record<string, Tone> = { qualify: "neutral", quote: "primary", won: "success", book: "info", billed: "accent" };

function PanelTitle({ children, tip }: { children: ReactNode; tip?: string }) {
  return (
    <span className="mk-panel-title">
      {children}
      {tip ? (
        <Tooltip title={tip}>
          <Info size={15} className="mk-info" aria-label={tip} />
        </Tooltip>
      ) : null}
    </span>
  );
}

export function OverviewTiles({ data }: { data: Overview }) {
  const { tx, locale } = useStore();
  const pipe = moneyLines(data.pipeline.open, locale);
  return (
    <div className="mk-tiles">
      <TileRow>
        <Tile icon={UserPlus} tone="primary" value={fmtNumber(data.leads.total, locale)} label={tx("mk_tileNewLeads")} to="/leads" />
        <Tile
          icon={Funnel}
          tone="info"
          value={fmtPct(data.leads.conversion)}
          label={tx("mk_tileConversion")}
          to="/leads"
          visual={
            data.leads.total ? (
              <SegmentBar
                height={6}
                parts={[
                  { value: data.leads.qualified, tone: "info", label: tx("mk_f_qualified") },
                  { value: Math.max(0, data.leads.total - data.leads.qualified), tone: "neutral", label: tx("mk_f_leads") },
                ]}
              />
            ) : undefined
          }
        />
        <Tile
          icon={Trophy}
          tone="success"
          value={fmtPct(data.quotations.winRate)}
          label={tx("mk_tileWinRate")}
          to="/quotations?tab=accepted"
          visual={<span className="mk-tile-note">{tx("mk_acceptedN", { n: data.quotations.accepted })}</span>}
        />
        <Tile
          icon={Coins}
          tone="accent"
          value={pipe.main}
          label={tx("mk_tilePipeline")}
          to="/pipeline"
          visual={<span className="mk-tile-note">{[tx("mk_dealsN", { n: data.pipeline.openDeals }), pipe.rest].filter(Boolean).join(" · ")}</span>}
        />
        <Tile
          icon={Buildings}
          tone="primary"
          value={fmtNumber(data.customers.newCount, locale)}
          label={tx("mk_tileNewCustomers")}
          to="/customers"
          visual={<span className="mk-tile-note">{tx("mk_activeN", { n: data.customers.active })}</span>}
        />
      </TileRow>
    </div>
  );
}

function FunnelPanel({ data }: { data: Overview }) {
  const { tx, locale } = useStore();
  const max = Math.max(1, ...data.funnel.map((f) => f.count));
  return (
    <Panel title={<PanelTitle tip={tx("mk_funnelTip")}>{tx("mk_funnel")}</PanelTitle>}>
      <ol className="mk-funnel">
        {data.funnel.map((f, i) => {
          const def = FUNNEL.find((d) => d.key === f.key)!;
          const I = def.icon;
          return (
            <li key={f.key}>
              {i > 0 ? (
                <div className="mk-funnel-rate" aria-hidden={f.rate === null}>
                  <span>
                    <ArrowDown size={11} aria-hidden />
                    {f.rate !== null && f.rate <= 100 ? fmtPct(f.rate) : ""}
                  </span>
                </div>
              ) : null}
              <Link to={def.to} className="mk-funnel-step" aria-label={`${tx(`mk_f_${f.key}`)}: ${f.count}`}>
                <span className="mk-funnel-label">
                  <IconBadge icon={I} tone={def.tone} size={28} />
                  <span>{tx(`mk_f_${f.key}`)}</span>
                </span>
                <span className="mk-funnel-track">
                  <span className={`mk-funnel-bar is-${def.tone}`} style={{ width: `${Math.max(8, (f.count / max) * 100)}%` }}>
                    {fmtNumber(f.count, locale)}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}

function SourcesPanel({ data }: { data: Overview }) {
  const { tx, locale } = useStore();
  const max = Math.max(1, ...data.sources.map((s) => s.leads));
  return (
    <Panel title={tx("mk_sources")}>
      {data.sources.length ? (
        <>
          <ul className="mk-sources">
            {data.sources.map((s) => {
              const I = SOURCE_ICON[s.key];
              const name = s.key === "other" && s.raw.length === 1 && s.raw[0] ? s.raw[0] : tx(`mk_src_${s.key}`);
              return (
                <li key={s.key}>
                  <Link to="/leads" className="mk-source">
                    <span className="mk-source-name">
                      <IconBadge icon={I} tone="primary" size={26} />
                      <span>{name}</span>
                    </span>
                    <Tooltip title={`${tx("mk_f_leads")} ${s.leads} · ${tx("mk_won")} ${s.won}`}>
                      <span className="mk-source-track">
                        <span className="mk-source-bar" style={{ width: `${(s.leads / max) * 100}%` }} />
                        <span className="mk-source-won" style={{ width: `${(s.won / max) * 100}%` }} />
                      </span>
                    </Tooltip>
                    <span className="mk-source-value">
                      <strong>{fmtNumber(s.leads, locale)}</strong>
                      <em>
                        {tx("mk_won")} {fmtPct(s.wonRate)}
                      </em>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="mk-legend-row">
            <Legend
              items={[
                { tone: "primary", label: tx("mk_f_leads") },
                { tone: "success", label: tx("mk_f_qualified") },
              ]}
            />
          </div>
        </>
      ) : (
        <EmptyState title={tx("mk_empty")} />
      )}
    </Panel>
  );
}

function QuotesPanel({ data }: { data: Overview }) {
  const { tx, locale } = useStore();
  const q = data.quotations;
  const parts: { value: number; tone: Tone; label: string }[] = [
    { value: q.accepted, tone: "success", label: tx("mk_q_accepted") },
    { value: q.waiting, tone: "info", label: tx("mk_q_waiting") },
    { value: q.rejected, tone: "accent", label: tx("mk_q_rejected") },
    { value: q.expired, tone: "neutral", label: tx("mk_q_expired") },
  ];
  const laneMax = Math.max(1, ...q.topLanes.map((l) => l.quotes));
  return (
    <Panel title={tx("mk_quotes")} extra={<Link to="/quotations">{tx("mk_quotesN", { n: q.sent })}</Link>}>
      {q.sent ? (
        <div className="mk-quotes">
          <Donut size={132} parts={parts} center={fmtPct(q.acceptanceRate)} caption={tx("mk_acceptance")} />
          <div className="mk-quotes-side">
            <Legend items={parts.map((p) => ({ tone: p.tone, label: p.label, value: fmtNumber(p.value, locale) }))} />
            <div className="mk-mini-stats">
              <Tooltip title={tx("mk_winRateTip")}>
                <span className="mk-mini">
                  <Trophy size={15} aria-hidden />
                  {tx("mk_tileWinRate")} <strong>{fmtPct(q.winRate)}</strong>
                </span>
              </Tooltip>
              <span className="mk-mini">
                <Timer size={15} aria-hidden />
                {tx("mk_avgDays")} <strong>{q.avgDaysToClose === null ? "—" : tx("mk_days", { n: q.avgDaysToClose })}</strong>
              </span>
            </div>
          </div>
        </div>
      ) : (
        <EmptyState title={tx("mk_empty")} />
      )}
      {q.topLanes.length ? (
        <>
          <div className="mk-subhead">{tx("mk_topLanes")}</div>
          <ul className="cz-barlist mk-lanes">
            {q.topLanes.map((l) => (
              <li key={`${l.pol}-${l.pod}`}>
                <Link to="/quotations" className="cz-barlist-row">
                  <span className="cz-barlist-label">
                    <LanePair pol={l.pol} pod={l.pod} />
                  </span>
                  <Tooltip title={`${tx("mk_q_accepted")} ${l.accepted}`}>
                    <span className="cz-barlist-track">
                      <span className="cz-barlist-bar is-info" style={{ width: `${(l.quotes / laneMax) * 100}%` }} />
                    </span>
                  </Tooltip>
                  <span className="cz-barlist-value">{fmtNumber(l.quotes, locale)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Panel>
  );
}

function PipelinePanel({ data }: { data: Overview }) {
  const { tx, locale } = useStore();
  const p = data.pipeline;
  const mainCur = p.open[0]?.currency;
  const ownerValue = (o: Overview["pipeline"]["byOwner"][number]) => o.open.find((m) => m.currency === mainCur)?.value ?? 0;
  const owners = p.byOwner.filter((o) => o.openDeals || o.wonDeals);
  const max = Math.max(1, ...owners.map(ownerValue));
  const stages = p.byStage.filter((s) => s.deals);
  return (
    <Panel title={tx("mk_pipelineOwners")} extra={<span className="mk-now">{tx("mk_now")}</span>}>
      {stages.length ? (
        <div className="mk-stagebar">
          <SegmentBar height={12} parts={stages.map((s) => ({ value: s.deals, tone: STAGE_TONE[s.stage] ?? "neutral", label: tx(`mk_stage_${s.stage}`) }))} />
          <Legend items={stages.map((s) => ({ tone: STAGE_TONE[s.stage] ?? "neutral", label: tx(`mk_stage_${s.stage}`), value: s.deals }))} />
        </div>
      ) : null}
      {owners.length ? (
        <ul className="mk-owners">
          {owners.map((o) => {
            const name = ownerName(o.owner, locale, tx("mk_unassigned"));
            const v = ownerValue(o);
            return (
              <li key={o.owner.key}>
                <Link to="/pipeline" className="mk-owner">
                  <span className="mk-owner-name">
                    <PersonAvatar name={name} size={28} />
                    <span>{name}</span>
                  </span>
                  <span className="mk-owner-track">
                    <span className="mk-owner-bar" style={{ width: `${(v / max) * 100}%` }} />
                  </span>
                  <span className="mk-owner-value">
                    <strong>{mainCur ? fmtCompactMoney(v, mainCur, locale) : "—"}</strong>
                    <em>
                      {tx("mk_openN", { n: o.openDeals })} · {tx("mk_wonN", { n: o.wonDeals })}
                    </em>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState title={tx("mk_empty")} />
      )}
    </Panel>
  );
}

function GrowthPanel({ data }: { data: Overview }) {
  const { tx, locale } = useStore();
  const g = data.customers.growth;
  const max = Math.max(1, ...g.map((m) => m.count));
  const current = data.range.to.slice(0, 7);
  return (
    <Panel title={tx("mk_growth")} extra={<span className="mk-now">{tx("mk_activeN", { n: data.customers.active })}</span>}>
      <div className="mk-growth" role="list">
        {g.map((m) => (
          <Link key={m.month} to="/customers" className="mk-growth-col" role="listitem" aria-label={`${monthLabel(m.month, locale)} ${m.month.slice(0, 4)}: ${m.count}`}>
            <span className="mk-growth-n">{m.count || ""}</span>
            <span
              className={`mk-growth-bar${m.count ? "" : " is-zero"}${m.month === current ? " is-current" : ""}`}
              style={{ height: `${Math.max(2, (m.count / max) * 100)}%` }}
            />
            <span className="mk-growth-m">{monthLabel(m.month, locale)}</span>
          </Link>
        ))}
      </div>
    </Panel>
  );
}

/** Follow-up due in two days at 10:00 local time. */
function followUpDue() {
  const due = new Date();
  due.setDate(due.getDate() + 2);
  due.setHours(10, 0, 0, 0);
  return due;
}

function AtRiskPanel({ total }: { total: number }) {
  const { tx, locale } = useStore();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { create } = useTaskActions();
  const [all, setAll] = useState(false);
  const [created, setCreated] = useState<Set<string>>(new Set());
  const limit = all ? 100 : 6;
  const q = useQuery({ queryKey: ["marketing", "at-risk", limit], queryFn: () => fetchAtRisk({ limit }) });

  async function addTask(r: AtRiskRow) {
    const due = followUpDue();
    try {
      await create.mutateAsync({
        title: tx("mk_taskTitle", { name: customerName(r, locale) }),
        customerId: r.id,
        ownerUserId: r.owner.userId ?? undefined,
        priority: "mid",
        dueAt: due.toISOString(),
      });
      setCreated((s) => new Set(s).add(r.id));
      message.success(tx("mk_taskCreated"));
      void qc.invalidateQueries({ queryKey: ["marketing", "at-risk"] });
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    }
  }

  const items = q.data?.items ?? [];
  return (
    <Panel
      title={<PanelTitle tip={tx("mk_atRiskTip")}>{tx("mk_atRisk")}</PanelTitle>}
      extra={total ? <span className="mk-chip-quiet">{fmtNumber(total, locale)}</span> : undefined}
    >
      {q.isLoading ? null : items.length ? (
        <>
          <ul className="mk-risk">
            {items.map((r) => {
              const name = customerName(r, locale);
              const owner = ownerName(r.owner, locale, tx("mk_unassigned"));
              const done = created.has(r.id) || r.openTasks > 0;
              return (
                <li key={r.id} className="mk-risk-row">
                  <IconBadge icon={ClockCountdown} tone="warning" size={34} />
                  <div className="mk-risk-main">
                    <Link to={`/customers/${r.id}`} className="mk-risk-name">
                      {name}
                    </Link>
                    <div className="mk-risk-meta">
                      <span className="mk-chip-quiet">{r.daysSince === null ? tx("mk_neverActive") : tx("mk_quietDays", { n: r.daysSince })}</span>
                      <PersonAvatar name={owner} size={20} />
                      <span>{owner}</span>
                    </div>
                  </div>
                  {done ? (
                    <span className="mk-done">
                      <CheckCircle size={16} weight="fill" aria-hidden />
                      {created.has(r.id) ? tx("mk_taskCreated") : tx("mk_hasTask")}
                    </span>
                  ) : (
                    <Button size="small" icon={<ListPlus size={15} />} loading={create.isPending && create.variables?.customerId === r.id} onClick={() => void addTask(r)}>
                      {tx("mk_createTask")}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
          {!all && total > items.length ? (
            <div className="mk-more">
              <Button type="link" onClick={() => setAll(true)}>
                {tx("mk_seeAll", { n: total })}
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <EmptyState title={tx("mk_atRiskEmpty")} />
      )}
    </Panel>
  );
}

export function MarketingOverviewTab({ data }: { data: Overview }) {
  return (
    <div className="cz-stack">
      <div className="mk-grid">
        <FunnelPanel data={data} />
        <SourcesPanel data={data} />
      </div>
      <div className="mk-grid">
        <QuotesPanel data={data} />
        <PipelinePanel data={data} />
      </div>
      <div className="mk-grid">
        <GrowthPanel data={data} />
        <AtRiskPanel total={data.customers.atRisk} />
      </div>
    </div>
  );
}
