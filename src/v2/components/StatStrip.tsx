import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import "./kit.css";

export type Stat = {
  label: string;
  value: ReactNode;
  /** Small line under the value — context, not decoration. */
  hint?: ReactNode;
  tone?: "default" | "warning" | "danger" | "success";
  to?: string;
};

/** A single ruled strip of key numbers (not a grid of cards). Each stat can link to its filtered list. */
export function StatStrip({ stats }: { stats: Stat[] }) {
  return (
    <dl className="cz-stats" style={{ ["--n" as string]: stats.length }}>
      {stats.map((s) => {
        const body = (
          <>
            <dt>{s.label}</dt>
            <dd className={`is-${s.tone ?? "default"}`}>{s.value}</dd>
            {s.hint ? <dd className="cz-stat-hint">{s.hint}</dd> : null}
          </>
        );
        return s.to ? (
          <Link key={s.label} to={s.to} className="cz-stat is-link">
            {body}
          </Link>
        ) : (
          <div key={s.label} className="cz-stat">
            {body}
          </div>
        );
      })}
    </dl>
  );
}
