import { Warning } from "@phosphor-icons/react";
import { Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { ShellJob } from "../../ports/job.port.ts";
import { useStore } from "../../store";
import { useCustomerLookup } from "../hooks/useCustomerLookup.ts";
import { fmtDate } from "../lib/format.ts";
import { fmtShortDate, known, milestoneLabel, personName, STAGE_KEYS, stageFromNext, useIsPhone } from "../pages/jobsShared.ts";
import { JobsStackList } from "../pages/JobsStackList.tsx";
import { DataTable } from "./DataTable.tsx";
import { progressBetween, RouteTrack, StageFlow, type StageKey } from "./Graphics.tsx";
import { LaneCell, PeopleStack } from "./Visuals.tsx";

export type JobNextStep = { code: string; label: string; plannedAt?: string | null } | null;
export type JobListRow = ShellJob & {
  next?: JobNextStep;
  /** 0 booked … 5 delivered (see jobsShared stage helpers). */
  stage?: number;
};

/** Stage of a list row: precomputed by the page, else derived from the next milestone. */
export function rowStage(r: JobListRow): number {
  return r.stage ?? stageFromNext(r, r.next?.code ?? null);
}

/** Voyage progress for the route picture: at origin until sailed, in port once arrived. */
export function rowProgress(r: JobListRow, stage = rowStage(r)): number | null {
  if (stage >= 3) return 100;
  if (stage < 2) return known(r.etd) ? 0 : null;
  return progressBetween(known(r.etd) || null, known(r.eta) || null) ?? 50;
}

type Props = {
  rows: JobListRow[];
  loading?: boolean;
  emptyText?: string;
  emptyAction?: ReactNode;
};

/**
 * Jobs list — at most 6 columns: Job no. + customer | stage icons | route picture (ETD/ETA) | vessel | next step | people.
 * Columns whose values are all unknown are hidden instead of showing a wall of "—". Phones get stacked rows.
 */
export function JobsProTable({ rows, loading, emptyText, emptyAction }: Props) {
  const { tx, locale } = useStore();
  const navigate = useNavigate();
  const { nameOf } = useCustomerLookup();
  const phone = useIsPhone();

  const people = (r: ShellJob) => [...new Set([personName(r.salesOwner), personName(r.opsOwner)].filter(Boolean))];
  const vessel = (r: ShellJob) => [known(r.vessel), known(r.voyage)].filter(Boolean).join(" / ") || known(r.carrier);
  const has = (fn: (r: JobListRow) => unknown) => rows.some((r) => Boolean(fn(r)));
  const shortDate = (v: string) => (known(v) ? fmtShortDate(v, locale) : undefined);
  const stageLabels = Object.fromEntries(STAGE_KEYS.map((k) => [k, tx(`stage_${k}`)])) as Record<StageKey, string>;

  const stageCell = (r: JobListRow) => {
    const stage = rowStage(r);
    const late = Boolean(r.delayed) && stage < 5;
    return (
      <span className="jobs-status-cell">
        <span className="jobs-stage-mini" aria-label={stageLabels[STAGE_KEYS[stage]]} role="img">
          <StageFlow current={stage >= 5 ? STAGE_KEYS.length : stage} labels={stageLabels} problem={late} size="sm" />
        </span>
        {late ? (
          <Tooltip title={tx("jobs_delayed")}>
            <span className="jobs-late-icon" role="img" aria-label={tx("jobs_delayed")}>
              <Warning size={16} weight="fill" />
            </span>
          </Tooltip>
        ) : null}
      </span>
    );
  };

  const route = (r: JobListRow) => {
    const stage = rowStage(r);
    return (
      <RouteTrack
        size="sm"
        from={r.pol}
        to={r.pod}
        progress={rowProgress(r, stage)}
        fromDate={shortDate(r.etd)}
        toDate={shortDate(r.eta)}
        delayed={Boolean(r.delayed)}
        done={stage >= 5}
      />
    );
  };

  if (phone) {
    return (
      <JobsStackList
        loading={loading}
        emptyText={emptyText}
        emptyAction={emptyAction}
        items={rows.map((r) => ({
          key: r.id,
          title: r.jobNumber,
          status: stageCell(r),
          sub: (
            <>
              <span>{nameOf(r.customerId)}</span>
              <LaneCell from={r.pol} to={r.pod} />
            </>
          ),
          onOpen: () => navigate(`/jobs/${r.id}`),
        }))}
      />
    );
  }

  const columns: ColumnsType<JobListRow> = [
    {
      title: tx("jobs_colJob"),
      key: "job",
      render: (_, r) => (
        <>
          <span className="cz-cell-main jobs-nowrap">{r.jobNumber}</span>
          <span className="cz-cell-sub jobs-cell-clip">{nameOf(r.customerId)}</span>
        </>
      ),
    },
    { title: tx("jobs_colStage"), key: "stage", render: (_, r) => stageCell(r) },
    { title: tx("jobs_colLane"), key: "route", width: 300, render: (_, r) => route(r) },
  ];

  if (has(vessel)) {
    columns.push({
      title: tx("jobs_colVessel"),
      key: "vessel",
      render: (_, r) => <span className="jobs-vessel">{vessel(r) || "—"}</span>,
    });
  }

  if (has((r) => r.next !== undefined)) {
    columns.push({
      title: tx("jobs_colNext"),
      key: "next",
      render: (_, r) => {
        if (!r.next) return <span className="cz-muted">{tx("jobs_allDone")}</span>;
        const overdue = r.next.plannedAt ? new Date(String(r.next.plannedAt)).getTime() < Date.now() : false;
        return (
          <>
            <span className="jobs-nowrap">{milestoneLabel(tx, r.next.code, r.next.label)}</span>
            {r.next.plannedAt ? (
              <span className={`cz-cell-sub${overdue ? " jobs-text-danger" : ""}`}>{fmtDate(r.next.plannedAt, locale)}</span>
            ) : null}
          </>
        );
      },
    });
  }

  if (has((r) => people(r).length)) {
    columns.push({ title: tx("jobs_colOwner"), key: "people", render: (_, r) => <PeopleStack names={people(r)} /> });
  }

  return (
    <DataTable<JobListRow>
      rowKey="id"
      columns={columns}
      dataSource={rows}
      loading={loading}
      emptyText={emptyText}
      emptyAction={emptyAction}
      onRowClick={(r) => navigate(`/jobs/${r.id}`)}
    />
  );
}
