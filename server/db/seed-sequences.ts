import { sql } from "drizzle-orm";
import type { Db } from "./index.js";
import { quotations } from "./schema/commercial.js";
import { bookings, jobs } from "./schema/operations.js";

type SequenceSource = {
  kind: string;
  prefix: string;
  numbers: string[];
};

function maxSeqForYear(numbers: string[], prefix: string, year: number): number {
  let max = 0;
  const re = new RegExp(`^${prefix}-(\\d+)-(\\d+)$`);
  for (const n of numbers) {
    const m = n.match(re);
    if (m && Number(m[1]) === year) max = Math.max(max, Number(m[2]));
  }
  return max;
}

async function collectSequenceSources(db: Db): Promise<SequenceSource[]> {
  const [jobRows, quoteRows, bookingRows] = await Promise.all([
    db.select({ n: jobs.jobNumber }).from(jobs),
    db.select({ n: quotations.quotationNumber }).from(quotations),
    db.select({ n: bookings.bookingNumber }).from(bookings),
  ]);

  return [
    { kind: "JOB", prefix: "JOB", numbers: jobRows.map((r) => r.n) },
    { kind: "QT", prefix: "QT", numbers: quoteRows.map((r) => r.n) },
    { kind: "BK", prefix: "BK", numbers: bookingRows.map((r) => r.n) },
  ];
}

/** Align doc_sequences with existing numbered rows so new documents never collide with seed data. */
export async function syncDocSequences(db: Db) {
  const year = new Date().getFullYear();
  const sources = await collectSequenceSources(db);

  for (const { kind, prefix, numbers } of sources) {
    const max = maxSeqForYear(numbers, prefix, year);
    if (max <= 0) continue;
    await db.execute(sql`
      INSERT INTO doc_sequences (kind, year, last_seq)
      VALUES (${kind}, ${year}, ${max})
      ON CONFLICT (kind, year)
      DO UPDATE SET last_seq = GREATEST(doc_sequences.last_seq, EXCLUDED.last_seq)
    `);
  }
}
