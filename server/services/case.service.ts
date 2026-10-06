import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { users } from "../db/schema/auth.js";
import { cannedReplies, caseEvents, caseSlaPolicies, cases } from "../db/schema/cases.js";
import { contacts, customers } from "../db/schema/crm.js";
import { businessUnits, lineChannels, lineContacts } from "../db/schema/inbox.js";
import { bookings, containers, jobs } from "../db/schema/operations.js";
import { organizationMembers, organizations } from "../db/schema/tenancy.js";
import {
  CASE_CATEGORIES,
  CASE_CHANNELS,
  CASE_OPEN_STATUSES,
  CASE_PRIORITIES,
  caseSla,
  computeDue,
  fmtCannedDate,
  mergePolicy,
  renderCanned,
  type CaseCategory,
  type CaseChannel,
  type CasePriority,
  type CaseSla,
  type CaseStatus,
  type SlaPolicy,
} from "../domain/cases.js";
import { openSecret } from "../lib/secret-box.js";
import { writeAudit } from "./audit.service.js";
import { notifyCaseAssigned } from "./automation.service.js";
import { pushLineWith } from "./line.service.js";
import { normalizeRecipients, sendAndRecord, textToHtml } from "./outbound-mail.service.js";
import { nextDocNumber } from "./sequence.service.js";

export class CaseInputError extends Error {
  code: string;
  field?: string;
  constructor(code: string, field?: string) {
    super(code);
    this.code = code;
    this.field = field;
  }
}

export type CaseActor = { userId: string };
type Lang = "th" | "en" | "zh";

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const clean = (v: string | null | undefined) => {
  const s = (v ?? "").trim();
  return s ? s : null;
};
const like = (q: string) => `%${q.trim().replace(/[%_\\]/g, (m) => `\\${m}`)}%`;

// ---------------------------------------------------------------------------
// DTOs

export type CaseDto = {
  id: string;
  caseNo: string;
  subject: string;
  description: string | null;
  channel: CaseChannel;
  category: CaseCategory;
  priority: CasePriority;
  status: CaseStatus;
  customerId: string | null;
  customer: { th: string; en: string; zh: string } | null;
  contactId: string | null;
  contact: { name: string; email: string; phone: string } | null;
  assigneeUserId: string | null;
  jobId: string | null;
  jobNumber: string | null;
  containerNo: string | null;
  bookingId: string | null;
  bookingNumber: string | null;
  sourceMailId: string | null;
  businessUnitId: string | null;
  businessUnit: { id: string; name: string; color: string | null } | null;
  lineContactId: string | null;
  /** The customer's LINE chat this case is answered in. */
  /** connected = that OA has LINE credentials; false → replies are only logged, not sent. */
  line: { displayName: string | null; pictureUrl: string | null; channelId: string; channelName: string; connected: boolean } | null;
  firstResponseDueAt: string | null;
  resolveDueAt: string | null;
  firstRespondedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  sla: CaseSla;
};

export type CaseEventDto = {
  id: string;
  type: string;
  body: string | null;
  data: Record<string, unknown>;
  userId: string | null;
  mailId: string | null;
  createdAt: string;
};

const caseSelect = {
  c: cases,
  custTh: customers.nameTh,
  custEn: customers.nameEn,
  custZh: customers.nameZh,
  contactName: contacts.name,
  contactEmail: contacts.email,
  contactPhone: contacts.phone,
  jobNumber: jobs.jobNumber,
  bookingNumber: bookings.bookingNumber,
  unitName: businessUnits.name,
  unitColor: businessUnits.color,
  lineName: lineContacts.displayName,
  linePicture: lineContacts.pictureUrl,
  lineChannelId: lineContacts.channelId,
  lineChannelName: lineChannels.name,
  lineConnected: sql<boolean>`(${lineChannels.active} and ${lineChannels.accessTokenEnc} is not null)`,
};

type CaseRow = {
  c: typeof cases.$inferSelect;
  custTh: string | null;
  custEn: string | null;
  custZh: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  jobNumber: string | null;
  bookingNumber: string | null;
  unitName: string | null;
  unitColor: string | null;
  lineName: string | null;
  linePicture: string | null;
  lineChannelId: string | null;
  lineChannelName: string | null;
  lineConnected: boolean | null;
};

function toDto(r: CaseRow, now: Date): CaseDto {
  const c = r.c;
  return {
    id: c.id,
    caseNo: c.caseNo,
    subject: c.subject,
    description: c.description,
    channel: c.channel as CaseChannel,
    category: c.category as CaseCategory,
    priority: c.priority as CasePriority,
    status: c.status as CaseStatus,
    customerId: c.customerId,
    customer: c.customerId ? { th: r.custTh ?? "", en: r.custEn ?? "", zh: r.custZh ?? "" } : null,
    contactId: c.contactId,
    contact: c.contactId && r.contactName !== null ? { name: r.contactName, email: r.contactEmail ?? "", phone: r.contactPhone ?? "" } : null,
    assigneeUserId: c.assigneeUserId,
    jobId: c.jobId,
    jobNumber: r.jobNumber,
    containerNo: c.containerNo,
    bookingId: c.bookingId,
    bookingNumber: r.bookingNumber,
    sourceMailId: c.sourceMailId,
    businessUnitId: c.businessUnitId,
    businessUnit: c.businessUnitId && r.unitName !== null ? { id: c.businessUnitId, name: r.unitName, color: r.unitColor } : null,
    lineContactId: c.lineContactId,
    line:
      c.lineContactId && r.lineChannelId
        ? { displayName: r.lineName, pictureUrl: r.linePicture, channelId: r.lineChannelId, channelName: r.lineChannelName ?? "LINE", connected: Boolean(r.lineConnected) }
        : null,
    firstResponseDueAt: iso(c.firstResponseDueAt),
    resolveDueAt: iso(c.resolveDueAt),
    firstRespondedAt: iso(c.firstRespondedAt),
    resolvedAt: iso(c.resolvedAt),
    closedAt: iso(c.closedAt),
    createdBy: c.createdBy,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    sla: caseSla(c, now),
  };
}

function toEventDto(e: typeof caseEvents.$inferSelect): CaseEventDto {
  return { id: e.id, type: e.type, body: e.body, data: e.data ?? {}, userId: e.userId, mailId: e.mailId, createdAt: e.createdAt.toISOString() };
}

function baseQuery(db: Db) {
  return db
    .select(caseSelect)
    .from(cases)
    .leftJoin(customers, eq(cases.customerId, customers.id))
    .leftJoin(contacts, eq(cases.contactId, contacts.id))
    .leftJoin(jobs, eq(cases.jobId, jobs.id))
    .leftJoin(bookings, eq(cases.bookingId, bookings.id))
    .leftJoin(businessUnits, eq(cases.businessUnitId, businessUnits.id))
    .leftJoin(lineContacts, eq(cases.lineContactId, lineContacts.id))
    .leftJoin(lineChannels, eq(lineContacts.channelId, lineChannels.id));
}

// ---------------------------------------------------------------------------
// SLA policy

export async function getSlaPolicy(db: Db, organizationId: string): Promise<SlaPolicy> {
  const rows = await db.select().from(caseSlaPolicies).where(eq(caseSlaPolicies.organizationId, organizationId));
  return mergePolicy(rows);
}

export async function setSlaPolicy(db: Db, organizationId: string, userId: string, policy: Partial<SlaPolicy>) {
  const before = await getSlaPolicy(db, organizationId);
  for (const p of CASE_PRIORITIES) {
    const t = policy[p];
    if (!t) continue;
    await db
      .insert(caseSlaPolicies)
      .values({ organizationId, priority: p, firstResponseMinutes: t.firstResponseMinutes, resolveMinutes: t.resolveMinutes, updatedBy: userId })
      .onConflictDoUpdate({
        target: [caseSlaPolicies.organizationId, caseSlaPolicies.priority],
        set: { firstResponseMinutes: t.firstResponseMinutes, resolveMinutes: t.resolveMinutes, updatedBy: userId, updatedAt: new Date() },
      });
  }
  const after = await getSlaPolicy(db, organizationId);
  await writeAudit(db, { userId, organizationId, action: "CASE_SLA_UPDATED", entityType: "case_sla", oldValue: before, newValue: after });
  return after;
}

// ---------------------------------------------------------------------------
// Reference checks (ids must belong to the caller's organization)

async function assertMember(db: Db, organizationId: string, userId: string, field: string) {
  const [m] = await db
    .select({ id: organizationMembers.userId })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, userId)))
    .limit(1);
  if (!m) throw new CaseInputError("unknown_user", field);
}

async function assertCustomer(db: Db, organizationId: string, id: string) {
  const [c] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, id), eq(customers.organizationId, organizationId)))
    .limit(1);
  if (!c) throw new CaseInputError("unknown_customer", "customerId");
}

async function assertContact(db: Db, organizationId: string, id: string) {
  const [c] = await db
    .select({ id: contacts.id, customerId: contacts.customerId })
    .from(contacts)
    .innerJoin(customers, eq(contacts.customerId, customers.id))
    .where(and(eq(contacts.id, id), eq(customers.organizationId, organizationId)))
    .limit(1);
  if (!c) throw new CaseInputError("unknown_contact", "contactId");
  return c;
}

async function assertJob(db: Db, organizationId: string, id: string) {
  const [j] = await db
    .select({ id: jobs.id, customerId: jobs.customerId })
    .from(jobs)
    .where(and(eq(jobs.id, id), eq(jobs.organizationId, organizationId)))
    .limit(1);
  if (!j) throw new CaseInputError("unknown_job", "jobId");
  return j;
}

async function assertBooking(db: Db, organizationId: string, id: string) {
  const [b] = await db
    .select({ id: bookings.id, customerId: bookings.customerId })
    .from(bookings)
    .innerJoin(customers, eq(bookings.customerId, customers.id))
    .where(and(eq(bookings.id, id), eq(customers.organizationId, organizationId)))
    .limit(1);
  if (!b) throw new CaseInputError("unknown_booking", "bookingId");
  return b;
}

async function assertUnit(db: Db, organizationId: string, id: string) {
  const [u] = await db
    .select({ id: businessUnits.id })
    .from(businessUnits)
    .where(and(eq(businessUnits.id, id), eq(businessUnits.organizationId, organizationId)))
    .limit(1);
  if (!u) throw new CaseInputError("unknown_business_unit", "businessUnitId");
}

/** Container numbers are free text (may be another line's box), normalized to upper case. */
const normBox = (v: string | null | undefined) => clean(v)?.toUpperCase().replace(/\s+/g, "") ?? null;

// ---------------------------------------------------------------------------
// List / stats

export type CaseListFilter = {
  /** open = new + in progress + waiting; board = open + resolved; all; or one status. */
  status?: CaseStatus | "open" | "board" | "all";
  /** mine | unassigned | all | a user id */
  assignee?: string;
  priority?: CasePriority;
  category?: CaseCategory;
  customerId?: string;
  jobId?: string;
  /** A business unit id, or "none" for cases without one. */
  businessUnitId?: string;
  channel?: CaseChannel;
  overdue?: boolean;
  q?: string;
  limit?: number;
  offset?: number;
};

const OPEN_LIST = [...CASE_OPEN_STATUSES] as string[];

/** Open and past a running SLA due time. */
function breachedSql(now: Date): SQL {
  return sql`(${cases.status} in ('new','in_progress','waiting_customer') and (
    (${cases.firstRespondedAt} is null and ${cases.firstResponseDueAt} < ${now.toISOString()}::timestamptz)
    or (${cases.resolvedAt} is null and ${cases.resolveDueAt} < ${now.toISOString()}::timestamptz)))`;
}

function statusCond(s: CaseListFilter["status"]): SQL | undefined {
  if (!s || s === "all") return undefined;
  if (s === "open") return inArray(cases.status, OPEN_LIST);
  if (s === "board") return inArray(cases.status, [...OPEN_LIST, "resolved"]);
  return eq(cases.status, s);
}

function filterConds(organizationId: string, actor: CaseActor, f: CaseListFilter, now: Date): (SQL | undefined)[] {
  const conds: (SQL | undefined)[] = [eq(cases.organizationId, organizationId)];
  if (f.assignee === "mine") conds.push(eq(cases.assigneeUserId, actor.userId));
  else if (f.assignee === "unassigned") conds.push(isNull(cases.assigneeUserId));
  else if (f.assignee && f.assignee !== "all") conds.push(eq(cases.assigneeUserId, f.assignee));
  if (f.priority) conds.push(eq(cases.priority, f.priority));
  if (f.category) conds.push(eq(cases.category, f.category));
  if (f.customerId) conds.push(eq(cases.customerId, f.customerId));
  if (f.jobId) conds.push(eq(cases.jobId, f.jobId));
  if (f.businessUnitId === "none") conds.push(isNull(cases.businessUnitId));
  else if (f.businessUnitId) conds.push(eq(cases.businessUnitId, f.businessUnitId));
  if (f.channel) conds.push(eq(cases.channel, f.channel));
  if (f.overdue) conds.push(breachedSql(now));
  if (f.q?.trim()) {
    const l = like(f.q);
    conds.push(
      or(
        ilike(cases.caseNo, l),
        ilike(cases.subject, l),
        ilike(cases.containerNo, l),
        ilike(customers.nameTh, l),
        ilike(customers.nameEn, l),
        ilike(customers.nameZh, l),
        ilike(jobs.jobNumber, l),
        ilike(bookings.bookingNumber, l),
        ilike(lineContacts.displayName, l),
      ),
    );
  }
  return conds;
}

const PRIORITY_RANK = sql`case ${cases.priority} when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end`;
const NEXT_DUE = sql`case when ${cases.firstRespondedAt} is null then ${cases.firstResponseDueAt} else ${cases.resolveDueAt} end`;

export async function listCases(db: Db, organizationId: string, actor: CaseActor, f: CaseListFilter = {}, now = new Date()) {
  const base = filterConds(organizationId, actor, f, now);
  const where = and(...base, statusCond(f.status));
  const limit = Math.min(Math.max(Math.trunc(f.limit ?? 50), 1), 300);
  const offset = Math.max(Math.trunc(f.offset ?? 0), 0);

  const [rows, [{ total }], counts] = await Promise.all([
    baseQuery(db)
      .where(where)
      .orderBy(
        sql`case when ${cases.status} in ('new','in_progress','waiting_customer') then 0 else 1 end`,
        PRIORITY_RANK,
        sql`${NEXT_DUE} asc nulls last`,
        desc(cases.updatedAt),
      )
      .limit(limit)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(cases)
      .leftJoin(customers, eq(cases.customerId, customers.id))
      .leftJoin(jobs, eq(cases.jobId, jobs.id))
      .leftJoin(bookings, eq(cases.bookingId, bookings.id))
      .leftJoin(lineContacts, eq(cases.lineContactId, lineContacts.id))
      .where(where),
    db
      .select({ status: cases.status, n: sql<number>`count(*)::int` })
      .from(cases)
      .leftJoin(customers, eq(cases.customerId, customers.id))
      .leftJoin(jobs, eq(cases.jobId, jobs.id))
      .leftJoin(bookings, eq(cases.bookingId, bookings.id))
      .leftJoin(lineContacts, eq(cases.lineContactId, lineContacts.id))
      .where(and(...base))
      .groupBy(cases.status),
  ]);
  const byStatus: Record<string, number> = { new: 0, in_progress: 0, waiting_customer: 0, resolved: 0, closed: 0 };
  for (const r of counts) byStatus[r.status] = r.n;
  return { items: rows.map((r) => toDto(r, now)), total, limit, offset, counts: byStatus };
}

async function orgTimezone(db: Db, organizationId: string) {
  const [o] = await db.select({ tz: organizations.timezone }).from(organizations).where(eq(organizations.id, organizationId));
  return o?.tz || "Asia/Bangkok";
}

export async function caseStats(db: Db, organizationId: string, actor: CaseActor, now = new Date()) {
  const tz = await orgTimezone(db, organizationId);
  const n = now.toISOString();
  const today = sql`(${n}::timestamptz at time zone ${tz})::date`;
  const org = eq(cases.organizationId, organizationId);
  const [[agg], byCat, byPri, byUnitRows, byChan] = await Promise.all([
    db
      .select({
        open: sql<number>`count(*) filter (where ${cases.status} in ('new','in_progress','waiting_customer'))::int`,
        mine: sql<number>`count(*) filter (where ${cases.status} in ('new','in_progress','waiting_customer') and ${cases.assigneeUserId} = ${actor.userId}::uuid)::int`,
        unassigned: sql<number>`count(*) filter (where ${cases.status} in ('new','in_progress','waiting_customer') and ${cases.assigneeUserId} is null)::int`,
        overdue: sql<number>`count(*) filter (where ${breachedSql(now)})::int`,
        dueToday: sql<number>`count(*) filter (where ${cases.status} in ('new','in_progress','waiting_customer')
          and ${NEXT_DUE} >= ${n}::timestamptz and (${NEXT_DUE} at time zone ${tz})::date = ${today})::int`,
        resolvedToday: sql<number>`count(*) filter (where ${cases.resolvedAt} is not null and (${cases.resolvedAt} at time zone ${tz})::date = ${today})::int`,
        avgFirstResponseMinutes: sql<number | null>`round(avg(extract(epoch from (${cases.firstRespondedAt} - ${cases.createdAt})) / 60)
          filter (where ${cases.firstRespondedAt} is not null and ${cases.createdAt} >= ${n}::timestamptz - interval '30 days'))::int`,
        responded30: sql<number>`count(*) filter (where ${cases.firstRespondedAt} is not null and ${cases.createdAt} >= ${n}::timestamptz - interval '30 days')::int`,
        respondedOnTime30: sql<number>`count(*) filter (where ${cases.firstRespondedAt} is not null and ${cases.firstRespondedAt} <= ${cases.firstResponseDueAt}
          and ${cases.createdAt} >= ${n}::timestamptz - interval '30 days')::int`,
      })
      .from(cases)
      .where(org),
    db
      .select({ key: cases.category, n: sql<number>`count(*)::int` })
      .from(cases)
      .where(and(org, inArray(cases.status, OPEN_LIST)))
      .groupBy(cases.category),
    db
      .select({ key: cases.priority, n: sql<number>`count(*)::int` })
      .from(cases)
      .where(and(org, inArray(cases.status, OPEN_LIST)))
      .groupBy(cases.priority),
    db
      .select({ key: cases.businessUnitId, n: sql<number>`count(*)::int` })
      .from(cases)
      .where(and(org, inArray(cases.status, OPEN_LIST)))
      .groupBy(cases.businessUnitId),
    db
      .select({ key: cases.channel, n: sql<number>`count(*)::int` })
      .from(cases)
      .where(and(org, inArray(cases.status, OPEN_LIST)))
      .groupBy(cases.channel),
  ]);
  const fill = (keys: readonly string[], rows: { key: string; n: number }[]) =>
    Object.fromEntries(keys.map((k) => [k, rows.find((r) => r.key === k)?.n ?? 0]));
  return {
    open: agg?.open ?? 0,
    mine: agg?.mine ?? 0,
    unassigned: agg?.unassigned ?? 0,
    overdue: agg?.overdue ?? 0,
    dueToday: agg?.dueToday ?? 0,
    resolvedToday: agg?.resolvedToday ?? 0,
    avgFirstResponseMinutes: agg?.avgFirstResponseMinutes ?? null,
    firstResponseMetRate: agg && agg.responded30 ? Math.round((agg.respondedOnTime30 / agg.responded30) * 100) : null,
    byCategory: fill(CASE_CATEGORIES, byCat),
    byPriority: fill(CASE_PRIORITIES, byPri),
    /** Open cases per business unit id ("none" = untagged). */
    byUnit: Object.fromEntries(byUnitRows.map((r) => [r.key ?? "none", r.n])),
    byChannel: fill(CASE_CHANNELS, byChan),
  };
}

// ---------------------------------------------------------------------------
// Detail

async function loadCase(db: Db, organizationId: string, id: string, now = new Date()) {
  const [row] = await baseQuery(db)
    .where(and(eq(cases.id, id), eq(cases.organizationId, organizationId)))
    .limit(1);
  return row ? toDto(row, now) : null;
}

export async function getCase(db: Db, organizationId: string, id: string, now = new Date()) {
  const kase = await loadCase(db, organizationId, id, now);
  if (!kase) return null;
  const [events, people] = await Promise.all([
    db
      .select()
      .from(caseEvents)
      .where(and(eq(caseEvents.caseId, id), eq(caseEvents.organizationId, organizationId)))
      .orderBy(asc(caseEvents.createdAt)),
    kase.customerId
      ? db
          .select({ id: contacts.id, name: contacts.name, title: contacts.title, email: contacts.email, phone: contacts.phone, lineId: contacts.lineId, primary: contacts.primary })
          .from(contacts)
          .where(eq(contacts.customerId, kase.customerId))
          .orderBy(desc(contacts.primary), asc(contacts.createdAt))
      : Promise.resolve([]),
  ]);
  return { case: kase, events: events.map(toEventDto), contacts: people };
}

async function addEvent(
  db: Db,
  organizationId: string,
  caseId: string,
  userId: string | null,
  type: string,
  body: string | null,
  data: Record<string, unknown> = {},
  mailId: string | null = null,
  at?: Date,
) {
  const [row] = await db
    .insert(caseEvents)
    .values({ id: `ce_${randomUUID()}`, organizationId, caseId, type, body, data, userId, mailId, ...(at ? { createdAt: at } : {}) })
    .returning();
  return toEventDto(row!);
}

// ---------------------------------------------------------------------------
// Create / update

export type CaseInput = {
  subject: string;
  description?: string | null;
  channel?: CaseChannel;
  category?: CaseCategory;
  priority?: CasePriority;
  customerId?: string | null;
  contactId?: string | null;
  assigneeUserId?: string | null;
  jobId?: string | null;
  containerNo?: string | null;
  bookingId?: string | null;
  sourceMailId?: string | null;
  businessUnitId?: string | null;
};

/** Cases opened by the system (a LINE message) have no actor: unassigned, created by nobody. */
type SystemCaseInput = CaseInput & { lineContactId?: string | null };

export async function createCase(db: Db, organizationId: string, actor: CaseActor | null, input: SystemCaseInput, now = new Date()) {
  let customerId = clean(input.customerId);
  if (customerId) await assertCustomer(db, organizationId, customerId);
  const contactId = clean(input.contactId);
  if (contactId) {
    const ct = await assertContact(db, organizationId, contactId);
    if (customerId && ct.customerId !== customerId) throw new CaseInputError("contact_customer_mismatch", "contactId");
    customerId ??= ct.customerId;
  }
  const jobId = clean(input.jobId);
  if (jobId) customerId ??= (await assertJob(db, organizationId, jobId)).customerId;
  const bookingId = clean(input.bookingId);
  if (bookingId) customerId ??= (await assertBooking(db, organizationId, bookingId)).customerId;
  const assigneeUserId = input.assigneeUserId === undefined ? (actor?.userId ?? null) : input.assigneeUserId || null;
  if (assigneeUserId) await assertMember(db, organizationId, assigneeUserId, "assigneeUserId");
  const businessUnitId = clean(input.businessUnitId);
  if (businessUnitId) await assertUnit(db, organizationId, businessUnitId);

  const priority = input.priority ?? "normal";
  const policy = await getSlaPolicy(db, organizationId);
  const due = computeDue(now, priority, policy);
  const id = `cs_${randomUUID()}`;
  const caseNo = await nextDocNumber(db, "CS", "CS");
  await db.insert(cases).values({
    id,
    organizationId,
    caseNo,
    customerId,
    contactId,
    channel: input.channel ?? "phone",
    category: input.category ?? "other",
    priority,
    status: "new",
    subject: input.subject.trim(),
    description: clean(input.description),
    assigneeUserId,
    assignedAt: assigneeUserId ? now : null,
    assignedBy: assigneeUserId ? (actor?.userId ?? null) : null,
    jobId,
    containerNo: normBox(input.containerNo),
    bookingId,
    sourceMailId: clean(input.sourceMailId),
    businessUnitId,
    lineContactId: clean(input.lineContactId),
    firstResponseDueAt: due.firstResponseDueAt,
    resolveDueAt: due.resolveDueAt,
    createdBy: actor?.userId ?? null,
    createdAt: now,
    updatedAt: now,
  });
  await addEvent(db, organizationId, id, actor?.userId ?? null, "created", null, { channel: input.channel ?? "phone", assignee: assigneeUserId }, null, now);
  const dto = (await loadCase(db, organizationId, id, now))!;
  await writeAudit(db, { userId: actor?.userId ?? null, organizationId, action: "CASE_CREATED", entityType: "case", entityId: id, newValue: dto });
  if (actor && assigneeUserId && assigneeUserId !== actor.userId) await notifyCaseAssigned(db, organizationId, dto, actor.userId, now);
  return dto;
}

export type CasePatch = Partial<CaseInput> & { status?: CaseStatus };

export async function updateCase(db: Db, organizationId: string, actor: CaseActor, id: string, patch: CasePatch, now = new Date()) {
  const before = await loadCase(db, organizationId, id, now);
  if (!before) return null;
  const set: Partial<typeof cases.$inferInsert> = {};
  const events: { type: string; data: Record<string, unknown> }[] = [];

  if (patch.subject !== undefined && patch.subject.trim() !== before.subject) set.subject = patch.subject.trim();
  if (patch.description !== undefined) set.description = clean(patch.description);
  if (patch.channel !== undefined && patch.channel !== before.channel) set.channel = patch.channel;

  if (patch.category !== undefined && patch.category !== before.category) {
    set.category = patch.category;
    events.push({ type: "category", data: { from: before.category, to: patch.category } });
  }

  if (patch.priority !== undefined && patch.priority !== before.priority) {
    set.priority = patch.priority;
    // Timers that are still running move to the new priority's targets (counted from opening).
    const due = computeDue(new Date(before.createdAt), patch.priority, await getSlaPolicy(db, organizationId));
    if (!before.firstRespondedAt) set.firstResponseDueAt = due.firstResponseDueAt;
    if (!before.resolvedAt) set.resolveDueAt = due.resolveDueAt;
    events.push({ type: "priority", data: { from: before.priority, to: patch.priority } });
  }

  let assignedTo: string | null | undefined;
  if (patch.assigneeUserId !== undefined) {
    const next = patch.assigneeUserId || null;
    if (next !== before.assigneeUserId) {
      if (next) await assertMember(db, organizationId, next, "assigneeUserId");
      set.assigneeUserId = next;
      set.assignedAt = next ? now : null;
      set.assignedBy = next ? actor.userId : null;
      assignedTo = next;
      events.push({ type: "assignment", data: { from: before.assigneeUserId, to: next } });
    }
  }

  if (patch.businessUnitId !== undefined) {
    const v = clean(patch.businessUnitId);
    if (v !== before.businessUnitId) {
      if (v) await assertUnit(db, organizationId, v);
      set.businessUnitId = v;
    }
  }

  // Links: customer / contact / job / container / booking.
  if (patch.customerId !== undefined) {
    const v = clean(patch.customerId);
    if (v !== before.customerId) {
      if (v) await assertCustomer(db, organizationId, v);
      set.customerId = v;
      if (before.contactId && patch.contactId === undefined) set.contactId = null;
      events.push({ type: "link", data: { field: "customer", from: before.customerId, to: v } });
    }
  }
  if (patch.contactId !== undefined) {
    const v = clean(patch.contactId);
    if (v !== before.contactId) {
      if (v) {
        const ct = await assertContact(db, organizationId, v);
        const cust = set.customerId !== undefined ? set.customerId : before.customerId;
        if (cust && ct.customerId !== cust) throw new CaseInputError("contact_customer_mismatch", "contactId");
        if (!cust) set.customerId = ct.customerId;
      }
      set.contactId = v;
    }
  }
  if (patch.jobId !== undefined) {
    const v = clean(patch.jobId);
    if (v !== before.jobId) {
      if (v) {
        const j = await assertJob(db, organizationId, v);
        if (!before.customerId && set.customerId === undefined) set.customerId = j.customerId;
      }
      set.jobId = v;
      events.push({ type: "link", data: { field: "job", from: before.jobNumber, to: v } });
    }
  }
  if (patch.containerNo !== undefined) {
    const v = normBox(patch.containerNo);
    if (v !== before.containerNo) {
      set.containerNo = v;
      events.push({ type: "link", data: { field: "container", from: before.containerNo, to: v } });
    }
  }
  if (patch.bookingId !== undefined) {
    const v = clean(patch.bookingId);
    if (v !== before.bookingId) {
      if (v) {
        const b = await assertBooking(db, organizationId, v);
        if (!before.customerId && set.customerId === undefined) set.customerId = b.customerId;
      }
      set.bookingId = v;
      events.push({ type: "link", data: { field: "booking", from: before.bookingNumber, to: v } });
    }
  }

  if (patch.status !== undefined && patch.status !== before.status) {
    set.status = patch.status;
    if (patch.status === "resolved") {
      set.resolvedAt = before.resolvedAt ? new Date(before.resolvedAt) : now;
      set.closedAt = null;
    } else if (patch.status === "closed") {
      set.closedAt = now;
      if (!before.resolvedAt) set.resolvedAt = now;
    } else {
      // Reopened: the resolution timer runs again.
      set.resolvedAt = null;
      set.closedAt = null;
    }
    events.push({ type: "status", data: { from: before.status, to: patch.status } });
  }

  if (!Object.keys(set).length) return before;
  set.updatedAt = now;
  await db.update(cases).set(set).where(and(eq(cases.id, id), eq(cases.organizationId, organizationId)));

  // Link events store readable numbers, not ids.
  for (const ev of events) {
    if (ev.type === "link" && ev.data.field === "job" && typeof ev.data.to === "string") {
      const [j] = await db.select({ n: jobs.jobNumber }).from(jobs).where(eq(jobs.id, ev.data.to)).limit(1);
      ev.data.to = j?.n ?? null;
    }
    if (ev.type === "link" && ev.data.field === "booking" && typeof ev.data.to === "string") {
      const [b] = await db.select({ n: bookings.bookingNumber }).from(bookings).where(eq(bookings.id, ev.data.to)).limit(1);
      ev.data.to = b?.n ?? null;
    }
    await addEvent(db, organizationId, id, actor.userId, ev.type, null, ev.data);
  }

  // A LINE chat linked to a customer stays linked: that chat's next cases arrive with the customer set.
  if (before.lineContactId && (set.customerId !== undefined || set.contactId !== undefined)) {
    const customerId = set.customerId !== undefined ? set.customerId : before.customerId;
    const contactId = set.contactId !== undefined ? set.contactId : customerId === before.customerId ? before.contactId : null;
    await db
      .update(lineContacts)
      .set({ customerId: customerId ?? null, contactId: contactId ?? null, updatedAt: now })
      .where(and(eq(lineContacts.id, before.lineContactId), eq(lineContacts.organizationId, organizationId)));
  }

  const after = (await loadCase(db, organizationId, id, now))!;
  await writeAudit(db, { userId: actor.userId, organizationId, action: "CASE_UPDATED", entityType: "case", entityId: id, oldValue: before, newValue: after });
  if (assignedTo && assignedTo !== actor.userId) await notifyCaseAssigned(db, organizationId, after, actor.userId, now);
  return after;
}

export async function deleteCase(db: Db, organizationId: string, actor: CaseActor, id: string) {
  const before = await loadCase(db, organizationId, id);
  if (!before) return false;
  await db.delete(cases).where(and(eq(cases.id, id), eq(cases.organizationId, organizationId)));
  await writeAudit(db, { userId: actor.userId, organizationId, action: "CASE_DELETED", entityType: "case", entityId: id, oldValue: before });
  return true;
}

export async function addCaseNote(db: Db, organizationId: string, actor: CaseActor, id: string, body: string, now = new Date()) {
  const kase = await loadCase(db, organizationId, id, now);
  if (!kase) return null;
  const ev = await addEvent(db, organizationId, id, actor.userId, "comment", body.trim());
  await db.update(cases).set({ updatedAt: now }).where(eq(cases.id, id));
  return ev;
}

// ---------------------------------------------------------------------------
// Reply to the customer

export type ReplyInput = {
  /** email = sent through the outbound mail service; line = pushed to the case's LINE chat when it has one; phone = logged only. */
  via: "email" | "phone" | "line";
  body: string;
  to?: string[];
  cc?: string[];
  subject?: string;
  /** Status to set after replying (default: new → in progress). */
  status?: CaseStatus;
};

async function defaultRecipients(db: Db, kase: CaseDto) {
  if (kase.contact?.email) {
    const ok = normalizeRecipients([kase.contact.email]).ok;
    if (ok.length) return ok;
  }
  if (!kase.customerId) return [];
  const rows = await db
    .select({ email: contacts.email })
    .from(contacts)
    .where(eq(contacts.customerId, kase.customerId))
    .orderBy(desc(contacts.primary), asc(contacts.createdAt));
  return normalizeRecipients(rows.map((r) => r.email)).ok.slice(0, 1);
}

export async function replyToCase(db: Db, organizationId: string, actor: CaseActor, id: string, input: ReplyInput, now = new Date()) {
  const kase = await loadCase(db, organizationId, id, now);
  if (!kase) return null;
  const body = input.body.trim();
  let mail: { id: string; status: "sent" | "failed"; error: string | null; to: string[]; cc: string[]; subject: string } | null = null;

  if (input.via === "email") {
    const to = input.to?.length ? normalizeRecipients(input.to) : { ok: await defaultRecipients(db, kase), bad: [] as string[] };
    if (to.bad.length) throw new CaseInputError("invalid_email", "to");
    if (!to.ok.length) throw new CaseInputError("no_recipient", "to");
    const cc = normalizeRecipients(input.cc ?? []);
    if (cc.bad.length) throw new CaseInputError("invalid_email", "cc");
    const subject = clean(input.subject) ?? `[${kase.caseNo}] ${kase.subject}`;
    const rec = await sendAndRecord(db, {
      organizationId,
      userId: actor.userId,
      to: to.ok,
      cc: cc.ok,
      subject,
      text: body,
      html: textToHtml(body),
      customerId: kase.customerId,
      entityType: "case",
      entityId: id,
    });
    mail = { id: rec.id, status: rec.status, error: rec.error, to: rec.to, cc: rec.cc, subject };
  }

  // LINE: push into the customer's chat on the OA the case came from.
  // An OA without credentials (demo / not set up yet) only logs the reply, like a phone call.
  let line: { delivery: "sent" | "failed" | "not_connected"; error: string | null; channel: string } | null = null;
  if (input.via === "line" && kase.lineContactId) {
    const [target] = await db
      .select({ lineUserId: lineContacts.lineUserId, token: lineChannels.accessTokenEnc, channel: lineChannels.name, active: lineChannels.active })
      .from(lineContacts)
      .innerJoin(lineChannels, eq(lineContacts.channelId, lineChannels.id))
      .where(and(eq(lineContacts.id, kase.lineContactId), eq(lineContacts.organizationId, organizationId)))
      .limit(1);
    const token = target?.active ? openSecret(target.token) : null;
    if (!target || !token) {
      line = { delivery: "not_connected", error: null, channel: target?.channel ?? "LINE" };
    } else {
      const res = await pushLineWith(token, target.lineUserId, body);
      line = { delivery: res.ok ? "sent" : "failed", error: res.error, channel: target.channel };
    }
  }

  const delivered = input.via === "email" ? mail?.status === "sent" : line?.delivery !== "failed";
  const event = await addEvent(
    db,
    organizationId,
    id,
    actor.userId,
    "reply",
    body,
    mail
      ? { via: "email", to: mail.to, cc: mail.cc, subject: mail.subject, delivery: mail.status, error: mail.error }
      : line
        ? { via: "line", channel: line.channel, delivery: line.delivery, error: line.error }
        : { via: input.via },
    mail?.id ?? null,
  );

  const set: Partial<typeof cases.$inferInsert> = { updatedAt: now };
  if (delivered && !kase.firstRespondedAt) set.firstRespondedAt = now;
  await db.update(cases).set(set).where(eq(cases.id, id));

  const nextStatus = input.status ?? (kase.status === "new" && delivered ? "in_progress" : undefined);
  const after = nextStatus && nextStatus !== kase.status
    ? await updateCase(db, organizationId, actor, id, { status: nextStatus }, now)
    : await loadCase(db, organizationId, id, now);
  return { event, mail, line, case: after! };
}

// ---------------------------------------------------------------------------
// Canned replies

export type CannedDto = { id: string; title: string; body: string; category: CaseCategory | null; sortOrder: number; updatedAt: string };

const toCanned = (r: typeof cannedReplies.$inferSelect): CannedDto => ({
  id: r.id,
  title: r.title,
  body: r.body,
  category: (r.category as CaseCategory | null) ?? null,
  sortOrder: r.sortOrder,
  updatedAt: r.updatedAt.toISOString(),
});

export async function listCanned(db: Db, organizationId: string) {
  const rows = await db
    .select()
    .from(cannedReplies)
    .where(eq(cannedReplies.organizationId, organizationId))
    .orderBy(asc(cannedReplies.sortOrder), asc(cannedReplies.title));
  return rows.map(toCanned);
}

export type CannedInput = { title: string; body: string; category?: CaseCategory | null; sortOrder?: number };

export async function createCanned(db: Db, organizationId: string, userId: string, input: CannedInput) {
  const [row] = await db
    .insert(cannedReplies)
    .values({
      id: `cr_${randomUUID()}`,
      organizationId,
      title: input.title.trim(),
      body: input.body.trim(),
      category: input.category ?? null,
      sortOrder: input.sortOrder ?? 0,
      createdBy: userId,
    })
    .returning();
  const dto = toCanned(row!);
  await writeAudit(db, { userId, organizationId, action: "CANNED_REPLY_CREATED", entityType: "canned_reply", entityId: dto.id, newValue: dto });
  return dto;
}

export async function updateCanned(db: Db, organizationId: string, userId: string, id: string, patch: Partial<CannedInput>) {
  const [before] = await db
    .select()
    .from(cannedReplies)
    .where(and(eq(cannedReplies.id, id), eq(cannedReplies.organizationId, organizationId)))
    .limit(1);
  if (!before) return null;
  const set: Partial<typeof cannedReplies.$inferInsert> = { updatedAt: new Date() };
  if (patch.title !== undefined) set.title = patch.title.trim();
  if (patch.body !== undefined) set.body = patch.body.trim();
  if (patch.category !== undefined) set.category = patch.category ?? null;
  if (patch.sortOrder !== undefined) set.sortOrder = patch.sortOrder;
  const [row] = await db.update(cannedReplies).set(set).where(eq(cannedReplies.id, id)).returning();
  const dto = toCanned(row!);
  await writeAudit(db, { userId, organizationId, action: "CANNED_REPLY_UPDATED", entityType: "canned_reply", entityId: id, oldValue: toCanned(before), newValue: dto });
  return dto;
}

export async function deleteCanned(db: Db, organizationId: string, userId: string, id: string) {
  const [row] = await db
    .delete(cannedReplies)
    .where(and(eq(cannedReplies.id, id), eq(cannedReplies.organizationId, organizationId)))
    .returning();
  if (!row) return false;
  await writeAudit(db, { userId, organizationId, action: "CANNED_REPLY_DELETED", entityType: "canned_reply", entityId: id, oldValue: toCanned(row) });
  return true;
}

/** Values for {customer} {container} {eta} {vessel} {job} {agent} from the case's links. */
export async function cannedValuesFor(db: Db, organizationId: string, kase: CaseDto, agentUserId: string, lang: Lang) {
  const [job] = kase.jobId
    ? await db.select({ n: jobs.jobNumber, vessel: jobs.vessel, voyage: jobs.voyage, eta: jobs.eta }).from(jobs).where(eq(jobs.id, kase.jobId)).limit(1)
    : [];
  const boxCond = kase.containerNo
    ? eq(containers.containerNo, kase.containerNo)
    : kase.jobId
      ? eq(containers.jobId, kase.jobId)
      : undefined;
  const [box] = boxCond
    ? await db
        .select({ no: containers.containerNo, vessel: containers.vessel, eta: containers.eta })
        .from(containers)
        .where(and(eq(containers.organizationId, organizationId), boxCond))
        .orderBy(asc(containers.containerNo))
        .limit(1)
    : [];
  const [bk] = kase.bookingId
    ? await db.select({ vessel: bookings.vessel, voyage: bookings.voyage, eta: bookings.eta }).from(bookings).where(eq(bookings.id, kase.bookingId)).limit(1)
    : [];
  const [agent] = await db.select({ name: users.name, th: users.nameTh, zh: users.nameZh }).from(users).where(eq(users.id, agentUserId)).limit(1);
  const cust = kase.customer ? (lang === "zh" ? kase.customer.zh : lang === "en" ? kase.customer.en : kase.customer.th) || kase.customer.th || kase.customer.en : null;
  const vesselOf = (v?: string | null, voy?: string | null) => (v ? `${v}${voy ? ` ${voy}` : ""}` : null);
  return {
    customer: cust,
    container: kase.containerNo ?? box?.no ?? null,
    job: job?.n ?? null,
    vessel: vesselOf(job?.vessel, job?.voyage) ?? vesselOf(box?.vessel) ?? vesselOf(bk?.vessel, bk?.voyage),
    eta: fmtCannedDate(job?.eta ?? box?.eta ?? bk?.eta ?? null, lang),
    agent: agent ? (lang === "th" ? agent.th : lang === "zh" ? agent.zh : null) || agent.name : null,
  };
}

export async function renderCannedForCase(
  db: Db,
  organizationId: string,
  actor: CaseActor,
  caseId: string,
  source: { cannedId?: string; body?: string },
  lang: Lang = "th",
) {
  const kase = await loadCase(db, organizationId, caseId);
  if (!kase) return null;
  let template = source.body ?? "";
  if (source.cannedId) {
    const [row] = await db
      .select()
      .from(cannedReplies)
      .where(and(eq(cannedReplies.id, source.cannedId), eq(cannedReplies.organizationId, organizationId)))
      .limit(1);
    if (!row) return null;
    template = row.body;
  }
  const values = await cannedValuesFor(db, organizationId, kase, actor.userId, lang);
  return { ...renderCanned(template, values), values };
}

// ---------------------------------------------------------------------------
// Status lookup (container / job / booking) for answering "where is my box?"

export type LookupHit = {
  kind: "container" | "job" | "booking";
  ref: string;
  jobId: string | null;
  jobNumber: string | null;
  containerNo: string | null;
  bookingId: string | null;
  bookingNumber: string | null;
  customerId: string | null;
  customer: { th: string; en: string; zh: string } | null;
  pol: string | null;
  pod: string | null;
  vessel: string | null;
  voyage: string | null;
  etd: string | null;
  eta: string | null;
  status: string;
  /** 0 booked … 5 delivered */
  stage: number;
  problem: boolean;
  containers: string[];
};

const JOB_STAGE: Record<string, number> = {
  BOOKING: 0, CONFIRMED: 0, GATE_IN: 1, SAIL: 2, SAILED: 2, ARRIVED: 3, CUSTOMS: 4, CLEARED: 4,
  DELIVERED: 5, CLOSED: 5, COMPLETED: 5,
};
const BOX_STAGE: Record<string, number> = { yard: 1, gate_in: 1, sail: 2, arrived: 3, hold: 3, customs: 4, clear: 4, do_ready: 4, delivered: 5, empty: 5 };
const BOOKING_STAGE: Record<string, number> = { booking: 0, gate_in: 1, sail: 2, arrived: 3, delivered: 5 };

const ymd = (v: string | Date | null | undefined) => {
  if (!v) return null;
  const s = v instanceof Date ? v.toISOString() : String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};

/** Dates win when statuses lag (ship clearly left / arrived but nobody ticked it). */
export function stageWithDates(stage: number, etd: string | null, eta: string | null, today: string): number {
  if (stage >= 3) return stage;
  if (eta && eta <= today) return Math.max(stage, 3);
  if (etd && etd <= today) return Math.max(stage, 2);
  return stage;
}

export async function lookupShipments(db: Db, organizationId: string, q: string, now = new Date()): Promise<LookupHit[]> {
  const needle = q.trim();
  if (needle.length < 2) return [];
  const l = like(needle);
  const today = now.toISOString().slice(0, 10);
  const custCols = { custTh: customers.nameTh, custEn: customers.nameEn, custZh: customers.nameZh };

  const [boxRows, jobRows, bookingRows] = await Promise.all([
    db
      .select({ b: containers, job: jobs, ...custCols })
      .from(containers)
      .leftJoin(jobs, eq(containers.jobId, jobs.id))
      .leftJoin(customers, eq(containers.customerId, customers.id))
      .where(and(eq(containers.organizationId, organizationId), or(ilike(containers.containerNo, l), ilike(containers.bl, l))))
      .limit(6),
    db
      .select({ j: jobs, ...custCols })
      .from(jobs)
      .leftJoin(customers, eq(jobs.customerId, customers.id))
      .where(
        and(
          eq(jobs.organizationId, organizationId),
          or(ilike(jobs.jobNumber, l), ilike(jobs.bookingNumber, l), ilike(jobs.masterBl, l), ilike(jobs.houseBl, l)),
        ),
      )
      .limit(6),
    db
      .select({ bk: bookings, ...custCols })
      .from(bookings)
      .innerJoin(customers, eq(bookings.customerId, customers.id))
      .where(
        and(
          eq(customers.organizationId, organizationId),
          or(ilike(bookings.bookingNumber, l), ilike(bookings.carrierBookingNo, l), ilike(bookings.bl, l)),
        ),
      )
      .limit(6),
  ]);

  const jobIds = [...new Set([...jobRows.map((r) => r.j.id), ...boxRows.map((r) => r.b.jobId).filter((x): x is string => Boolean(x))])];
  const boxesByJob = new Map<string, string[]>();
  if (jobIds.length) {
    const rows = await db
      .select({ jobId: containers.jobId, no: containers.containerNo })
      .from(containers)
      .where(and(eq(containers.organizationId, organizationId), inArray(containers.jobId, jobIds)))
      .orderBy(asc(containers.containerNo));
    for (const r of rows) if (r.jobId) boxesByJob.set(r.jobId, [...(boxesByJob.get(r.jobId) ?? []), r.no]);
  }
  const cust = (r: { custTh: string | null; custEn: string | null; custZh: string | null }) =>
    r.custTh !== null || r.custEn !== null ? { th: r.custTh ?? "", en: r.custEn ?? "", zh: r.custZh ?? "" } : null;

  const hits: LookupHit[] = [];
  for (const r of boxRows) {
    const j = r.job;
    const etd = ymd(j?.etd);
    const eta = ymd(r.b.eta) ?? ymd(j?.eta);
    hits.push({
      kind: "container",
      ref: r.b.containerNo,
      jobId: j?.id ?? null,
      jobNumber: j?.jobNumber ?? null,
      containerNo: r.b.containerNo,
      bookingId: j?.bookingId ?? null,
      bookingNumber: j?.bookingNumber ?? null,
      customerId: r.b.customerId,
      customer: cust(r),
      pol: r.b.pol ?? j?.pol ?? null,
      pod: r.b.pod ?? j?.pod ?? null,
      vessel: r.b.vessel ?? j?.vessel ?? null,
      voyage: j?.voyage ?? null,
      etd,
      eta,
      status: r.b.status,
      // "hold" = stopped at a port: at origin before sailing, at destination after arrival.
      stage: stageWithDates(r.b.status === "hold" ? (eta && eta <= today ? 3 : 1) : (BOX_STAGE[r.b.status] ?? 0), etd, eta, today),
      problem: r.b.status === "hold",
      containers: j ? (boxesByJob.get(j.id) ?? [r.b.containerNo]) : [r.b.containerNo],
    });
  }
  for (const r of jobRows) {
    const j = r.j;
    const etd = ymd(j.etd);
    const eta = ymd(j.eta);
    const base = JOB_STAGE[j.status.toUpperCase()] ?? 0;
    const stage = stageWithDates(base, etd, eta, today);
    hits.push({
      kind: "job",
      ref: j.jobNumber,
      jobId: j.id,
      jobNumber: j.jobNumber,
      containerNo: null,
      bookingId: j.bookingId,
      bookingNumber: j.bookingNumber,
      customerId: j.customerId,
      customer: cust(r),
      pol: j.pol,
      pod: j.pod,
      vessel: j.vessel,
      voyage: j.voyage,
      etd,
      eta,
      status: j.status,
      stage,
      problem: Boolean(eta && eta < today && stage < 3),
      containers: boxesByJob.get(j.id) ?? [],
    });
  }
  for (const r of bookingRows) {
    const b = r.bk;
    const etd = ymd(b.etd);
    const eta = ymd(b.eta);
    hits.push({
      kind: "booking",
      ref: b.bookingNumber,
      jobId: null,
      jobNumber: null,
      containerNo: null,
      bookingId: b.id,
      bookingNumber: b.bookingNumber,
      customerId: b.customerId,
      customer: cust(r),
      pol: b.pol,
      pod: b.pod,
      vessel: b.vessel,
      voyage: b.voyage,
      etd,
      eta,
      status: b.stage,
      stage: stageWithDates(BOOKING_STAGE[b.stage] ?? 0, etd, eta, today),
      problem: false,
      containers: [],
    });
  }
  return hits.slice(0, 12);
}

