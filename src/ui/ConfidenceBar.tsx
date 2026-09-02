import { useStore } from "../store";

type Props = {
  value: number;
  needsHuman?: boolean;
};

export function ConfidenceBar({ value, needsHuman }: Props) {
  const { tx } = useStore();
  const pct = Math.round(value * 100);
  return (
    <div className="conf-bar">
      <div className="conf-head">
        <span>{tx("aiConfidenceHint")}</span>
        <strong className="num">{pct}%</strong>
      </div>
      <div className="conf-track" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <span className="conf-fill" style={{ width: `${pct}%` }} />
      </div>
      {needsHuman ? <p className="conf-warn">{tx("needsHumanHint")}</p> : null}
    </div>
  );
}
