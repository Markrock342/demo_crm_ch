import { Button, Card, Space, Tag, Typography } from "antd";
import { Sparkle } from "@phosphor-icons/react";
import { useEffect, useMemo } from "react";
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
  compact?: boolean;
  style?: React.CSSProperties;
};

export function AiBriefCard({ title, buttonLabel, facts, localFallback, context, autoRun, compact, style }: Props) {
  const { locale, tx } = useStore();
  const { result, busy, missingKey, animateKey, run } = useAiBrief(locale as "zh" | "th" | "en");

  const factsKey = useMemo(() => JSON.stringify(facts), [facts]);

  useEffect(() => {
    if (!autoRun) return;
    void run(facts, localFallback, context);
  }, [autoRun, context, facts, factsKey, localFallback, run]);

  return (
    <Card
      size="small"
      className={`ai-card${compact ? " ai-card--compact" : ""}`}
      style={style}
      title={
        <Space size={6}>
          <Sparkle size={16} weight="fill" color="#6366f1" />
          <span>{title}</span>
        </Space>
      }
      extra={
        <Space size={8}>
          {missingKey ? <Tag color="warning">{tx("aiNoKey")}</Tag> : null}
          <Button
            size="small"
            type="primary"
            disabled={busy}
            icon={<Sparkle size={14} />}
            onClick={() => void run(facts, localFallback, context)}
          >
            {buttonLabel ?? (busy ? tx("runningGemini") : tx("runAiJobSummary"))}
          </Button>
        </Space>
      }
    >
      {busy ? (
        <AiThinkingState />
      ) : result ? (
        <AiBriefView result={result} locale={locale as "zh" | "th" | "en"} animate={animateKey > 0} />
      ) : (
        <Typography.Text type="secondary">{tx("aiBriefHint")}</Typography.Text>
      )}
    </Card>
  );
}
