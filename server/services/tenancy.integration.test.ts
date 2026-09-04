import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function dbConnectionError(e: unknown): string | null {
  let cur: unknown = e;
  for (let depth = 0; depth < 6 && cur; depth++) {
    const msg = cur instanceof Error ? cur.message : String(cur);
    if (/does not exist|ECONNREFUSED|authentication failed|connect ETIMEDOUT|database unavailable/i.test(msg)) {
      return msg;
    }
    cur = cur instanceof Error ? (cur as Error & { cause?: unknown }).cause : undefined;
  }
  return null;
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadDotEnv(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
}

describe("tenant isolation integration", () => {
  it("tenant B cannot read tenant A job via getJob", async (t) => {
    loadDotEnv(join(root, ".env"));
    if (!process.env.DATABASE_URL) {
      t.skip("DATABASE_URL not set");
      return;
    }

    const { getDb, closeDb } = await import("../db/index.js");
    const { getJob, listJobs } = await import("./operations.service.js");
    const { DEMO_ORG_ID } = await import("../domain/tenancy.js");
    const { organizations } = await import("../db/schema/tenancy.js");
    const { jobs } = await import("../db/schema/operations.js");
    const { eq } = await import("drizzle-orm");

    const db = getDb();
    if (!db) {
      t.skip("database unavailable");
      return;
    }

    try {
      const orgB = "22222222-2222-4222-8222-222222222222";
      await db
        .insert(organizations)
        .values({ id: orgB, slug: "isolation-test-b", name: "Isolation Test B" })
        .onConflictDoNothing();

      const [existing] = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.organizationId, DEMO_ORG_ID)).limit(1);
      if (!existing) {
        t.skip("no seeded jobs — run db:seed");
        return;
      }

      assert.equal(await getJob(db, orgB, existing.id), null);
      const tenantA = await listJobs(db, DEMO_ORG_ID);
      const tenantB = await listJobs(db, orgB);
      assert.ok(tenantA.length > 0);
      assert.equal(tenantB.length, 0);
    } catch (e) {
      const reason = dbConnectionError(e);
      if (reason) {
        t.skip(`database unavailable: ${reason}`);
        return;
      }
      throw e;
    } finally {
      await closeDb();
    }
  });
});
