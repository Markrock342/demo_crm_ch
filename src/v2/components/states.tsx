import { Result, Spin } from "antd";
import type { ReactNode } from "react";
import "./kit.css";

type EmptyProps = { title?: string; description?: string; action?: ReactNode };

/** Empty state that tells people what to do next, not just "no data". */
export function EmptyState({ title, description, action }: EmptyProps) {
  return (
    <div className="cz-empty">
      <svg width="56" height="40" viewBox="0 0 56 40" aria-hidden>
        <rect x="1" y="9" width="54" height="30" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10 9V1h36v8M14 17v14M22 17v14M30 17v14M38 17v14M46 17v14" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      {title ? <p className="cz-empty-title">{title}</p> : null}
      {description ? <p className="cz-empty-desc">{description}</p> : null}
      {action ? <div className="cz-empty-action">{action}</div> : null}
    </div>
  );
}

export function LoadingState({ tip }: { tip?: string }) {
  return (
    <div className="cz-loading">
      <Spin />
      {tip ? <span>{tip}</span> : null}
    </div>
  );
}

export function ErrorState({ title, subTitle, action }: { title?: string; subTitle?: string; action?: ReactNode }) {
  return <Result status="warning" title={title ?? "Something went wrong"} subTitle={subTitle} extra={action} />;
}
