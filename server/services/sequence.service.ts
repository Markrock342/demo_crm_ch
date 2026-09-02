import { sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { docSequences } from "../db/schema/commercial.js";

export async function nextDocNumber(db: Db, kind: string, prefix: string): Promise<string> {
  const year = new Date().getFullYear();

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(docSequences)
      .where(sql`${docSequences.kind} = ${kind} AND ${docSequences.year} = ${year}`)
      .limit(1);

    let seq: number;
    if (!existing) {
      await tx.insert(docSequences).values({ kind, year, lastSeq: 1 });
      seq = 1;
    } else {
      seq = existing.lastSeq + 1;
      await tx.update(docSequences).set({ lastSeq: seq }).where(sql`${docSequences.kind} = ${kind} AND ${docSequences.year} = ${year}`);
    }

    return `${prefix}-${year}-${String(seq).padStart(6, "0")}`;
  });
}
