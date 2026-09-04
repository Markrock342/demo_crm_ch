import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { crmDocs, mails } from "../db/schema/comms.js";
import { customers } from "../db/schema/crm.js";
import { DEMO_ORG_ID } from "../domain/tenancy.js";

export type MailDto = {
  id: string;
  customerId: string;
  from: string;
  subjectZh: string;
  subjectTh: string;
  subjectEn: string;
  bodyZh: string;
  bodyTh: string;
  bodyEn: string;
  draftZh: string;
  draftTh: string;
  draftEn: string;
  time: string;
  confidence: number;
  unread: boolean;
  state: "open" | "sent" | "rejected";
  intent?: string;
  summary?: string;
  origin?: string;
  dest?: string;
  extractedBoxes?: string[];
  docsMissing?: string[];
  suggestedStatus?: string;
  needsHuman?: boolean;
};

export type CrmDocDto = {
  id: string;
  customerId: string;
  boxId: string;
  kind: string;
  name: string;
  status: "ok" | "wait" | "late";
  updated: string;
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === "string");
}

function toMail(row: typeof mails.$inferSelect): MailDto {
  return {
    id: row.id,
    customerId: row.customerId ?? "",
    from: row.fromAddr,
    subjectZh: row.subjectZh,
    subjectTh: row.subjectTh,
    subjectEn: row.subjectEn,
    bodyZh: row.bodyZh,
    bodyTh: row.bodyTh,
    bodyEn: row.bodyEn,
    draftZh: row.draftZh,
    draftTh: row.draftTh,
    draftEn: row.draftEn,
    time: row.timeLabel,
    confidence: Number(row.confidence),
    unread: row.unread,
    state: row.state as MailDto["state"],
    intent: row.intent ?? undefined,
    summary: row.summary ?? undefined,
    origin: row.origin ?? undefined,
    dest: row.dest ?? undefined,
    extractedBoxes: asStringArray(row.extractedBoxes),
    docsMissing: asStringArray(row.docsMissing),
    suggestedStatus: row.suggestedStatus ?? undefined,
    needsHuman: row.needsHuman,
  };
}

function toDoc(row: typeof crmDocs.$inferSelect): CrmDocDto {
  return {
    id: row.id,
    customerId: row.customerId,
    boxId: row.boxId,
    kind: row.kind,
    name: row.name,
    status: row.status as CrmDocDto["status"],
    updated: row.updated,
  };
}

export async function listMails(db: Db, organizationId: string, customerId?: string) {
  const clauses = [eq(mails.organizationId, organizationId)];
  if (customerId) clauses.push(eq(mails.customerId, customerId));
  const rows = await db
    .select()
    .from(mails)
    .where(and(...clauses))
    .orderBy(desc(mails.updatedAt));
  return rows.map(toMail);
}

export async function getMail(db: Db, organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(mails)
    .where(and(eq(mails.id, id), eq(mails.organizationId, organizationId)))
    .limit(1);
  return row ? toMail(row) : null;
}

export async function createMail(db: Db, input: Omit<MailDto, "id"> & { id?: string }, organizationId?: string) {
  const id = input.id ?? `m${Date.now()}`;
  let orgId = organizationId;
  if (!orgId && input.customerId) {
    const [cust] = await db
      .select({ organizationId: customers.organizationId })
      .from(customers)
      .where(eq(customers.id, input.customerId))
      .limit(1);
    orgId = cust?.organizationId;
  }
  if (!orgId) orgId = DEMO_ORG_ID;

  const [row] = await db
    .insert(mails)
    .values({
      id,
      organizationId: orgId,
      customerId: input.customerId || null,
      fromAddr: input.from,
      subjectZh: input.subjectZh,
      subjectTh: input.subjectTh,
      subjectEn: input.subjectEn,
      bodyZh: input.bodyZh,
      bodyTh: input.bodyTh,
      bodyEn: input.bodyEn,
      draftZh: input.draftZh,
      draftTh: input.draftTh,
      draftEn: input.draftEn,
      timeLabel: input.time,
      confidence: String(input.confidence),
      unread: input.unread,
      state: input.state,
      intent: input.intent ?? null,
      summary: input.summary ?? null,
      origin: input.origin ?? null,
      dest: input.dest ?? null,
      extractedBoxes: input.extractedBoxes ?? [],
      docsMissing: input.docsMissing ?? [],
      suggestedStatus: input.suggestedStatus ?? null,
      needsHuman: input.needsHuman ?? false,
    })
    .returning();
  return toMail(row);
}

export async function updateMail(db: Db, organizationId: string, id: string, patch: Partial<MailDto>) {
  const [existing] = await db
    .select()
    .from(mails)
    .where(and(eq(mails.id, id), eq(mails.organizationId, organizationId)))
    .limit(1);
  if (!existing) return null;
  const [row] = await db
    .update(mails)
    .set({
      customerId: patch.customerId !== undefined ? patch.customerId || null : existing.customerId,
      fromAddr: patch.from ?? existing.fromAddr,
      subjectZh: patch.subjectZh ?? existing.subjectZh,
      subjectTh: patch.subjectTh ?? existing.subjectTh,
      subjectEn: patch.subjectEn ?? existing.subjectEn,
      bodyZh: patch.bodyZh ?? existing.bodyZh,
      bodyTh: patch.bodyTh ?? existing.bodyTh,
      bodyEn: patch.bodyEn ?? existing.bodyEn,
      draftZh: patch.draftZh ?? existing.draftZh,
      draftTh: patch.draftTh ?? existing.draftTh,
      draftEn: patch.draftEn ?? existing.draftEn,
      timeLabel: patch.time ?? existing.timeLabel,
      confidence: patch.confidence !== undefined ? String(patch.confidence) : existing.confidence,
      unread: patch.unread ?? existing.unread,
      state: patch.state ?? existing.state,
      intent: patch.intent !== undefined ? patch.intent ?? null : existing.intent,
      summary: patch.summary !== undefined ? patch.summary ?? null : existing.summary,
      origin: patch.origin !== undefined ? patch.origin ?? null : existing.origin,
      dest: patch.dest !== undefined ? patch.dest ?? null : existing.dest,
      extractedBoxes: patch.extractedBoxes ?? asStringArray(existing.extractedBoxes),
      docsMissing: patch.docsMissing ?? asStringArray(existing.docsMissing),
      suggestedStatus:
        patch.suggestedStatus !== undefined ? patch.suggestedStatus ?? null : existing.suggestedStatus,
      needsHuman: patch.needsHuman ?? existing.needsHuman,
      updatedAt: new Date(),
    })
    .where(eq(mails.id, id))
    .returning();
  return row ? toMail(row) : null;
}

export async function listCrmDocs(db: Db, organizationId: string, customerId?: string) {
  const clauses = [eq(crmDocs.organizationId, organizationId)];
  if (customerId) clauses.push(eq(crmDocs.customerId, customerId));
  const rows = await db
    .select()
    .from(crmDocs)
    .where(and(...clauses))
    .orderBy(desc(crmDocs.updatedAt));
  return rows.map(toDoc);
}

export async function upsertCrmDoc(db: Db, input: CrmDocDto, organizationId?: string) {
  let orgId = organizationId;
  if (!orgId) {
    const [cust] = await db
      .select({ organizationId: customers.organizationId })
      .from(customers)
      .where(eq(customers.id, input.customerId))
      .limit(1);
    orgId = cust?.organizationId ?? DEMO_ORG_ID;
  }

  const [existing] = await db.select().from(crmDocs).where(eq(crmDocs.id, input.id)).limit(1);
  if (existing) {
    const [row] = await db
      .update(crmDocs)
      .set({
        customerId: input.customerId,
        boxId: input.boxId,
        kind: input.kind,
        name: input.name,
        status: input.status,
        updated: input.updated,
        updatedAt: new Date(),
      })
      .where(eq(crmDocs.id, input.id))
      .returning();
    return toDoc(row);
  }
  const [row] = await db
    .insert(crmDocs)
    .values({
      id: input.id,
      organizationId: orgId,
      customerId: input.customerId,
      boxId: input.boxId,
      kind: input.kind,
      name: input.name,
      status: input.status,
      updated: input.updated,
    })
    .returning();
  return toDoc(row);
}

export async function updateCrmDocStatus(db: Db, id: string, status: CrmDocDto["status"], updated: string) {
  const [row] = await db
    .update(crmDocs)
    .set({ status, updated, updatedAt: new Date() })
    .where(eq(crmDocs.id, id))
    .returning();
  return row ? toDoc(row) : null;
}

export function mailTransitionAllowed(from: string, to: string): boolean {
  if (from === to) return true;
  if (from === "open" && (to === "sent" || to === "rejected")) return true;
  return false;
}

export async function seedCommsFromDemo(db: Db) {
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(mails);
  if (Number(count) > 0) return { skipped: true as const };

  const { mailsSeed } = await import("../../src/data.js");
  const { docs } = await import("../../src/crm.js");

  for (const m of mailsSeed) {
    await createMail(db, { ...m, id: m.id });
  }
  for (const d of docs) {
    await upsertCrmDoc(db, d);
  }
  return { skipped: false as const, mails: mailsSeed.length, docs: docs.length };
}
