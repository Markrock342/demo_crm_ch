import {
  Anchor,
  Boat,
  CheckSquare,
  Receipt,
  WarningCircle,
  type Icon,
} from "@phosphor-icons/react";
import { Checkbox } from "antd";
import { useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import type { Locale } from "../../i18n";
import { useShellSession } from "../../shell/session.tsx";
import { useStore } from "../../store";
import {
  AiBriefCard,
  CardGrid,
  Donut,
  EmptyState,
  EntityCard,
  IconBadge,
  Legend,
  LoadingState,
  PageHeader,
  Panel,
  PersonAvatar,
  RouteTrack,
  SHIPMENT_STAGES,
  StatusTag,
  Tile,
  TileRow,
  progressBetween,
} from "../components";
import type { Tone } from "../components/Graphics.tsx";
import { useAppMode } from "../hooks/useAppMode.ts";
import { useCustomerLookup } from "../hooks/useCustomerLookup.ts";
import { fmtNumber } from "../lib/format.ts";
import { localizedUserName } from "../lib/demoText.ts";
import { AttentionCard } from "./home/AttentionList.tsx";
import {
  daysAgo,
  jobStage,
  parseLooseDate,
  useAttentionItems,
  useModeInvoices,
  useActiveJobs,
} from "./home/attention.ts";
import { useModeTasks } from "./home/tasks.ts";
import "./home/home.css";

const INTL: Record<Locale, string> = {
  zh: "zh-CN",
  th: "th-TH-u-ca-gregory",
  en: "en-GB",
};

function greetingKey(d = new Date()) {
  const h = d.getHours();
  return h < 12
    ? "home_greet_morning"
    : h < 17
      ? "home_greet_afternoon"
      : "home_greet_evening";
}

/** Section heading: icon badge + 1–2 words + count bubble. */
export function SectionTitle({
  icon,
  tone,
  label,
  count,
}: {
  icon: Icon;
  tone: Tone;
  label: string;
  count?: number;
}) {
  return (
    <span className="hm-sec-title">
      <IconBadge icon={icon} tone={tone} size={28} />
      <span>{label}</span>
      {count !== undefined ? (
        <span className={`hm-count is-${tone}`}>{count}</span>
      ) : null}
    </span>
  );
}

function Quiet({ icon: I, children }: { icon: Icon; children: ReactNode }) {
  return (
    <p className="hm-quiet-line">
      <I size={18} aria-hidden />
      {children}
    </p>
  );
}

const AGING: { key: string; tone: Tone }[] = [
  { key: "current", tone: "success" },
  { key: "d30", tone: "warning" },
  { key: "d60", tone: "accent" },
  { key: "d60p", tone: "danger" },
];

export function OverviewPageV2() {
  const { tx, locale } = useStore();
  const loc = locale as Locale;
  const { enabled } = useAppMode();
  const { user } = useAuth();
  const { shellUser } = useShellSession();
  const { jobs, loading } = useActiveJobs();
  const invoices = useModeInvoices();
  const { items } = useAttentionItems();
  const { tasks, toggle } = useModeTasks();
  const { nameOf } = useCustomerLookup();

  const name = localizedUserName(shellUser ?? user, locale);
  const today = new Intl.DateTimeFormat(INTL[loc], {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
  const dm = (d: Date | null) =>
    d
      ? new Intl.DateTimeFormat(INTL[loc], {
          day: "numeric",
          month: "short",
        }).format(d)
      : undefined;

  const activeJobs = useMemo(
    () => jobs.filter((j) => j.status !== "CLOSED"),
    [jobs],
  );
  const urgent = items.filter((i) => i.severity === "high").length;
  const overdueInv = invoices.filter((i) => i.overdue);
  const openTasks = tasks.filter((t) => !t.done);
  const dueTasks = openTasks.filter((t) => t.bucket !== "later");
  const lateTasks = openTasks.filter((t) => t.bucket === "overdue").length;

  /** Every active job with its stage, dates and voyage progress. */
  const board = useMemo(
    () =>
      activeJobs.map((j) => {
        const etd = parseLooseDate(j.etd);
        const eta = parseLooseDate(j.eta);
        const stage = jobStage(j);
        const etaIn = daysAgo(eta);
        return {
          job: j,
          etd,
          eta,
          stage,
          etaIn: etaIn === null ? null : -etaIn,
          progress: progressBetween(etd, eta),
        };
      }),
    [activeJobs],
  );

  const onWater = board
    .filter((b) => b.stage === 2)
    .sort(
      (a, b) => (a.eta?.getTime() ?? Infinity) - (b.eta?.getTime() ?? Infinity),
    );
  const arriving = board.filter(
    (b) => b.stage < 3 && b.etaIn !== null && b.etaIn >= 0 && b.etaIn <= 7,
  );
  const departing = board.filter(
    (b) =>
      b.stage < 2 &&
      b.etd &&
      (daysAgo(b.etd) ?? 1) <= 0 &&
      (daysAgo(b.etd) ?? 0) >= -7,
  );
  const stageCounts = SHIPMENT_STAGES.map(
    (_, i) => board.filter((b) => b.stage === i).length,
  );

  /** Open receivables by how late they are (invoice count). */
  const aging = useMemo(() => {
    const out: Record<string, number> = { current: 0, d30: 0, d60: 0, d60p: 0 };
    for (const inv of invoices) {
      if (
        !(inv.balanceDue > 0) ||
        inv.status === "PAID" ||
        inv.status === "DRAFT" ||
        inv.status === "VOID"
      )
        continue;
      const late = inv.overdue
        ? (daysAgo(parseLooseDate(inv.dueDate)) ?? 1)
        : 0;
      out[
        late <= 0 ? "current" : late <= 30 ? "d30" : late <= 60 ? "d60" : "d60p"
      ] += 1;
    }
    return out;
  }, [invoices]);
  const openAr = Object.values(aging).reduce((a, n) => a + n, 0);

  const facts = useMemo(
    () => ({
      activeJobs: activeJobs.length,
      needsAttention: items.length,
      urgent,
      delayed: items.filter((i) => i.kind === "delay").length,
      overdueInvoices: overdueInv.length,
      onTheWater: onWater.length,
      departingThisWeek: departing.length,
      arrivingThisWeek: arriving.length,
      openTasks: openTasks.length,
    }),
    [
      activeJobs.length,
      arriving.length,
      departing.length,
      items,
      onWater.length,
      openTasks.length,
      overdueInv.length,
      urgent,
    ],
  );
  const localBrief = `${activeJobs.length} active jobs, ${onWater.length} on the water, ${items.length} items need attention (${urgent} urgent), ${overdueInv.length} overdue invoices, ${arriving.length} arrivals in the next 7 days, ${openTasks.length} open tasks.`;

  if (!enabled) {
    return (
      <>
        <PageHeader
          title={tx("navOverview")}
          subtitle={tx("home_not_connected")}
        />
        <EmptyState
          description={tx("home_not_connected_desc")}
          action={<Link to="/login">{tx("home_sign_in")}</Link>}
        />
      </>
    );
  }

  const topItems = items.slice(0, 6);
  const stageLabels = Object.fromEntries(
    SHIPMENT_STAGES.map((s) => [s.key, tx(`stage_${s.key}`)]),
  );

  return (
    <>
      <PageHeader
        title={
          name ? tx(greetingKey(), { name }) : tx(`${greetingKey()}_plain`)
        }
        subtitle={today}
      >
        <div className="hm-tiles">
          <TileRow>
            <Tile
              icon={WarningCircle}
              tone={urgent ? "danger" : items.length ? "warning" : "success"}
              value={fmtNumber(items.length, loc)}
              label={tx("home_tile_attention")}
              to="/exceptions"
            />
            <Tile
              icon={Boat}
              tone="primary"
              value={fmtNumber(onWater.length, loc)}
              label={tx("home_tile_water")}
              to="/jobs?stage=sailed"
            />
            <Tile
              icon={Anchor}
              tone="info"
              value={fmtNumber(arriving.length, loc)}
              label={tx("home_tile_arriving")}
              to="/calendar"
            />
            <Tile
              icon={Receipt}
              tone={overdueInv.length ? "warning" : "neutral"}
              value={fmtNumber(overdueInv.length, loc)}
              label={tx("home_tile_overdue_ar")}
              to="/invoices?view=overdue"
            />
            <Tile
              icon={CheckSquare}
              tone={lateTasks ? "danger" : "accent"}
              value={fmtNumber(openTasks.length, loc)}
              label={tx("home_tile_tasks")}
              to="/tasks"
            />
          </TileRow>
        </div>
      </PageHeader>

      <div className="cz-split">
        <div className="cz-stack">
          <Panel
            title={
              <SectionTitle
                icon={Boat}
                tone="primary"
                label={tx("home_sec_water")}
                count={onWater.length}
              />
            }
            extra={
              onWater.length ? (
                <Link to="/jobs?stage=sailed" className="cz-link-btn">
                  {tx("home_all_tasks")}
                </Link>
              ) : null
            }
          >
            {loading ? (
              <LoadingState />
            ) : onWater.length ? (
              <CardGrid min={280}>
                {onWater.slice(0, 6).map((b) => {
                  const late = Boolean(b.job.delayed);
                  return (
                    <EntityCard
                      key={b.job.id}
                      to={`/jobs/${b.job.id}`}
                      tone={late ? "danger" : "default"}
                      title={b.job.jobNumber}
                      subtitle={nameOf(b.job.customerId)}
                      badge={
                        late ? (
                          <StatusTag status="DELAYED" tone="danger" />
                        ) : b.etaIn !== null && b.etaIn >= 0 ? (
                          <span className="hm-age is-info">
                            {b.etaIn === 0
                              ? tx("home_today")
                              : tx("home_in_days", { n: b.etaIn })}
                          </span>
                        ) : null
                      }
                    >
                      <RouteTrack
                        from={b.job.pol}
                        to={b.job.pod}
                        progress={b.progress ?? 50}
                        fromDate={dm(b.etd)}
                        toDate={dm(b.eta)}
                        delayed={late}
                        size="sm"
                      />
                    </EntityCard>
                  );
                })}
              </CardGrid>
            ) : (
              <Quiet icon={Boat}>{tx("home_water_empty")}</Quiet>
            )}
          </Panel>

          <Panel
            title={
              <SectionTitle
                icon={WarningCircle}
                tone={urgent ? "danger" : "warning"}
                label={tx("home_attn_title")}
                count={items.length}
              />
            }
            extra={
              items.length > topItems.length ? (
                <Link to="/exceptions" className="cz-link-btn">
                  {tx("home_view_all", { n: items.length })}
                </Link>
              ) : null
            }
          >
            {loading ? (
              <LoadingState />
            ) : topItems.length ? (
              <CardGrid min={250}>
                {topItems.map((it) => (
                  <AttentionCard key={it.id} item={it} />
                ))}
              </CardGrid>
            ) : (
              <Quiet icon={CheckSquare}>{tx("home_attn_empty_title")}</Quiet>
            )}
          </Panel>

          <Panel title={tx("home_sec_stages")}>
            <ol className="hm-stagecount" aria-label={tx("home_sec_stages")}>
              {SHIPMENT_STAGES.map((s, i) => {
                const n = stageCounts[i];
                return (
                  <li key={s.key} className={n ? "has-jobs" : undefined}>
                    <Link
                      to={`/jobs?stage=${s.key}`}
                      className="hm-stagecount-link"
                      aria-label={`${stageLabels[s.key]} ${n}`}
                    >
                      <span className="hm-stagecount-dot">
                        <s.icon
                          size={20}
                          weight={n ? "fill" : "regular"}
                          aria-hidden
                        />
                        {n ? (
                          <span className="hm-stagecount-n">{n}</span>
                        ) : null}
                      </span>
                      <span className="hm-stagecount-label">
                        {stageLabels[s.key]}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </Panel>
        </div>

        <div className="cz-stack">
          <div className="hm-ai-compact">
            <AiBriefCard
              variant="panel"
              title={tx("home_ai_title")}
              facts={facts}
              localFallback={localBrief}
              context="overview"
            />
          </div>

          <Panel
            title={
              <SectionTitle
                icon={Receipt}
                tone={overdueInv.length ? "warning" : "success"}
                label={tx("home_sec_ar")}
              />
            }
            extra={
              <Link to="/invoices" className="cz-link-btn">
                {tx("home_all_tasks")}
              </Link>
            }
          >
            {openAr ? (
              <div className="hm-aging">
                <Donut
                  size={112}
                  parts={AGING.map((a) => ({
                    value: aging[a.key],
                    tone: a.tone,
                    label: tx(`home_aging_${a.key}`),
                  }))}
                  center={fmtNumber(openAr, loc)}
                  caption={tx("home_aging_caption")}
                />
                <Legend
                  items={AGING.map((a) => ({
                    tone: a.tone,
                    label: tx(`home_aging_${a.key}`),
                    value: aging[a.key],
                  }))}
                />
              </div>
            ) : (
              <Quiet icon={Receipt}>{tx("home_ar_empty")}</Quiet>
            )}
          </Panel>

          <Panel
            title={
              <SectionTitle
                icon={CheckSquare}
                tone={lateTasks ? "danger" : "accent"}
                label={tx("home_tasks_title")}
                count={dueTasks.length}
              />
            }
            extra={
              <Link to="/tasks" className="cz-link-btn">
                {tx("home_all_tasks")}
              </Link>
            }
          >
            {dueTasks.length ? (
              <ul className="hm-mini-tasks">
                {dueTasks.slice(0, 5).map((t) => (
                  <li
                    key={t.id}
                    className={t.bucket === "overdue" ? "is-late" : undefined}
                  >
                    <Checkbox
                      checked={t.done}
                      onChange={() => toggle(t.id)}
                      aria-label={t.title}
                    />
                    <span className="hm-mini-title">{t.title}</span>
                    {t.customerId ? (
                      <PersonAvatar name={nameOf(t.customerId)} size={22} />
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <Quiet icon={CheckSquare}>
                {openTasks.length
                  ? tx("home_tasks_none_due")
                  : tx("home_tasks_none")}
              </Quiet>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
