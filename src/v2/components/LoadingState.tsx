import { Spin } from "antd";
import "./kit.css";

/** Kept in its own module so route-level Suspense fallbacks don't pull the rest of the kit into the entry chunk. */
export function LoadingState({ tip }: { tip?: string }) {
  return (
    <div className="cz-loading">
      <Spin />
      {tip ? <span>{tip}</span> : null}
    </div>
  );
}
