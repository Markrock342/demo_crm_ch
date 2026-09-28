import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { contacts, customers } from "../db/schema/crm.js";

/**
 * Customer portal access.
 *
 * A customer contact signs in with their contact e-mail + the customer's portal access code.
 * Staff issue (or rotate) the code with `issuePortalAccessCode`; only a bcrypt hash is stored in
 * `customers.portal_pin`. Legacy plain values (e.g. the old "demo" default) are treated as
 * "portal access not enabled" — they never grant a session.
 */

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

export function generateAccessCode(): string {
  let raw = "";
  for (let i = 0; i < 8; i++) raw += ALPHABET[randomInt(ALPHABET.length)];
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export function normalizeAccessCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function isHashed(stored: string | null | undefined): stored is string {
  return typeof stored === "string" && stored.startsWith("$2");
}

export function portalAccessEnabled(stored: string | null | undefined): boolean {
  return isHashed(stored);
}

export async function hashAccessCode(code: string): Promise<string> {
  return bcrypt.hash(normalizeAccessCode(code), 10);
}

export async function verifyAccessCode(code: string, stored: string | null | undefined): Promise<boolean> {
  if (!isHashed(stored)) return false;
  const norm = normalizeAccessCode(code);
  if (norm.length < 6) return false;
  return bcrypt.compare(norm, stored);
}

/** Generates a new code for a customer in the given organization; returns the plain code once. */
export async function issuePortalAccessCode(db: Db, orgId: string, customerId: string) {
  const [cust] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.organizationId, orgId)))
    .limit(1);
  if (!cust) return null;
  const code = generateAccessCode();
  await db
    .update(customers)
    .set({ portalPin: await hashAccessCode(code), updatedAt: new Date() })
    .where(eq(customers.id, cust.id));
  const emails = await db
    .select({ email: contacts.email })
    .from(contacts)
    .where(eq(contacts.customerId, cust.id));
  return { customerId: cust.id, code, emails: emails.map((e) => e.email).filter(Boolean) };
}

/** Disables portal access for a customer (existing sessions expire within a day). */
export async function revokePortalAccess(db: Db, orgId: string, customerId: string) {
  const rows = await db
    .update(customers)
    .set({ portalPin: "", updatedAt: new Date() })
    .where(and(eq(customers.id, customerId), eq(customers.organizationId, orgId)))
    .returning({ id: customers.id });
  return rows.length > 0;
}

let dummyHash: string | null = null;

/** Contact e-mail + access code → the customer (or null). Same response time shape for all failures. */
export async function authenticatePortalContact(db: Db, email: string, code: string) {
  const rows = await db
    .select({ customerId: customers.id, orgId: customers.organizationId, pin: customers.portalPin })
    .from(contacts)
    .innerJoin(customers, eq(contacts.customerId, customers.id))
    .where(sql`lower(${contacts.email}) = ${email.trim().toLowerCase()}`);
  for (const row of rows) {
    if (await verifyAccessCode(code, row.pin)) return { customerId: row.customerId, orgId: row.orgId };
  }
  if (rows.length === 0) {
    // Keep timing similar to a real comparison so e-mails cannot be enumerated.
    dummyHash ??= await bcrypt.hash("no-such-contact", 10);
    await bcrypt.compare(normalizeAccessCode(code) || "x", dummyHash);
  }
  return null;
}

/** Tiny in-memory brute-force guard: 8 failures per key per 15 minutes. */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 8;
const fails = new Map<string, { n: number; until: number }>();

export function portalLoginBlocked(key: string): boolean {
  const f = fails.get(key);
  if (!f) return false;
  if (Date.now() > f.until) {
    fails.delete(key);
    return false;
  }
  return f.n >= MAX_FAILS;
}

export function recordPortalLoginFailure(key: string) {
  const now = Date.now();
  const f = fails.get(key);
  if (!f || now > f.until) fails.set(key, { n: 1, until: now + WINDOW_MS });
  else f.n += 1;
}

export function clearPortalLoginFailures(key: string) {
  fails.delete(key);
}
