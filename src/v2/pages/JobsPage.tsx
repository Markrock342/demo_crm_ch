import { ArrowRight, CheckCircle, DownloadSimple, Funnel, Plus, Warning, X } from "@phosphor-icons/react";
import { Badge, Button, Popover, Radio } from "antd";
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { mapJobRowToShell } from "../../adapters/api/jobMapper.ts";
import { fetchJobsPage, jobsCsvUrl, type JobListParams, type JobPage, type JobPageRow } from "../../api/lists.ts";
import { useAuth } from "../../auth/AuthProvider";
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
import { useCan } from "../hooks/useCan.ts";
import { useCustomerLookup } from "../hooks/useCustomerLookup.ts";
import { useUserLookup } from "../hooks/useUserLookup.ts";
import { fmtShortDate, isStageKey, known, milestoneLabel, personName, STAGE_KEYS, stageFromNext } from "./jobsShared.ts";
import { CustomerFilter } from "./scale/CustomerFilter.tsx";
import { JobsBulkBar } from "./scale/JobsBulkBar.tsx";
import { LoadMore } from "./scale/ListPager.tsx";
import { useDebounced } from "./scale/useDebounced.ts";
import "./jobs.css";
import { ImportButton } from "./ImportButton.tsx";

type StatusTab = "all" | "OPEN" | "IN_PROGRESS" | "CLOSED" | "delayed";
const BILLING = ["UNBILLED", "INVOICED", "PARTIAL", "PAID"] as const;
/** Server-side paging: list page size, board cards per column, grid cards per "load more". */
const PAGE = 50;
const PER_STAGE = 20;
const GRID = 48;

export function JobsPageV2() {
  const shell = useIsShellMode();
  const { mode, user } = useAuth();
  const live = !shell && mode === "production" && Boolean(user);
  const { tx, locale } = useStore();
  const navigate = useNavigate();
  const can = useCan();
  const [params, setParams] = useSearchParams();
  const { nameOf } = useCustomerLookup();
  const { nameOf: userName } = useUserLookup();

  const initialTab = (): StatusTab => {
    const s = params.get("status");
    if (params.get("delayed") === "1") return "delayed";
    return s === "OPEN" || s === "IN_PROGRESS" || s === "CLOSED" ? s : "all";
  };
  const [tab, setTab] = useState<StatusTab>(initialTab);
  const [billing, setBilling] = useState<string>(() => params.get("billing") ?? "");
  const [customerId, setCustomerId] = useState<string | undefined>(() => params.get("customer") ?? undefined);
  const [customerLabel, setCustomerLabel] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim(), 300);
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
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  /** Board "load more": extra cards fetched per stage column. */
  const [extra, setExtra] = useState<Partial<Record<StageKey, JobListRow[]>>>({});
  const [moreBusy, setMoreBusy] = useState<StageKey | null>(null);

  const filters: JobListParams = { q, status: tab, billing: billing || undefined, customerId };
  const filterKey = JSON.stringify(filters);
  useEffect(() => {
    setPage(1);
    setSelected([]);
    setExtra({});
  }, [filterKey, stageFilter, view]);

  useEffect(() => {
    const sel = params.get("selected");
    if (sel) navigate(`/jobs/${sel}`, { replace: true });
  }, [params, navigate]);

  const serverName = (r: JobPageRow) =>
    (locale === "th" ? r.customerNameTh : locale === "en" ? r.customerNameEn : r.customerNameZh) ||
    r.customerNameEn ||
    r.customerNameTh ||
    r.customerNameZh ||
    "";
  const toRow = (r: JobPageRow): JobListRow => {
    const job = mapJobRowToShell(r);
    return {
      ...job,
      // Live owners are user ids — resolve them to people's names.
      salesOwner: userName(job.salesOwner),
      opsOwner: userName(job.opsOwner),
      stage: typeof r.stage === "number" ? r.stage : stageFromNext(job, r.nextMilestoneCode ?? null, r.milestonePendingCount === 0),
      next: r.nextMilestoneCode
        ? { code: r.nextMilestoneCode, label: r.nextMilestoneLabel ?? r.nextMilestoneCode, plannedAt: r.nextMilestonePlannedAt }
        : null,
      customerLabel: nameOf(r.customerId, "") || serverName(r) || undefined,
    };
  };

  const boardMode = view === "cards" && !stageFilter;
  const gridMode = view === "cards" && Boolean(stageFilter);
  const boardQ = useQuery({
    queryKey: ["jobs", "page", "board", filterKey],
    queryFn: () => fetchJobsPage({ ...filters, perStage: PER_STAGE }),
    enabled: live && boardMode,
    placeholderData: keepPreviousData,
  });
  const gridQ = useInfiniteQuery({
    queryKey: ["jobs", "page", "grid", filterKey, stageFilter],
    queryFn: ({ pageParam }) => fetchJobsPage({ ...filters, stage: stageFilter, sort: "board", limit: GRID, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, all) => {
      const n = all.reduce((s, p) => s + p.items.length, 0);
      return n < last.total ? n : undefined;
    },
    enabled: live && gridMode,
  });
  const listQ = useQuery({
    queryKey: ["jobs", "page", "list", filterKey, stageFilter, page],
    queryFn: () => fetchJobsPage({ ...filters, stage: stageFilter, limit: PAGE, offset: (page - 1) * PAGE }),
    enabled: live && view === "list",
    placeholderData: keepPreviousData,
  });

  const active: JobPage | undefined = view === "list" ? listQ.data : gridMode ? gridQ.data?.pages[0] : boardQ.data;
  const activeQ = view === "list" ? listQ : gridMode ? gridQ : boardQ;
  const loading = live && activeQ.isLoading;
  const counts = active?.counts;
  const stageCounts = active?.stageCounts;
  const count = (t: StatusTab) => counts?.[t];
  const stageCount = (k: StageKey) => stageCounts?.[k] ?? 0;
  const matched = active?.total ?? 0;
  const anyJobs = (counts?.all ?? 0) > 0 || Boolean(q || billing || customerId);

  const boardRows = useMemo(() => (boardQ.data?.items ?? []).map(toRow), [boardQ.data, nameOf, userName, locale]); // eslint-disable-line react-hooks/exhaustive-deps
  const gridRows = useMemo(() => (gridQ.data?.pages ?? []).flatMap((p) => p.items).map(toRow), [gridQ.data, nameOf, userName, locale]); // eslint-disable-line react-hooks/exhaustive-deps
  const listRows = useMemo(() => (listQ.data?.items ?? []).map(toRow), [listQ.data, nameOf, userName, locale]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadMoreStage(key: StageKey, shown: number) {
    setMoreBusy(key);
    try {
      const res = await fetchJobsPage({ ...filters, stage: key, sort: "board", limit: PER_STAGE, offset: shown });
      setExtra((e) => ({ ...e, [key]: [...(e[key] ?? []), ...res.items.map(toRow)] }));
    } finally {
      setMoreBusy(null);
    }
  }

  const fleetFacts = {
    visibleJobs: matched,
    delayed: counts?.delayed ?? 0,
    open: counts?.OPEN ?? 0,
    inProgress: counts?.IN_PROGRESS ?? 0,
  };
  const fleetLocal = `Fleet view: ${matched} jobs shown, ${fleetFacts.delayed} delayed.`;

  const newButton = (
    <Link to="/quotations?tab=accepted">
      <Button type="primary" icon={<Plus size={16} aria-hidden />}>
        {tx("jobs_newFromQuote")}
      </Button>
    </Link>
  );

  if (!live) {
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

  const exportAll = jobsCsvUrl({ ...filters, stage: stageFilter, lang: locale });
  const emptyText = anyJobs ? tx("jobs_noMatch") : tx("jobs_emptyDesc");
  const emptyAction = anyJobs ? undefined : newButton;

  return (
    <>
      <PageHeader
        title={tx("jobs_title")}
        subtitle={counts ? tx("jobs_sub", { n: counts.all.toLocaleString(), late: counts.delayed.toLocaleString() }) : undefined}
        extra={
          <>
            <AiBriefCard
              title={tx("aiJobSummary")}
              facts={fleetFacts}
              localFallback={fleetLocal}
            />
            <ImportButton entity="jobs" />
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
                { value: "OPEN", label: tx("jobs_tabOpen"), count: count("OPEN") },
                { value: "IN_PROGRESS", label: tx("jobs_tabInProgress"), count: count("IN_PROGRESS") },
                { value: "CLOSED", label: tx("jobs_tabClosed"), count: count("CLOSED") },
                { value: "delayed", label: tx("jobs_tabDelayed"), count: count("delayed") },
              ],
            }}
            search={{
              value: search,
              onChange: setSearch,
              placeholder: tx("jobs_search"),
            }}
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
                <CustomerFilter
                  value={customerId}
                  label={customerLabel ?? (customerId ? nameOf(customerId, "") : undefined)}
                  placeholder={tx("jobs_allCustomers")}
                  onChange={(id, name) => {
                    setCustomerId(id);
                    setCustomerLabel(name);
                  }}
                  width={190}
                />
                {filterPopover}
                {can("shipment.view") ? (
                  <Button href={exportAll} icon={<DownloadSimple size={16} aria-hidden />} aria-label={tx("sc_exportFiltered")} title={tx("sc_exportFiltered")} />
                ) : null}
                <ViewSwitch value={view} onChange={setView} labels={{ cards: tx("jobs_viewBoard"), list: tx("viewList") }} />
              </>
            }
            count={active ? matched : undefined}
          />
        </div>
      </PageHeader>

      {activeQ.isError ? (
        <ErrorState
          title={tx("jobs_loadFailed")}
          action={
            <Button onClick={() => void activeQ.refetch()}>
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
            <>
              {selected.length ? (
                <JobsBulkBar ids={selected} onClear={() => setSelected([])} exportHref={jobsCsvUrl({ ids: selected, lang: locale })} />
              ) : null}
              <JobsProTable
                rows={listRows}
                loading={loading || (listQ.isFetching && listQ.isPlaceholderData)}
                emptyText={emptyText}
                emptyAction={emptyAction}
                rowSelection={{
                  selectedRowKeys: selected,
                  preserveSelectedRowKeys: true,
                  onChange: (keys) => setSelected(keys as string[]),
                }}
                paging={{ page, pageSize: PAGE, total: matched, onChange: setPage }}
              />
            </>
          ) : loading ? (
            <LoadingState />
          ) : !matched ? (
            <EmptyState description={emptyText} action={emptyAction} />
          ) : gridMode ? (
            <>
              <CardGrid min={300}>
                {gridRows.map((r) => (
                  <JobCard key={r.id} row={r} customer={r.customerLabel ?? nameOf(r.customerId)} />
                ))}
              </CardGrid>
              <LoadMore left={matched - gridRows.length} loading={gridQ.isFetchingNextPage} onClick={() => void gridQ.fetchNextPage()} />
            </>
          ) : (
            <div
              className="jobs-board"
              style={{
                ["--jobs-cols" as string]: SHIPMENT_STAGES.map((st) =>
                  stageCount(st.key) ? "minmax(264px, 1fr)" : "minmax(150px, 0.45fr)",
                ).join(" "),
              }}
            >
              <Board
                columns={SHIPMENT_STAGES.map((st) => {
                  const idx = STAGE_KEYS.indexOf(st.key);
                  const list = [...boardRows.filter((r) => rowStage(r) === idx), ...(extra[st.key] ?? [])];
                  const total = stageCount(st.key);
                  const late = list.some((r) => r.delayed && rowStage(r) < 5);
                  return {
                    key: st.key,
                    icon: st.icon,
                    tone: late ? "danger" : STAGE_TONE[st.key],
                    title: tx(`stage_${st.key}`),
                    count: total,
                    children: list.length ? (
                      <>
                        {list.map((r) => <JobCard key={r.id} row={r} customer={r.customerLabel ?? nameOf(r.customerId)} />)}
                        <LoadMore left={total - list.length} loading={moreBusy === st.key} onClick={() => void loadMoreStage(st.key, list.length)} />
                      </>
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
