import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { permissions, rolePermissions, roles, userRoles, users } from "../db/schema/index.js";
import { PERMISSIONS, ROLES, permissionsForRoles, type PermissionCode, type RoleCode } from "../domain/rbac.js";
import { writeAudit } from "./audit.service.js";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  nameZh: string | null;
  roles: RoleCode[];
  permissions: PermissionCode[];
};

export async function loginUser(db: Db, email: string, password: string): Promise<AuthUser | null> {
  const normalized = email.toLowerCase().trim();
  const [row] = await db.select().from(users).where(eq(users.email, normalized)).limit(1);
  if (!row?.active) return null;
  const ok = await bcrypt.compare(password, row.passwordHash);
  if (!ok) return null;
  return loadAuthUser(db, row.id);
}

export async function loadAuthUser(db: Db, userId: string): Promise<AuthUser | null> {
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!row?.active) return null;

  const roleRows = await db
    .select({ code: roles.code })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, userId));

  const roleCodes = roleRows.map((r) => r.code as RoleCode);
  const perms = [...permissionsForRoles(roleCodes)];

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    nameZh: row.nameZh,
    roles: roleCodes,
    permissions: perms,
  };
}

export async function seedAuth(db: Db) {
  for (const code of PERMISSIONS) {
    await db.insert(permissions).values({ code, description: code }).onConflictDoNothing({ target: permissions.code });
  }

  const roleNames: Record<RoleCode, string> = {
    SUPER_ADMIN: "Super Admin",
    MANAGEMENT: "Management",
    SALES: "Sales",
    PRICING: "Pricing",
    CUSTOMER_SERVICE: "Customer Service",
    OPERATIONS: "Operations",
    ACCOUNTING: "Accounting",
    VIEWER: "Viewer",
  };

  for (const code of ROLES) {
    await db.insert(roles).values({ code, name: roleNames[code] }).onConflictDoNothing({ target: roles.code });
  }

  const permRows = await db.select().from(permissions);
  const roleRows = await db.select().from(roles);
  const permByCode = Object.fromEntries(permRows.map((p) => [p.code, p.id]));
  const roleByCode = Object.fromEntries(roleRows.map((r) => [r.code, r.id]));

  const { ROLE_PERMISSIONS } = await import("../domain/rbac.js");
  for (const roleCode of ROLES) {
    const roleId = roleByCode[roleCode];
    if (!roleId) continue;
    for (const permCode of ROLE_PERMISSIONS[roleCode]) {
      const permissionId = permByCode[permCode];
      if (!permissionId) continue;
      await db.insert(rolePermissions).values({ roleId, permissionId }).onConflictDoNothing();
    }
  }

  const demoUsers: Array<{ email: string; password: string; name: string; nameZh: string; role: RoleCode }> = [
    { email: "admin@cangzhan.com", password: "demo123", name: "Lin Xiaohang", nameZh: "林晓衡", role: "SUPER_ADMIN" },
    { email: "sales@cangzhan.com", password: "demo123", name: "Zhou Ke", nameZh: "周可", role: "SALES" },
    { email: "ops@cangzhan.com", password: "demo123", name: "Ma Siyuan", nameZh: "马思远", role: "OPERATIONS" },
    { email: "finance@cangzhan.com", password: "demo123", name: "Finance Clerk", nameZh: "财务", role: "ACCOUNTING" },
  ];

  for (const u of demoUsers) {
    const hash = await bcrypt.hash(u.password, 10);
    const [inserted] = await db
      .insert(users)
      .values({ email: u.email, passwordHash: hash, name: u.name, nameZh: u.nameZh })
      .onConflictDoUpdate({
        target: users.email,
        set: { passwordHash: hash, name: u.name, nameZh: u.nameZh, updatedAt: new Date() },
      })
      .returning();

    let userId = inserted?.id;
    if (!userId) {
      const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, u.email)).limit(1);
      userId = existing?.id;
    }

    const roleId = roleByCode[u.role];
    if (userId && roleId) {
      await db.delete(userRoles).where(eq(userRoles.userId, userId));
      await db.insert(userRoles).values({ userId, roleId });
    }
  }

  await writeAudit(db, {
    action: "SEED_AUTH",
    entityType: "system",
    entityId: "auth",
    newValue: { users: demoUsers.map((u) => u.email) },
  });
}
