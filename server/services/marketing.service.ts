import { sql, type SQL } from "drizzle-orm";
import type { Db } from "../db/index.js";

/**
 * Marketing analytics — every number here is a SQL aggregate scoped to one organization.
 * Nothing loads whole tables into memory; list endpoints are paged.
 *
 * Date ranges are Bangkok calendar days (inclusive): `from`..`to` → [from 00:00+07, to+1 00:00+07).
 */

const TZ = "Asia/Bangkok";
const DAY = 86_400_000;

/* ── Ranges ─────────────────────────────────────────── */

export type Period = "month" | "quarter" | "year" | "custom";
export type DateRange = { period: Period; from: string; to: string };

const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const isYmd = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const pad = (n: number) => String(n).padStart(2, "0");

/** Resolve ?period=month|quarter|year or ?from=&to= (custom) into Bangkok calendar dates. Default: this month. */
export function resolveRange(q: { period?: string; from?: string; to?: string }, now = new Date()): DateRange {
  if (isYmd(q.from) && isYmd(q.to)) {
    const [from, to] = q.from <= q.to ? [q.from, q.to] : [q.to, q.from];
    // Cap custom ranges at ~3 years so a typo can't scan decades.
    const maxFrom = ymd(new Date(Date.parse(`${to}T00:00:00Z`) - 3 * 366 * DAY));
    return { period: "custom", from: from < maxFrom ? maxFrom : from, to };
  }
  const today = ymd(now);
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  if (q.period === "year") return { period: "year", from: `${y}-01-01`, to: today };
  if (q.period === "quarter") {
    const qm = Math.floor((m - 1) / 3) * 3 + 1;
    return { period: "quarter", from: `${y}-${pad(qm)}-01`, to: today };
  }
  return { period: "month", from: `${y}-${pad(m)}-01`, to: today };
}

/** Timestamp bounds of a range: start inclusive, end exclusive. */
export function rangeBounds(r: { from: string; to: string }) {
  const start = new Date(`${r.from}T00:00:00+07:00`);
  const end = new Date(new Date(`${r.to}T00:00:00+07:00`).getTime() + DAY);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** YYYY-MM keys from the month of `from` (or 5 months before `to`, whichever is earlier) to the month of `to`; max 24. */
export function growthMonths(r: { from: string; to: string }): string[] {
  const endY = Number(r.to.slice(0, 4));
  const endM = Number(r.to.slice(5, 7));
  const endIdx = endY * 12 + (endM - 1);
  const fromIdx = Number(r.from.slice(0, 4)) * 12 + (Number(r.from.slice(5, 7)) - 1);
  const startIdx = Math.max(endIdx - 23, Math.min(fromIdx, endIdx - 5));
  const out: string[] = [];
  for (let i = startIdx; i <= endIdx; i++) out.push(`${Math.floor(i / 12)}-${pad((i % 12) + 1)}`);
  return out;
}

/* ── Lead sources ───────────────────────────────────── */

export const SOURCE_KEYS = ["exhibition", "referral", "website", "line", "facebook", "phone", "email", "association", "social", "cold_call", "existing", "other"] as const;
export type SourceKey = (typeof SOURCE_KEYS)[number];

/** Lead `source` is free text (zh / th / en, legacy values) — fold it into a small set of keys. */
export function normalizeSource(raw: string | null | undefined): SourceKey {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return "other";
  const has = (...needles: string[]) => needles.some((n) => s.includes(n));
  const word = (w: string) => new RegExp(`(^|[^a-z])${w}([^a-z]|$)`).test(s);
  if (word("line") || has("line oa", "lineoa", "ไลน์")) return "line";
  if (word("fb") || has("facebook", "脸书", "เฟซบุ๊ก", "เฟสบุ๊ค")) return "facebook";
  if (has("exhibition", "trade show", "tradeshow", "expo", "fair", "展会", "งานแสดงสินค้า", "งานแสดง", "บูธ")) return "exhibition";
  if (has("referral", "refer", "转介", "推荐", "แนะนำ")) return "referral";
  if (has("website", "web", "官网", "网站", "เว็บไซต์", "เว็บ")) return "website";
  if (has("phone", "inbound call", "call-in", "来电", "电话", "โทรเข้า", "โทร")) return has("cold", "陌生", "ติดต่อหาเอง") ? "cold_call" : "phone";
  if (has("cold", "陌生", "ติดต่อหาเอง")) return "cold_call";
  if (has("email", "e-mail", "mail", "邮件", "อีเมล")) return "email";
  if (has("association", "协会", "商会", "สมาคม", "หอการค้า")) return "association";
  if (has("social", "社交", "wechat", "微信", "tiktok", "โซเชียล")) return "social";
  if (has("existing", "老客户", "ลูกค้าเดิม")) return "existing";
  return "other";
}

/* ── Owners ─────────────────────────────────────────── */

export type OwnerRef = { key: string; userId: string | null; name: string; nameZh: string | null; nameTh: string | null };

/**
 * Lateral join that resolves a row's owner to a member of the organization: by `owner_user_id`, else
 * by the legacy display name (any language). `alias` is the outer row alias.
 */
function ownerLateral(organizationId: string, alias: string) {
  const a = sql.raw(alias);
  return sql`LEFT JOIN LATERAL (
      SELECT u.id, u.name, u.name_zh, u.name_th FROM users u
      JOIN organization_members m ON m.user_id = u.id AND m.organization_id = ${organizationId}
      WHERE u.id = ${a}.owner_user_id
         OR (${a}.owner_user_id IS NULL AND ${a}.owner <> '' AND ${a}.owner IN (u.name, u.name_zh, u.name_th))
      ORDER BY (u.id = ${a}.owner_user_id) DESC NULLS LAST
      LIMIT 1
    ) ou ON true`;
}

type OwnerCols = { owner_id: string | null; owner_raw: string | null; owner_name: string | null; owner_zh: string | null; owner_th: string | null };

function ownerRef(r: OwnerCols): OwnerRef {
  if (r.owner_id) return { key: r.owner_id, userId: r.owner_id, name: r.owner_name ?? "", nameZh: r.owner_zh, nameTh: r.owner_th };
  const raw = (r.owner_raw ?? "").trim();
  return { key: raw ? `n:${raw}` : "none", userId: null, name: raw, nameZh: null, nameTh: null };
}

const OWNER_SELECT = sql`ou.id::text AS owner_id, ou.name AS owner_name, ou.name_zh AS owner_zh, ou.name_th AS owner_th`;

/* ── Overview ───────────────────────────────────────── */

const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);

export const OPEN_DEAL_STAGES = ["qualify", "quote"] as const;
export const WON_DEAL_STAGES = ["won", "book", "billed"] as const;

export type MarketingOverview = {
  range: DateRange;
  funnel: { key: "leads" | "qualified" | "sent" | "accepted" | "jobs"; count: number; rate: number | null }[];
  sources: { key: SourceKey; raw: string[]; leads: number; won: number; wonRate: number | null }[];
  pipeline: {
    byStage: { stage: string; deals: number; values: { currency: string; value: number }[] }[];
    byOwner: { owner: OwnerRef; openDeals: number; wonDeals: number; open: { currency: string; value: number }[] }[];
    open: { currency: string; value: number }[];
    openDeals: number;
  };
  quotations: {
    sent: number;
    accepted: number;
    rejected: number;
    expired: number;
    waiting: number;
    acceptanceRate: number | null;
    winRate: number | null;
    avgDaysToClose: number | null;
    topLanes: { pol: string; pod: string; quotes: number; accepted: number }[];
  };
  customers: { newCount: number; active: number; atRisk: number; growth: { month: string; count: number }[] };
  leads: { total: number; qualified: number; conversion: number | null };
};

export async function marketingOverview(db: Db, organizationId: string, range: DateRange): Promise<MarketingOverview> {
  const { start, end } = rangeBounds(range);
  const s = sql`${start}::timestamptz`;
  const e = sql`${end}::timestamptz`;
  const sentInRange = sql`organization_id = ${organizationId} AND status IN ('SENT','ACCEPTED','REJECTED','EXPIRED')
      AND ((sent_at >= ${s} AND sent_at < ${e}) OR (sent_at IS NULL AND created_at >= ${s} AND created_at < ${e}))`;
  const months = growthMonths(range);
  const growthStart = new Date(`${months[0]}-01T00:00:00+07:00`).toISOString();

  const [head] = (await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM leads WHERE organization_id = ${organizationId} AND created_at >= ${s} AND created_at < ${e}) AS leads,
      (SELECT count(*)::int FROM leads WHERE organization_id = ${organizationId} AND created_at >= ${s} AND created_at < ${e} AND stage = 'qualified') AS qualified,
      (SELECT json_build_object(
          'sent', count(*),
          'accepted', count(*) FILTER (WHERE status = 'ACCEPTED'),
          'rejected', count(*) FILTER (WHERE status = 'REJECTED'),
          'expired', count(*) FILTER (WHERE status = 'EXPIRED'),
          'waiting', count(*) FILTER (WHERE status = 'SENT'))
        FROM quotations WHERE ${sentInRange}) AS quotes,
      (SELECT avg(EXTRACT(EPOCH FROM (coalesce(sig.signed_at, q.updated_at) - q.created_at)) / 86400)::float8
        FROM quotations q
        LEFT JOIN LATERAL (SELECT min(signed_at) AS signed_at FROM quote_signatures WHERE quotation_id = q.id) sig ON true
        WHERE q.organization_id = ${organizationId} AND q.status = 'ACCEPTED'
          AND ((q.sent_at >= ${s} AND q.sent_at < ${e}) OR (q.sent_at IS NULL AND q.created_at >= ${s} AND q.created_at < ${e}))) AS avg_days,
      (SELECT count(*)::int FROM jobs j JOIN quotations q ON q.id = j.quotation_id
        WHERE j.organization_id = ${organizationId} AND q.organization_id = ${organizationId} AND q.status = 'ACCEPTED'
          AND ((q.sent_at >= ${s} AND q.sent_at < ${e}) OR (q.sent_at IS NULL AND q.created_at >= ${s} AND q.created_at < ${e}))) AS jobs,
      (SELECT count(*)::int FROM customers WHERE organization_id = ${organizationId} AND created_at >= ${s} AND created_at < ${e}) AS new_customers,
      (SELECT count(DISTINCT customer_id)::int FROM jobs WHERE organization_id = ${organizationId} AND created_at >= ${s} AND created_at < ${e}) AS active_customers,
      (SELECT coalesce(json_agg(x), '[]'::json) FROM (
          SELECT source, count(*)::int AS n, (count(*) FILTER (WHERE stage = 'qualified'))::int AS won
          FROM leads WHERE organization_id = ${organizationId} AND created_at >= ${s} AND created_at < ${e}
          GROUP BY source) x) AS sources,
      (SELECT coalesce(json_agg(x), '[]'::json) FROM (
          SELECT pol, pod, count(*)::int AS quotes, (count(*) FILTER (WHERE status = 'ACCEPTED'))::int AS accepted
          FROM quotations WHERE organization_id = ${organizationId} AND created_at >= ${s} AND created_at < ${e}
          GROUP BY pol, pod ORDER BY count(*) DESC, pol, pod LIMIT 6) x) AS lanes,
      (SELECT coalesce(json_agg(x), '[]'::json) FROM (
          SELECT to_char(date_trunc('month', created_at AT TIME ZONE ${TZ}), 'YYYY-MM') AS month, count(*)::int AS n
          FROM customers WHERE organization_id = ${organizationId} AND created_at >= ${growthStart}::timestamptz AND created_at < ${e}
          GROUP BY 1) x) AS growth
  `)) as unknown as Array<{
    leads: number;
    qualified: number;
    quotes: { sent: number; accepted: number; rejected: number; expired: number; waiting: number };
    avg_days: number | null;
    jobs: number;
    new_customers: number;
    active_customers: number;
    sources: { source: string; n: number; won: number }[];
    lanes: { pol: string; pod: string; quotes: number; accepted: number }[];
    growth: { month: string; n: number }[];
  }>;
  const h = head!;

  const stageRows = (await db.execute(sql`
    SELECT o.stage, o.currency, count(*)::int AS deals, coalesce(sum(o.value), 0)::float8 AS value
    FROM opportunities o JOIN customers c ON c.id = o.customer_id
    WHERE c.organization_id = ${organizationId}
    GROUP BY o.stage, o.currency
  `)) as unknown as { stage: string; currency: string; deals: number; value: number }[];

  const ownerRows = (await db.execute(sql`
    SELECT o.owner AS owner_raw, ${OWNER_SELECT}, o.currency,
      (count(*) FILTER (WHERE o.stage IN ('qualify','quote')))::int AS open_deals,
      (count(*) FILTER (WHERE o.stage IN ('won','book','billed')))::int AS won_deals,
      (coalesce(sum(o.value) FILTER (WHERE o.stage IN ('qualify','quote')), 0))::float8 AS open_value
    FROM opportunities o JOIN customers c ON c.id = o.customer_id
    ${ownerLateral(organizationId, "o")}
    WHERE c.organization_id = ${organizationId}
    GROUP BY o.owner, ou.id, ou.name, ou.name_zh, ou.name_th, o.currency
  `)) as unknown as (OwnerCols & { currency: string; open_deals: number; won_deals: number; open_value: number })[];

  const atRisk = await countAtRisk(db, organizationId);

  // Funnel: each step's rate is relative to the step before it.
  const steps = [
    ["leads", h.leads],
    ["qualified", h.qualified],
    ["sent", h.quotes.sent],
    ["accepted", h.quotes.accepted],
    ["jobs", h.jobs],
  ] as const;
  const funnel = steps.map(([key, count], i) => ({ key, count, rate: i === 0 ? null : pct(count, steps[i - 1]![1]) }));

  // Lead sources folded into keys.
  const bySource = new Map<SourceKey, { raw: Set<string>; leads: number; won: number }>();
  for (const r of h.sources) {
    const k = normalizeSource(r.source);
    const cur = bySource.get(k) ?? { raw: new Set<string>(), leads: 0, won: 0 };
    cur.raw.add(r.source);
    cur.leads += r.n;
    cur.won += r.won;
    bySource.set(k, cur);
  }
  const sources = [...bySource.entries()]
    .map(([key, v]) => ({ key, raw: [...v.raw], leads: v.leads, won: v.won, wonRate: pct(v.won, v.leads) }))
    .sort((a, b) => b.leads - a.leads || a.key.localeCompare(b.key));

  // Pipeline by stage (snapshot, all stages) + by owner (open deals).
  const stageOrder = [...OPEN_DEAL_STAGES, ...WON_DEAL_STAGES] as string[];
  const stageMap = new Map<string, { deals: number; values: Map<string, number> }>();
  for (const r of stageRows) {
    const cur = stageMap.get(r.stage) ?? { deals: 0, values: new Map<string, number>() };
    cur.deals += r.deals;
    cur.values.set(r.currency, (cur.values.get(r.currency) ?? 0) + r.value);
    stageMap.set(r.stage, cur);
  }
  const byStage = [...stageOrder, ...[...stageMap.keys()].filter((k) => !stageOrder.includes(k))].map((stage) => {
    const v = stageMap.get(stage);
    return { stage, deals: v?.deals ?? 0, values: v ? moneyList(v.values) : [] };
  });
  const openTotals = new Map<string, number>();
  let openDeals = 0;
  for (const st of OPEN_DEAL_STAGES) {
    const v = stageMap.get(st);
    if (!v) continue;
    openDeals += v.deals;
    for (const [cur, val] of v.values) openTotals.set(cur, (openTotals.get(cur) ?? 0) + val);
  }
  const ownerMap = new Map<string, { owner: OwnerRef; openDeals: number; wonDeals: number; open: Map<string, number> }>();
  for (const r of ownerRows) {
    const owner = ownerRef(r);
    const cur = ownerMap.get(owner.key) ?? { owner, openDeals: 0, wonDeals: 0, open: new Map<string, number>() };
    cur.openDeals += r.open_deals;
    cur.wonDeals += r.won_deals;
    if (r.open_value) cur.open.set(r.currency, (cur.open.get(r.currency) ?? 0) + r.open_value);
    ownerMap.set(owner.key, cur);
  }
  const byOwner = [...ownerMap.values()]
    .map((o) => ({ owner: o.owner, openDeals: o.openDeals, wonDeals: o.wonDeals, open: moneyList(o.open) }))
    .sort((a, b) => (b.open[0]?.value ?? 0) - (a.open[0]?.value ?? 0) || b.openDeals - a.openDeals);

  const q = h.quotes;
  const decided = q.accepted + q.rejected + q.expired;
  const growthMap = new Map(h.growth.map((g) => [g.month, g.n]));

  return {
    range,
    funnel,
    sources,
    pipeline: { byStage, byOwner, open: moneyList(openTotals), openDeals },
    quotations: {
      ...q,
      acceptanceRate: pct(q.accepted, q.sent),
      winRate: pct(q.accepted, decided),
      avgDaysToClose: h.avg_days === null || h.avg_days === undefined ? null : Math.round(Number(h.avg_days) * 10) / 10,
      topLanes: h.lanes,
    },
    customers: { newCount: h.new_customers, active: h.active_customers, atRisk, growth: months.map((m) => ({ month: m, count: growthMap.get(m) ?? 0 })) },
    leads: { total: h.leads, qualified: h.qualified, conversion: pct(h.qualified, h.leads) },
  };
}

function moneyList(m: Map<string, number>) {
  return [...m.entries()].map(([currency, value]) => ({ currency, value })).sort((a, b) => b.value - a.value);
}

/* ── Customers at risk ──────────────────────────────── */

export const AT_RISK_DAYS = 90;

/** Active customers with no job and no quotation in the last 90 days (customers newer than that are not counted). */
function atRiskCte(organizationId: string) {
  return sql`last AS (
      SELECT c.id, c.created_at,
        greatest(
          (SELECT max(j.created_at) FROM jobs j WHERE j.customer_id = c.id),
          (SELECT max(q.created_at) FROM quotations q WHERE q.customer_id = c.id)
        ) AS last_at
      FROM customers c
      WHERE c.organization_id = ${organizationId} AND c.status = 'active'
    ),
    risk AS (
      SELECT id, last_at FROM last WHERE coalesce(last_at, created_at) < now() - make_interval(days => ${AT_RISK_DAYS})
    )`;
}

async function countAtRisk(db: Db, organizationId: string): Promise<number> {
  const [r] = (await db.execute(sql`WITH ${atRiskCte(organizationId)} SELECT count(*)::int AS n FROM risk`)) as unknown as { n: number }[];
  return r?.n ?? 0;
}

export type CustomerNames = { id: string; nameZh: string; nameTh: string; nameEn: string };
export type AtRiskRow = CustomerNames & {
  owner: OwnerRef;
  lastAt: string | null;
  daysSince: number | null;
  contact: { name: string; phone: string; email: string } | null;
  openTasks: number;
};

export async function listAtRisk(db: Db, organizationId: string, opts: { limit?: number; offset?: number } = {}) {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
  const offset = Math.max(opts.offset ?? 0, 0);
  const [head] = (await db.execute(sql`
    WITH ${atRiskCte(organizationId)}
    SELECT
      (SELECT count(*)::int FROM risk) AS total,
      (SELECT coalesce(json_agg(x), '[]'::json) FROM (
        SELECT c.id, c.name_zh, c.name_th, c.name_en, c.owner AS owner_raw, ${OWNER_SELECT},
          r.last_at, (now()::date - (r.last_at AT TIME ZONE ${TZ})::date) AS days_since,
          ct.name AS contact_name, ct.phone AS contact_phone, ct.email AS contact_email,
          (SELECT count(*)::int FROM tasks t WHERE t.organization_id = ${organizationId} AND t.customer_id = c.id AND t.status = 'open') AS open_tasks
        FROM risk r JOIN customers c ON c.id = r.id
        ${ownerLateral(organizationId, "c")}
        LEFT JOIN LATERAL (SELECT name, phone, email FROM contacts WHERE customer_id = c.id ORDER BY "primary" DESC, created_at LIMIT 1) ct ON true
        ORDER BY r.last_at ASC NULLS FIRST, c.id
        LIMIT ${limit} OFFSET ${offset}) x) AS items
  `)) as unknown as {
    total: number;
    items: (OwnerCols & {
      id: string;
      name_zh: string;
      name_th: string;
      name_en: string;
      last_at: string | null;
      days_since: number | null;
      contact_name: string | null;
      contact_phone: string | null;
      contact_email: string | null;
      open_tasks: number;
    })[];
  }[];
  const items: AtRiskRow[] = head!.items.map((r) => ({
    id: r.id,
    nameZh: r.name_zh,
    nameTh: r.name_th,
    nameEn: r.name_en,
    owner: ownerRef(r),
    lastAt: r.last_at ? new Date(r.last_at).toISOString() : null,
    daysSince: r.days_since,
    contact: r.contact_name ? { name: r.contact_name, phone: r.contact_phone ?? "", email: r.contact_email ?? "" } : null,
    openTasks: r.open_tasks,
  }));
  return { items, total: head!.total, limit, offset };
}

/* ── Segments ───────────────────────────────────────── */

export const RECENCY = ["d30", "d90", "dormant", "never"] as const;
export const SIZES = ["none", "small", "medium", "large"] as const;
export type Recency = (typeof RECENCY)[number];
export type Size = (typeof SIZES)[number];

/** Job-count buckets for "size". */
export const SIZE_BOUNDS: Record<Size, [number, number | null]> = { none: [0, 0], small: [1, 2], medium: [3, 5], large: [6, null] };

export type SegmentFilter = {
  pol?: string;
  pod?: string;
  businessType?: string;
  industry?: string;
  owner?: string;
  recency?: Recency;
  size?: Size;
  q?: string;
};

export function parseSegmentFilter(q: Record<string, string | undefined>): SegmentFilter {
  const str = (v: string | undefined, max = 80) => {
    const t = (v ?? "").trim();
    return t ? t.slice(0, max) : undefined;
  };
  const code = (v: string | undefined) => {
    const t = (v ?? "").trim().toUpperCase();
    return /^[A-Z0-9]{2,6}$/.test(t) ? t : undefined;
  };
  return {
    pol: code(q.pol),
    pod: code(q.pod),
    businessType: str(q.businessType, 40),
    industry: str(q.industry),
    owner: str(q.owner, 120),
    recency: RECENCY.includes(q.recency as Recency) ? (q.recency as Recency) : undefined,
    size: SIZES.includes(q.size as Size) ? (q.size as Size) : undefined,
    q: str(q.q),
  };
}

/** Customers of the org with job count, last touch (job / quotation / activity) and resolved owner, then filtered. */
function segmentCte(organizationId: string, f: SegmentFilter) {
  const where: SQL[] = [sql`c.organization_id = ${organizationId}`];
  const lane = (col: "pol" | "pod", v: string) => {
    const c = sql.raw(col);
    return sql`(EXISTS (SELECT 1 FROM jobs j WHERE j.customer_id = c.id AND j.${c} = ${v})
      OR EXISTS (SELECT 1 FROM quotations q WHERE q.customer_id = c.id AND q.${c} = ${v})
      OR c.preferred_lanes @> ${JSON.stringify([{ [col]: v }])}::jsonb)`;
  };
  if (f.pol) where.push(lane("pol", f.pol));
  if (f.pod) where.push(lane("pod", f.pod));
  if (f.businessType) where.push(f.businessType === "none" ? sql`coalesce(c.business_type, '') = ''` : sql`c.business_type = ${f.businessType}`);
  if (f.industry) where.push(sql`lower(trim(c.industry)) = lower(${f.industry})`);
  if (f.q) {
    const like = `%${f.q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    where.push(sql`(c.name_zh ILIKE ${like} OR c.name_th ILIKE ${like} OR c.name_en ILIKE ${like})`);
  }

  const outer: SQL[] = [sql`true`];
  if (f.owner) outer.push(sql`b.owner_key = ${f.owner}`);
  if (f.recency === "d30") outer.push(sql`b.last_at >= now() - interval '30 days'`);
  if (f.recency === "d90") outer.push(sql`b.last_at < now() - interval '30 days' AND b.last_at >= now() - interval '90 days'`);
  if (f.recency === "dormant") outer.push(sql`b.last_at < now() - interval '90 days'`);
  if (f.recency === "never") outer.push(sql`b.last_at IS NULL`);
  if (f.size) {
    const [lo, hi] = SIZE_BOUNDS[f.size];
    outer.push(hi === null ? sql`b.jobs >= ${lo}` : sql`b.jobs BETWEEN ${lo} AND ${hi}`);
  }

  return sql`js AS (
      SELECT customer_id, count(*)::int AS n, max(created_at) AS last FROM jobs WHERE organization_id = ${organizationId} GROUP BY customer_id
    ),
    qs AS (
      SELECT customer_id, max(created_at) AS last FROM quotations WHERE organization_id = ${organizationId} GROUP BY customer_id
    ),
    acts AS (
      SELECT customer_id, max(occurred_at) AS last FROM activities
      WHERE organization_id = ${organizationId} AND customer_id IS NOT NULL GROUP BY customer_id
    ),
    b AS (
      SELECT c.id, c.name_zh, c.name_th, c.name_en, c.business_type, c.industry, c.owner AS owner_raw, c.created_at, ${OWNER_SELECT},
        coalesce(ou.id::text, CASE WHEN c.owner <> '' THEN 'n:' || c.owner ELSE 'none' END) AS owner_key,
        coalesce(js.n, 0) AS jobs,
        greatest(js.last, qs.last, acts.last) AS last_at
      FROM customers c
      LEFT JOIN js ON js.customer_id = c.id
      LEFT JOIN qs ON qs.customer_id = c.id
      LEFT JOIN acts ON acts.customer_id = c.id
      ${ownerLateral(organizationId, "c")}
      WHERE ${sql.join(where, sql` AND `)}
    ),
    seg AS (SELECT * FROM b WHERE ${sql.join(outer, sql` AND `)})`;
}

export type SegmentRow = CustomerNames & {
  businessType: string | null;
  industry: string | null;
  owner: OwnerRef;
  jobs: number;
  lastAt: string | null;
  lane: { pol: string; pod: string } | null;
  contact: { name: string; email: string; phone: string } | null;
  contacts: number;
};

export type SegmentOptions = {
  pols: string[];
  pods: string[];
  businessTypes: string[];
  industries: string[];
  owners: OwnerRef[];
};

export async function segmentCustomers(db: Db, organizationId: string, f: SegmentFilter, opts: { limit?: number; offset?: number } = {}) {
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  const [head] = (await db.execute(sql`
    WITH ${segmentCte(organizationId, f)}
    SELECT
      (SELECT count(*)::int FROM seg) AS total,
      (SELECT count(*)::int FROM contacts ct JOIN seg ON seg.id = ct.customer_id WHERE ct.email <> '' OR ct.phone <> '') AS reachable,
      (SELECT coalesce(json_agg(x), '[]'::json) FROM (
        SELECT seg.*, ln.pol, ln.pod, ct.name AS contact_name, ct.email AS contact_email, ct.phone AS contact_phone,
          (SELECT count(*)::int FROM contacts WHERE customer_id = seg.id) AS contacts
        FROM seg
        LEFT JOIN LATERAL (
          SELECT pol, pod FROM (
            SELECT pol, pod, created_at FROM jobs WHERE customer_id = seg.id
            UNION ALL SELECT pol, pod, created_at FROM quotations WHERE customer_id = seg.id
          ) l ORDER BY created_at DESC LIMIT 1) ln ON true
        LEFT JOIN LATERAL (SELECT name, email, phone FROM contacts WHERE customer_id = seg.id ORDER BY "primary" DESC, created_at LIMIT 1) ct ON true
        ORDER BY seg.last_at DESC NULLS LAST, seg.id
        LIMIT ${limit} OFFSET ${offset}) x) AS items
  `)) as unknown as {
    total: number;
    reachable: number;
    items: (OwnerCols & {
      id: string;
      name_zh: string;
      name_th: string;
      name_en: string;
      business_type: string | null;
      industry: string | null;
      jobs: number;
      last_at: string | null;
      pol: string | null;
      pod: string | null;
      contact_name: string | null;
      contact_email: string | null;
      contact_phone: string | null;
      contacts: number;
    })[];
  }[];
  const items: SegmentRow[] = head!.items.map((r) => ({
    id: r.id,
    nameZh: r.name_zh,
    nameTh: r.name_th,
    nameEn: r.name_en,
    businessType: r.business_type,
    industry: r.industry,
    owner: ownerRef(r),
    jobs: r.jobs,
    lastAt: r.last_at ? new Date(r.last_at).toISOString() : null,
    lane: r.pol && r.pod ? { pol: r.pol, pod: r.pod } : null,
    contact: r.contact_name ? { name: r.contact_name, email: r.contact_email ?? "", phone: r.contact_phone ?? "" } : null,
    contacts: r.contacts,
  }));
  return { items, total: head!.total, reachable: head!.reachable, limit, offset };
}

/** Choices for the segment filter chips (distinct values that actually exist in the org). */
export async function segmentOptions(db: Db, organizationId: string): Promise<SegmentOptions> {
  const [r] = (await db.execute(sql`
    SELECT
      (SELECT coalesce(json_agg(p ORDER BY n DESC, p), '[]'::json) FROM (
        SELECT pol AS p, count(*) AS n FROM (
          SELECT pol FROM jobs WHERE organization_id = ${organizationId}
          UNION ALL SELECT pol FROM quotations WHERE organization_id = ${organizationId}) a
        WHERE pol <> '' GROUP BY pol LIMIT 40) x) AS pols,
      (SELECT coalesce(json_agg(p ORDER BY n DESC, p), '[]'::json) FROM (
        SELECT pod AS p, count(*) AS n FROM (
          SELECT pod FROM jobs WHERE organization_id = ${organizationId}
          UNION ALL SELECT pod FROM quotations WHERE organization_id = ${organizationId}) a
        WHERE pod <> '' GROUP BY pod LIMIT 40) x) AS pods,
      (SELECT coalesce(json_agg(DISTINCT business_type), '[]'::json) FROM customers
        WHERE organization_id = ${organizationId} AND coalesce(business_type, '') <> '') AS business_types,
      (SELECT coalesce(json_agg(i ORDER BY i), '[]'::json) FROM (
        SELECT DISTINCT trim(industry) AS i FROM customers
        WHERE organization_id = ${organizationId} AND coalesce(trim(industry), '') <> '' LIMIT 60) x) AS industries
  `)) as unknown as { pols: string[]; pods: string[]; business_types: string[]; industries: string[] }[];
  const owners = (await db.execute(sql`
    SELECT DISTINCT c.owner AS owner_raw, ${OWNER_SELECT}
    FROM customers c ${ownerLateral(organizationId, "c")}
    WHERE c.organization_id = ${organizationId}
  `)) as unknown as OwnerCols[];
  const seen = new Map<string, OwnerRef>();
  for (const o of owners) {
    const ref = ownerRef(o);
    if (ref.key !== "none" && !seen.has(ref.key)) seen.set(ref.key, ref);
  }
  return {
    pols: r!.pols,
    pods: r!.pods,
    businessTypes: r!.business_types,
    industries: r!.industries,
    owners: [...seen.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/* ── CSV ────────────────────────────────────────────── */

export const CSV_MAX_ROWS = 20_000;

/** RFC 4180 cell; also neutralises spreadsheet formulas (=, +, -, @ at the start, except plain phone numbers). */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  // Phone numbers like "+66 2 754 3301" stay as they are; anything else that could start a formula is quoted.
  if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?[\d\s().-]+$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: unknown[][]): string {
  // BOM so Excel opens Thai / Chinese text as UTF-8.
  return "\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export type CsvLang = "zh" | "th" | "en";

export const CSV_HEADERS: Record<CsvLang, string[]> = {
  th: ["ชื่อ", "อีเมล", "โทรศัพท์", "บริษัท", "ตำแหน่ง", "LINE", "ผู้รับผิดชอบ"],
  zh: ["姓名", "邮箱", "电话", "公司", "职位", "LINE", "负责人"],
  en: ["Name", "Email", "Phone", "Company", "Title", "LINE", "Owner"],
};

/** Contacts (name, email, phone, company …) of every customer in the segment, for campaign tools. */
export async function segmentContactsCsv(db: Db, organizationId: string, f: SegmentFilter, lang: CsvLang = "th") {
  const nameCol = sql.raw(lang === "zh" ? "seg.name_zh" : lang === "en" ? "seg.name_en" : "seg.name_th");
  const ownerName = sql.raw(lang === "zh" ? "coalesce(seg.owner_zh, seg.owner_name, seg.owner_raw)" : lang === "th" ? "coalesce(seg.owner_th, seg.owner_name, seg.owner_raw)" : "coalesce(seg.owner_name, seg.owner_raw)");
  const rows = (await db.execute(sql`
    WITH ${segmentCte(organizationId, f)}
    SELECT ct.name, ct.email, ct.phone, coalesce(nullif(${nameCol}, ''), seg.name_en, seg.name_th) AS company, ct.title, ct.line_id, ${ownerName} AS owner
    FROM contacts ct JOIN seg ON seg.id = ct.customer_id
    WHERE ct.email <> '' OR ct.phone <> ''
    ORDER BY company, ct."primary" DESC, ct.name
    LIMIT ${CSV_MAX_ROWS}
  `)) as unknown as { name: string; email: string; phone: string; company: string; title: string; line_id: string; owner: string | null }[];
  const csv = toCsv([CSV_HEADERS[lang], ...rows.map((r) => [r.name, r.email, r.phone, r.company, r.title, r.line_id, r.owner ?? ""])]);
  return { csv, count: rows.length };
}
