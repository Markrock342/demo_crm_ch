import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { roles, userRoles, users } from "../db/schema/auth.js";
import { organizationMembers } from "../db/schema/tenancy.js";
import { ROLES, type RoleCode } from "../domain/rbac.js";
import { writeAudit } from "./audit.service.js";
// Circular with middleware/auth.ts (it imports isSessionStale from here); only used inside functions, so safe.
import { forgetAuth } from "../middleware/auth.js";

export type OrgUserDto = {
  id: string;
  name: string;
  nameZh: string | null;
  nameTh: string | null;
  email: string;
  roles: string[];
  orgRole: string;
  active: boolean;
  createdAt?: string;
};

/** bcrypt cost — same as the auth seed (auth.service.ts). */
const BCRYPT_ROUNDS = 10;
export const ADMIN_ROLE: RoleCode = "SUPER_ADMIN";

/** Error thrown by the admin / account services; `code` maps to an HTTP status in the routes. */
export class UserAdminError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Password rules
// ---------------------------------------------------------------------------

const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "12345678",
  "123456789",
  "1234567890",
  "qwerty123",
  "qwertyuiop",
  "11111111",
  "00000000",
  "abc12345",
  "abcd1234",
  "iloveyou1",
  "admin123",
  "admin1234",
  "welcome1",
  "letmein1",
  "demo1234",
  "cangzhan1",
  "cangzhan123",
]);

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

/**
 * Returns null when the password is acceptable, otherwise an error code:
 * password_too_short | password_too_long | password_needs_letter_and_digit | password_too_common | password_contains_email
 */
export function passwordProblem(password: string, email?: string | null): string | null {
  if (password.length < PASSWORD_MIN) return "password_too_short";
  if (password.length > PASSWORD_MAX) return "password_too_long";
  if (!/\p{L}/u.test(password) || !/\d/.test(password)) return "password_needs_letter_and_digit";
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return "password_too_common";
  const local = email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && password.toLowerCase().includes(local)) return "password_contains_email";
  return null;
}

const TEMP_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Random temporary password (12 chars, no look-alike characters, always letters + digits). */
export function generateTempPassword(length = 12): string {
  for (;;) {
    let out = "";
    for (let i = 0; i < length; i++) out += TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)];
    if (!passwordProblem(out)) return out;
  }
}

export function hashPassword(password: string) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/** True when a session issued at `iatSeconds` predates the user's last password change. */
export function isSessionStale(iatSeconds: number | undefined, passwordChangedAt: Date | null | undefined): boolean {
  if (!passwordChangedAt) return false;
  if (typeof iatSeconds !== "number") return true;
  return iatSeconds < Math.floor(passwordChangedAt.getTime() / 1000);
}

export async function passwordChangedAtFor(db: Db, userId: string): Promise<Date | null> {
  const [row] = await db.select({ at: users.passwordChangedAt }).from(users).where(eq(users.id, userId)).limit(1);
  return row?.at ?? null;
}

// ---------------------------------------------------------------------------
// People directory
// ---------------------------------------------------------------------------

/** Members of one organization (people directory for owner pickers / avatars). No secrets. */
export async function listOrganizationUsers(
  db: Db,
  organizationId: string,
  opts: { includeInactive?: boolean } = {},
): Promise<OrgUserDto[]> {
  const where = opts.includeInactive
    ? eq(organizationMembers.organizationId, organizationId)
    : and(eq(organizationMembers.organizationId, organizationId), eq(users.active, true));
  const members = await db
    .select({
      id: users.id,
      name: users.name,
      nameZh: users.nameZh,
      nameTh: users.nameTh,
      email: users.email,
      active: users.active,
      orgRole: organizationMembers.orgRole,
      createdAt: users.createdAt,
    })
    .from(organizationMembers)
    .innerJoin(users, eq(organizationMembers.userId, users.id))
    .where(where)
    .orderBy(asc(users.name));

  if (!members.length) return [];
  const roleRows = await db
    .select({ userId: userRoles.userId, code: roles.code })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(
      inArray(
        userRoles.userId,
        members.map((m) => m.id),
      ),
    );

  return members.map((m) => ({
    ...m,
    createdAt: m.createdAt.toISOString(),
    roles: roleRows.filter((r) => r.userId === m.id).map((r) => r.code),
  }));
}

async function getOrgUser(db: Db, organizationId: string, userId: string): Promise<OrgUserDto> {
  const list = await listOrganizationUsers(db, organizationId, { includeInactive: true });
  const u = list.find((x) => x.id === userId);
  if (!u) throw new UserAdminError("user_not_found");
  return u;
}

/** Active members of the org holding the admin role, optionally ignoring one user. */
async function countActiveAdmins(db: Db, organizationId: string, excludeUserId?: string): Promise<number> {
  const conds = [
    eq(organizationMembers.organizationId, organizationId),
    eq(users.active, true),
    eq(roles.code, ADMIN_ROLE),
  ];
  if (excludeUserId) conds.push(ne(users.id, excludeUserId));
  const [row] = await db
    .select({ n: sql<number>`count(distinct ${users.id})::int` })
    .from(organizationMembers)
    .innerJoin(users, eq(organizationMembers.userId, users.id))
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(and(...conds));
  return row?.n ?? 0;
}

async function roleIdFor(db: Db, code: RoleCode): Promise<string> {
  const [row] = await db.select({ id: roles.id }).from(roles).where(eq(roles.code, code)).limit(1);
  if (!row) throw new UserAdminError("invalid_role");
  return row.id;
}

function assertRole(role: string): asserts role is RoleCode {
  if (!(ROLES as readonly string[]).includes(role)) throw new UserAdminError("invalid_role");
}

// ---------------------------------------------------------------------------
// Admin: create / update / reset
// ---------------------------------------------------------------------------

export type CreateUserInput = {
  email: string;
  name: string;
  nameZh?: string | null;
  nameTh?: string | null;
  role: string;
  /** Admin-chosen password; when omitted a temporary one is generated and returned once. */
  password?: string | null;
};

export async function createOrgUser(
  db: Db,
  organizationId: string,
  actorId: string,
  input: CreateUserInput,
): Promise<{ user: OrgUserDto; tempPassword: string | null }> {
  assertRole(input.role);
  const email = input.email.toLowerCase().trim();
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) throw new UserAdminError("email_taken");

  const chosen = input.password?.trim() ? input.password : null;
  if (chosen) {
    const problem = passwordProblem(chosen, email);
    if (problem) throw new UserAdminError(problem);
  }
  const password = chosen ?? generateTempPassword();
  const roleId = await roleIdFor(db, input.role);

  const userId = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(users)
      .values({
        email,
        passwordHash: await hashPassword(password),
        name: input.name.trim(),
        nameZh: input.nameZh?.trim() || null,
        nameTh: input.nameTh?.trim() || null,
        passwordChangedAt: new Date(),
      })
      .returning({ id: users.id });
    await tx.insert(userRoles).values({ userId: row!.id, roleId });
    await tx
      .insert(organizationMembers)
      .values({ organizationId, userId: row!.id, orgRole: input.role === ADMIN_ROLE ? "admin" : "member" });
    return row!.id;
  });

  await writeAudit(db, {
    userId: actorId,
    organizationId,
    action: "USER_CREATE",
    entityType: "user",
    entityId: userId,
    newValue: { email, role: input.role, organizationId },
  });

  return { user: await getOrgUser(db, organizationId, userId), tempPassword: chosen ? null : password };
}

export type UpdateUserInput = {
  name?: string;
  nameZh?: string | null;
  nameTh?: string | null;
  role?: string;
  active?: boolean;
};

export async function updateOrgUser(
  db: Db,
  organizationId: string,
  actorId: string,
  userId: string,
  input: UpdateUserInput,
): Promise<OrgUserDto> {
  const before = await getOrgUser(db, organizationId, userId);
  if (input.role !== undefined) assertRole(input.role);

  const wasAdmin = before.active && before.roles.includes(ADMIN_ROLE);
  const staysAdmin =
    (input.active ?? before.active) && (input.role !== undefined ? input.role === ADMIN_ROLE : before.roles.includes(ADMIN_ROLE));
  if (wasAdmin && !staysAdmin && (await countActiveAdmins(db, organizationId, userId)) === 0) {
    throw new UserAdminError("last_admin");
  }
  if (input.active === false && userId === actorId) throw new UserAdminError("cannot_deactivate_self");

  await db.transaction(async (tx) => {
    const patch: Partial<typeof users.$inferInsert> = {};
    if (input.name !== undefined) patch.name = input.name.trim();
    if (input.nameZh !== undefined) patch.nameZh = input.nameZh?.trim() || null;
    if (input.nameTh !== undefined) patch.nameTh = input.nameTh?.trim() || null;
    if (input.active !== undefined) patch.active = input.active;
    if (Object.keys(patch).length) {
      await tx
        .update(users)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(users.id, userId));
    }
    if (input.role !== undefined && !(before.roles.length === 1 && before.roles[0] === input.role)) {
      const roleId = await roleIdFor(db, input.role as RoleCode);
      await tx.delete(userRoles).where(eq(userRoles.userId, userId));
      await tx.insert(userRoles).values({ userId, roleId });
      if (before.orgRole !== "owner") {
        await tx
          .update(organizationMembers)
          .set({ orgRole: input.role === ADMIN_ROLE ? "admin" : "member" })
          .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, userId)));
      }
    }
  });

  // Role / active changes must apply on the user's very next request, not after the auth cache TTL.
  forgetAuth(userId);
  const after = await getOrgUser(db, organizationId, userId);
  await writeAudit(db, {
    userId: actorId,
    organizationId,
    action: input.active === false ? "USER_DEACTIVATE" : input.active === true && !before.active ? "USER_REACTIVATE" : "USER_UPDATE",
    entityType: "user",
    entityId: userId,
    oldValue: { name: before.name, nameZh: before.nameZh, nameTh: before.nameTh, roles: before.roles, active: before.active },
    newValue: { name: after.name, nameZh: after.nameZh, nameTh: after.nameTh, roles: after.roles, active: after.active },
  });
  return after;
}

/** Admin reset: sets a new password (given or generated) and signs the user out everywhere. */
export async function resetOrgUserPassword(
  db: Db,
  organizationId: string,
  actorId: string,
  userId: string,
  password?: string | null,
): Promise<{ tempPassword: string | null }> {
  const target = await getOrgUser(db, organizationId, userId);
  const chosen = password?.trim() ? password : null;
  if (chosen) {
    const problem = passwordProblem(chosen, target.email);
    if (problem) throw new UserAdminError(problem);
  }
  const next = chosen ?? generateTempPassword();
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(next), passwordChangedAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, userId));
  forgetAuth(userId);
  await writeAudit(db, { userId: actorId, organizationId, action: "USER_PASSWORD_RESET", entityType: "user", entityId: userId });
  return { tempPassword: chosen ? null : next };
}

// ---------------------------------------------------------------------------
// Self-service account
// ---------------------------------------------------------------------------

export type AccountDto = {
  id: string;
  email: string;
  name: string;
  nameZh: string | null;
  nameTh: string | null;
  roles: string[];
  passwordChangedAt: string | null;
};

export async function getAccount(db: Db, userId: string): Promise<AccountDto> {
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!row) throw new UserAdminError("user_not_found");
  const roleRows = await db
    .select({ code: roles.code })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, userId));
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    nameZh: row.nameZh,
    nameTh: row.nameTh,
    roles: roleRows.map((r) => r.code),
    passwordChangedAt: row.passwordChangedAt?.toISOString() ?? null,
  };
}

export async function updateAccountNames(
  db: Db,
  userId: string,
  input: { name: string; nameZh?: string | null; nameTh?: string | null },
): Promise<AccountDto> {
  await db
    .update(users)
    .set({ name: input.name.trim(), nameZh: input.nameZh?.trim() || null, nameTh: input.nameTh?.trim() || null, updatedAt: new Date() })
    .where(eq(users.id, userId));
  forgetAuth(userId);
  await writeAudit(db, { userId, action: "ACCOUNT_UPDATE", entityType: "user", entityId: userId, newValue: input });
  return getAccount(db, userId);
}

/**
 * Change one's own password. Verifies the current password, applies the strength rules and
 * stamps password_changed_at so sessions issued earlier (other devices) stop working.
 * Returns the change instant so the caller can issue a fresh session for this device.
 */
export async function changeOwnPassword(db: Db, userId: string, currentPassword: string, newPassword: string): Promise<Date> {
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!row?.active) throw new UserAdminError("user_not_found");
  const ok = await bcrypt.compare(currentPassword, row.passwordHash);
  if (!ok) throw new UserAdminError("wrong_password");
  if (currentPassword === newPassword) throw new UserAdminError("password_unchanged");
  const problem = passwordProblem(newPassword, row.email);
  if (problem) throw new UserAdminError(problem);
  const at = new Date();
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(newPassword), passwordChangedAt: at, updatedAt: at })
    .where(eq(users.id, userId));
  forgetAuth(userId);
  await writeAudit(db, { userId, action: "ACCOUNT_PASSWORD_CHANGE", entityType: "user", entityId: userId });
  return at;
}
