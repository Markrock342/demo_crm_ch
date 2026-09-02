import { Robot } from "@phosphor-icons/react";
import { useStore } from "../store";
import { Button } from "./Button";

type Props = {
  brief: string | null;
  busy: boolean;
  error: string | null;
  onRun: () => void;
};

function splitBrief(text: string): string[] {
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length > 1) return lines;

  const parts = text
    .split(/(?:\d+[.)]\s*|[·•]\s+|(?<=[。.!?])\s+)/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 1 ? parts : [text.trim()];
}

export function AiBriefChat({ brief, busy, error, onRun }: Props) {
  const { tx } = useStore();
  const points = brief ? splitBrief(brief) : [];

  return (
    <section className="ai-chat-panel" aria-labelledby="ai-brief-title">
      <header className="ai-chat-head">
        <div className="ai-chat-avatar" aria-hidden>
          <Robot size={22} weight="regular" />
        </div>
        <div className="ai-chat-head-copy">
          <h2 id="ai-brief-title">{tx("briefToday")}</h2>
          <p className="ai-chat-sub">{tx("aiAssistant")}</p>
        </div>
        <span className="panel-tag panel-tag-draft">{tx("aiLabel")}</span>
      </header>

      <div className="ai-chat-thread" role="log" aria-live="polite" aria-relevant="additions text">
        <div className="ai-chat-row ai-chat-row--user">
          <div className="ai-chat-bubble ai-chat-bubble--user">
            <p>{tx("briefPrompt")}</p>
          </div>
        </div>

        {busy ? (
          <div className="ai-chat-row ai-chat-row--ai">
            <div className="ai-chat-avatar ai-chat-avatar--sm" aria-hidden>
              <Robot size={18} weight="regular" />
            </div>
            <div className="ai-chat-bubble ai-chat-bubble--ai ai-chat-bubble--typing">
              <span className="ai-typing" aria-hidden>
                <span />
                <span />
                <span />
              </span>
              <p>{tx("briefRunning")}</p>
            </div>
          </div>
        ) : brief ? (
          <div className="ai-chat-row ai-chat-row--ai">
            <div className="ai-chat-avatar ai-chat-avatar--sm" aria-hidden>
              <Robot size={18} weight="regular" />
            </div>
            <div className="ai-chat-bubble ai-chat-bubble--ai">
              <ul className="ai-chat-points">
                {points.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <div className="ai-chat-row ai-chat-row--ai">
            <div className="ai-chat-avatar ai-chat-avatar--sm" aria-hidden>
              <Robot size={18} weight="regular" />
            </div>
            <div className="ai-chat-bubble ai-chat-bubble--ai ai-chat-bubble--empty">
              <p>{tx("briefEmpty")}</p>
            </div>
          </div>
        )}
      </div>

      {error ? (
        <p className="field-err ai-chat-err" role="alert">
          {error}
        </p>
      ) : null}

      <footer className="ai-chat-foot">
        <p className="ai-zone-hint">{tx("briefAiHint")}</p>
        <Button variant="draft" onClick={onRun} busy={busy}>
          {busy ? tx("briefRunning") : tx("briefTodayBtn")}
        </Button>
      </footer>
    </section>
  );
}
