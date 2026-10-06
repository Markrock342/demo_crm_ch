-- Per-organization modules (sales, cs, tracking, docs, yard, finance, automation) + MARKETING role.

-- Module switches live on the company profile: {"finance": false, ...}. A missing key means ON,
-- so existing companies keep every module until an admin turns one off.
ALTER TABLE "organization_profiles" ADD COLUMN IF NOT EXISTS "modules" jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Marketing department role (permissions mirror server/domain/rbac.ts; role checks read rbac.ts,
-- these rows keep the roles table complete so admins can assign the role without a re-seed).
INSERT INTO "roles" ("code", "name") VALUES ('MARKETING', 'Marketing') ON CONFLICT ("code") DO NOTHING;
INSERT INTO "permissions" ("code", "description") VALUES ('report.marketing.view', 'report.marketing.view') ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
  FROM "roles" r
  JOIN "permissions" p ON p."code" IN (
    'customer.view', 'customer.create', 'customer.edit',
    'rate.view_sell', 'rate.sell.view',
    'quotation.view', 'quotation.create', 'quotation.edit', 'quotation.send',
    'shipment.view', 'report.sales.view', 'report.marketing.view', 'activity.create'
  )
 WHERE r."code" = 'MARKETING'
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
  FROM "roles" r
  JOIN "permissions" p ON p."code" = 'report.marketing.view'
 WHERE r."code" IN ('SUPER_ADMIN', 'MANAGEMENT', 'SALES')
ON CONFLICT DO NOTHING;
