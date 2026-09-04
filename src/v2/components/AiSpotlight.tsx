import { Button, Space, Tag } from "antd";
import { Sparkle } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { aiHealth } from "../../ai/client.ts";
import { useStore } from "../../store";
import { useAiBrief } from "../hooks/useAiBrief.ts";
import { AiBriefView } from "./AiBriefView.tsx";
import { AiThinkingState } from "./AiThinkingState.tsx";
import "./ai.css";

type Props = {
  facts: Record<string, string | number | boolean>;
  localFallback: string;
  context?: string;
};

export function AiSpotlight({ facts, localFallback, context = "overview" }: Props) {
  const { locale, tx } = useStore();
  const { result, busy, missingKey, animateKey, run } = useAiBrief(locale as "zh" | "th" | "en");
  const [gemini, setGemini] = useState<boolean | null>(null);

  useEffect(() => {
    aiHealth()
      .then((h) => setGemini(h.ok))
      .catch(() => setGemini(false));
  }, []);

  return (
    <section className="ai-spotlight">
      <Space align="start" style={{ width: "100%", justifyContent: "space-between" }} wrap>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h2 className="ai-spotlight__title">{tx("aiSpotlightTitle")}</h2>
          <p className="ai-spotlight__desc">{tx("aiSpotlightDesc")}</p>
          <Space wrap>
            <Tag color={gemini ? "success" : "default"}>{gemini ? tx("geminiReady") : tx("geminiMissing")}</Tag>
            {missingKey ? <Tag color="warning">{tx("aiNoKey")}</Tag> : null}
          </Space>
        </div>
        <Button
          type="primary"
          size="large"
          disabled={busy}
          icon={<Sparkle size={18} weight="fill" />}
          onClick={() => void run(facts, localFallback, context)}
          style={{ background: "#fff", color: "#4338ca", border: "none", fontWeight: 600 }}
        >
          {busy ? tx("runningGemini") : tx("aiMgmtReport")}
        </Button>
      </Space>
      {busy ? (
        <div style={{ marginTop: 16 }}>
          <AiThinkingState variant="inverse" />
        </div>
      ) : result ? (
        <div style={{ marginTop: 16 }}>
          <AiBriefView result={result} locale={locale as "zh" | "th" | "en"} variant="inverse" animate={animateKey > 0} />
        </div>
      ) : null}
    </section>
  );
}
