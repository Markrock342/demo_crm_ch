import { Sparkle } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useStore } from "../../store";
import "./ai.css";

type Props = {
  variant?: "default" | "inverse";
  steps?: string[];
};

export function AiThinkingState({ variant = "default", steps: customSteps }: Props) {
  const { tx } = useStore();
  const steps = customSteps ?? [tx("aiThinkingRead"), tx("aiThinkingAnalyze"), tx("aiThinkingDraft")];
  const [step, setStep] = useState(0);

  useEffect(() => {
    setStep(0);
    const id = window.setInterval(() => setStep((s) => (s + 1) % steps.length), 2000);
    return () => window.clearInterval(id);
  }, [steps.join("|")]);

  return (
    <div className={`ai-thinking${variant === "inverse" ? " ai-thinking--inverse" : ""}`} role="status" aria-live="polite">
      <Sparkle size={18} weight="fill" className="ai-thinking__sparkle" aria-hidden />
      <div className="ai-thinking__body">
        <p className="ai-thinking__line">
          {steps[step]}
          <span className="ai-thinking__cursor" aria-hidden />
        </p>
        <div className="ai-thinking__skeleton" aria-hidden>
          <span />
          <span />
          <span style={{ width: "72%" }} />
        </div>
      </div>
    </div>
  );
}
