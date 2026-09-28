import { useSyncExternalStore, type ReactNode } from "react";
import { EmptyState } from "../../components";

const QUERY = "(max-width: 640px)";

function subscribe(cb: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/** True on phone-width screens, where lists switch to stacked rows. */
export function useIsNarrow() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}

export type MobileItem = {
  key: string;
  title: ReactNode;
  status?: ReactNode;
  line2?: ReactNode;
  line3?: ReactNode;
  tone?: "danger";
  onClick?: () => void;
};

/** Stacked rows for phones: identifier + status on line 1, context on line 2. */
export function OpsMobileList({ items, emptyText, emptyAction }: { items: MobileItem[]; emptyText?: string; emptyAction?: ReactNode }) {
  if (!items.length) {
    return (
      <div className="ops-mlist is-empty">
        <EmptyState description={emptyText} action={emptyAction} />
      </div>
    );
  }
  return (
    <ul className="ops-mlist">
      {items.map((it) => (
        <li key={it.key}>
          {it.onClick ? (
            <button type="button" className={`ops-mrow${it.tone ? ` is-${it.tone}` : ""}`} onClick={it.onClick}>
              <RowBody it={it} />
            </button>
          ) : (
            <div className={`ops-mrow is-static${it.tone ? ` is-${it.tone}` : ""}`}>
              <RowBody it={it} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function RowBody({ it }: { it: MobileItem }) {
  return (
    <>
      <span className="ops-mrow-top">
        <span className="ops-mrow-title">{it.title}</span>
        {it.status}
      </span>
      {it.line2 ? <span className="ops-mrow-line">{it.line2}</span> : null}
      {it.line3 ? <span className="ops-mrow-line">{it.line3}</span> : null}
    </>
  );
}
