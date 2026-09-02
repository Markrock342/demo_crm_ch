import { asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { contacts, customers, leads, opportunities } from "../db/schema/crm.js";

export type CustomerDto = {
  id: string;
  nameZh: string;
  nameTh: string;
  nameEn: string;
  cityZh: string;
  cityTh: string;
  cityEn: string;
  laneZh: string;
  laneTh: string;
  laneEn: string;
  boxes: number;
  owner: string;
  updated: string;
  arDays: number;
};

export type ContactDto = {
  id: string;
  customerId: string;
  name: string;
  title: string;
  email: string;
  phone: string;
  wechat: string;
  primary: boolean;
};

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
  updated: string;
};

export type OpportunityDto = {
  id: string;
  customerId: string;
  title: string;
  lane: string;
  stage: string;
  value: number;
  teu: number;
  close: string;
  owner: string;
};

function toCustomer(row: typeof customers.$inferSelect): CustomerDto {
  return {
    id: row.id,
    nameZh: row.nameZh,
    nameTh: row.nameTh,
    nameEn: row.nameEn,
    cityZh: row.cityZh,
    cityTh: row.cityTh,
    cityEn: row.cityEn,
    laneZh: row.laneZh,
    laneTh: row.laneTh,
    laneEn: row.laneEn,
    boxes: row.boxes,
    owner: row.owner,
    updated: row.updated,
    arDays: row.arDays,
  };
}

function toContact(row: typeof contacts.$inferSelect): ContactDto {
  return {
    id: row.id,
    customerId: row.customerId,
    name: row.name,
    title: row.title,
    email: row.email,
    phone: row.phone,
    wechat: row.wechat,
    primary: row.primary,
  };
}

function toLead(row: typeof leads.$inferSelect): LeadDto {
  return {
    id: row.id,
    company: row.company,
    city: row.city,
    lane: row.lane,
    contact: row.contact,
    source: row.source,
    stage: row.stage,
    teu: row.teu,
    owner: row.owner,
    updated: row.updated,
  };
}

function toOpportunity(row: typeof opportunities.$inferSelect): OpportunityDto {
  return {
    id: row.id,
    customerId: row.customerId,
    title: row.title,
    lane: row.lane,
    stage: row.stage,
    value: row.value,
    teu: row.teu,
    close: row.close,
    owner: row.owner,
  };
}

export async function listCustomers(
  db: Db,
  opts: { q?: string; limit?: number; offset?: number } = {},
) {
  const limit = Math.min(opts.limit ?? 100, 200);
  const offset = opts.offset ?? 0;
  const q = opts.q?.trim();

  const where = q
    ? or(
        ilike(customers.nameZh, `%${q}%`),
        ilike(customers.nameEn, `%${q}%`),
        ilike(customers.nameTh, `%${q}%`),
        ilike(customers.cityZh, `%${q}%`),
        ilike(customers.owner, `%${q}%`),
      )
    : undefined;

  const rows = await db
    .select()
    .from(customers)
    .where(where)
    .orderBy(desc(customers.updatedAt))
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(customers)
    .where(where);

  return { items: rows.map(toCustomer), total: count, limit, offset };
}

export async function getCustomer(db: Db, id: string) {
  const [row] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  return row ? toCustomer(row) : null;
}

export async function createCustomer(
  db: Db,
  input: {
    nameZh: string;
    nameTh?: string;
    nameEn?: string;
    cityZh: string;
    cityTh?: string;
    cityEn?: string;
    laneZh: string;
    laneTh?: string;
    laneEn?: string;
    owner: string;
    id?: string;
  },
) {
  const stamp = formatStamp(new Date());
  const id = input.id ?? `c${Date.now()}`;
  const [row] = await db
    .insert(customers)
    .values({
      id,
      nameZh: input.nameZh,
      nameTh: input.nameTh || input.nameZh,
      nameEn: input.nameEn || input.nameZh,
      cityZh: input.cityZh,
      cityTh: input.cityTh || input.cityZh,
      cityEn: input.cityEn || input.cityZh,
      laneZh: input.laneZh,
      laneTh: input.laneTh || input.laneZh,
      laneEn: input.laneEn || input.laneZh,
      boxes: 0,
      owner: input.owner,
      updated: stamp,
      arDays: 0,
    })
    .returning();
  return toCustomer(row);
}

export async function updateCustomer(db: Db, id: string, patch: Partial<CustomerDto>) {
  const [row] = await db
    .update(customers)
    .set({
      ...patch,
      updatedAt: new Date(),
      updated: patch.updated ?? formatStamp(new Date()),
    })
    .where(eq(customers.id, id))
    .returning();
  return row ? toCustomer(row) : null;
}

export async function listContacts(db: Db, customerId?: string) {
  const rows = await db
    .select()
    .from(contacts)
    .where(customerId ? eq(contacts.customerId, customerId) : undefined)
    .orderBy(desc(contacts.primary), asc(contacts.name));
  return rows.map(toContact);
}

export async function createContact(
  db: Db,
  input: Omit<ContactDto, "id"> & { id?: string },
) {
  const id = input.id ?? `p${Date.now()}`;
  const [row] = await db
    .insert(contacts)
    .values({
      id,
      customerId: input.customerId,
      name: input.name,
      title: input.title,
      email: input.email,
      phone: input.phone,
      wechat: input.wechat,
      primary: input.primary,
    })
    .returning();
  return toContact(row);
}

export async function listLeads(db: Db, stage?: string) {
  const rows = await db
    .select()
    .from(leads)
    .where(stage ? eq(leads.stage, stage) : undefined)
    .orderBy(desc(leads.updatedAt));
  return rows.map(toLead);
}

export async function updateLeadStage(db: Db, id: string, stage: string) {
  const [row] = await db
    .update(leads)
    .set({ stage, updated: formatStamp(new Date()), updatedAt: new Date() })
    .where(eq(leads.id, id))
    .returning();
  return row ? toLead(row) : null;
}

export async function createLead(db: Db, input: Omit<LeadDto, "id" | "updated" | "stage"> & { stage?: string; id?: string }) {
  const id = input.id ?? `l${Date.now()}`;
  const [row] = await db
    .insert(leads)
    .values({
      id,
      company: input.company,
      city: input.city,
      lane: input.lane,
      contact: input.contact,
      source: input.source,
      stage: input.stage ?? "new",
      teu: input.teu,
      owner: input.owner,
      updated: formatStamp(new Date()),
    })
    .returning();
  return toLead(row);
}

export async function listOpportunities(db: Db, customerId?: string) {
  const rows = await db
    .select()
    .from(opportunities)
    .where(customerId ? eq(opportunities.customerId, customerId) : undefined)
    .orderBy(desc(opportunities.updatedAt));
  return rows.map(toOpportunity);
}

export async function updateOpportunityStage(db: Db, id: string, stage: string) {
  const [row] = await db
    .update(opportunities)
    .set({ stage, updatedAt: new Date() })
    .where(eq(opportunities.id, id))
    .returning();
  return row ? toOpportunity(row) : null;
}

export async function createOpportunity(
  db: Db,
  input: Omit<OpportunityDto, "id" | "stage"> & { stage?: string; id?: string },
) {
  const id = input.id ?? `d${Date.now()}`;
  const [row] = await db
    .insert(opportunities)
    .values({
      id,
      customerId: input.customerId,
      title: input.title,
      lane: input.lane,
      stage: input.stage ?? "qualify",
      value: input.value,
      teu: input.teu,
      close: input.close,
      owner: input.owner,
    })
    .returning();
  return toOpportunity(row);
}

export async function seedCrmFromDemo(db: Db) {
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(customers);
  if (count > 0) return { skipped: true };

  const { customers: seedCustomers } = await import("../../src/data.js");
  const { contacts: seedContacts, leads: seedLeads, deals: seedDeals } = await import("../../src/crm.js");

  await db.insert(customers).values(
    seedCustomers.map((c) => ({
      id: c.id,
      nameZh: c.nameZh,
      nameTh: c.nameTh,
      nameEn: c.nameEn,
      cityZh: c.cityZh,
      cityTh: c.cityTh,
      cityEn: c.cityEn,
      laneZh: c.laneZh,
      laneTh: c.laneTh,
      laneEn: c.laneEn,
      boxes: c.boxes,
      owner: c.owner,
      updated: c.updated,
      arDays: c.arDays,
    })),
  );

  await db.insert(contacts).values(
    seedContacts.map((p) => ({
      id: p.id,
      customerId: p.customerId,
      name: p.name,
      title: p.title,
      email: p.email,
      phone: p.phone,
      wechat: p.wechat,
      primary: p.primary,
    })),
  );

  await db.insert(leads).values(
    seedLeads.map((l) => ({
      id: l.id,
      company: l.company,
      city: l.city,
      lane: l.lane,
      contact: l.contact,
      source: l.source,
      stage: l.stage,
      teu: l.teu,
      owner: l.owner,
      updated: l.updated,
    })),
  );

  await db.insert(opportunities).values(
    seedDeals.map((d) => ({
      id: d.id,
      customerId: d.customerId,
      title: d.title,
      lane: d.lane,
      stage: d.stage,
      value: d.value,
      teu: d.teu,
      close: d.close,
      owner: d.owner,
    })),
  );

  return { skipped: false, customers: seedCustomers.length, contacts: seedContacts.length, leads: seedLeads.length, opportunities: seedDeals.length };
}

function formatStamp(d: Date) {
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
