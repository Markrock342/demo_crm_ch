import { asc, desc, eq, ilike, inArray, or, sql, and } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { contacts, customers, leads, opportunities, type LanePair } from "../db/schema/crm.js";
import { businessUnits } from "../db/schema/inbox.js";
import { users } from "../db/schema/auth.js";
import { organizationMembers } from "../db/schema/tenancy.js";
import {
  laneLabel,
  normalizeContacts,
  resolveNames,
  taxIdError,
  type ContactInput,
  type CustomerCreateInput,
  type CustomerPatchInput,
} from "../domain/customer.js";
import { containers } from "../db/schema/operations.js";
import { DEMO_ORG_ID } from "../domain/tenancy.js";

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
  nameLangs: string[] | null;
  businessType: string | null;
  website: string | null;
  industry: string | null;
  leadSource: string | null;
  ownerUserId: string | null;
  status: string;
  notes: string | null;
  taxId: string | null;
  branchNo: string | null;
  billingAddress: string | null;
  country: string | null;
  currency: string | null;
  creditTermDays: number | null;
  creditLimit: number | null;
  paymentMethod: string | null;
  billingEmail: string | null;
  preferredLanes: LanePair[];
  containerTypes: string[];
  commodities: string[];
  incoterms: string | null;
  customsBroker: boolean | null;
  handlingNotes: string | null;
  businessUnits: string[];
  createdAt: string;
  /** Customer portal sign-in is enabled (a hashed access code is stored). */
  portalAccess: boolean;
};

export type ContactDto = {
  id: string;
  customerId: string;
  name: string;
  title: string;
  email: string;
  phone: string;
  wechat: string;
  lineId: string;
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

export function toCustomer(row: typeof customers.$inferSelect, boxes = 0): CustomerDto {
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
    boxes,
    owner: row.owner,
    updated: row.updated,
    arDays: row.arDays,
    nameLangs: row.nameLangs ? row.nameLangs.split(",").filter(Boolean) : null,
    businessType: row.businessType,
    website: row.website,
    industry: row.industry,
    leadSource: row.leadSource,
    ownerUserId: row.ownerUserId,
    status: row.status,
    notes: row.notes,
    taxId: row.taxId,
    branchNo: row.branchNo,
    billingAddress: row.billingAddress,
    country: row.country,
    currency: row.currency,
    creditTermDays: row.creditTermDays,
    creditLimit: row.creditLimit === null ? null : Number(row.creditLimit),
    paymentMethod: row.paymentMethod,
    billingEmail: row.billingEmail,
    preferredLanes: row.preferredLanes ?? [],
    containerTypes: row.containerTypes ?? [],
    commodities: row.commodities ?? [],
    incoterms: row.incoterms,
    customsBroker: row.customsBroker,
    handlingNotes: row.handlingNotes,
    businessUnits: row.businessUnits ?? [],
    createdAt: row.createdAt.toISOString(),
    portalAccess: typeof row.portalPin === "string" && row.portalPin.startsWith("$2"),
  };
}

async function containerCountMap(db: Db, customerIds?: string[]): Promise<Map<string, number>> {
  const rows =
    customerIds && customerIds.length > 0
      ? await db
          .select({ customerId: containers.customerId, n: sql<number>`count(*)::int` })
          .from(containers)
          .where(inArray(containers.customerId, customerIds))
          .groupBy(containers.customerId)
      : await db
          .select({ customerId: containers.customerId, n: sql<number>`count(*)::int` })
          .from(containers)
          .groupBy(containers.customerId);
  return new Map(rows.map((r) => [r.customerId, Number(r.n)]));
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
    lineId: row.lineId,
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
  organizationId: string,
  opts: { q?: string; limit?: number; offset?: number } = {},
) {
  const limit = Math.min(opts.limit ?? 100, 200);
  const offset = opts.offset ?? 0;
  const q = opts.q?.trim();

  const orgFilter = eq(customers.organizationId, organizationId);
  const where = q
    ? and(
        orgFilter,
        or(
          ilike(customers.nameZh, `%${q}%`),
          ilike(customers.nameEn, `%${q}%`),
          ilike(customers.nameTh, `%${q}%`),
          ilike(customers.cityZh, `%${q}%`),
          ilike(customers.owner, `%${q}%`),
        ),
      )
    : orgFilter;

  const rows = await db
    .select()
    .from(customers)
    .where(where)
    .orderBy(desc(customers.updatedAt))
    .limit(limit)
    .offset(offset);

  const counts = await containerCountMap(
    db,
    rows.map((r) => r.id),
  );

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(customers)
    .where(where);

  return { items: rows.map((r) => toCustomer(r, counts.get(r.id) ?? 0)), total: count, limit, offset };
}

export async function getCustomer(db: Db, organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, id), eq(customers.organizationId, organizationId)))
    .limit(1);
  if (!row) return null;
  const counts = await containerCountMap(db, [id]);
  return toCustomer(row, counts.get(id) ?? 0);
}

export class CustomerInputError extends Error {
  code: string;
  field?: string;
  constructor(code: string, field?: string) {
    super(code);
    this.code = code;
    this.field = field;
  }
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** The owner must be an active member of the same organization; returns their display name. */
async function resolveOwner(db: Db | Tx, organizationId: string, userId: string): Promise<string> {
  const [u] = await db
    .select({ name: users.name, nameZh: users.nameZh })
    .from(organizationMembers)
    .innerJoin(users, eq(organizationMembers.userId, users.id))
    .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, userId), eq(users.active, true)))
    .limit(1);
  if (!u) throw new CustomerInputError("owner_not_in_org", "ownerUserId");
  return u.nameZh || u.name;
}

/** Profile columns shared by create + patch; only keys present in `input` are returned. */
function profileColumns(input: CustomerPatchInput, present: (k: string) => boolean) {
  const out: Partial<typeof customers.$inferInsert> = {};
  const keys = [
    "businessType",
    "website",
    "industry",
    "leadSource",
    "status",
    "notes",
    "taxId",
    "branchNo",
    "billingAddress",
    "country",
    "currency",
    "creditTermDays",
    "creditLimit",
    "paymentMethod",
    "billingEmail",
    "preferredLanes",
    "containerTypes",
    "commodities",
    "incoterms",
    "customsBroker",
    "handlingNotes",
    "businessUnits",
  ] as const;
  for (const k of keys) {
    if (!present(k)) continue;
    const v = input[k];
    if (v === undefined) continue;
    (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

/** Keeps only business unit ids that belong to the organization. */
async function ownUnits(tx: Tx, organizationId: string, cols: Partial<typeof customers.$inferInsert>) {
  if (!cols.businessUnits?.length) return cols;
  const known = await tx
    .select({ id: businessUnits.id })
    .from(businessUnits)
    .where(and(eq(businessUnits.organizationId, organizationId), inArray(businessUnits.id, cols.businessUnits)));
  const ok = new Set(known.map((u) => u.id));
  return { ...cols, businessUnits: cols.businessUnits.filter((id) => ok.has(id)) };
}

async function writeContacts(tx: Tx, customerId: string, list: ContactInput[], existingIds: Set<string>) {
  const normalized = normalizeContacts(list);
  const keep = new Set<string>();
  let n = 0;
  for (const c of normalized) {
    const values = {
      name: c.name,
      title: c.title ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      wechat: c.wechat ?? "",
      lineId: c.lineId ?? "",
      primary: c.primary,
    };
    if (c.id && existingIds.has(c.id)) {
      keep.add(c.id);
      await tx
        .update(contacts)
        .set({ ...values, updatedAt: new Date() })
        .where(and(eq(contacts.id, c.id), eq(contacts.customerId, customerId)));
    } else {
      const id = `p${Date.now()}${String(n++).padStart(2, "0")}${Math.random().toString(36).slice(2, 6)}`;
      keep.add(id);
      await tx.insert(contacts).values({ id, customerId, ...values });
    }
  }
  const drop = [...existingIds].filter((id) => !keep.has(id));
  if (drop.length) await tx.delete(contacts).where(and(eq(contacts.customerId, customerId), inArray(contacts.id, drop)));
}

export async function createCustomer(
  db: Db,
  organizationId: string,
  input: CustomerCreateInput & { id?: string },
  present: (k: string) => boolean = (k) => (input as Record<string, unknown>)[k] !== undefined,
) {
  const stamp = formatStamp(new Date());
  const id = input.id ?? `c${Date.now()}`;
  const names = resolveNames(input);
  const city = input.city ?? input.cityZh ?? "—";
  const lane = input.laneZh ?? laneLabel(input.preferredLanes) ?? "—";

  return db.transaction(async (tx) => {
    const owner = input.ownerUserId ? await resolveOwner(tx, organizationId, input.ownerUserId) : input.owner || "—";
    const [row] = await tx
      .insert(customers)
      .values({
        id,
        organizationId,
        ...names,
        cityZh: city,
        cityTh: city,
        cityEn: city,
        laneZh: lane,
        laneTh: input.laneTh || lane,
        laneEn: input.laneEn || lane,
        owner,
        ownerUserId: input.ownerUserId ?? null,
        updated: stamp,
        arDays: 0,
        ...(await ownUnits(tx, organizationId, profileColumns(input, present))),
      })
      .returning();
    if (input.contacts?.length) await writeContacts(tx, id, input.contacts, new Set());
    return toCustomer(row!, 0);
  });
}

/**
 * Partial update. `present(k)` says whether the caller sent key k (so "" / null clears a field,
 * and a missing key leaves it alone). `contacts`, when sent, is the full list: rows with a known
 * id are updated, rows without id are created, and stored contacts not in the list are deleted.
 */
export async function updateCustomer(
  db: Db,
  organizationId: string,
  id: string,
  input: CustomerPatchInput,
  present: (k: string) => boolean = (k) => (input as Record<string, unknown>)[k] !== undefined,
) {
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(customers)
      .where(and(eq(customers.id, id), eq(customers.organizationId, organizationId)))
      .limit(1);
    if (!before) return null;

    const set: Partial<typeof customers.$inferInsert> = await ownUnits(tx, organizationId, profileColumns(input, present));

    if (present("nameZh") || present("nameTh") || present("nameEn")) {
      const typed = new Set(before.nameLangs ? before.nameLangs.split(",") : ["zh", "th", "en"]);
      const pick = (k: "nameZh" | "nameTh" | "nameEn", lang: string) =>
        present(k) ? input[k] : typed.has(lang) ? before[k] : null;
      const names = resolveNames({ nameZh: pick("nameZh", "zh"), nameTh: pick("nameTh", "th"), nameEn: pick("nameEn", "en") });
      if (!names.nameLangs) throw new CustomerInputError("name_required", "name");
      Object.assign(set, names);
    }
    if (present("city") || present("cityZh")) {
      const city = input.city ?? input.cityZh ?? "—";
      Object.assign(set, { cityZh: city, cityTh: city, cityEn: city });
    }
    if (present("laneZh") || present("preferredLanes")) {
      const lane = input.laneZh ?? laneLabel(input.preferredLanes) ?? (present("laneZh") ? "—" : before.laneZh);
      Object.assign(set, { laneZh: lane, laneTh: input.laneTh || lane, laneEn: input.laneEn || lane });
    }
    if (present("ownerUserId")) {
      set.ownerUserId = input.ownerUserId ?? null;
      if (input.ownerUserId) set.owner = await resolveOwner(tx, organizationId, input.ownerUserId);
    } else if (present("owner") && input.owner) {
      set.owner = input.owner;
    }

    const err = taxIdError(set.taxId !== undefined ? set.taxId : before.taxId, set.country !== undefined ? set.country : before.country);
    if (err && (present("taxId") || present("country"))) throw new CustomerInputError(err, "taxId");

    const [row] = await tx
      .update(customers)
      .set({ ...set, updatedAt: new Date(), updated: formatStamp(new Date()) })
      .where(and(eq(customers.id, id), eq(customers.organizationId, organizationId)))
      .returning();

    if (input.contacts) {
      const existing = await tx.select({ id: contacts.id }).from(contacts).where(eq(contacts.customerId, id));
      await writeContacts(tx, id, input.contacts, new Set(existing.map((r) => r.id)));
    }
    const counts = await containerCountMap(tx as unknown as Db, [id]);
    return toCustomer(row!, counts.get(id) ?? 0);
  });
}

/** Contacts of customers in this organization (optionally one customer). */
export async function listContacts(db: Db, organizationId: string, customerId?: string) {
  const rows = await db
    .select({ c: contacts })
    .from(contacts)
    .innerJoin(customers, eq(contacts.customerId, customers.id))
    .where(and(eq(customers.organizationId, organizationId), customerId ? eq(contacts.customerId, customerId) : undefined))
    .orderBy(desc(contacts.primary), asc(contacts.name));
  return rows.map((r) => toContact(r.c));
}

export async function getContact(db: Db, organizationId: string, id: string) {
  const [r] = await db
    .select({ c: contacts })
    .from(contacts)
    .innerJoin(customers, eq(contacts.customerId, customers.id))
    .where(and(eq(contacts.id, id), eq(customers.organizationId, organizationId)))
    .limit(1);
  return r ? toContact(r.c) : null;
}

/** Only one primary contact per customer. */
async function clearOtherPrimaries(db: Db | Tx, customerId: string, keepId: string) {
  await db
    .update(contacts)
    .set({ primary: false, updatedAt: new Date() })
    .where(and(eq(contacts.customerId, customerId), eq(contacts.primary, true), sql`${contacts.id} <> ${keepId}`));
}

export async function createContact(
  db: Db,
  input: Omit<ContactDto, "id" | "lineId"> & { id?: string; lineId?: string },
) {
  const id = input.id ?? `p${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
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
      lineId: input.lineId ?? "",
      primary: input.primary,
    })
    .returning();
  if (row!.primary) await clearOtherPrimaries(db, row!.customerId, row!.id);
  return toContact(row!);
}

export async function updateContact(db: Db, organizationId: string, id: string, patch: Partial<Omit<ContactDto, "id" | "customerId">>) {
  const before = await getContact(db, organizationId, id);
  if (!before) return null;
  const set: Partial<typeof contacts.$inferInsert> = {};
  for (const k of ["name", "title", "email", "phone", "wechat", "lineId", "primary"] as const) {
    if (patch[k] !== undefined) (set as Record<string, unknown>)[k] = patch[k];
  }
  const [row] = await db
    .update(contacts)
    .set({ ...set, updatedAt: new Date() })
    .where(eq(contacts.id, id))
    .returning();
  if (row!.primary) await clearOtherPrimaries(db, row!.customerId, row!.id);
  return toContact(row!);
}

export async function deleteContact(db: Db, organizationId: string, id: string) {
  const before = await getContact(db, organizationId, id);
  if (!before) return null;
  await db.delete(contacts).where(eq(contacts.id, id));
  return before;
}

/** Hard delete (tests / cleanup). Fails with a FK error once jobs, quotations or invoices point at the customer. */
export async function deleteCustomer(db: Db, organizationId: string, id: string) {
  const [row] = await db
    .delete(customers)
    .where(and(eq(customers.id, id), eq(customers.organizationId, organizationId)))
    .returning({ id: customers.id });
  return row ?? null;
}

export async function listLeads(db: Db, organizationId: string, stage?: string) {
  const filters = [eq(leads.organizationId, organizationId)];
  if (stage) filters.push(eq(leads.stage, stage));
  const rows = await db
    .select()
    .from(leads)
    .where(and(...filters))
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

export async function createLead(
  db: Db,
  organizationId: string,
  input: Omit<LeadDto, "id" | "updated" | "stage"> & { stage?: string; id?: string },
) {
  const id = input.id ?? `l${Date.now()}`;
  const [row] = await db
    .insert(leads)
    .values({
      id,
      organizationId,
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
      organizationId: DEMO_ORG_ID,
      nameZh: c.nameZh,
      nameTh: c.nameTh,
      nameEn: c.nameEn,
      cityZh: c.cityZh,
      cityTh: c.cityTh,
      cityEn: c.cityEn,
      laneZh: c.laneZh,
      laneTh: c.laneTh,
      laneEn: c.laneEn,
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
      organizationId: DEMO_ORG_ID,
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
