import { Hono } from "hono";
import { getDb, hasDatabase } from "../db/index.js";
import { getBranding, logoHeaders, quoteTokenOrganizationId, resolveDefaultOrganizationId } from "../services/branding.service.js";
import { readOrganizationLogo } from "../services/organization.service.js";

export const PUBLIC_BRANDING_LOGO_PATH = "/api/public/branding/logo";

function dbOrNull() {
  return hasDatabase() ? getDb() : null;
}

/**
 * Public (no sign-in) white-label branding, mounted at /api/public:
 *   GET /branding                → { name: { th, zh, en } | null, logoUrl }   (the deployment's default company)
 *   GET /branding/logo           → that company's logo image
 *   GET /quotes/:token/logo      → logo of the company that issued a public quotation
 * Nothing else from the company profile is exposed.
 */
export function publicBrandingRoutes() {
  const r = new Hono();

  r.get("/branding", async (c) => {
    const db = dbOrNull();
    if (!db) return c.json({ error: "database_unavailable" }, 503);
    const orgId = await resolveDefaultOrganizationId(db);
    c.header("Cache-Control", "public, max-age=60");
    return c.json(await getBranding(db, orgId, PUBLIC_BRANDING_LOGO_PATH));
  });

  r.get("/branding/logo", async (c) => {
    const db = dbOrNull();
    if (!db) return c.json({ error: "database_unavailable" }, 503);
    const orgId = await resolveDefaultOrganizationId(db);
    const logo = orgId ? await readOrganizationLogo(db, orgId) : null;
    if (!logo) return c.json({ error: "not_found" }, 404);
    return new Response(new Uint8Array(logo.bytes), { headers: logoHeaders(logo.mime, "public") });
  });

  r.get("/quotes/:token/logo", async (c) => {
    const db = dbOrNull();
    if (!db) return c.json({ error: "database_unavailable" }, 503);
    const orgId = await quoteTokenOrganizationId(db, c.req.param("token"));
    const logo = orgId ? await readOrganizationLogo(db, orgId) : null;
    if (!logo) return c.json({ error: "not_found" }, 404);
    return new Response(new Uint8Array(logo.bytes), { headers: logoHeaders(logo.mime, "public") });
  });

  return r;
}
