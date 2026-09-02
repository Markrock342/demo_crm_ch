import type { MailAnalysis } from "./ai/client";
import type { Box, BoxStatus, Customer } from "./data";
import type { CrmDoc, DocKind, TaskItem } from "./crm";

const boxStatuses: BoxStatus[] = ["yard", "sail", "clear", "hold", "empty"];

export function syncCustomerBoxCounts(customers: Customer[], boxes: Box[]): Customer[] {
  return customers.map((c) => ({
    ...c,
    boxes: boxes.filter((b) => b.customerId === c.id).length,
  }));
}

function mapSuggestedStatus(raw: string): BoxStatus | null {
  const s = raw.toLowerCase();
  for (const st of boxStatuses) {
    if (s.includes(st)) return st;
  }
  return null;
}

function mapDocKind(raw: string): DocKind | null {
  const u = raw.toUpperCase();
  if (u.includes("CO") || u.includes("C/O") || u.includes("产地")) return "CO";
  if (u.includes("BL") || u.includes("B/L") || u.includes("提单")) return "BL";
  if (u.includes("PL") || u.includes("装箱")) return "PL";
  if (u.includes("CI") || u.includes("发票")) return "CI";
  if (u.includes("BOOK") || u.includes("订舱")) return "BOOK";
  return null;
}

function stamp() {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export type OpsApplyResult = {
  boxes: Box[];
  docs: CrmDoc[];
  tasks: TaskItem[];
  applied: string[];
};

export function applyMailOps(
  a: MailAnalysis,
  boxes: Box[],
  docs: CrmDoc[],
  tasks: TaskItem[],
  mailCustomerId: string,
): OpsApplyResult {
  const applied: string[] = [];
  let nextBoxes = [...boxes];
  let nextDocs = [...docs];
  let nextTasks = [...tasks];

  const status = mapSuggestedStatus(a.suggestedStatus);
  const boxIds = a.boxIds?.length ? a.boxIds : [];

  if (status && boxIds.length) {
    nextBoxes = nextBoxes.map((b) => {
      if (boxIds.includes(b.id)) {
        applied.push(`box:${b.id}:${status}`);
        return { ...b, status };
      }
      return b;
    });
  }

  for (const raw of a.docsMissing ?? []) {
    const kind = mapDocKind(raw);
    if (!kind) continue;
    const boxId = boxIds[0] ?? nextBoxes.find((b) => b.customerId === (a.customerId || mailCustomerId))?.id ?? "";
    if (!boxId) continue;
    const customerId = nextBoxes.find((b) => b.id === boxId)?.customerId ?? a.customerId ?? mailCustomerId;
    const existing = nextDocs.find((d) => d.boxId === boxId && d.kind === kind);
    if (existing) {
      if (existing.status === "ok") continue;
      nextDocs = nextDocs.map((d) => (d.id === existing.id ? { ...d, status: "wait", updated: stamp() } : d));
      applied.push(`doc:${existing.id}:wait`);
    } else {
      const id = `f${Date.now()}${Math.random().toString(36).slice(2, 5)}`;
      nextDocs = [
        {
          id,
          customerId,
          boxId,
          kind,
          name: `${kind} ${boxId}`,
          status: "wait",
          updated: stamp(),
        },
        ...nextDocs,
      ];
      applied.push(`doc:${id}:new`);
    }
  }

  if (a.needsHuman && boxIds.length) {
    const title = `Review mail: ${boxIds.join(", ")}`;
    if (!nextTasks.some((t) => !t.done && t.title === title)) {
      nextTasks = [
        {
          id: `t${Date.now()}`,
          title,
          due: stamp(),
          owner: "林晓衡",
          priority: "high",
          done: false,
          customerId: a.customerId || mailCustomerId,
          boxId: boxIds[0],
        },
        ...nextTasks,
      ];
      applied.push("task:review");
    }
  }

  return { boxes: nextBoxes, docs: nextDocs, tasks: nextTasks, applied };
}
