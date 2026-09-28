import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { users } from "../db/schema/auth.js";
import { customers, leads, opportunities } from "../db/schema/crm.js";
import { organizationMembers } from "../db/schema/tenancy.js";

/*
 * Leads and deals (opportunities) with a real staff owner (owner_user_id) and deal currency.
 * `owner` keeps a display name: it is refreshed from the user when an owner is picked and is
 * the fallback for legacy rows that were never mapped to a user.
 */

export const LEAD_STAGES = ["new", "working", "qualified", "lost"] as const;
export const DEAL_STAGES = ["qualify", "quote", "won", "book", "billed"] as const;

export class PipelineInputError extends Error {
  code: string;
  field?: string;
  status: 400 | 404;
  constructor(code: string, field?: string, status: 400 | 404 = 400) {
    super(code);
    this.code = code;
    this.field = field;
    this.status = status;
  }
}

export type LeadDto = {
  id: string;
  company: string;
  city: string;
  lane: string;
  contact: string;
  source: string;
  stage: string;
  teu: number;
  owner: string;
  ownerUserId: string | null;
  updated: string;
};

export type DealDto = {
  id: string;
  customerId: string;
  title: string;
  lane: string;
  stage: string;
  value: number;
  currency: string;
  teu: number;
  close: string;
  owner: string;
  ownerUserId: string | null;
};

const toLead = (r: typeof leads.$inferSelect): LeadDto => ({
  id: r.id,
  company: r.company,
  city: r.city,
  lane: r.lane,
  contact: r.contact,
  source: r.source,
  stage: r.stage,
  teu: r.teu,
  owner: r.owner,
  ownerUserId: r.ownerUserId,
  updated: r.updated,
});

const toDeal = (r: typeof opportunities.$inferSelect): DealDto => ({
  id: r.id,
  customerId: r.customerId,
  title: r.title,
  lane: r.lane,
  stage: r.stage,
  value: r.value,
  currency: r.currency,
  teu: r.teu,
  close: r.close,
  owner: r.owner,
  ownerUserId: r.ownerUserId,
});

function stamp(d = new Date()) {
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The owner must be an active member of the organization; returns the stored display name. */
export async function resolveOwnerName(db: Db, organizationId: string, userId: string): Promise<string> {
  const [u] = await db
    .select({ name: users.name, nameZh: users.nameZh })
    .from(organizationMembers)
    .innerJoin(users, eq(organizationMembers.userId, users.id))
    .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, userId), eq(users.active, true)))
    .limit(1);
  if (!u) throw new PipelineInputError("owner_not_in_org", "ownerUserId");
  return u.nameZh || u.name;
}

/* ── Leads ─────────────────────────────────────────── */

export type LeadInput = {
  company: string;
  city?: string;
  lane?: string;
  contact?: string;
  source?: string;
  teu?: number;
  stage?: string;
  ownerUserId?: string | null;
  /** Legacy free-text owner (used only when no ownerUserId is given). */
  owner?: string;
};

export async function listLeadRows(db: Db, organizationId: string, stage?: string) {
  const f = [eq(leads.organizationId, organizationId)];
  if (stage) f.push(eq(leads.stage, stage));
  const rows = await db
    .select()
    .from(leads)
    .where(and(...f))
    .orderBy(desc(leads.updatedAt));
  return rows.map(toLead);
}

export async function createLeadRow(db: Db, organizationId: string, input: LeadInput) {
  const owner = input.ownerUserId ? await resolveOwnerName(db, organizationId, input.ownerUserId) : input.owner?.trim() || "—";
  const [row] = await db
    .insert(leads)
    .values({
      id: `l${Date.now()}${Math.floor(Math.random() * 1000)}`,
      organizationId,
      company: input.company,
      city: input.city || "—",
      lane: input.lane || "—",
      contact: input.contact || "—",
      source: input.source || "—",
      stage: input.stage ?? "new",
      teu: input.teu ?? 0,
      owner,
      ownerUserId: input.ownerUserId ?? null,
      updated: stamp(),
    })
    .returning();
  return toLead(row);
}

export async function updateLeadRow(db: Db, organizationId: string, id: string, patch: Partial<LeadInput>) {
  const [before] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, id), eq(leads.organizationId, organizationId)))
    .limit(1);
  if (!before) return null;
  const set: Partial<typeof leads.$inferInsert> = { updated: stamp(), updatedAt: new Date() };
  for (const k of ["company", "city", "lane", "contact", "source", "teu", "stage"] as const) {
    if (patch[k] !== undefined) (set as Record<string, unknown>)[k] = patch[k];
  }
  if (patch.ownerUserId !== undefined) {
    set.ownerUserId = patch.ownerUserId;
    if (patch.ownerUserId) set.owner = await resolveOwnerName(db, organizationId, patch.ownerUserId);
  }
  const [row] = await db.update(leads).set(set).where(eq(leads.id, id)).returning();
  return { before: toLead(before), after: toLead(row) };
}

/* ── Deals ─────────────────────────────────────────── */

export type DealInput = {
  customerId: string;
  title: string;
  lane?: string;
  value?: number;
  currency?: string;
  teu?: number;
  close?: string;
  stage?: string;
  ownerUserId?: string | null;
  owner?: string;
};

/** Deals are scoped through their customer's organization. */
export async function listDealRows(db: Db, organizationId: string, customerId?: string) {
  const f = [eq(customers.organizationId, organizationId)];
  if (customerId) f.push(eq(opportunities.customerId, customerId));
  const rows = await db
    .select({ o: opportunities })
    .from(opportunities)
    .innerJoin(customers, eq(customers.id, opportunities.customerId))
    .where(and(...f))
    .orderBy(desc(opportunities.updatedAt));
  return rows.map((r) => toDeal(r.o));
}

async function findDeal(db: Db, organizationId: string, id: string) {
  const [r] = await db
    .select({ o: opportunities })
    .from(opportunities)
    .innerJoin(customers, eq(customers.id, opportunities.customerId))
    .where(and(eq(opportunities.id, id), eq(customers.organizationId, organizationId)))
    .limit(1);
  return r?.o ?? null;
}

export async function createDealRow(db: Db, organizationId: string, input: DealInput) {
  const [cust] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, input.customerId), eq(customers.organizationId, organizationId)))
    .limit(1);
  if (!cust) throw new PipelineInputError("customer_not_found", "customerId", 404);
  const owner = input.ownerUserId ? await resolveOwnerName(db, organizationId, input.ownerUserId) : input.owner?.trim() || "—";
  const [row] = await db
    .insert(opportunities)
    .values({
      id: `d${Date.now()}${Math.floor(Math.random() * 1000)}`,
      customerId: input.customerId,
      title: input.title,
      lane: input.lane || "—",
      stage: input.stage ?? "qualify",
      value: input.value ?? 0,
      currency: (input.currency ?? "THB").toUpperCase(),
      teu: input.teu ?? 0,
      close: input.close || "—",
      owner,
      ownerUserId: input.ownerUserId ?? null,
    })
    .returning();
  return toDeal(row);
}

export async function updateDealRow(db: Db, organizationId: string, id: string, patch: Partial<Omit<DealInput, "customerId">>) {
  const before = await findDeal(db, organizationId, id);
  if (!before) return null;
  const set: Partial<typeof opportunities.$inferInsert> = { updatedAt: new Date() };
  for (const k of ["title", "lane", "value", "teu", "close", "stage"] as const) {
    if (patch[k] !== undefined) (set as Record<string, unknown>)[k] = patch[k];
  }
  if (patch.currency !== undefined) set.currency = patch.currency.toUpperCase();
  if (patch.ownerUserId !== undefined) {
    set.ownerUserId = patch.ownerUserId;
    if (patch.ownerUserId) set.owner = await resolveOwnerName(db, organizationId, patch.ownerUserId);
  }
  const [row] = await db.update(opportunities).set(set).where(eq(opportunities.id, id)).returning();
  return { before: toDeal(before), after: toDeal(row) };
}

/** Sum of deal values per currency (open deals = not billed). */
export function totalsByCurrency(deals: Pick<DealDto, "value" | "currency" | "stage">[], openOnly = false) {
  const out: Record<string, number> = {};
  for (const d of deals) {
    if (openOnly && d.stage === "billed") continue;
    out[d.currency] = (out[d.currency] ?? 0) + d.value;
  }
  return out;
}
