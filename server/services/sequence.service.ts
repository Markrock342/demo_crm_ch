import { sql } from "drizzle-orm";
import type { Db } from "../db/index.js";

export async function nextDocNumber(db: Db, kind: string, prefix: string): Promise<string> {
  const year = new Date().getFullYear();

  return db.transaction(async (tx) => {
    const rows = await tx.execute<{ last_seq: number }>(sql`
      INSERT INTO doc_sequences (kind, year, last_seq)
      VALUES (${kind}, ${year}, 1)
      ON CONFLICT (kind, year)
      DO UPDATE SET last_seq = doc_sequences.last_seq + 1
      RETURNING last_seq
    `);
    const row = rows[0] as { last_seq: number } | undefined;
    if (!row) throw new Error("doc_sequence_failed");
    return `${prefix}-${year}-${String(row.last_seq).padStart(6, "0")}`;
  });
}
