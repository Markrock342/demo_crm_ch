import { Button, Drawer, Tag } from "antd";
import { Sparkle } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "../../store";
import { useAiBrief } from "../hooks/useAiBrief.ts";
import { AiBriefView } from "./AiBriefView.tsx";
import { AiThinkingState } from "./AiThinkingState.tsx";
import "./ai.css";

type Props = {
  title: string;
  buttonLabel?: string;
  facts: Record<string, string | number | boolean>;
  localFallback: string;
  context?: string;
  autoRun?: boolean;
  /** @deprecated all briefs are compact now. */
  compact?: boolean;
  /**
   * "button" (default): a quiet header button that opens the brief in a side drawer.
   * "panel": inline panel — only for pages whose main job is the brief (Overview).
   */
  variant?: "button" | "panel";
  style?: React.CSSProperties;
};

export function AiBriefCard({ title, buttonLabel, facts, localFallback, context, autoRun, variant = "button", style }: Props) {
  const { locale, tx } = useStore();
  const { result, busy, missingKey, animateKey, run } = useAiBrief(locale as "zh" | "th" | "en");
  const [open, setOpen] = useState(false);

  const factsKey = useMemo(() => JSON.stringify(facts), [facts]);

  useEffect(() => {
    if (!autoRun) return;
    void run(facts, localFallback, context);
  }, [autoRun, context, facts, factsKey, localFallback, run]);

  const body = busy ? (
    <AiThinkingState />
  ) : result ? (
    <AiBriefView result={result} locale={locale as "zh" | "th" | "en"} animate={animateKey > 0} />
  ) : (
    <p className="ai-hint">{tx("aiBriefHint")}</p>
  );

  const runButton = (
    <Button
      size="small"
      disabled={busy}
      icon={<Sparkle size={14} weight="fill" />}
      onClick={() => void run(facts, localFallback, context)}
    >
      {buttonLabel ?? (busy ? tx("runningGemini") : result ? tx("aiRegenerate") : tx("runAiJobSummary"))}
    </Button>
  );

  if (variant === "panel") {
    return (
      <section className="ai-panel" style={style}>
        <div className="ai-panel-head">
          <h2>
            <Sparkle size={16} weight="fill" aria-hidden className="ai-mark" />
            {title}
          </h2>
          <span className="ai-panel-actions">
            {missingKey ? <Tag color="warning">{tx("aiNoKey")}</Tag> : null}
            {runButton}
          </span>
        </div>
        <div className="ai-panel-body">{body}</div>
      </section>
    );
  }

  return (
    <>
      <Button
        style={style}
        icon={<Sparkle size={16} weight="fill" className="ai-mark" />}
        onClick={() => {
          setOpen(true);
          if (!result && !busy) void run(facts, localFallback, context);
        }}
      >
        {tx("aiAsk")}
      </Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        width={480}
        title={
          <span className="ai-drawer-title">
            <Sparkle size={16} weight="fill" aria-hidden className="ai-mark" />
            {title}
          </span>
        }
        extra={
          <span className="ai-panel-actions">
            {missingKey ? <Tag color="warning">{tx("aiNoKey")}</Tag> : null}
            {runButton}
          </span>
        }
      >
        {body}
      </Drawer>
    </>
  );
}
