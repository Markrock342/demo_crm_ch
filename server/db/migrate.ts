import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const dir = dirname(fileURLToPath(import.meta.url));

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

async function ensureMigrationsTable(sql: postgres.Sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;
}

async function appliedFiles(sql: postgres.Sql): Promise<Set<string>> {
  const rows = await sql<{ filename: string }[]>`SELECT filename FROM schema_migrations`;
  return new Set(rows.map((r) => r.filename));
}

async function main() {
  loadDotEnv(".env");
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  const sql = postgres(url, { max: 1 });
  await ensureMigrationsTable(sql);

  const done = await appliedFiles(sql);
  const files = readdirSync(join(dir, "migrations"))
    .filter((f) => f.endsWith(".sql") && !f.startsWith("._"))
    .sort();

  for (const file of files) {
    if (done.has(file)) {
      console.log(`Skip ${file} (already applied)`);
      continue;
    }
    const migration = readFileSync(join(dir, "migrations", file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(migration);
      await tx`INSERT INTO schema_migrations (filename) VALUES (${file})`;
    });
    console.log(`Migration ${file} applied`);
  }

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
