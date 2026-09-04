import { List, Typography } from "antd";
import type { AiBriefResult } from "../../ai/client.ts";
import { useTypewriter } from "../hooks/useTypewriter.ts";
import "./ai.css";

const HEADINGS = {
  zh: { situation: "现状分析", risks: "风险与缺口", recommendations: "建议", actions: "今日应做" },
  th: { situation: "สถานการณ์", risks: "ความเสี่ยงและช่องว่าง", recommendations: "ข้อเสนอแนะ", actions: "สิ่งที่ควรทำวันนี้" },
  en: { situation: "Situation", risks: "Risks & gaps", recommendations: "Recommendations", actions: "Actions for today" },
} as const;

type Props = {
  result: AiBriefResult;
  locale: "zh" | "th" | "en";
  variant?: "default" | "inverse";
  animate?: boolean;
};

function Section({
  title,
  children,
  inverse,
  revealClass,
}: {
  title: string;
  children: React.ReactNode;
  inverse?: boolean;
  revealClass?: string;
}) {
  return (
    <div className={revealClass} style={{ marginBottom: 14 }}>
      <Typography.Text strong style={{ color: inverse ? "#e0e7ff" : undefined, display: "block", marginBottom: 6 }}>
        {title}
      </Typography.Text>
      {children}
    </div>
  );
}

export function AiBriefView({ result, locale, variant = "default", animate = false }: Props) {
  const h = HEADINGS[locale];
  const inverse = variant === "inverse";
  const textColor = inverse ? "#f8fafc" : undefined;
  const muted = inverse ? "rgba(248,250,252,0.85)" : undefined;
  const situationTyped = useTypewriter(result.situation, animate, 8);

  return (
    <div className="ai-brief-view">
      <Section title={h.situation} inverse={inverse}>
        <Typography.Paragraph className="ai-summary" style={{ color: textColor, marginBottom: 0 }}>
          {animate ? situationTyped : result.situation}
          {animate && situationTyped.length < result.situation.length ? (
            <span className="ai-thinking__cursor" aria-hidden />
          ) : null}
        </Typography.Paragraph>
      </Section>

      {result.risks.length > 0 ? (
        <Section title={h.risks} inverse={inverse} revealClass={animate ? "ai-reveal ai-reveal--1" : undefined}>
          <List
            size="small"
            dataSource={result.risks}
            renderItem={(item) => (
              <List.Item style={{ padding: "4px 0", border: "none", color: muted ?? textColor }}>
                <span style={{ marginRight: 6 }}>•</span>
                {item}
              </List.Item>
            )}
          />
        </Section>
      ) : null}

      {result.recommendations.length > 0 ? (
        <Section title={h.recommendations} inverse={inverse} revealClass={animate ? "ai-reveal ai-reveal--2" : undefined}>
          <List
            size="small"
            dataSource={result.recommendations}
            renderItem={(item, i) => (
              <List.Item style={{ padding: "4px 0", border: "none", color: muted ?? textColor }}>
                <span style={{ marginRight: 6 }}>{i + 1}.</span>
                {item}
              </List.Item>
            )}
          />
        </Section>
      ) : null}

      {result.actions.length > 0 ? (
        <Section title={h.actions} inverse={inverse} revealClass={animate ? "ai-reveal ai-reveal--3" : undefined}>
          <List
            size="small"
            dataSource={result.actions}
            renderItem={(item, i) => (
              <List.Item style={{ padding: "4px 0", border: "none", color: textColor, fontWeight: i === 0 ? 600 : 400 }}>
                <span style={{ marginRight: 6, color: inverse ? "#fcd34d" : "#6366f1" }}>→</span>
                {item}
              </List.Item>
            )}
          />
        </Section>
      ) : null}
    </div>
  );
}
