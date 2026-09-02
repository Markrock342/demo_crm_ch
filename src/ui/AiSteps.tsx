import { useStore } from "../store";

const steps = ["aiStepRead", "aiStepDraft", "aiStepReview", "aiStepSend"] as const;

type Props = {
  active: 0 | 1 | 2 | 3;
};

export function AiSteps({ active }: Props) {
  const { tx } = useStore();
  return (
    <ol className="ai-steps" aria-label={tx("aiFlowTitle")}>
      {steps.map((key, i) => (
        <li key={key} className={i <= active ? "is-on" : ""} aria-current={i === active ? "step" : undefined}>
          <span className="ai-step-n">{i + 1}</span>
          <span>{tx(key)}</span>
        </li>
      ))}
    </ol>
  );
}
