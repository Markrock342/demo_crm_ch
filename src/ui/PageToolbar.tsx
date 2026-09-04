import type { ReactNode } from "react";

type Props = {
  title: string;
  hint?: string;
  count?: number;
  actions?: ReactNode;
  filters?: ReactNode;
};

/** Stable page chrome — title left edge + height stay fixed across routes. */
export function PageToolbar({ title, hint, count, actions, filters }: Props) {
  return (
    <header className="page-toolbar">
      <div className="page-toolbar-top">
        <div className="page-toolbar-lead">
          <div className="page-toolbar-heading">
            <h1>{title}</h1>
            {typeof count === "number" ? <span className="page-count">{count}</span> : null}
          </div>
          <p className="page-toolbar-hint">{hint?.trim() ? hint : "\u00A0"}</p>
        </div>
        {actions ? <div className="page-toolbar-actions">{actions}</div> : <div className="page-toolbar-actions" aria-hidden />}
      </div>
      {filters ? <div className="page-toolbar-filters">{filters}</div> : null}
    </header>
  );
}
