import { Alert, Button, Tooltip } from "antd";
import {
  Boat,
  CalendarPlus,
  ChatCircleDots,
  FileX,
  Package,
  Receipt,
  SealCheck,
  Sparkle,
  WarningCircle,
  type Icon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { AiError, analyzeMail, type MailAnalysis } from "../../ai/client.ts";
import { ledgerPayload } from "../../ai/ledger.ts";
import { useStore } from "../../store";
import { useShellOps } from "../../shell/opsStore.tsx";
import { useIsShellMode } from "../../shell/session.tsx";
import { useTypewriter } from "../hooks/useTypewriter.ts";
import { AiThinkingState } from "./AiThinkingState.tsx";
import { RouteTrack } from "./Graphics.tsx";
import "./ai.css";
import "./AiMailPanel.css";

const INTENT_KEYS = ["documents_hold", "booking", "capacity", "billing", "other"] as const;

/** One icon per mail intent — lets a list row say "booking" / "missing docs" without words. */
export const MAIL_INTENT_ICON: Record<string, Icon> = {
  documents_hold: FileX,
  booking: CalendarPlus,
  capacity: Boat,
  billing: Receipt,
  other: ChatCircleDots,
};

type TagMail = { intent?: string; needsHuman?: boolean; extractedBoxes?: string[]; docsMissing?: string[] };

/** Small AI tag icons for a mail row: intent, "check me", containers found, missing docs. */
export function MailTags({ mail }: { mail: TagMail }) {
  const { tx } = useStore();
  const tags: { key: string; icon: Icon; tone: string; label: string; n?: number }[] = [];
  if (mail.intent) {
    const known = INTENT_KEYS.includes(mail.intent as (typeof INTENT_KEYS)[number]);
    tags.push({
      key: "intent",
      icon: MAIL_INTENT_ICON[known ? mail.intent : "other"],
      tone: mail.intent === "documents_hold" ? "warning" : "info",
      label: known ? tx(`home_intent_${mail.intent}`) : mail.intent,
    });
  }
  if (mail.needsHuman) tags.push({ key: "check", icon: WarningCircle, tone: "warning", label: tx("home_ai_mail_check") });
  if (mail.extractedBoxes?.length)
    tags.push({ key: "boxes", icon: Package, tone: "primary", label: tx("home_ai_mail_boxes"), n: mail.extractedBoxes.length });
  if (mail.docsMissing?.length)
    tags.push({ key: "docs", icon: FileX, tone: "danger", label: tx("home_ai_mail_docs"), n: mail.docsMissing.length });
  if (!tags.length) return null;
  return (
    <span className="ai-mail-icons">
      {tags.map((t) => (
        <Tooltip key={t.key} title={t.n ? `${t.label} · ${t.n}` : t.label}>
          <span className={`ai-mail-icon is-${t.tone}`} role="img" aria-label={t.n ? `${t.label} ${t.n}` : t.label}>
            <t.icon size={14} weight="fill" aria-hidden />
            {t.n ? <span>{t.n}</span> : null}
          </span>
        </Tooltip>
      ))}
    </span>
  );
}

type MailLike = {
  from: string;
  subjectZh: string;
  subjectTh: string;
  subjectEn: string;
  bodyZh: string;
  bodyTh: string;
  bodyEn: string;
  /** Saved analysis (shown when present, so results survive switching mails). */
  intent?: string;
  summary?: string;
  origin?: string;
  dest?: string;
  extractedBoxes?: string[];
  docsMissing?: string[];
  confidence?: number;
  needsHuman?: boolean;
};

type Props = {
  mail: MailLike;
  onResult?: (result: MailAnalysis) => void;
  /** Render without its own frame (when placed inside a Panel). */
  bare?: boolean;
};

export function AiMailPanel({ mail, onResult, bare }: Props) {
  const { tx, locale, customers, boxes } = useStore();
  const shell = useIsShellMode();
  const ops = useShellOps();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<MailAnalysis | null>(null);
  const [animate, setAnimate] = useState(false);
  const [forMail, setForMail] = useState<MailLike | null>(null);

  const subject = locale === "th" ? mail.subjectTh : locale === "en" ? mail.subjectEn : mail.subjectZh;
  const body = locale === "th" ? mail.bodyTh : locale === "en" ? mail.bodyEn : mail.bodyZh;

  // Local result only applies to the mail it was run on; otherwise fall back to what is saved on the mail.
  const fresh = result && forMail === mail ? result : null;
  const view = fresh
    ? {
        intent: fresh.intent,
        summary: fresh.summary,
        origin: fresh.origin,
        dest: fresh.dest,
        boxes: fresh.boxIds,
        docs: fresh.docsMissing,
        confidence: fresh.confidence,
        needsHuman: fresh.needsHuman,
      }
    : mail.intent || mail.summary
      ? {
          intent: mail.intent ?? "",
          summary: mail.summary ?? "",
          origin: mail.origin ?? "",
          dest: mail.dest ?? "",
          boxes: mail.extractedBoxes ?? [],
          docs: mail.docsMissing ?? [],
          confidence: mail.confidence ?? 0,
          needsHuman: mail.needsHuman ?? false,
        }
      : null;

  const summaryTyped = useTypewriter(view?.summary ?? "", Boolean(fresh) && animate, 6);

  const ledgerBoxes = shell
    ? ops.boxes.map((b) => ({ id: b.id, customerId: b.customerId, status: b.status, bl: b.bl, dir: b.dir, type: b.type }))
    : boxes;

  async function runAnalyze() {
    setBusy(true);
    setErr(null);
    setAnimate(false);
    try {
      const analysis = await analyzeMail({
        ...ledgerPayload(locale, customers, ledgerBoxes as typeof boxes),
        from: mail.from,
        subject,
        body,
      });
      setResult(analysis);
      setForMail(mail);
      setAnimate(true);
      onResult?.(analysis);
    } catch (e) {
      setErr(e instanceof AiError && e.code === "missing_key" ? tx("aiNoKey") : tx("home_ai_mail_error"));
    } finally {
      setBusy(false);
    }
  }

  const intentLabel = (i: string) =>
    INTENT_KEYS.includes(i as (typeof INTENT_KEYS)[number]) ? tx(`home_intent_${i}`) : i || "—";

  return (
    <div className={bare ? "ai-mail is-bare" : "ai-mail"}>
      <div className="ai-mail-head">
        <span className="ai-mail-title">
          <Sparkle size={16} weight="fill" aria-hidden className="ai-mark" />
          {tx("home_ai_mail_title")}
        </span>
        <Button size="small" disabled={busy} onClick={() => void runAnalyze()}>
          {busy ? tx("home_ai_mail_running") : view ? tx("home_ai_mail_rerun") : tx("home_ai_mail_run")}
        </Button>
      </div>

      {busy ? <AiThinkingState steps={[tx("home_ai_mail_step1"), tx("home_ai_mail_step2"), tx("home_ai_mail_step3")]} /> : null}
      {err ? <Alert type="warning" message={err} showIcon /> : null}

      {!busy && !view && !err ? <p className="ai-hint">{tx("home_ai_mail_hint")}</p> : null}

      {view && !busy ? (
        <div className="ai-mail-out ai-reveal">
          <div className="ai-mail-tags">
            <span className="ai-mail-pill is-info">
              {(() => {
                const I = MAIL_INTENT_ICON[INTENT_KEYS.includes(view.intent as (typeof INTENT_KEYS)[number]) ? view.intent : "other"];
                return <I size={15} weight="fill" aria-hidden />;
              })()}
              {intentLabel(view.intent)}
            </span>
            {view.needsHuman ? (
              <span className="ai-mail-pill is-warning">
                <WarningCircle size={15} weight="fill" aria-hidden />
                {tx("home_ai_mail_check")}
              </span>
            ) : (
              <span className={`ai-mail-pill is-${view.confidence >= 0.7 ? "success" : "warning"}`}>
                <SealCheck size={15} weight="fill" aria-hidden />
                {Math.round(view.confidence * 100)}%
              </span>
            )}
          </div>
          {view.summary ? (
            <p className="ai-mail-summary">
              {fresh && animate ? summaryTyped : view.summary}
              {fresh && animate && summaryTyped.length < view.summary.length ? <span className="ai-thinking__cursor" aria-hidden /> : null}
            </p>
          ) : null}
          {view.origin || view.dest ? <RouteTrack from={view.origin} to={view.dest} progress={null} size="sm" /> : null}
          {view.boxes.length || view.docs.length ? (
            <ul className="ai-mail-chips">
              {view.boxes.map((b) => (
                <li key={`b-${b}`} className="ai-mail-chip cz-mono">
                  <Package size={14} aria-label={tx("home_ai_mail_boxes")} />
                  {b}
                </li>
              ))}
              {view.docs.map((d) => (
                <li key={`d-${d}`} className="ai-mail-chip is-danger">
                  <FileX size={14} aria-label={tx("home_ai_mail_docs")} />
                  {d}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
