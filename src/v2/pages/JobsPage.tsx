import { ArrowRight, CheckCircle, Funnel, Plus, Warning, X } from "@phosphor-icons/react";
import { Badge, Button, Popover, Radio } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { mapJobRowToShell } from "../../adapters/api/jobMapper.ts";
import { fetchJobs } from "../../api/commercial.ts";
import { useAuth } from "../../auth/AuthProvider";
import { useShellJobs } from "../../shell/jobStore.tsx";
import { useIsShellMode } from "../../shell/session.tsx";
import { useStore } from "../../store";
import {
  AiBriefCard,
  Board,
  CardGrid,
  EmptyState,
  EntityCard,
  ErrorState,
  FilterBar,
  LoadingState,
  PageHeader,
  PeopleStack,
  RouteTrack,
  SHIPMENT_STAGES,
  ViewSwitch,
  readView,
  writeView,
  type StageKey,
} from "../components";
import { JobsProTable, rowProgress, rowStage, type JobListRow } from "../components/JobsProTable.tsx";
import { useCustomerLookup } from "../hooks/useCustomerLookup.ts";
import { useUserLookup } from "../hooks/useUserLookup.ts";
import { queryKeys } from "../queries/keys.ts";
import { fmtShortDate, isStageKey, known, milestoneLabel, personName, STAGE_KEYS, stageFromMilestones, stageFromNext } from "./jobsShared.ts";
import "./jobs.css";

type StatusTab = "all" | "OPEN" | "IN_PROGRESS" | "CLOSED" | "delayed";
const BILLING = ["UNBILLED", "INVOICED", "PARTIAL", "PAID"] as const;

export function JobsPageV2() {
  const shell = useIsShellMode();
  const { mode, user } = useAuth();
  const live = !shell && mode === "production" && Boolean(user);
  const { tx } = useStore();
  const jobStore = useShellJobs();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { nameOf, customers } = useCustomerLookup();
  const { nameOf: userName } = useUserLookup();

  // Live: keep the list API's next-milestone fields alongside the mapped job.
  const liveQuery = useQuery({
    queryKey: [...queryKeys.jobs.all, "list-with-next"],
    queryFn: async () => {
      const items = await fetchJobs();
      return items.map((r): JobListRow => {
        const job = mapJobRowToShell(r);
        const pending = (r as { milestonePendingCount?: number | null }).milestonePendingCount;
        return {
        ...job,
        stage: stageFromNext(job, r.nextMilestoneCode ?? null, pending === 0),
        next: r.nextMilestoneCode
          ? {
              code: r.nextMilestoneCode,
              label: r.nextMilestoneLabel ?? r.nextMilestoneCode,
              plannedAt: r.nextMilestonePlannedAt,
            }
          : null,
        };
      });
    },
    enabled: live,
  });

  const rows: JobListRow[] = useMemo(() => {
    // Live owners are user ids — resolve them to people's names.
    if (!shell)
      return (liveQuery.data ?? []).map((j) => ({ ...j, salesOwner: userName(j.salesOwner), opsOwner: userName(j.opsOwner) }));
    return jobStore.jobs.map((j) => {
      const m = j.milestones.find((x) => !x.actualAt);
      return { ...j, stage: stageFromMilestones(j, j.milestones), next: m ? { code: m.code, label: m.label } : null };
    });
  }, [shell, jobStore.jobs, liveQuery.data, userName]);
  const loading = live && liveQuery.isLoading;

  const initialTab = (): StatusTab => {
    const s = params.get("status");
    if (params.get("delayed") === "1") return "delayed";
    return s === "OPEN" || s === "IN_PROGRESS" || s === "CLOSED" ? s : "all";
  };
  const [tab, setTab] = useState<StatusTab>(initialTab);
  const [billing, setBilling] = useState<string>(
    () => params.get("billing") ?? "",
  );
  const [customerId, setCustomerId] = useState<string | undefined>(
    () => params.get("customer") ?? undefined,
  );
  const [search, setSearch] = useState("");
  const stageParam = params.get("stage");
  const stageFilter: StageKey | null = isStageKey(stageParam) ? stageParam : null;
  const setStage = (k: StageKey | null) => {
    const next = new URLSearchParams(params);
    if (k) next.set("stage", k);
    else next.delete("stage");
    setParams(next, { replace: true });
  };
  const [view, setViewState] = useState<"cards" | "list">(() => readView("jobs"));
  const setView = (v: "cards" | "list") => {
    setViewState(v);
    writeView("jobs", v);
  };

  useEffect(() => {
    const selected = params.get("selected");
    if (selected && rows.some((j) => j.id === selected))
      navigate(`/jobs/${selected}`, { replace: true });
  }, [params, navigate, rows]);

  const q = search.trim().toLowerCase();
  const base = rows.filter((j) => {
    if (billing && j.billingStatus !== billing) return false;
    if (customerId && j.customerId !== customerId) return false;
    if (!q) return true;
    return `${j.jobNumber} ${nameOf(j.customerId, "")} ${j.shipper} ${j.consignee} ${j.carrier} ${j.vessel} ${j.origin} ${j.destination} ${j.pol} ${j.pod}`
      .toLowerCase()
      .includes(q);
  });
  const inTab = (j: JobListRow, t: StatusTab) =>
    t === "all" ? true : t === "delayed" ? Boolean(j.delayed) : j.status === t;
  const inTabRows = base.filter((j) => inTab(j, tab));
  const stageCount = (k: StageKey) => inTabRows.filter((j) => STAGE_KEYS[rowStage(j)] === k).length;
  const filtered = stageFilter ? inTabRows.filter((j) => STAGE_KEYS[rowStage(j)] === stageFilter) : inTabRows;
  const count = (t: StatusTab) => base.filter((j) => inTab(j, t)).length;
  const lateTotal = rows.filter((j) => j.delayed).length;

  const fleetFacts = {
    visibleJobs: filtered.length,
    delayed: filtered.filter((j) => j.delayed).length,
    open: filtered.filter((j) => j.status === "OPEN").length,
    inProgress: filtered.filter((j) => j.status === "IN_PROGRESS").length,
    unbilled: filtered.filter((j) => j.billingStatus === "UNBILLED").length,
  };
  const fleetLocal = `Fleet view: ${filtered.length} jobs shown, ${fleetFacts.delayed} delayed, ${fleetFacts.unbilled} unbilled.`;

  const newButton = (
    <Link to="/quotations?tab=accepted">
      <Button type="primary" icon={<Plus size={16} aria-hidden />}>
        {tx("jobs_newFromQuote")}
      </Button>
    </Link>
  );

  if (!shell && !live) {
    return (
      <>
        <PageHeader title={tx("jobs_title")} />
        <ErrorState title={tx("apiNotConfigured")} />
      </>
    );
  }

  const filterPopover = (
    <Popover
      trigger="click"
      placement="bottomRight"
      content={
        <div className="jobs-filter-pop">
          <h3>{tx("jobs_filterBilling")}</h3>
          <Radio.Group
            value={billing}
            onChange={(e) => setBilling(e.target.value as string)}
            options={[
              { value: "", label: tx("jobs_anyBilling") },
              ...BILLING.map((b) => ({ value: b, label: tx(`status_${b}`) })),
            ]}
            style={{ display: "grid", gap: 6 }}
          />
        </div>
      }
    >
      <Badge dot={Boolean(billing)} offset={[-4, 4]}>
        <Button icon={<Funnel size={16} aria-hidden />}>
          {tx("jobs_filters")}
        </Button>
      </Badge>
    </Popover>
  );

  return (
    <>
      <PageHeader
        title={tx("jobs_title")}
        subtitle={tx("jobs_sub", { n: rows.length, late: lateTotal })}
        extra={
          <>
            <AiBriefCard
              title={tx("aiJobSummary")}
              facts={fleetFacts}
              localFallback={fleetLocal}
            />
            {newButton}
          </>
        }
      >
        <div className="jobs-filters">
          <FilterBar
            tabs={{
              value: tab,
              onChange: (v) => setTab(v as StatusTab),
              options: [
                { value: "all", label: tx("filterAll"), count: count("all") },
                {
                  value: "OPEN",
                  label: tx("jobs_tabOpen"),
                  count: count("OPEN"),
                },
                {
                  value: "IN_PROGRESS",
                  label: tx("jobs_tabInProgress"),
                  count: count("IN_PROGRESS"),
                },
                {
                  value: "CLOSED",
                  label: tx("jobs_tabClosed"),
                  count: count("CLOSED"),
                },
                {
                  value: "delayed",
                  label: tx("jobs_tabDelayed"),
                  count: count("delayed"),
                },
              ],
            }}
            search={{
              value: search,
              onChange: setSearch,
              placeholder: tx("jobs_search"),
            }}
            selects={[
              {
                key: "customer",
                placeholder: tx("jobs_allCustomers"),
                value: customerId,
                onChange: setCustomerId,
                options: customers.map((c) => ({
                  value: c.id,
                  label: nameOf(c.id),
                })),
                width: 190,
              },
            ]}
            onClear={
              billing || customerId || search || tab !== "all" || stageFilter
                ? () => {
                    setTab("all");
                    setBilling("");
                    setCustomerId(undefined);
                    setSearch("");
                    setStage(null);
                  }
                : undefined
            }
            extra={
              <>
                {filterPopover}
                <ViewSwitch value={view} onChange={setView} labels={{ cards: tx("jobs_viewBoard"), list: tx("viewList") }} />
              </>
            }
            count={filtered.length}
          />
        </div>
      </PageHeader>

      {live && liveQuery.isError ? (
        <ErrorState
          title={tx("jobs_loadFailed")}
          action={
            <Button onClick={() => void liveQuery.refetch()}>
              {tx("jobs_retry")}
            </Button>
          }
        />
      ) : (
        <div className="cz-stack">
          {view === "list" || stageFilter ? (
            <StagePicker value={stageFilter} onChange={setStage} count={stageCount} />
          ) : null}
          {view === "list" ? (
            <JobsProTable
              rows={filtered}
              loading={loading}
              emptyText={rows.length ? tx("jobs_noMatch") : tx("jobs_emptyDesc")}
              emptyAction={rows.length ? undefined : newButton}
            />
          ) : loading ? (
            <LoadingState />
          ) : !filtered.length ? (
            <EmptyState description={rows.length ? tx("jobs_noMatch") : tx("jobs_emptyDesc")} action={rows.length ? undefined : newButton} />
          ) : stageFilter ? (
            <CardGrid min={300}>
              {sortForBoard(filtered).map((r) => (
                <JobCard key={r.id} row={r} customer={nameOf(r.customerId)} />
              ))}
            </CardGrid>
          ) : (
            <div
              className="jobs-board"
              style={{
                ["--jobs-cols" as string]: SHIPMENT_STAGES.map((st) =>
                  filtered.some((r) => STAGE_KEYS[rowStage(r)] === st.key) ? "minmax(264px, 1fr)" : "minmax(150px, 0.45fr)",
                ).join(" "),
              }}
            >
              <Board
                columns={SHIPMENT_STAGES.map((st) => {
                  const list = sortForBoard(filtered.filter((r) => STAGE_KEYS[rowStage(r)] === st.key));
                  const late = list.filter((r) => r.delayed && rowStage(r) < 5).length;
                  return {
                    key: st.key,
                    icon: st.icon,
                    tone: late ? "danger" : STAGE_TONE[st.key],
                    title: tx(`stage_${st.key}`),
                    count: list.length,
                    children: list.length ? (
                      list.map((r) => <JobCard key={r.id} row={r} customer={nameOf(r.customerId)} />)
                    ) : (
                      <span className="jobs-board-empty" aria-hidden>
                        —
                      </span>
                    ),
                  };
                })}
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}

const STAGE_TONE: Record<StageKey, "neutral" | "info" | "primary" | "success"> = {
  booked: "neutral",
  gatein: "info",
  sailed: "primary",
  arrived: "primary",
  customs: "info",
  delivered: "success",
};

/** Late first, then soonest arrival. */
function sortForBoard(list: JobListRow[]): JobListRow[] {
  const t = (v: string) => {
    const d = known(v) ? new Date(v).getTime() : NaN;
    return Number.isNaN(d) ? Infinity : d;
  };
  return [...list].sort((a, b) => Number(Boolean(b.delayed)) - Number(Boolean(a.delayed)) || t(a.eta) - t(b.eta));
}

/** Six stage buttons (icon + count) — filters both views, mirrors /jobs?stage=<key>. */
function StagePicker({ value, onChange, count }: { value: StageKey | null; onChange: (k: StageKey | null) => void; count: (k: StageKey) => number }) {
  const { tx } = useStore();
  return (
    <div className="jobs-stagepick" role="group" aria-label={tx("jobs_colStage")}>
      {SHIPMENT_STAGES.map((st) => {
        const on = value === st.key;
        const n = count(st.key);
        return (
          <button
            key={st.key}
            type="button"
            className={`jobs-stagepick-btn${on ? " is-on" : ""}`}
            aria-pressed={on}
            onClick={() => onChange(on ? null : st.key)}
          >
            <st.icon size={18} weight={on ? "fill" : "regular"} aria-hidden />
            <span className="jobs-stagepick-label">{tx(`stage_${st.key}`)}</span>
            <span className="jobs-stagepick-n">{n}</span>
          </button>
        );
      })}
      {value ? (
        <button type="button" className="jobs-stagepick-clear" onClick={() => onChange(null)} aria-label={tx("jobs_stageAll")}>
          <X size={14} aria-hidden />
          {tx("jobs_stageAll")}
        </button>
      ) : null}
    </div>
  );
}

/** Board / grid card: job no. + customer, the voyage picture, owners and the next step. */
function JobCard({ row: r, customer }: { row: JobListRow; customer: string }) {
  const { tx, locale } = useStore();
  const stage = rowStage(r);
  const done = stage >= 5;
  const late = Boolean(r.delayed) && !done;
  const people = [...new Set([personName(r.salesOwner), personName(r.opsOwner)].filter(Boolean))];
  const nextLate = Boolean(r.next?.plannedAt) && new Date(String(r.next!.plannedAt)).getTime() < Date.now();
  const short = (v: string) => (known(v) ? fmtShortDate(v, locale) : undefined);
  return (
    <EntityCard
      to={`/jobs/${r.id}`}
      tone={late ? "danger" : "default"}
      title={r.jobNumber}
      subtitle={customer}
      badge={
        late ? (
          <span className="jobs-card-flag is-late" role="img" aria-label={tx("jobs_delayed")} title={tx("jobs_delayed")}>
            <Warning size={18} weight="fill" />
          </span>
        ) : done ? (
          <span className="jobs-card-flag is-done" role="img" aria-label={tx("stage_delivered")} title={tx("stage_delivered")}>
            <CheckCircle size={18} weight="fill" />
          </span>
        ) : null
      }
      footer={
        <>
          <PeopleStack names={people} />
          {r.next ? (
            <span className={`jobs-next-chip${nextLate || late ? " is-late" : ""}`} title={milestoneLabel(tx, r.next.code, r.next.label)}>
              <ArrowRight size={12} weight="bold" aria-hidden />
              <span>{milestoneLabel(tx, r.next.code, r.next.label)}</span>
            </span>
          ) : r.next === null ? (
            <span className="jobs-next-chip is-done">
              <CheckCircle size={12} weight="fill" aria-hidden />
              <span>{tx("jobs_allDone")}</span>
            </span>
          ) : null}
        </>
      }
    >
      <RouteTrack
        size="sm"
        from={r.pol}
        to={r.pod}
        progress={rowProgress(r, stage)}
        fromDate={short(r.etd)}
        toDate={short(r.eta)}
        delayed={late}
        done={done}
      />
    </EntityCard>
  );
}
