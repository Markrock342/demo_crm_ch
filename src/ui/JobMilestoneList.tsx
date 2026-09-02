import type { MilestoneDto } from "../api/operations.ts";
import { Check } from "./Check.tsx";
import { formatMilestoneDate, milestoneIsOverdue } from "../demo/milestones-demo.ts";

type Props = {
  items: MilestoneDto[];
  onToggle: (code: string, complete: boolean) => void;
};

export function JobMilestoneList({ items, onToggle }: Props) {
  if (items.length === 0) return null;

  return (
    <ul className="milestone-list">
      {items.map((m) => {
        const done = !!m.actualAt;
        const overdue = milestoneIsOverdue(m);
        return (
          <li key={m.id} className={`milestone-row${done ? " is-done" : ""}${overdue ? " is-overdue" : ""}`}>
            <Check checked={done} onChange={() => onToggle(m.code, !done)} label={m.label} />
            <time className="num">{formatMilestoneDate(m.plannedAt)}</time>
          </li>
        );
      })}
    </ul>
  );
}
