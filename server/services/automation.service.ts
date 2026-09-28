import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/index.js";
import {
  automationRules,
  containers,
  crmDocs,
  customers,
  invoices,
  jobs,
  notificationChannels,
  notifications,
  organizationMembers,
  organizations,
  quotations,
  roles,
  userRoles,
  users,
} from "../db/schema/index.js";
import { lineConfigured, pushLine } from "./line.service.js";

/**
 * Server-side automation: rules evaluate real org data and create per-user notifications.
 * Evaluation (`evaluateRules`) is pure so it can be tested without a database;
 * `runAutomation` loads the data, inserts (deduplicated) notifications and pushes LINE.
 */

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbLike = Db | Tx;

export const RULE_KEYS = ["job_delayed", "eta_changed", "doc_missing", "free_time", "invoice_overdue", "quote_expiring"] as const;
export type RuleKey = (typeof RULE_KEYS)[number];
export const CHANNELS = ["in_app", "line"] as const;

export function isRuleKey(v: string): v is RuleKey {
  return (RULE_KEYS as readonly string[]).includes(v);
}

/** Days of free time after arrival before demurrage (mirrors the Containers page estimate). */
export const FREE_DAYS = 5;
/** Warn when this many days (or fewer) of free time are left. */
export const FREE_TIME_WARN_DAYS = 3;
/** Warn when a sent quotation expires within this many days. */
export const QUOTE_WARN_DAYS = 3;
/** "Waiting" documents only become urgent when the shipment moves within this many days. */
export const DOC_WARN_DAYS = 3;
/**
 * Events older than this are history, not news: they stay visible on their pages but don't
 * notify (keeps the first run on an imported / long-lived dataset from flooding everyone).
 */
export const STALE_DAYS = { job_delayed: 30, free_time: 14, invoice_overdue: 90 } as const;

const JOB_ARRIVED = new Set(["ARRIVED", "CUSTOMS", "CLEARED", "DELIVERED", "CLOSED", "COMPLETED", "CANCELLED"]);
const JOB_DONE = new Set(["DELIVERED", "CLOSED", "COMPLETED", "CANCELLED"]);
const INVOICE_OPEN = new Set(["ISSUED", "SENT", "PARTIALLY_PAID", "OVERDUE"]);
const QUOTE_OPEN = new Set(["SENT", "APPROVED"]);
/** Laden containers on the ground at the port (yard / customs). Empties are excluded: already unpacked. */
const BOX_ON_GROUND = new Set(["yard", "hold", "clear", "arrived", "customs", "do_ready"]);

// ---------------------------------------------------------------------------
// Snapshot + pure evaluation

export type Member = { id: string; roles: string[]; orgRole: string };
export type SnapCustomer = { id: string; ownerUserId: string | null; nameTh: string; nameEn: string };
export type SnapJob = {
  id: string;
  jobNumber: string;
  customerId: string;
  status: string;
  etd: string | null;
  eta: string | null;
  salesOwnerId: string | null;
  assignedOperator: string | null;
};
export type SnapContainer = {
  id: string;
  containerNo: string;
  jobId: string | null;
  customerId: string;
  status: string;
  direction: string;
  eta: string | null;
};
export type SnapDoc = { id: string; customerId: string; boxId: string; kind: string; name: string; status: string };
export type SnapInvoice = {
  id: string;
  invoiceNumber: string;
  customerId: string;
  jobId: string | null;
  status: string;
  dueDate: Date;
  balanceDue: string;
  currency: string;
};
export type SnapQuote = {
  id: string;
  quotationNumber: string;
  customerId: string;
  status: string;
  validUntil: Date | null;
  salesOwnerId: string | null;
};

export type Snapshot = {
  now: Date;
  timezone: string;
  members: Member[];
  customers: SnapCustomer[];
  jobs: SnapJob[];
  containers: SnapContainer[];
  docs: SnapDoc[];
  invoices: SnapInvoice[];
  quotations: SnapQuote[];
};

export type Candidate = {
  rule: RuleKey;
  userIds: string[];
  title: string;
  body: string;
  params: Record<string, string | number | null>;
  refType: string;
  refId: string;
  href: string;
  dedupeKey: string;
};

export type RuleState = { eta?: Record<string, string> };

export type Evaluation = {
  candidates: Candidate[];
  matched: Record<RuleKey, number>;
  nextState: Partial<Record<RuleKey, RuleState>>;
};

/** yyyy-mm-dd of `d` in the org's timezone. */
export function ymdIn(d: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/** Normalize loose date text ("2026-09-25", "2026-09-25T…") to yyyy-mm-dd, or null. */
export function normYmd(v: string | null | undefined): string | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** Whole days from `a` to `b` (both yyyy-mm-dd). */
export function daysBetween(a: string, b: string): number {
  const pa = a.split("-").map(Number);
  const pb = b.split("-").map(Number);
  return Math.round((Date.UTC(pb[0]!, pb[1]! - 1, pb[2]!) - Date.UTC(pa[0]!, pa[1]! - 1, pa[2]!)) / 86_400_000);
}

function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + n)).toISOString().slice(0, 10);
}

function uniq(ids: (string | null | undefined)[], valid: Set<string>): string[] {
  return [...new Set(ids.filter((x): x is string => Boolean(x) && valid.has(x!)))];
}

export function evaluateRules(snap: Snapshot, enabled: Set<RuleKey>, state: Partial<Record<RuleKey, RuleState>> = {}): Evaluation {
  const today = ymdIn(snap.now, snap.timezone);
  const memberIds = new Set(snap.members.map((m) => m.id));
  const admins = snap.members
    .filter((m) => m.roles.includes("SUPER_ADMIN") || m.orgRole === "owner" || m.orgRole === "admin")
    .map((m) => m.id);
  const finance = snap.members.filter((m) => m.roles.includes("ACCOUNTING")).map((m) => m.id);
  const customerById = new Map(snap.customers.map((c) => [c.id, c]));
  const jobById = new Map(snap.jobs.map((j) => [j.id, j]));
  const boxByNo = new Map(snap.containers.map((b) => [b.containerNo, b]));

  const candidates: Candidate[] = [];
  const matched = Object.fromEntries(RULE_KEYS.map((k) => [k, 0])) as Record<RuleKey, number>;
  const nextState: Partial<Record<RuleKey, RuleState>> = {};

  /** Recipients; falls back to org admins so an event never goes unseen. */
  const people = (...ids: (string | null | undefined)[]) => {
    const out = uniq(ids, memberIds);
    return out.length ? out : uniq(admins, memberIds);
  };
  const ownerOf = (customerId: string | null | undefined) => (customerId ? (customerById.get(customerId)?.ownerUserId ?? null) : null);
  const jobPeople = (j: SnapJob) => people(j.assignedOperator, j.salesOwnerId, ownerOf(j.customerId));
  const push = (c: Candidate) => {
    matched[c.rule]++;
    if (c.userIds.length) candidates.push(c);
  };

  // Job delayed: ETA has passed and the shipment has not arrived.
  if (enabled.has("job_delayed")) {
    for (const j of snap.jobs) {
      const eta = normYmd(j.eta);
      if (!eta || JOB_ARRIVED.has(j.status.toUpperCase())) continue;
      const late = daysBetween(eta, today);
      if (late <= 0 || late > STALE_DAYS.job_delayed) continue;
      push({
        rule: "job_delayed",
        userIds: jobPeople(j),
        title: j.jobNumber,
        body: `ETA ${eta} passed (${late}d), not arrived`,
        params: { eta, days: late, customerId: j.customerId },
        refType: "job",
        refId: j.id,
        href: `/jobs/${j.id}`,
        dedupeKey: `job_delayed:${j.id}:${eta}`,
      });
    }
  }

  // ETA changed since the previous run (first run only records a baseline).
  if (enabled.has("eta_changed")) {
    const seen = state.eta_changed?.eta ?? null;
    const next: Record<string, string> = {};
    for (const j of snap.jobs) {
      const eta = normYmd(j.eta);
      if (!eta || JOB_DONE.has(j.status.toUpperCase())) continue;
      next[j.id] = eta;
      const prev = seen?.[j.id];
      if (!prev || prev === eta) continue;
      push({
        rule: "eta_changed",
        userIds: jobPeople(j),
        title: j.jobNumber,
        body: `ETA ${prev} → ${eta}`,
        params: { from: prev, to: eta, days: daysBetween(prev, eta), customerId: j.customerId },
        refType: "job",
        refId: j.id,
        href: `/jobs/${j.id}`,
        dedupeKey: `eta_changed:${j.id}:${prev}>${eta}`,
      });
    }
    nextState.eta_changed = { eta: next };
  }

  // Documents late, or still missing when the shipment sails/arrives within a few days.
  if (enabled.has("doc_missing")) {
    for (const d of snap.docs) {
      if (d.status !== "late" && d.status !== "wait") continue;
      const box = d.boxId ? boxByNo.get(d.boxId) : undefined;
      const job = box?.jobId ? jobById.get(box.jobId) : undefined;
      if (job && JOB_DONE.has(job.status.toUpperCase())) continue;
      if (d.status === "wait") {
        const when = normYmd(job?.etd) ?? normYmd(job?.eta) ?? normYmd(box?.eta);
        if (!when || daysBetween(today, when) > DOC_WARN_DAYS) continue;
      }
      push({
        rule: "doc_missing",
        userIds: job ? jobPeople(job) : people(ownerOf(d.customerId)),
        title: job?.jobNumber ?? d.name,
        body: `${d.kind} ${d.status === "late" ? "late" : "missing"}: ${d.name}`,
        params: { doc: d.name, docKind: d.kind, state: d.status, box: d.boxId || null, customerId: d.customerId },
        refType: "document",
        refId: d.id,
        href: job ? `/docs?jobId=${encodeURIComponent(job.id)}` : "/docs?missing=1",
        dedupeKey: `doc_missing:${d.id}:${d.status}`,
      });
    }
  }

  // Container free time running out (≤ 3 days) or already over.
  if (enabled.has("free_time")) {
    for (const b of snap.containers) {
      if (b.direction === "out" || !BOX_ON_GROUND.has(b.status)) continue;
      const eta = normYmd(b.eta);
      if (!eta || daysBetween(eta, today) < 0) continue;
      const lfd = addDays(eta, FREE_DAYS);
      const left = daysBetween(today, lfd);
      if (left > FREE_TIME_WARN_DAYS || -left > STALE_DAYS.free_time) continue;
      const stage = left < 0 ? "over" : "soon";
      const job = b.jobId ? jobById.get(b.jobId) : undefined;
      push({
        rule: "free_time",
        userIds: job ? jobPeople(job) : people(ownerOf(b.customerId)),
        title: b.containerNo,
        body: left < 0 ? `Free time over by ${-left}d (LFD ${lfd})` : `${left}d free time left (LFD ${lfd})`,
        params: { lfd, days: left, stage, job: job?.jobNumber ?? null, customerId: b.customerId },
        refType: "container",
        refId: b.id,
        href: `/boxes?q=${encodeURIComponent(b.containerNo)}`,
        dedupeKey: `free_time:${b.id}:${lfd}:${stage}`,
      });
    }
  }

  // Invoice overdue: issued, balance left, due date passed. Finance + account owner.
  if (enabled.has("invoice_overdue")) {
    for (const inv of snap.invoices) {
      if (!INVOICE_OPEN.has(inv.status.toUpperCase()) || !(Number(inv.balanceDue) > 0)) continue;
      const due = ymdIn(inv.dueDate, snap.timezone);
      const over = daysBetween(due, today);
      if (over <= 0 || over > STALE_DAYS.invoice_overdue) continue;
      const job = inv.jobId ? jobById.get(inv.jobId) : undefined;
      push({
        rule: "invoice_overdue",
        userIds: people(...finance, ownerOf(inv.customerId), job?.salesOwnerId),
        title: inv.invoiceNumber,
        body: `${inv.currency} ${Number(inv.balanceDue).toFixed(2)} overdue ${over}d`,
        params: { due, days: over, amount: Number(inv.balanceDue), currency: inv.currency, customerId: inv.customerId },
        refType: "invoice",
        refId: inv.id,
        href: "/invoices?view=overdue",
        dedupeKey: `invoice_overdue:${inv.id}:${due}`,
      });
    }
  }

  // Sent/approved quotation expiring within 3 days.
  if (enabled.has("quote_expiring")) {
    for (const q of snap.quotations) {
      if (!q.validUntil || !QUOTE_OPEN.has(q.status.toUpperCase())) continue;
      const until = ymdIn(q.validUntil, snap.timezone);
      const left = daysBetween(today, until);
      if (left < 0 || left > QUOTE_WARN_DAYS) continue;
      push({
        rule: "quote_expiring",
        userIds: people(q.salesOwnerId, ownerOf(q.customerId)),
        title: q.quotationNumber,
        body: left === 0 ? `Expires today (${until})` : `Expires in ${left}d (${until})`,
        params: { until, days: left, customerId: q.customerId },
        refType: "quotation",
        refId: q.id,
        href: `/quotations?tab=${q.status.toUpperCase() === "SENT" ? "sent" : "approval"}`,
        dedupeKey: `quote_expiring:${q.id}:${until}`,
      });
    }
  }

  return { candidates, matched, nextState };
}

/** One notification row per (candidate, recipient); duplicates dropped by (user, dedupe key). */
export function expandCandidates(organizationId: string, list: Candidate[]) {
  const seen = new Set<string>();
  const rows: (typeof notifications.$inferInsert & { rule: RuleKey })[] = [];
  for (const c of list) {
    for (const userId of c.userIds) {
      const k = `${userId}|${c.dedupeKey}`;
      if (seen.has(k)) continue;
      seen.add(k);
      rows.push({
        rule: c.rule,
        organizationId,
        userId,
        kind: c.rule,
        title: c.title,
        body: c.body,
        params: c.params,
        refType: c.refType,
        refId: c.refId,
        href: c.href,
        dedupeKey: c.dedupeKey,
      });
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// LINE text (Thai — the customer's working language)

const LINE_HEAD: Record<RuleKey, string> = {
  job_delayed: "งานล่าช้า",
  eta_changed: "ETA เปลี่ยน",
  doc_missing: "เอกสารขาด/ล่าช้า",
  free_time: "วันฟรีใกล้หมด",
  invoice_overdue: "ใบแจ้งหนี้เกินกำหนด",
  quote_expiring: "ใบเสนอราคาใกล้หมดอายุ",
};

export function lineText(
  rule: RuleKey,
  title: string,
  params: Record<string, string | number | null>,
  customerName?: string | null,
): string {
  const p = params;
  let detail = "";
  switch (rule) {
    case "job_delayed":
      detail = `ETA ${p.eta} ผ่านมา ${p.days} วัน ยังไม่ถึง`;
      break;
    case "eta_changed":
      detail = `ETA ${p.from} → ${p.to}`;
      break;
    case "doc_missing":
      detail = `${p.doc} (${p.state === "late" ? "ล่าช้า" : "ยังไม่ได้รับ"})`;
      break;
    case "free_time":
      detail = Number(p.days) < 0 ? `เกินวันฟรี ${-Number(p.days)} วัน (LFD ${p.lfd})` : `วันฟรีเหลือ ${p.days} วัน (LFD ${p.lfd})`;
      break;
    case "invoice_overdue":
      detail = `ค้าง ${p.currency} ${Number(p.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })} เกิน ${p.days} วัน`;
      break;
    case "quote_expiring":
      detail = Number(p.days) === 0 ? `หมดอายุวันนี้ (${p.until})` : `หมดอายุใน ${p.days} วัน (${p.until})`;
      break;
  }
  return [`[${LINE_HEAD[rule]}] ${title}`, customerName || null, detail].filter(Boolean).join("\n");
}

// ---------------------------------------------------------------------------
// DB side

export type RuleRow = {
  key: RuleKey;
  enabled: boolean;
  channels: string[];
  lastRunAt: string | null;
  lastResult: { matched: number; created: number } | null;
};

export async function listRules(db: DbLike, organizationId: string): Promise<RuleRow[]> {
  const rows = await db.select().from(automationRules).where(eq(automationRules.organizationId, organizationId));
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return RULE_KEYS.map((key) => {
    const r = byKey.get(key);
    return {
      key,
      enabled: r?.enabled ?? true,
      channels: r?.channels ?? ["in_app"],
      lastRunAt: r?.lastRunAt?.toISOString() ?? null,
      lastResult: r?.lastResult ?? null,
    };
  });
}

export async function updateRule(
  db: DbLike,
  organizationId: string,
  userId: string | null,
  key: RuleKey,
  patch: { enabled?: boolean; channels?: string[] },
): Promise<{ before: RuleRow; after: RuleRow }> {
  const before = (await listRules(db, organizationId)).find((r) => r.key === key)!;
  const channels = patch.channels
    ? [...new Set(["in_app", ...patch.channels.filter((c) => (CHANNELS as readonly string[]).includes(c))])]
    : undefined;
  await db
    .insert(automationRules)
    .values({
      organizationId,
      key,
      enabled: patch.enabled ?? before.enabled,
      channels: channels ?? before.channels,
      updatedBy: userId,
    })
    .onConflictDoUpdate({
      target: [automationRules.organizationId, automationRules.key],
      set: {
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(channels ? { channels } : {}),
        updatedBy: userId,
        updatedAt: new Date(),
      },
    });
  const after = (await listRules(db, organizationId)).find((r) => r.key === key)!;
  return { before, after };
}

export async function loadSnapshot(db: DbLike, organizationId: string, now = new Date()): Promise<Snapshot> {
  const [org] = await db.select({ timezone: organizations.timezone }).from(organizations).where(eq(organizations.id, organizationId));
  const memberRows = await db
    .select({ id: users.id, orgRole: organizationMembers.orgRole })
    .from(organizationMembers)
    .innerJoin(users, eq(organizationMembers.userId, users.id))
    .where(and(eq(organizationMembers.organizationId, organizationId), eq(users.active, true)));
  const roleRows = memberRows.length
    ? await db
        .select({ userId: userRoles.userId, code: roles.code })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(
          inArray(
            userRoles.userId,
            memberRows.map((m) => m.id),
          ),
        )
    : [];
  const members: Member[] = memberRows.map((m) => ({
    id: m.id,
    orgRole: m.orgRole,
    roles: roleRows.filter((r) => r.userId === m.id).map((r) => r.code),
  }));

  const [cust, jobRows, boxRows, docRows, invRows, quoteRows] = await Promise.all([
    db
      .select({ id: customers.id, ownerUserId: customers.ownerUserId, nameTh: customers.nameTh, nameEn: customers.nameEn })
      .from(customers)
      .where(eq(customers.organizationId, organizationId)),
    db
      .select({
        id: jobs.id,
        jobNumber: jobs.jobNumber,
        customerId: jobs.customerId,
        status: jobs.status,
        etd: jobs.etd,
        eta: jobs.eta,
        salesOwnerId: jobs.salesOwnerId,
        assignedOperator: jobs.assignedOperator,
      })
      .from(jobs)
      .where(eq(jobs.organizationId, organizationId)),
    db
      .select({
        id: containers.id,
        containerNo: containers.containerNo,
        jobId: containers.jobId,
        customerId: containers.customerId,
        status: containers.status,
        direction: containers.direction,
        eta: containers.eta,
      })
      .from(containers)
      .where(eq(containers.organizationId, organizationId)),
    db
      .select({
        id: crmDocs.id,
        customerId: crmDocs.customerId,
        boxId: crmDocs.boxId,
        kind: crmDocs.kind,
        name: crmDocs.name,
        status: crmDocs.status,
      })
      .from(crmDocs)
      .where(and(eq(crmDocs.organizationId, organizationId), inArray(crmDocs.status, ["wait", "late"]))),
    db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        customerId: invoices.customerId,
        jobId: invoices.jobId,
        status: invoices.status,
        dueDate: invoices.dueDate,
        balanceDue: invoices.balanceDue,
        currency: invoices.currency,
      })
      .from(invoices)
      .where(eq(invoices.organizationId, organizationId)),
    db
      .select({
        id: quotations.id,
        quotationNumber: quotations.quotationNumber,
        customerId: quotations.customerId,
        status: quotations.status,
        validUntil: quotations.validUntil,
        salesOwnerId: quotations.salesOwnerId,
      })
      .from(quotations)
      .where(eq(quotations.organizationId, organizationId)),
  ]);

  return {
    now,
    timezone: org?.timezone || "Asia/Bangkok",
    members,
    customers: cust,
    jobs: jobRows,
    containers: boxRows,
    docs: docRows,
    invoices: invRows,
    quotations: quoteRows,
  };
}

export type RunResult = {
  organizationId: string;
  ranAt: string;
  created: number;
  lineSent: number;
  byRule: Record<RuleKey, { matched: number; created: number }>;
};

export async function runAutomation(db: DbLike, organizationId: string, opts: { now?: Date; line?: boolean } = {}): Promise<RunResult> {
  const now = opts.now ?? new Date();
  const ruleRows = await db.select().from(automationRules).where(eq(automationRules.organizationId, organizationId));
  const rules = await listRules(db, organizationId);
  const enabled = new Set(rules.filter((r) => r.enabled).map((r) => r.key));
  const state = Object.fromEntries(ruleRows.map((r) => [r.key, (r.state ?? {}) as RuleState])) as Partial<Record<RuleKey, RuleState>>;

  const snap = await loadSnapshot(db, organizationId, now);
  const ev = evaluateRules(snap, enabled, state);
  const rows = expandCandidates(organizationId, ev.candidates);

  const inserted: { id: string; userId: string; kind: string; title: string; params: Record<string, string | number | null> }[] = [];
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200).map(({ rule: _rule, ...r }) => r);
    const out = await db
      .insert(notifications)
      .values(chunk)
      .onConflictDoNothing({ target: [notifications.organizationId, notifications.userId, notifications.dedupeKey] })
      .returning({
        id: notifications.id,
        userId: notifications.userId,
        kind: notifications.kind,
        title: notifications.title,
        params: notifications.params,
      });
    inserted.push(...out);
  }

  const byRule = Object.fromEntries(RULE_KEYS.map((k) => [k, { matched: ev.matched[k], created: 0 }])) as RunResult["byRule"];
  for (const n of inserted) if (isRuleKey(n.kind)) byRule[n.kind].created++;

  for (const key of RULE_KEYS) {
    if (!enabled.has(key)) continue;
    const next = ev.nextState[key];
    await db
      .insert(automationRules)
      .values({ organizationId, key, lastRunAt: now, lastResult: byRule[key], ...(next ? { state: next } : {}) })
      .onConflictDoUpdate({
        target: [automationRules.organizationId, automationRules.key],
        set: { lastRunAt: now, lastResult: byRule[key], ...(next ? { state: next } : {}) },
      });
  }

  let lineSent = 0;
  if (opts.line !== false && inserted.length && lineConfigured()) {
    lineSent = await deliverLine(db, organizationId, inserted, rules, snap);
  }

  return { organizationId, ranAt: now.toISOString(), created: inserted.length, lineSent, byRule };
}

async function deliverLine(
  db: DbLike,
  organizationId: string,
  rows: { id: string; userId: string; kind: string; title: string; params: Record<string, string | number | null> }[],
  rules: RuleRow[],
  snap: Snapshot,
): Promise<number> {
  const lineRules = new Set(rules.filter((r) => r.channels.includes("line")).map((r) => r.key));
  const wanted = rows.filter((r) => isRuleKey(r.kind) && lineRules.has(r.kind));
  if (!wanted.length) return 0;
  const links = await db
    .select({ userId: notificationChannels.userId, address: notificationChannels.address })
    .from(notificationChannels)
    .where(
      and(
        eq(notificationChannels.organizationId, organizationId),
        eq(notificationChannels.channel, "line"),
        eq(notificationChannels.enabled, true),
        inArray(notificationChannels.userId, [...new Set(wanted.map((r) => r.userId))]),
      ),
    );
  const to = new Map(links.filter((l) => l.address).map((l) => [l.userId, l.address!]));
  const custName = new Map(snap.customers.map((c) => [c.id, c.nameTh || c.nameEn]));
  const sentIds: string[] = [];
  for (const r of wanted) {
    const addr = to.get(r.userId);
    if (!addr) continue;
    const cid = typeof r.params.customerId === "string" ? r.params.customerId : null;
    if (await pushLine(addr, lineText(r.kind as RuleKey, r.title, r.params, cid ? custName.get(cid) : null))) sentIds.push(r.id);
  }
  if (sentIds.length) await db.update(notifications).set({ lineSentAt: new Date() }).where(inArray(notifications.id, sentIds));
  return sentIds.length;
}

/** Scheduler / cron entry: every active organization. */
export async function runAutomationAllOrgs(db: Db): Promise<RunResult[]> {
  const orgs = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.active, true));
  const out: RunResult[] = [];
  for (const o of orgs) {
    try {
      out.push(await runAutomation(db, o.id));
    } catch (e) {
      console.error(`[automation] org ${o.id} failed:`, e instanceof Error ? e.message : e);
    }
  }
  return out;
}
