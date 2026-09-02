import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const dir = dirname(fileURLToPath(import.meta.url));

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  const sql = postgres(url, { max: 1 });
  const files = readdirSync(join(dir, "migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const migration = readFileSync(join(dir, "migrations", file), "utf8");
    await sql.unsafe(migration);
    console.log(`Migration ${file} applied`);
  }
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
