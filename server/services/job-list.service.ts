import { sql, type SQL } from "drizzle-orm";
import type { Db } from "../db/index.js";

/**
 * Server-side jobs list: search, status tabs, billing, stage, paging and per-tab / per-stage counts
 * in ONE round trip. Derived columns (UI status bucket, delayed, billing status, gross profit,
 * next milestone, shipment stage 0–5) are computed in SQL so filters and counts work over the
 * whole org, not just the rows on screen.
 *
 * Stage / status / billing rules mirror src/v2/pages/jobsShared.ts (stageFromNext),
 * src/adapters/api/jobMapper.ts (mapShellStatus) and job-enrichment.service.ts (deriveBillingStatus).
 */

export const JOB_STAGE_KEYS = ["booked", "gatein", "sailed", "arrived", "customs", "delivered"] as const;
export type JobStageKey = (typeof JOB_STAGE_KEYS)[number];
export const JOB_STATUS_TABS = ["OPEN", "IN_PROGRESS", "CLOSED", "delayed"] as const;
export type JobStatusTab = (typeof JOB_STATUS_TABS)[number];
export const JOB_BILLING = ["UNBILLED", "INVOICED", "PARTIAL", "PAID"] as const;

export type JobListQuery = {
  customerId?: string;
  q?: string;
  status?: JobStatusTab;
  billing?: (typeof JOB_BILLING)[number];
  stage?: JobStageKey;
  milestoneFilter?: "all" | "at_risk" | "pending";
  ids?: string[];
  limit: number;
  offset: number;
  /** "board": late first, then soonest ETA. Default: most recently updated. */
  sort?: "updated" | "board";
  /** Board view: at most this many rows per stage (limit/offset ignored). */
  perStage?: number;
};

export type JobListItem = {
  id: string;
  jobNumber: string;
  customerId: string;
  origin: string;
  destination: string;
  pol: string;
  pod: string;
  mode: string;
  status: string;
  teu: number;
  currency: string;
  carrier: string | null;
  vessel: string | null;
  voyage: string | null;
  etd: string | null;
  eta: string | null;
  containerType: string | null;
  containerCount: number;
  incoterm: string | null;
  assignedOperator: string | null;
  salesOwnerId: string | null;
  nextMilestoneCode: string | null;
  nextMilestoneLabel: string | null;
  nextMilestonePlannedAt: string | null;
  milestoneAtRisk: boolean;
  milestonePendingCount: number;
  grossProfit: string | null;
  billingStatus: string;
  customerNameZh: string | null;
  customerNameTh: string | null;
  customerNameEn: string | null;
  /** 0 booked … 5 delivered. */
  stage: number;
};

export type JobListResult = {
  items: JobListItem[];
  total: number;
  limit: number;
  offset: number;
  /** Per status tab, over the search / customer / billing filters (ignores the chosen tab). */
  counts: Record<"all" | JobStatusTab, number>;
  /** Per stage key, over every filter except the stage itself. */
  stageCounts: Record<JobStageKey, number>;
};

const STAGE_INDEX: Record<JobStageKey, number> = { booked: 0, gatein: 1, sailed: 2, arrived: 3, customs: 4, delivered: 5 };

function likeEscape(s: string) {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

export async function listJobsPage(db: Db, organizationId: string, o: JobListQuery): Promise<JobListResult> {
  const base: SQL[] = [sql`j.organization_id = ${organizationId}`];
  if (o.customerId) base.push(sql`j.customer_id = ${o.customerId}`);
  if (o.ids?.length) base.push(sql`j.id IN (${sql.join(o.ids.map((id) => sql`${id}`), sql`, `)})`);
  const q = o.q?.trim();
  if (q) {
    const like = `%${likeEscape(q)}%`;
    base.push(sql`(
      j.job_number ILIKE ${like} OR j.carrier ILIKE ${like} OR j.vessel ILIKE ${like} OR j.voyage ILIKE ${like}
      OR j.pol ILIKE ${like} OR j.pod ILIKE ${like} OR j.origin ILIKE ${like} OR j.destination ILIKE ${like}
      OR j.booking_number ILIKE ${like} OR j.master_bl ILIKE ${like} OR j.house_bl ILIKE ${like}
      OR c.name_zh ILIKE ${like} OR c.name_th ILIKE ${like} OR c.name_en ILIKE ${like}
    )`);
  }

  // Filters applied on the derived rows.
  const billingF = o.billing ? sql`d.billing_status = ${o.billing}` : sql`true`;
  const ms = o.milestoneFilter === "at_risk" ? sql`d.at_risk` : o.milestoneFilter === "pending" ? sql`d.pending > 0` : sql`true`;
  const tabF =
    o.status === "delayed" ? sql`d.at_risk` : o.status ? sql`d.ui_status = ${o.status}` : sql`true`;
  const stageF = o.stage ? sql`d.stage = ${STAGE_INDEX[o.stage]}` : sql`true`;

  const order =
    o.sort === "board"
      ? sql`d.at_risk DESC, d.eta_key ASC NULLS LAST, d.updated_at DESC, d.id`
      : sql`d.updated_at DESC, d.id`;

  const itemsSql = o.perStage
    ? sql`SELECT * FROM (
        SELECT d.*, row_number() OVER (PARTITION BY d.stage ORDER BY ${order}) AS rn FROM f d WHERE ${stageF}
      ) r WHERE r.rn <= ${o.perStage} ORDER BY r.stage, r.rn`
    : sql`SELECT d.* FROM f d WHERE ${stageF} ORDER BY ${order} LIMIT ${o.limit} OFFSET ${o.offset}`;

  const query = sql`
    WITH b AS (
      SELECT j.*, c.name_zh AS c_zh, c.name_th AS c_th, c.name_en AS c_en FROM jobs j LEFT JOIN customers c ON c.id = j.customer_id
      WHERE ${sql.join(base, sql` AND `)}
    ),
    ms AS (
      SELECT m.job_id,
        (array_agg(m.code ORDER BY m.sort_order) FILTER (WHERE m.actual_at IS NULL))[1] AS next_code,
        (array_agg(m.label ORDER BY m.sort_order) FILTER (WHERE m.actual_at IS NULL))[1] AS next_label,
        (array_agg(m.planned_at ORDER BY m.sort_order) FILTER (WHERE m.actual_at IS NULL))[1] AS next_planned,
        count(*) FILTER (WHERE m.actual_at IS NULL)::int AS pending,
        coalesce(bool_or(m.actual_at IS NULL AND m.planned_at < now()), false) AS at_risk
      FROM job_milestones m JOIN b ON b.id = m.job_id
      GROUP BY m.job_id
    ),
    inv AS (
      SELECT i.job_id,
        count(*) FILTER (WHERE i.status <> 'DRAFT')::int AS issued,
        bool_and(i.status = 'PAID' OR i.balance_due <= 0) FILTER (WHERE i.status <> 'DRAFT') AS all_paid,
        bool_or(i.paid_amount > 0) FILTER (WHERE i.status <> 'DRAFT') AS any_paid
      FROM invoices i JOIN b ON b.id = i.job_id
      GROUP BY i.job_id
    ),
    ch AS (
      SELECT s.job_id,
        count(*)::int AS n,
        coalesce(sum(coalesce(s.actual_amount, s.total_amount)) FILTER (WHERE s.charge_type = 'REVENUE'), 0)
          - coalesce(sum(coalesce(s.actual_amount, s.total_amount)) FILTER (WHERE s.charge_type = 'COST'), 0) AS gp
      FROM shipment_charges s JOIN b ON b.id = s.job_id
      GROUP BY s.job_id
    ),
    today AS (
      SELECT to_char((now() AT TIME ZONE coalesce((SELECT timezone FROM organizations WHERE id = ${organizationId}), 'Asia/Bangkok'))::date, 'YYYY-MM-DD') AS t
    ),
    x AS (
      SELECT b.*,
        CASE WHEN upper(b.status) IN ('DELIVERED', 'CLOSED', 'COMPLETED') THEN 'CLOSED'
             WHEN upper(b.status) IN ('BOOKING', 'DRAFT', 'QUOTED') THEN 'OPEN'
             ELSE 'IN_PROGRESS' END AS ui_status,
        coalesce(ms.at_risk, false) AS at_risk,
        coalesce(ms.pending, 0) AS pending,
        ms.next_code, ms.next_label, ms.next_planned,
        CASE WHEN coalesce(inv.issued, 0) = 0 THEN 'UNBILLED'
             WHEN inv.all_paid THEN 'PAID'
             WHEN inv.any_paid THEN 'PARTIAL'
             ELSE 'INVOICED' END AS billing_status,
        CASE WHEN ch.n > 0 THEN ch.gp::numeric(18, 4)::text END AS gross_profit,
        CASE WHEN b.eta ~ '^\\d{4}-\\d{2}-\\d{2}' THEN substr(b.eta, 1, 10) END AS eta_key,
        CASE WHEN b.eta ~ '^\\d{4}-\\d{2}-\\d{2}' AND substr(b.eta, 1, 10) <= today.t THEN 3
             WHEN b.etd ~ '^\\d{4}-\\d{2}-\\d{2}' AND substr(b.etd, 1, 10) <= today.t THEN 2
             ELSE 0 END AS by_date,
        CASE ms.next_code
          WHEN 'QUOTE_ACCEPTED' THEN 0 WHEN 'BOOKING' THEN 0 WHEN 'SI' THEN 0 WHEN 'CONTAINER' THEN 0 WHEN 'GATE_IN' THEN 0
          WHEN 'LOADED' THEN 1 WHEN 'SAILED' THEN 1 WHEN 'ARRIVED' THEN 2 WHEN 'CLEAR' THEN 3 WHEN 'DO' THEN 3
          WHEN 'DELIVERED' THEN 4 WHEN 'POD' THEN 5 WHEN 'INVOICED' THEN 5 WHEN 'PAID' THEN 5 END AS while_next
      FROM b CROSS JOIN today
      LEFT JOIN ms ON ms.job_id = b.id
      LEFT JOIN inv ON inv.job_id = b.id
      LEFT JOIN ch ON ch.job_id = b.id
    ),
    d AS (
      SELECT x.*,
        CASE WHEN x.ui_status = 'CLOSED' THEN 5
             WHEN x.next_code IS NULL THEN CASE WHEN x.pending = 0 THEN greatest(4, x.by_date) ELSE x.by_date END
             WHEN x.while_next IS NULL THEN x.by_date
             WHEN x.while_next = 3 AND x.by_date < 3 THEN 2
             WHEN x.while_next <= 1 THEN greatest(x.while_next, x.by_date)
             ELSE x.while_next END AS stage
      FROM x
    ),
    f AS (SELECT d.* FROM d WHERE ${billingF} AND ${ms} AND ${tabF})
    SELECT
      (SELECT json_build_object(
          'all', count(*),
          'OPEN', count(*) FILTER (WHERE d.ui_status = 'OPEN'),
          'IN_PROGRESS', count(*) FILTER (WHERE d.ui_status = 'IN_PROGRESS'),
          'CLOSED', count(*) FILTER (WHERE d.ui_status = 'CLOSED'),
          'delayed', count(*) FILTER (WHERE d.at_risk))
        FROM d WHERE ${billingF} AND ${ms}) AS counts,
      (SELECT coalesce(json_object_agg(s.stage, s.n), '{}'::json) FROM (SELECT d.stage, count(*) AS n FROM f d GROUP BY d.stage) s) AS stage_counts,
      (SELECT count(*)::int FROM f d WHERE ${stageF}) AS total,
      (SELECT coalesce(json_agg(json_build_object(
          'id', i.id, 'jobNumber', i.job_number, 'customerId', i.customer_id, 'customerNameZh', i.c_zh,
          'customerNameTh', i.c_th, 'customerNameEn', i.c_en, 'origin', i.origin,
          'destination', i.destination, 'pol', i.pol, 'pod', i.pod, 'mode', i.mode, 'status', i.status,
          'teu', i.teu, 'currency', i.currency, 'carrier', i.carrier, 'vessel', i.vessel, 'voyage', i.voyage,
          'etd', i.etd, 'eta', i.eta, 'containerType', i.container_type, 'containerCount', i.container_count,
          'incoterm', i.incoterm, 'assignedOperator', i.assigned_operator, 'salesOwnerId', i.sales_owner_id,
          'nextMilestoneCode', i.next_code, 'nextMilestoneLabel', i.next_label, 'nextMilestonePlannedAt', i.next_planned,
          'milestoneAtRisk', i.at_risk, 'milestonePendingCount', i.pending, 'grossProfit', i.gross_profit,
          'billingStatus', i.billing_status, 'stage', i.stage)), '[]'::json)
        FROM (${itemsSql}) i) AS items
  `;

  const rows = (await db.execute(query)) as unknown as Array<{
    counts: Record<string, number>;
    stage_counts: Record<string, number>;
    total: number;
    items: JobListItem[];
  }>;
  const row = rows[0];
  const stageCounts = Object.fromEntries(JOB_STAGE_KEYS.map((k, i) => [k, Number(row?.stage_counts?.[String(i)] ?? 0)])) as Record<
    JobStageKey,
    number
  >;
  return {
    items: row?.items ?? [],
    total: row?.total ?? 0,
    limit: o.limit,
    offset: o.offset,
    counts: {
      all: Number(row?.counts?.all ?? 0),
      OPEN: Number(row?.counts?.OPEN ?? 0),
      IN_PROGRESS: Number(row?.counts?.IN_PROGRESS ?? 0),
      CLOSED: Number(row?.counts?.CLOSED ?? 0),
      delayed: Number(row?.counts?.delayed ?? 0),
    },
    stageCounts,
  };
}

/** Parse & clamp the list query string (shared by GET /jobs and the CSV export). */
export function parseJobListQuery(get: (k: string) => string | undefined): JobListQuery {
  const pick = <T extends string>(v: string | undefined, allowed: readonly T[]) => (v && (allowed as readonly string[]).includes(v) ? (v as T) : undefined);
  const mf = get("milestoneFilter");
  const perStage = Number(get("perStage") || 0);
  const view = get("view");
  return {
    customerId: get("customerId") || undefined,
    q: get("q")?.slice(0, 100) || undefined,
    status: pick(get("status"), JOB_STATUS_TABS),
    billing: pick(get("billing"), JOB_BILLING),
    stage: pick(get("stage"), JOB_STAGE_KEYS),
    milestoneFilter: mf === "at_risk" || mf === "pending" ? mf : "all",
    limit: Math.min(Math.max(Number(get("limit") || 200) || 200, 1), 500),
    offset: Math.max(Number(get("offset") || 0) || 0, 0),
    sort: view === "board" || get("sort") === "board" ? "board" : "updated",
    perStage: view === "board" ? Math.min(Math.max(perStage || 20, 1), 100) : undefined,
  };
}

export type JobReportSummary = {
  total: number;
  /** Raw job status (BOOKING, IN_TRANSIT, DELIVERED, …) → count. */
  byStatus: Record<string, number>;
  /** UNBILLED / INVOICED / PARTIAL / PAID → count (same rule as the list's billingStatus). */
  byBilling: Record<string, number>;
  containers: number;
  laneCount: number;
  /** Busiest lanes by containers (POL, else origin → POD, else destination). */
  lanes: Array<{ pol: string; pod: string; containers: number }>;
};

/** Org-wide job aggregates for the Reports page — one query, no rows shipped to the browser. */
export async function jobReportSummary(db: Db, organizationId: string, topLanes = 6): Promise<JobReportSummary> {
  const query = sql`
    WITH b AS (
      SELECT j.id, j.status, coalesce(j.container_count, 1) AS boxes,
        coalesce(nullif(j.pol, ''), j.origin, '') AS lpol, coalesce(nullif(j.pod, ''), j.destination, '') AS lpod
      FROM jobs j WHERE j.organization_id = ${organizationId}
    ),
    inv AS (
      SELECT i.job_id,
        count(*) FILTER (WHERE i.status <> 'DRAFT')::int AS issued,
        bool_and(i.status = 'PAID' OR i.balance_due <= 0) FILTER (WHERE i.status <> 'DRAFT') AS all_paid,
        bool_or(i.paid_amount > 0) FILTER (WHERE i.status <> 'DRAFT') AS any_paid
      FROM invoices i JOIN b ON b.id = i.job_id
      GROUP BY i.job_id
    ),
    d AS (
      SELECT b.*,
        CASE WHEN coalesce(inv.issued, 0) = 0 THEN 'UNBILLED'
             WHEN inv.all_paid THEN 'PAID'
             WHEN inv.any_paid THEN 'PARTIAL'
             ELSE 'INVOICED' END AS billing_status
      FROM b LEFT JOIN inv ON inv.job_id = b.id
    )
    SELECT
      (SELECT count(*)::int FROM d) AS total,
      (SELECT coalesce(sum(boxes), 0)::int FROM d) AS containers,
      (SELECT coalesce(json_object_agg(s.status, s.n), '{}'::json) FROM (SELECT status, count(*)::int AS n FROM d GROUP BY status) s) AS by_status,
      (SELECT coalesce(json_object_agg(s.billing_status, s.n), '{}'::json) FROM (SELECT billing_status, count(*)::int AS n FROM d GROUP BY billing_status) s) AS by_billing,
      (SELECT count(*)::int FROM (SELECT 1 FROM d GROUP BY lpol, lpod) l) AS lane_count,
      (SELECT coalesce(json_agg(json_build_object('pol', l.lpol, 'pod', l.lpod, 'containers', l.n)), '[]'::json) FROM (
          SELECT lpol, lpod, sum(boxes)::int AS n FROM d GROUP BY lpol, lpod ORDER BY n DESC, lpol, lpod LIMIT ${topLanes}
        ) l) AS lanes
  `;
  const rows = (await db.execute(query)) as unknown as Array<{
    total: number;
    containers: number;
    by_status: Record<string, number>;
    by_billing: Record<string, number>;
    lane_count: number;
    lanes: JobReportSummary["lanes"];
  }>;
  const r = rows[0];
  return {
    total: Number(r?.total ?? 0),
    byStatus: r?.by_status ?? {},
    byBilling: r?.by_billing ?? {},
    containers: Number(r?.containers ?? 0),
    laneCount: Number(r?.lane_count ?? 0),
    lanes: r?.lanes ?? [],
  };
}
