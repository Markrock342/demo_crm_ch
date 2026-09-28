import type { ReactNode } from "react";
import "./kit.css";

type Props = {
  title?: ReactNode;
  /** Right side of the panel head: a link or small button. */
  extra?: ReactNode;
  children: ReactNode;
  /** Remove body padding (for tables/lists that run edge to edge). */
  flush?: boolean;
  className?: string;
};

/** The one surface: a paper panel with a thin rule. Never nest panels. */
export function Panel({ title, extra, children, flush, className }: Props) {
  return (
    <section className={`cz-panel${className ? ` ${className}` : ""}`}>
      {title || extra ? (
        <div className="cz-panel-head">
          {title ? <h2>{title}</h2> : <span />}
          {extra}
        </div>
      ) : null}
      <div className={flush ? "cz-panel-body is-flush" : "cz-panel-body"}>{children}</div>
    </section>
  );
}
