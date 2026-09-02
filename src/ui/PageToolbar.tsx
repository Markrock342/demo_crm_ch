import type { ReactNode } from "react";

type Props = {
  title: string;
  hint?: string;
  count?: number;
  actions?: ReactNode;
  filters?: ReactNode;
};

export function PageToolbar({ title, hint, count, actions, filters }: Props) {
  return (
    <header className="page-toolbar">
      <div className="page-toolbar-top">
        <div className="page-toolbar-title">
          <h1>{title}</h1>
          {typeof count === "number" ? <span className="page-count">{count}</span> : null}
          {hint ? <p>{hint}</p> : null}
        </div>
        {actions ? <div className="page-toolbar-actions">{actions}</div> : null}
      </div>
      {filters ? <div className="page-toolbar-filters">{filters}</div> : null}
    </header>
  );
}
