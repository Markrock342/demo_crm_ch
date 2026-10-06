import { Hono, type Context } from "hono";
import { getDb, hasDatabase, type Db } from "../db/index.js";
import { authMiddleware, requireAuth, requirePermission, requireTenant, type AuthEnv } from "../middleware/auth.js";
import { writeAudit } from "../services/audit.service.js";
import {
  listAtRisk,
  marketingOverview,
  parseSegmentFilter,
  resolveRange,
  segmentContactsCsv,
  segmentCustomers,
  segmentOptions,
  type CsvLang,
} from "../services/marketing.service.js";

function dbOr503(c: Context<AuthEnv>): Db | Response {
  if (!hasDatabase()) return c.json({ error: "database_unconfigured" }, 503);
  const db = getDb();
  if (!db) return c.json({ error: "database_unavailable" }, 503);
  return db;
}

const qInt = (v: string | undefined) => (v && /^\d+$/.test(v) ? Number(v) : undefined);

/** Marketing analytics: funnel, lead sources, pipeline, quotations, customer growth, segments. Read-only. */
const gate = [requireAuth(), requireTenant(), requirePermission("report.marketing.view")] as const;

export function marketingRoutes() {
  const r = new Hono<AuthEnv>();
  r.use("*", authMiddleware);

  /** GET /marketing/overview?period=month|quarter|year | ?from=YYYY-MM-DD&to=YYYY-MM-DD */
  r.get("/marketing/overview", ...gate, async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const range = resolveRange(c.req.query());
    return c.json(await marketingOverview(db, c.get("organizationId")!, range));
  });

  /** GET /marketing/at-risk?limit=&offset= — active customers with no job / quotation in 90 days. */
  r.get("/marketing/at-risk", ...gate, async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const q = c.req.query();
    return c.json(await listAtRisk(db, c.get("organizationId")!, { limit: qInt(q.limit), offset: qInt(q.offset) }));
  });

  /** GET /marketing/segments/options — chip choices (lanes, business types, industries, owners). */
  r.get("/marketing/segments/options", ...gate, async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    return c.json(await segmentOptions(db, c.get("organizationId")!));
  });

  /** GET /marketing/segments?pol=&pod=&businessType=&industry=&owner=&recency=&size=&q=&limit=&offset= */
  r.get("/marketing/segments", ...gate, async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const q = c.req.query();
    const filter = parseSegmentFilter(q);
    return c.json({ filter, ...(await segmentCustomers(db, c.get("organizationId")!, filter, { limit: qInt(q.limit), offset: qInt(q.offset) })) });
  });

  /** GET /marketing/segments/contacts.csv?…same filters…&lang=th|zh|en — campaign contact list (audited). */
  r.get("/marketing/segments/contacts.csv", ...gate, async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const q = c.req.query();
    const filter = parseSegmentFilter(q);
    const lang: CsvLang = q.lang === "zh" || q.lang === "en" ? q.lang : "th";
    const organizationId = c.get("organizationId")!;
    const { csv, count } = await segmentContactsCsv(db, organizationId, filter, lang);
    await writeAudit(db, {
      userId: c.get("user")!.id,
      organizationId,
      action: "marketing.segment_export",
      entityType: "customer",
      newValue: { filter, contacts: count },
    });
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="segment-contacts-${stamp}.csv"`,
        "Cache-Control": "no-store",
        "X-Row-Count": String(count),
      },
    });
  });

  return r;
}
