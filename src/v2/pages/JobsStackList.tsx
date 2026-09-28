import type { ReactNode } from "react";
import { EmptyState, LoadingState } from "../components";
import "./jobs.css";

export type StackItem = {
  key: string;
  title: ReactNode;
  status?: ReactNode;
  sub?: ReactNode;
  onOpen: () => void;
};

/** Phone-width list: id + status on line 1, customer + lane on line 2. */
export function JobsStackList({
  items,
  loading,
  emptyText,
  emptyAction,
}: {
  items: StackItem[];
  loading?: boolean;
  emptyText?: string;
  emptyAction?: ReactNode;
}) {
  if (loading) return <LoadingState />;
  if (!items.length) {
    return (
      <div className="cz-table">
        <EmptyState description={emptyText} action={emptyAction} />
      </div>
    );
  }
  return (
    <ul className="jobs-stack">
      {items.map((it) => (
        <li key={it.key}>
          <button type="button" className="jobs-stack-row" onClick={it.onOpen}>
            <span className="jobs-stack-line">
              <span className="cz-cell-main">{it.title}</span>
              {it.status}
            </span>
            {it.sub ? <span className="jobs-stack-sub">{it.sub}</span> : null}
          </button>
        </li>
      ))}
    </ul>
  );
}
