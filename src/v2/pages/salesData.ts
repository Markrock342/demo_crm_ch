/** Per-customer money shapes (the numbers come from GET /api/customers?stats=1 — customer-list.service.ts). */

/** Receivable split by age: not yet due / overdue ≤30 days / overdue >30 days. */
export type ArAging = { current: number; late: number; veryLate: number };

export type CustomerMoney = {
  activeJobs: number;
  balance: number;
  currency: string;
  aging: ArAging;
};

export function agingOf(balance: number, dueDate: string | null | undefined, now = Date.now()): keyof ArAging {
  if (!dueDate || balance <= 0) return "current";
  const days = (now - new Date(dueDate).getTime()) / 86_400_000;
  if (Number.isNaN(days) || days <= 0) return "current";
  return days > 30 ? "veryLate" : "late";
}
