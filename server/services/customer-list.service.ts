import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { customers } from "../db/schema/crm.js";
import { toCustomer, type CustomerDto } from "./crm.service.js";

/**
 * Customers screen, server side: search, tab (all / boxes moving / AR ≥ 30 days), owner, paging,
 * tab counts and the per-customer money strip (active jobs, open receivable in the main currency,
 * aged current / ≤30 / >30 days) for just the rows on screen.
 */

export const CUSTOMER_TABS = ["all", "active", "ar"] as const;
export type CustomerTab = (typeof CUSTOMER_TABS)[number];
const AR_WARN = 30;

export type CustomerMoney = {
  activeJobs: number;
  balance: number;
  currency: string;
  aging: { current: number; late: number; veryLate: number };
};

export type CustomerListRow = CustomerDto & { money: CustomerMoney };

function likeEscape(s: string) {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

export async function listCustomersPage(
  db: Db,
  organizationId: string,
  o: { q?: string; tab?: CustomerTab; owner?: string; limit: number; offset: number },
) {
  const where: SQL[] = [sql`cu.organization_id = ${organizationId}`];
  const q = o.q?.trim();
  if (q) {
    const like = `%${likeEscape(q)}%`;
    where.push(sql`(cu.name_zh ILIKE ${like} OR cu.name_th ILIKE ${like} OR cu.name_en ILIKE ${like}
      OR cu.city_zh ILIKE ${like} OR cu.city_th ILIKE ${like} OR cu.city_en ILIKE ${like}
      OR cu.lane_zh ILIKE ${like} OR cu.lane_th ILIKE ${like} OR cu.lane_en ILIKE ${like} OR cu.owner ILIKE ${like})`);
  }
  if (o.owner) where.push(sql`cu.owner = ${o.owner}`);
  const tabF = o.tab === "active" ? sql`c.boxes > 0` : o.tab === "ar" ? sql`c.ar_days >= ${AR_WARN}` : sql`true`;

  const [head] = (await db.execute(sql`
    WITH box AS (
      SELECT customer_id, count(*)::int AS n FROM containers WHERE organization_id = ${organizationId} GROUP BY customer_id
    ),
    c AS (
      SELECT cu.id, cu.updated_at, cu.ar_days, coalesce(box.n, 0) AS boxes
      FROM customers cu LEFT JOIN box ON box.customer_id = cu.id
      WHERE ${sql.join(where, sql` AND `)}
    )
    SELECT
      (SELECT json_build_object('all', count(*), 'active', count(*) FILTER (WHERE boxes > 0),
          'ar', count(*) FILTER (WHERE ar_days >= ${AR_WARN})) FROM c) AS counts,
      (SELECT count(*)::int FROM c WHERE ${tabF}) AS total,
      (SELECT coalesce(json_agg(json_build_object('id', x.id, 'boxes', x.boxes)), '[]'::json) FROM (
          SELECT c.id, c.boxes FROM c WHERE ${tabF} ORDER BY c.updated_at DESC, c.id LIMIT ${o.limit} OFFSET ${o.offset}) x) AS page,
      (SELECT coalesce(json_agg(DISTINCT owner ORDER BY owner), '[]'::json) FROM customers
          WHERE organization_id = ${organizationId} AND owner <> '') AS owners
  `)) as unknown as Array<{
    counts: { all: number; active: number; ar: number };
    total: number;
    page: Array<{ id: string; boxes: number }>;
    owners: string[];
  }>;

  const ids = head!.page.map((p) => p.id);
  const rows = ids.length
    ? await db.select().from(customers).where(and(eq(customers.organizationId, organizationId), inArray(customers.id, ids)))
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const money = await customerMoney(db, organizationId, ids);
  const items: CustomerListRow[] = head!.page
    .filter((p) => byId.has(p.id))
    .map((p) => ({ ...toCustomer(byId.get(p.id)!, p.boxes), money: money.get(p.id) ?? emptyMoney() }));

  return { items, total: head!.total, limit: o.limit, offset: o.offset, counts: head!.counts, owners: head!.owners };
}

function emptyMoney(): CustomerMoney {
  return { activeJobs: 0, balance: 0, currency: "", aging: { current: 0, late: 0, veryLate: 0 } };
}

/** Active jobs + open receivable (main currency only, issued invoices) per customer — 2 grouped queries. */
export async function customerMoney(db: Db, organizationId: string, customerIds: string[]): Promise<Map<string, CustomerMoney>> {
  const out = new Map<string, CustomerMoney>();
  if (!customerIds.length) return out;
  const idList = sql.join(customerIds.map((id) => sql`${id}`), sql`, `);
  const [jobs, ar] = await Promise.all([
    db.execute(sql`
      SELECT customer_id, count(*)::int AS n FROM jobs
      WHERE organization_id = ${organizationId} AND customer_id IN (${idList})
        AND upper(status) NOT IN ('DELIVERED', 'CLOSED', 'COMPLETED')
      GROUP BY customer_id`) as unknown as Promise<Array<{ customer_id: string; n: number }>>,
    db.execute(sql`
      WITH open AS (
        SELECT customer_id, currency, balance_due::float8 AS bal, (now()::date - due_date::date) AS late_days
        FROM invoices
        WHERE organization_id = ${organizationId} AND customer_id IN (${idList})
          AND balance_due > 0 AND status NOT IN ('DRAFT', 'VOID', 'CANCELLED')
      ),
      per AS (
        SELECT customer_id, currency, sum(bal) AS total,
          sum(bal) FILTER (WHERE late_days <= 0) AS cur,
          sum(bal) FILTER (WHERE late_days > 0 AND late_days <= 30) AS late,
          sum(bal) FILTER (WHERE late_days > 30) AS very,
          row_number() OVER (PARTITION BY customer_id ORDER BY sum(bal) DESC) AS rk
        FROM open GROUP BY customer_id, currency
      )
      SELECT customer_id, currency, total, coalesce(cur, 0) AS cur, coalesce(late, 0) AS late, coalesce(very, 0) AS very
      FROM per WHERE rk = 1`) as unknown as Promise<
      Array<{ customer_id: string; currency: string; total: number; cur: number; late: number; very: number }>
    >,
  ]);
  const get = (id: string) => {
    let m = out.get(id);
    if (!m) out.set(id, (m = emptyMoney()));
    return m;
  };
  for (const j of jobs) get(j.customer_id).activeJobs = Number(j.n);
  for (const a of ar) {
    const m = get(a.customer_id);
    m.currency = a.currency;
    m.balance = Number(a.total);
    m.aging = { current: Number(a.cur), late: Number(a.late), veryLate: Number(a.very) };
  }
  return out;
}

export function wantsPagedCustomers(get: (k: string) => string | undefined): boolean {
  return ["tab", "owner", "stats"].some((k) => get(k) !== undefined);
}

export function parseCustomerListQuery(get: (k: string) => string | undefined) {
  const tab = get("tab");
  return {
    q: get("q")?.slice(0, 100) || undefined,
    tab: (CUSTOMER_TABS as readonly string[]).includes(tab ?? "") ? (tab as CustomerTab) : undefined,
    owner: get("owner") || undefined,
    limit: Math.min(Math.max(Number(get("limit") || 50) || 50, 1), 200),
    offset: Math.max(Number(get("offset") || 0) || 0, 0),
  };
}
