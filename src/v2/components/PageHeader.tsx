import { ArrowLeft } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import "./kit.css";

type Props = {
  title: ReactNode;
  /** One short line: what this page is for, or live counts. Not a restatement of the title. */
  subtitle?: ReactNode;
  /** Adds a "back" link above the title (detail pages). */
  back?: { to: string; label: string };
  /** @deprecated kept for older callers — rendered as a back link to the last crumb with an href. */
  breadcrumbs?: { title: string; href?: string }[];
  /** Page actions, right-aligned. Put the ONE primary action last. */
  extra?: ReactNode;
  /** Rendered under the title row: tabs, filter bar, stat strip. */
  children?: ReactNode;
};

export function PageHeader({ title, subtitle, back, breadcrumbs, extra, children }: Props) {
  const crumb = back ?? (() => {
    const b = breadcrumbs?.filter((x) => x.href).at(-1);
    return b?.href ? { to: b.href, label: b.title } : undefined;
  })();

  return (
    <header className="cz-page-head">
      {crumb ? (
        <Link to={crumb.to} className="cz-back">
          <ArrowLeft size={14} aria-hidden />
          {crumb.label}
        </Link>
      ) : null}
      <div className="cz-page-row">
        <div className="cz-page-titles">
          <h1 className="cz-page-title">{title}</h1>
          {subtitle ? <div className="cz-page-sub">{subtitle}</div> : null}
        </div>
        {extra ? <div className="cz-page-actions">{extra}</div> : null}
      </div>
      {children ? <div className="cz-page-below">{children}</div> : null}
    </header>
  );
}
