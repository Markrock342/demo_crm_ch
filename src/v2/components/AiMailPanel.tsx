import { Alert, Button, Descriptions, Space, Tag, Typography } from "antd";
import { Sparkle } from "@phosphor-icons/react";
import { useState } from "react";
import { AiError, analyzeMail, type MailAnalysis } from "../../ai/client.ts";
import { ledgerPayload } from "../../ai/ledger.ts";
import { useStore } from "../../store";
import { useShellOps } from "../../shell/opsStore.tsx";
import { useIsShellMode } from "../../shell/session.tsx";
import { useTypewriter } from "../hooks/useTypewriter.ts";
import { AiThinkingState } from "./AiThinkingState.tsx";
import "./ai.css";

const INTENT_KEYS = ["documents_hold", "booking", "capacity", "billing", "other"] as const;

function intentLabel(tx: (k: string) => string, intent: string) {
  const key = `intent_${intent}`;
  return INTENT_KEYS.includes(intent as (typeof INTENT_KEYS)[number]) ? tx(key) : intent;
}

type MailLike = {
  from: string;
  subjectZh: string;
  subjectTh: string;
  subjectEn: string;
  bodyZh: string;
  bodyTh: string;
  bodyEn: string;
};

type Props = {
  mail: MailLike;
  onResult?: (result: MailAnalysis) => void;
};

export function AiMailPanel({ mail, onResult }: Props) {
  const { tx, locale, customers, boxes } = useStore();
  const shell = useIsShellMode();
  const ops = useShellOps();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<MailAnalysis | null>(null);
  const [animate, setAnimate] = useState(false);

  const subject = locale === "th" ? mail.subjectTh : locale === "en" ? mail.subjectEn : mail.subjectZh;
  const body = locale === "th" ? mail.bodyTh : locale === "en" ? mail.bodyEn : mail.bodyZh;
  const summaryTyped = useTypewriter(result?.summary ?? "", animate, 6);

  const ledgerBoxes = shell
    ? ops.boxes.map((b) => ({
        id: b.id,
        customerId: b.customerId,
        status: b.status,
        bl: b.bl,
        dir: b.dir,
        type: b.type,
      }))
    : boxes;

  async function runAnalyze() {
    setBusy(true);
    setErr(null);
    setResult(null);
    setAnimate(false);
    try {
      const analysis = await analyzeMail({
        ...ledgerPayload(locale, customers, ledgerBoxes as typeof boxes),
        from: mail.from,
        subject,
        body,
      });
      setResult(analysis);
      setAnimate(true);
      onResult?.(analysis);
    } catch (e) {
      setErr(e instanceof AiError && e.code === "missing_key" ? tx("aiNoKey") : tx("aiError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ai-mail-result">
      <Space style={{ width: "100%", justifyContent: "space-between" }} wrap>
        <Space size={6}>
          <Sparkle size={16} weight="fill" color="#6366f1" />
          <Typography.Text strong>{tx("aiMailIntel")}</Typography.Text>
        </Space>
        <Button type="primary" size="small" disabled={busy} icon={<Sparkle size={14} />} onClick={() => void runAnalyze()}>
          {busy ? tx("aiThinkingMail") : tx("aiMailAnalyze")}
        </Button>
      </Space>

      {busy ? (
        <AiThinkingState
          steps={[tx("aiThinkingMail"), tx("aiThinkingAnalyze"), tx("aiThinkingDraft")]}
        />
      ) : null}
      {err ? <Alert type="warning" message={err} style={{ marginTop: 8 }} showIcon /> : null}

      {result && !busy ? (
        <Descriptions size="small" column={1} style={{ marginTop: 12 }} className="ai-reveal">
          <Descriptions.Item label={tx("intent")}>{intentLabel(tx, result.intent)}</Descriptions.Item>
          <Descriptions.Item label={tx("fields")}>
            {animate ? summaryTyped : result.summary}
            {animate && summaryTyped.length < result.summary.length ? <span className="ai-thinking__cursor" aria-hidden /> : null}
          </Descriptions.Item>
          <Descriptions.Item label={tx("originPort")}>{result.origin || "—"}</Descriptions.Item>
          <Descriptions.Item label={tx("destPort")}>{result.dest || "—"}</Descriptions.Item>
          <Descriptions.Item label={tx("extractedBoxes")}>{result.boxIds.join(", ") || "—"}</Descriptions.Item>
          <Descriptions.Item label={tx("docsMissing")}>{result.docsMissing.join(", ") || "—"}</Descriptions.Item>
          <Descriptions.Item label="Confidence">
            <Tag color={result.confidence >= 0.7 ? "success" : "warning"}>{Math.round(result.confidence * 100)}%</Tag>
            {result.needsHuman ? <Tag color="orange">{tx("needsHuman")}</Tag> : null}
          </Descriptions.Item>
        </Descriptions>
      ) : null}
    </div>
  );
}
