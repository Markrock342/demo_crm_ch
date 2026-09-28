import { eq, lt, sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { loginAttempts } from "../db/schema/security.js";

/**
 * Staff login brute-force guard, stored in Postgres so it holds across serverless instances.
 * Same semantics as the customer portal: after 8 failed attempts for one e-mail + IP, further
 * attempts get 429 `too_many_attempts` for 15 minutes (the password is not even checked).
 */
export const LOGIN_MAX_FAILURES = 8;
export const LOGIN_LOCK_MINUTES = 15;

export function loginLockKey(email: string, ip: string) {
  return `${email.trim().toLowerCase()}|${ip || "unknown"}`;
}

/** Client IP from proxy headers (Vercel sets x-real-ip / x-forwarded-for). */
export function clientIp(get: (name: string) => string | string[] | undefined | null): string {
  const pick = (v: string | string[] | undefined | null) => (Array.isArray(v) ? v[0] : v) ?? "";
  const real = pick(get("x-real-ip")).trim();
  if (real) return real;
  const fwd = pick(get("x-forwarded-for")).split(",")[0]?.trim();
  return fwd || "local";
}

/** Seconds until the lock ends, or 0 when the key may try again. */
export async function loginLockRemaining(db: Db, key: string): Promise<number> {
  const [row] = await db
    .select({ lockedUntil: loginAttempts.lockedUntil })
    .from(loginAttempts)
    .where(eq(loginAttempts.key, key))
    .limit(1);
  if (!row?.lockedUntil) return 0;
  const ms = row.lockedUntil.getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 1000) : 0;
}

/** Counts a failure (atomic upsert). Returns the count in the current window and whether it is now locked. */
export async function recordLoginFailure(db: Db, key: string) {
  const [email = "", ip = ""] = key.split("|");
  const window = sql.raw(`interval '${LOGIN_LOCK_MINUTES} minutes'`);
  const expired = sql`(${loginAttempts.windowStartedAt} < now() - ${window} OR (${loginAttempts.lockedUntil} IS NOT NULL AND ${loginAttempts.lockedUntil} <= now()))`;
  const next = sql`CASE WHEN ${expired} THEN 1 ELSE ${loginAttempts.failures} + 1 END`;
  const [row] = await db
    .insert(loginAttempts)
    .values({ key, email, ip, failures: 1 })
    .onConflictDoUpdate({
      target: loginAttempts.key,
      set: {
        failures: next,
        windowStartedAt: sql`CASE WHEN ${expired} THEN now() ELSE ${loginAttempts.windowStartedAt} END`,
        lockedUntil: sql`CASE WHEN ${next} >= ${LOGIN_MAX_FAILURES} THEN now() + ${window} WHEN ${expired} THEN NULL ELSE ${loginAttempts.lockedUntil} END`,
        updatedAt: sql`now()`,
      },
    })
    .returning({ failures: loginAttempts.failures, lockedUntil: loginAttempts.lockedUntil });
  // Opportunistic cleanup of stale rows.
  if (Math.random() < 0.05) {
    await db.delete(loginAttempts).where(lt(loginAttempts.updatedAt, new Date(Date.now() - 24 * 3600 * 1000)));
  }
  return { failures: row?.failures ?? 1, locked: (row?.failures ?? 0) >= LOGIN_MAX_FAILURES };
}

export async function clearLoginFailures(db: Db, key: string) {
  await db.delete(loginAttempts).where(eq(loginAttempts.key, key));
}

/**
 * Records a failed staff login; when this failure triggers the lock, writes a USER_LOGIN_LOCKED
 * audit entry (attributed to the account when the e-mail exists).
 */
export async function noteStaffLoginFailure(db: Db, email: string, ip: string) {
  const res = await recordLoginFailure(db, loginLockKey(email, ip));
  if (res.locked && res.failures === LOGIN_MAX_FAILURES) {
    const { users } = await import("../db/schema/auth.js");
    const { writeAudit } = await import("./audit.service.js");
    const [u] = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${email.trim().toLowerCase()}`)
      .limit(1);
    await writeAudit(db, {
      userId: u?.id ?? null,
      action: "USER_LOGIN_LOCKED",
      entityType: "user",
      entityId: u?.id ?? null,
      newValue: { email: email.trim().toLowerCase(), ip, failures: res.failures, minutes: LOGIN_LOCK_MINUTES },
    });
  }
  return res;
}
