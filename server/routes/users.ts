import { Hono, type Context } from "hono";
import { z } from "zod";
import { getDb, hasDatabase, type Db } from "../db/index.js";
import { ROLES } from "../domain/rbac.js";
import { sessionCookie, signSession } from "../lib/jwt.js";
import { authMiddleware, requireAuth, requirePermission, requireTenant, type AuthEnv } from "../middleware/auth.js";
import {
  LOGO_MAX_BYTES,
  getOrganizationProfile,
  readOrganizationLogo,
  removeOrganizationLogo,
  saveOrganizationLogo,
  updateOrganizationProfile,
} from "../services/organization.service.js";
import {
  UserAdminError,
  changeOwnPassword,
  createOrgUser,
  getAccount,
  listOrganizationUsers,
  resetOrgUserPassword,
  updateAccountNames,
  updateOrgUser,
} from "../services/users.service.js";

const ERROR_STATUS: Record<string, number> = {
  user_not_found: 404,
  email_taken: 409,
  invalid_role: 400,
  last_admin: 409,
  cannot_deactivate_self: 409,
  wrong_password: 400,
  password_unchanged: 400,
  password_too_short: 400,
  password_too_long: 400,
  password_needs_letter_and_digit: 400,
  password_too_common: 400,
  password_contains_email: 400,
};

const name = z.string().trim().min(1).max(120);
const optName = z.string().trim().max(120).optional().nullable();
const roleEnum = z.enum(ROLES);

const createUserSchema = z.object({
  email: z.string().trim().email().max(200),
  name,
  nameZh: optName,
  nameTh: optName,
  role: roleEnum,
  password: z.string().max(128).optional().nullable(),
});

const updateUserSchema = z
  .object({ name: name.optional(), nameZh: optName, nameTh: optName, role: roleEnum.optional(), active: z.boolean().optional() })
  .strict();

const resetSchema = z.object({ password: z.string().max(128).optional().nullable() });
const accountSchema = z.object({ name, nameZh: optName, nameTh: optName });
const passwordSchema = z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().min(1).max(200) });

const optText = (max: number) => z.string().max(max).optional().nullable();
const orgPatchSchema = z
  .object({
    nameEn: z.string().trim().min(1).max(200).optional(),
    nameTh: optText(200),
    nameZh: optText(200),
    taxId: z
      .string()
      .trim()
      .regex(/^[0-9-]{0,20}$/)
      .optional()
      .nullable(),
    branchType: z.enum(["head_office", "branch"]).optional(),
    branchCode: z
      .string()
      .trim()
      .regex(/^[0-9]{0,5}$/)
      .optional()
      .nullable(),
    addressEn: optText(500),
    addressTh: optText(500),
    addressZh: optText(500),
    phone: optText(60),
    email: z.union([z.string().trim().email().max(200), z.literal("")]).optional().nullable(),
    website: optText(200),
    bankName: optText(120),
    bankBranch: optText(120),
    bankAccountName: optText(200),
    bankAccountNo: optText(60),
    bankSwift: optText(20),
    defaultCurrency: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{3}$/)
      .optional(),
    invoiceFooter: optText(1000),
    quotationFooter: optText(1000),
  })
  .strict();

function dbOr503(c: Context<AuthEnv>): Db | Response {
  if (!hasDatabase()) return c.json({ error: "database_unconfigured" }, 503);
  const db = getDb();
  if (!db) return c.json({ error: "database_unavailable" }, 503);
  return db;
}

async function parse<T extends z.ZodType>(c: Context<AuthEnv>, schema: T): Promise<{ data: z.infer<T> } | { error: Response }> {
  const raw = await c.req.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: c.json(
        { error: "invalid_body", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
        400,
      ),
    };
  }
  return { data: parsed.data };
}

function fail(c: Context<AuthEnv>, e: unknown) {
  if (e instanceof UserAdminError) return c.json({ error: e.code }, (ERROR_STATUS[e.code] ?? 400) as 400);
  throw e;
}

const gate = [requireAuth(), requireTenant()] as const;
const adminGate = [requireAuth(), requireTenant(), requirePermission("user.manage")] as const;

export function usersRoutes() {
  const r = new Hono<AuthEnv>();
  r.use("*", authMiddleware);

  /**
   * Org members (id, names, email, roles) so the UI can show people instead of ids.
   * Admins may pass ?all=1 to include deactivated accounts (user management).
   */
  r.get("/users", ...gate, async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const wantAll = c.req.query("all") === "1";
    const isAdmin = c.get("user")!.permissions.includes("user.manage") || c.get("user")!.roles.includes("SUPER_ADMIN");
    return c.json({ items: await listOrganizationUsers(db, c.get("organizationId")!, { includeInactive: wantAll && isAdmin }) });
  });

  r.get("/roles", ...gate, (c) => c.json({ items: ROLES }));

  r.post("/users", ...adminGate, async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const body = await parse(c, createUserSchema);
    if ("error" in body) return body.error;
    try {
      const out = await createOrgUser(db, c.get("organizationId")!, c.get("user")!.id, body.data);
      return c.json(out, 201);
    } catch (e) {
      return fail(c, e);
    }
  });

  r.patch("/users/:id", ...adminGate, async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const body = await parse(c, updateUserSchema);
    if ("error" in body) return body.error;
    try {
      const user = await updateOrgUser(db, c.get("organizationId")!, c.get("user")!.id, c.req.param("id"), body.data);
      return c.json({ user });
    } catch (e) {
      return fail(c, e);
    }
  });

  r.post("/users/:id/reset-password", ...adminGate, async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const body = await parse(c, resetSchema);
    if ("error" in body) return body.error;
    try {
      const out = await resetOrgUserPassword(db, c.get("organizationId")!, c.get("user")!.id, c.req.param("id"), body.data.password);
      return c.json(out);
    } catch (e) {
      return fail(c, e);
    }
  });

  // ---- My account -------------------------------------------------------

  r.get("/account", ...gate, async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    return c.json({ account: await getAccount(db, c.get("user")!.id) });
  });

  r.patch("/account", ...gate, async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const body = await parse(c, accountSchema);
    if ("error" in body) return body.error;
    return c.json({ account: await updateAccountNames(db, c.get("user")!.id, body.data) });
  });

  r.post("/account/password", ...gate, async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const body = await parse(c, passwordSchema);
    if ("error" in body) return body.error;
    const user = c.get("user")!;
    try {
      await changeOwnPassword(db, user.id, body.data.currentPassword, body.data.newPassword);
    } catch (e) {
      return fail(c, e);
    }
    // Other devices are now signed out (password_changed_at); keep this one signed in.
    const token = await signSession({
      sub: user.id,
      email: user.email,
      roles: user.roles,
      permissions: user.permissions,
      orgId: c.get("organizationId")!,
    });
    c.header("Set-Cookie", sessionCookie(token));
    return c.json({ ok: true });
  });

  // ---- Organization (company profile) ------------------------------------

  r.get("/organization", ...gate, async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const org = await getOrganizationProfile(db, c.get("organizationId")!);
    if (!org) return c.json({ error: "not_found" }, 404);
    return c.json({ organization: org });
  });

  r.patch("/organization", ...adminGate, async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const body = await parse(c, orgPatchSchema);
    if ("error" in body) return body.error;
    const org = await updateOrganizationProfile(db, c.get("organizationId")!, c.get("user")!.id, body.data);
    return c.json({ organization: org });
  });

  r.get("/organization/logo", ...gate, async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const logo = await readOrganizationLogo(db, c.get("organizationId")!);
    if (!logo) return c.json({ error: "not_found" }, 404);
    return new Response(new Uint8Array(logo.bytes), {
      headers: { "Content-Type": logo.mime, "Cache-Control": "private, max-age=300" },
    });
  });

  r.post("/organization/logo", ...adminGate, async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const form = await c.req.formData().catch(() => null);
    const file = form?.get("file");
    if (!file || typeof file === "string") return c.json({ error: "invalid_body" }, 400);
    if (file.size > LOGO_MAX_BYTES) return c.json({ error: "logo_too_large" }, 413);
    try {
      const org = await saveOrganizationLogo(db, c.get("organizationId")!, c.get("user")!.id, Buffer.from(await file.arrayBuffer()));
      return c.json({ organization: org });
    } catch (e) {
      const code = e instanceof Error ? e.message : "bad_request";
      if (code === "logo_too_large") return c.json({ error: code }, 413);
      if (code === "logo_invalid_type") return c.json({ error: code }, 415);
      throw e;
    }
  });

  r.delete("/organization/logo", ...adminGate, async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    return c.json({ organization: await removeOrganizationLogo(db, c.get("organizationId")!, c.get("user")!.id) });
  });

  return r;
}
