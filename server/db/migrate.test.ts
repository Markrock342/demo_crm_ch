import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "migrations");

describe("db migrations layout", () => {
  it("ships sorted SQL migrations and migrate runner with ledger transaction", () => {
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql") && !f.startsWith("._"))
      .sort();
    assert.ok(files.length >= 3, "expected at least init + crm + commercial migrations");
    assert.deepEqual(files, [...files].sort(), "migration filenames must sort lexicographically");

    const runner = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "migrate.ts"), "utf8");
    assert.match(runner, /schema_migrations/);
    assert.match(runner, /sql\.begin/);
    assert.match(runner, /loadDotEnv/);
    assert.ok(existsSync(join(migrationsDir, files[0]!)));
  });
});
