import { sql, type SQL } from "drizzle-orm";
import type { Db } from "../db/index.js";

/**
 * Server-side invoices list for the Invoices screen: tabs, search, customer, paging, the
 * money summary (per currency) and the urgency groups of the card view — one round trip.
 * "Open" / "overdue" / "soon" follow src/v2/pages/InvoicesPage.tsx (isOpen / isOverdue / isSoon);
 * days are counted in the organization's time zone.
 */

export const INVOICE_VIEWS = ["draft", "open", "overdue", "paid"] as const;
export type InvoiceView = (typeof INVOICE_VIEWS)[number];
export const INVOICE_GROUPS = ["overdue", "soon", "open", "draft", "paid"] as const;
export type InvoiceGroup = (typeof INVOICE_GROUPS)[number];

export type InvoiceListQuery = {
  view?: InvoiceView;
  q?: string;
  customerId?: string;
  jobId?: string;
  status?: string;
  ids?: string[];
  limit: number;
  offset: number;
  /** Card view: at most this many rows per urgency group (limit/offset ignored). */
  perGroup?: number;
  group?: InvoiceGroup;
};

export type InvoiceListItem = {
  id: string;
  invoiceNumber: string;
  customerId: string;
  jobId: string | null;
  jobNumber: string | null;
  customerNameZh: string | null;
  customerNameTh: string | null;
  customerNameEn: string | null;
  issueDate: string;
  dueDate: string;
  currency: string;
  subtotal: string;
  tax: string;
  total: string;
  paidAmount: string;
  balanceDue: string;
  status: string;
  group: InvoiceGroup | "other";
};

type Money = { currency: string; amount: number };
export type InvoiceSummary = {
  /** Per currency, over non-draft / non-void invoices, biggest first. */
  currencies: Array<{
    currency: string;
    billed: number;
    paid: number;
    due: number;
    overdue: number;
    aging: { notDue: number; d1_30: number; d31_60: number; d60: number };
  }>;
  open: { count: number; balance: Money[] };
  overdue: { count: number; balance: Money[] };
  week: { count: number; balance: Money[] };
};

export type InvoiceListResult = {
  items: InvoiceListItem[];
  total: number;
  limit: number;
  offset: number;
  counts: { all: number; draft: number; open: number; overdue: number; paid: number };
  groupCounts: Record<InvoiceGroup, number>;
  summary: InvoiceSummary;
};

function likeEscape(s: string) {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

export async function listInvoicesPage(db: Db, organizationId: string, o: InvoiceListQuery): Promise<InvoiceListResult> {
  // Scope = what tabs, tiles and the money summary count over.
  const scope: SQL[] = [sql`i.organization_id = ${organizationId}`];
  if (o.jobId) scope.push(sql`i.job_id = ${o.jobId}`);
  // Filters = the list itself.
  const filt: SQL[] = [sql`true`];
  if (o.customerId) filt.push(sql`d.customer_id = ${o.customerId}`);
  if (o.status) filt.push(sql`d.status = ${o.status}`);
  if (o.ids?.length) filt.push(sql`d.id IN (${sql.join(o.ids.map((id) => sql`${id}`), sql`, `)})`);
  const q = o.q?.trim();
  if (q) {
    const like = `%${likeEscape(q)}%`;
    filt.push(sql`(d.invoice_number ILIKE ${like} OR d.job_number ILIKE ${like} OR d.c_zh ILIKE ${like} OR d.c_th ILIKE ${like} OR d.c_en ILIKE ${like})`);
  }
  if (o.view === "draft") filt.push(sql`d.status = 'DRAFT'`);
  if (o.view === "open") filt.push(sql`d.is_open`);
  if (o.view === "overdue") filt.push(sql`d.is_open AND d.days < 0`);
  if (o.view === "paid") filt.push(sql`d.status = 'PAID'`);
  if (o.group) filt.push(sql`d.grp = ${o.group}`);

  const order = sql`CASE WHEN d.is_open THEN 0 ELSE 1 END, d.due_date ASC, d.invoice_number DESC`;
  const itemsSql = o.perGroup
    ? sql`SELECT * FROM (
        SELECT d.*, row_number() OVER (PARTITION BY d.grp ORDER BY ${order}) AS rn FROM f d
      ) r WHERE r.rn <= ${o.perGroup} ORDER BY r.grp, r.rn`
    : sql`SELECT d.* FROM f d ORDER BY d.issue_date DESC, d.invoice_number DESC LIMIT ${o.limit} OFFSET ${o.offset}`;

  const query = sql`
    WITH today AS (
      SELECT coalesce((SELECT timezone FROM organizations WHERE id = ${organizationId}), 'Asia/Bangkok') AS tz
    ),
    d AS (
      SELECT i.id, i.invoice_number, i.customer_id, i.job_id, i.issue_date, i.due_date, i.currency, i.subtotal, i.tax,
        i.total, i.paid_amount, i.balance_due, i.status, j.job_number,
        c.name_zh AS c_zh, c.name_th AS c_th, c.name_en AS c_en,
        (i.balance_due > 0 AND i.status IN ('ISSUED', 'PARTIALLY_PAID', 'PARTIAL')) AS is_open,
        ((i.due_date AT TIME ZONE today.tz)::date - (now() AT TIME ZONE today.tz)::date) AS days,
        (i.status NOT IN ('DRAFT', 'VOID', 'CANCELLED')) AS counted
      FROM invoices i CROSS JOIN today
      LEFT JOIN jobs j ON j.id = i.job_id
      LEFT JOIN customers c ON c.id = i.customer_id
      WHERE ${sql.join(scope, sql` AND `)}
    ),
    g AS (
      SELECT d.*,
        CASE WHEN d.is_open AND d.days < 0 THEN 'overdue'
             WHEN d.is_open AND d.days <= 7 THEN 'soon'
             WHEN d.is_open THEN 'open'
             WHEN d.status = 'DRAFT' THEN 'draft'
             WHEN d.status = 'PAID' THEN 'paid'
             ELSE 'other' END AS grp
      FROM d
    ),
    f AS (SELECT d.* FROM g d WHERE ${sql.join(filt, sql` AND `)})
    SELECT
      (SELECT json_build_object(
          'all', count(*),
          'draft', count(*) FILTER (WHERE status = 'DRAFT'),
          'open', count(*) FILTER (WHERE is_open),
          'overdue', count(*) FILTER (WHERE is_open AND days < 0),
          'paid', count(*) FILTER (WHERE status = 'PAID'),
          'week', count(*) FILTER (WHERE is_open AND days BETWEEN 0 AND 7)) FROM d) AS counts,
      (SELECT coalesce(json_agg(x ORDER BY x.billed DESC), '[]'::json) FROM (
          SELECT currency,
            sum(total) FILTER (WHERE counted)::float8 AS billed,
            sum(greatest(total - balance_due, 0)) FILTER (WHERE counted)::float8 AS paid,
            coalesce(sum(balance_due) FILTER (WHERE counted AND is_open AND days >= 0), 0)::float8 AS due,
            coalesce(sum(balance_due) FILTER (WHERE counted AND is_open AND days < 0), 0)::float8 AS overdue,
            coalesce(sum(balance_due) FILTER (WHERE counted AND is_open AND days >= 0), 0)::float8 AS a0,
            coalesce(sum(balance_due) FILTER (WHERE counted AND is_open AND days < 0 AND days >= -30), 0)::float8 AS a30,
            coalesce(sum(balance_due) FILTER (WHERE counted AND is_open AND days < -30 AND days >= -60), 0)::float8 AS a60,
            coalesce(sum(balance_due) FILTER (WHERE counted AND is_open AND days < -60), 0)::float8 AS a90
          FROM d GROUP BY currency HAVING count(*) FILTER (WHERE counted) > 0) x) AS currencies,
      (SELECT coalesce(json_agg(x), '[]'::json) FROM (
          SELECT currency,
            sum(balance_due) FILTER (WHERE is_open)::float8 AS open_bal,
            sum(balance_due) FILTER (WHERE is_open AND days < 0)::float8 AS overdue_bal,
            sum(balance_due) FILTER (WHERE is_open AND days BETWEEN 0 AND 7)::float8 AS week_bal
          FROM d GROUP BY currency) x) AS balances,
      (SELECT coalesce(json_object_agg(grp, n), '{}'::json) FROM (SELECT grp, count(*) AS n FROM f GROUP BY grp) s) AS group_counts,
      (SELECT count(*)::int FROM f) AS total,
      (SELECT coalesce(json_agg(json_build_object(
          'id', r.id, 'invoiceNumber', r.invoice_number, 'customerId', r.customer_id, 'jobId', r.job_id,
          'jobNumber', r.job_number, 'customerNameZh', r.c_zh, 'customerNameTh', r.c_th, 'customerNameEn', r.c_en,
          'issueDate', r.issue_date, 'dueDate', r.due_date, 'currency', r.currency, 'subtotal', r.subtotal::text,
          'tax', r.tax::text, 'total', r.total::text, 'paidAmount', r.paid_amount::text, 'balanceDue', r.balance_due::text,
          'status', r.status, 'group', r.grp)), '[]'::json)
        FROM (${itemsSql}) r) AS items
  `;

  const rows = (await db.execute(query)) as unknown as Array<{
    counts: Record<string, number>;
    currencies: Array<{ currency: string; billed: number; paid: number; due: number; overdue: number; a0: number; a30: number; a60: number; a90: number }>;
    balances: Array<{ currency: string; open_bal: number | null; overdue_bal: number | null; week_bal: number | null }>;
    group_counts: Record<string, number>;
    total: number;
    items: InvoiceListItem[];
  }>;
  const row = rows[0]!;
  const money = (k: "open_bal" | "overdue_bal" | "week_bal"): Money[] =>
    row.balances.filter((b) => (b[k] ?? 0) > 0).map((b) => ({ currency: b.currency, amount: b[k] ?? 0 })).sort((a, b) => b.amount - a.amount);

  return {
    items: row.items,
    total: row.total,
    limit: o.limit,
    offset: o.offset,
    counts: {
      all: Number(row.counts.all ?? 0),
      draft: Number(row.counts.draft ?? 0),
      open: Number(row.counts.open ?? 0),
      overdue: Number(row.counts.overdue ?? 0),
      paid: Number(row.counts.paid ?? 0),
    },
    groupCounts: Object.fromEntries(INVOICE_GROUPS.map((k) => [k, Number(row.group_counts[k] ?? 0)])) as Record<InvoiceGroup, number>,
    summary: {
      currencies: row.currencies.map((c) => ({
        currency: c.currency,
        billed: c.billed ?? 0,
        paid: c.paid ?? 0,
        due: c.due,
        overdue: c.overdue,
        aging: { notDue: c.a0, d1_30: c.a30, d31_60: c.a60, d60: c.a90 },
      })),
      open: { count: Number(row.counts.open ?? 0), balance: money("open_bal") },
      overdue: { count: Number(row.counts.overdue ?? 0), balance: money("overdue_bal") },
      week: { count: Number(row.counts.week ?? 0), balance: money("week_bal") },
    },
  };
}

/** True when the request asks for the paged list (any paging / filter param). */
export function wantsPagedInvoices(get: (k: string) => string | undefined): boolean {
  return ["limit", "offset", "q", "view", "perGroup", "group", "jobId", "status"].some((k) => get(k) !== undefined);
}

export function parseInvoiceListQuery(get: (k: string) => string | undefined): InvoiceListQuery {
  const pick = <T extends string>(v: string | undefined, allowed: readonly T[]) => (v && (allowed as readonly string[]).includes(v) ? (v as T) : undefined);
  const perGroup = Number(get("perGroup") || 0);
  return {
    view: pick(get("view"), INVOICE_VIEWS),
    q: get("q")?.slice(0, 100) || undefined,
    customerId: get("customerId") || undefined,
    jobId: get("jobId") || undefined,
    status: get("status") || undefined,
    group: pick(get("group"), INVOICE_GROUPS),
    limit: Math.min(Math.max(Number(get("limit") || 50) || 50, 1), 500),
    offset: Math.max(Number(get("offset") || 0) || 0, 0),
    perGroup: perGroup ? Math.min(Math.max(perGroup, 1), 100) : undefined,
  };
}
