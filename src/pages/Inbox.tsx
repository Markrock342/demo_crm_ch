import { useMemo, useState, type FormEvent } from "react";
import { AiError, analyzeMail } from "../ai/client";
import { ledgerPayload } from "../ai/ledger";
import { customerName } from "../data";
import { useStore } from "../store";
import { AiSteps } from "../ui/AiSteps";
import { ConfidenceBar } from "../ui/ConfidenceBar";
import { Button } from "../ui/Button";

export function InboxPage() {
  const { tx, locale, mails, customers, boxes, query, sendMail, saveDraft, rejectMail, markRead, applyMailAnalysis, applyMailOps, addPastedMail } =
    useStore();
  const open = mails.filter((m) => m.state === "open");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return open.filter((m) => {
      const c = customers.find((x) => x.id === m.customerId);
      const blob = `${m.from} ${m.subjectZh} ${m.subjectTh} ${m.subjectEn} ${c ? customerName(c, locale) : ""}`.toLowerCase();
      return !q || blob.includes(q);
    });
  }, [customers, locale, open, query]);

  const [active, setActive] = useState<string | null>(shown[0]?.id ?? null);
  const mail = mails.find((m) => m.id === active) ?? shown[0];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [running, setRunning] = useState(false);
  const [aiErr, setAiErr] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteFrom, setPasteFrom] = useState("");
  const [pasteSubject, setPasteSubject] = useState("");
  const [pasteBody, setPasteBody] = useState("");

  function pick(id: string) {
    setActive(id);
    setEditing(false);
    setAiErr(null);
    markRead(id);
  }

  function draftText() {
    if (!mail) return "";
    if (locale === "th") return mail.draftTh;
    if (locale === "en") return mail.draftEn;
    return mail.draftZh;
  }

  function bodyText() {
    if (!mail) return "";
    if (locale === "th") return mail.bodyTh;
    if (locale === "en") return mail.bodyEn;
    return mail.bodyZh;
  }

  function subjectText() {
    if (!mail) return "";
    if (locale === "th") return mail.subjectTh;
    if (locale === "en") return mail.subjectEn;
    return mail.subjectZh;
  }

  function errLabel(e: unknown) {
    if (e instanceof AiError && e.code === "missing_key") return tx("aiNoKey");
    return tx("aiError");
  }

  async function runOnMail() {
    if (!mail) return;
    setRunning(true);
    setAiErr(null);
    try {
      const result = await analyzeMail({
        ...ledgerPayload(locale, customers, boxes),
        from: mail.from,
        subject: subjectText(),
        body: bodyText(),
      });
      applyMailAnalysis(mail.id, result);
    } catch (e) {
      setAiErr(errLabel(e));
    } finally {
      setRunning(false);
    }
  }

  async function runPaste(e: FormEvent) {
    e.preventDefault();
    if (!pasteBody.trim()) return;
    setRunning(true);
    setAiErr(null);
    try {
      const result = await analyzeMail({
        ...ledgerPayload(locale, customers, boxes),
        from: pasteFrom,
        subject: pasteSubject,
        body: pasteBody,
      });
      const id = addPastedMail({ from: pasteFrom, subject: pasteSubject, body: pasteBody, analysis: result });
      setActive(id);
      setPasteOpen(false);
      setPasteBody("");
      setPasteSubject("");
      setPasteFrom("");
    } catch (err) {
      setAiErr(errLabel(err));
    } finally {
      setRunning(false);
    }
  }

  function onSend() {
    if (!mail) return;
    setSending(true);
    window.setTimeout(() => {
      sendMail(mail.id);
      setSending(false);
      setActive(shown.find((m) => m.id !== mail.id)?.id ?? null);
    }, 700);
  }

  const customer = mail ? customers.find((c) => c.id === mail.customerId) : null;
  const hasDraft = Boolean(draftText().trim());
  const canApplyOps = Boolean(mail?.extractedBoxes?.length || mail?.docsMissing?.length || mail?.suggestedStatus);
  const aiStep: 0 | 1 | 2 | 3 = !mail ? 0 : !hasDraft ? 1 : editing ? 2 : 3;

  return (
    <div className="page page--inbox">
      <div className="page-head">
        <div>
          <h1>{tx("inboxTitle")}</h1>
          <p>{tx("inboxHint")}</p>
        </div>
        <Button variant="ghost" onClick={() => setPasteOpen((v) => !v)} aria-expanded={pasteOpen}>
          {tx("pasteMail")}
        </Button>
      </div>

      <AiSteps active={aiStep} />

      {pasteOpen ? (
        <form className="ai-paste form" onSubmit={runPaste}>
          <p className="ai-paste-lead">{tx("aiPasteLead")}</p>
          <label>
            {tx("from")}
            <input value={pasteFrom} onChange={(e) => setPasteFrom(e.target.value)} />
          </label>
          <label>
            {tx("subject")}
            <input value={pasteSubject} onChange={(e) => setPasteSubject(e.target.value)} />
          </label>
          <label className="form-wide">
            {tx("pasteHint")}
            <textarea className="draft-edit" value={pasteBody} onChange={(e) => setPasteBody(e.target.value)} rows={6} required />
          </label>
          <div className="form-actions">
            {aiErr && pasteOpen ? (
              <p className="field-err" role="alert">
                {aiErr}
              </p>
            ) : null}
            <Button onClick={() => setPasteOpen(false)}>{tx("cancel")}</Button>
            <Button type="submit" variant="draft" busy={running}>
              {running ? tx("runningGemini") : tx("runGemini")}
            </Button>
          </div>
        </form>
      ) : null}

      {shown.length === 0 ? (
        <p className="empty">{tx("emptyInbox")}</p>
      ) : (
        <div className="mail-layout">
          <div className="mail-list" role="list">
            {shown.map((m) => {
              const c = customers.find((x) => x.id === m.customerId);
              return (
                <button
                  key={m.id}
                  type="button"
                  className="mail-item"
                  role="listitem"
                  aria-current={mail?.id === m.id}
                  onClick={() => pick(m.id)}
                >
                  <span className="who-line">
                    <span>
                      {m.unread ? <span className="unread-dot" aria-label={tx("unread")} /> : null}{" "}
                      {c ? customerName(c, locale) : m.from}
                    </span>
                    <time>{m.time}</time>
                  </span>
                  <strong>{locale === "th" ? m.subjectTh : locale === "en" ? m.subjectEn : m.subjectZh}</strong>
                  {m.needsHuman ? <span className="pill pill-hold">{tx("needsHuman")}</span> : null}
                </button>
              );
            })}
          </div>

          {mail && mail.state === "open" ? (
            <div className="mail-panels">
              <article className="mail-human">
                <header className="panel-head">
                  <h3>{tx("original")}</h3>
                  <span className="panel-tag panel-tag-human">{tx("humanZone")}</span>
                </header>
                <p className="meta">
                  {tx("from")} {mail.from}
                  {customer ? ` · ${customerName(customer, locale)}` : ""}
                </p>
                <p className="meta">
                  {tx("subject")} {subjectText()}
                </p>
                <p className="letter-body">{bodyText()}</p>
              </article>

              <article className="mail-ai">
                <header className="panel-head">
                  <h3>{tx("aiZoneTitle")}</h3>
                  <span className="panel-tag panel-tag-draft">{tx("draft")}</span>
                </header>
                <p className="ai-zone-hint">{tx("aiZoneHint")}</p>

                {hasDraft ? (
                  <ConfidenceBar value={mail.confidence} needsHuman={mail.needsHuman} />
                ) : (
                  <p className="ai-empty">{tx("aiEmptyDraft")}</p>
                )}

                {mail.intent ? (
                  <dl className="ai-facts">
                    <div>
                      <dt>{tx("intent")}</dt>
                      <dd>{tx(`intent_${mail.intent}`)}</dd>
                    </div>
                    {mail.origin ? (
                      <div>
                        <dt>{tx("originPort")}</dt>
                        <dd>{mail.origin}</dd>
                      </div>
                    ) : null}
                    {mail.dest ? (
                      <div>
                        <dt>{tx("destPort")}</dt>
                        <dd>{mail.dest}</dd>
                      </div>
                    ) : null}
                    {mail.extractedBoxes?.length ? (
                      <div>
                        <dt>{tx("extractedBoxes")}</dt>
                        <dd>{mail.extractedBoxes.join(", ")}</dd>
                      </div>
                    ) : null}
                    {mail.docsMissing?.length ? (
                      <div>
                        <dt>{tx("docsMissing")}</dt>
                        <dd>{mail.docsMissing.join(", ")}</dd>
                      </div>
                    ) : null}
                  </dl>
                ) : null}

                {mail.summary ? <p className="letter-body ai-summary">{mail.summary}</p> : null}

                <div className="ai-draft">
                  <p className="ai-draft-label">{tx("aiDraftLabel")}</p>
                  {editing ? (
                    <textarea className="draft-edit" value={draft} onChange={(e) => setDraft(e.target.value)} rows={10} />
                  ) : hasDraft ? (
                    <p className="letter-body">{draftText()}</p>
                  ) : (
                    <p className="meta">{tx("aiEmptyDraft")}</p>
                  )}
                </div>

                {aiErr && !pasteOpen ? (
                  <p className="field-err" role="alert">
                    {aiErr}
                  </p>
                ) : null}

                <div className="ai-actions">
                  <Button variant="draft" onClick={runOnMail} busy={running}>
                    {running ? tx("runningGemini") : tx("runGemini")}
                  </Button>
                  {hasDraft ? (
                    editing ? (
                      <Button
                        onClick={() => {
                          saveDraft(mail.id, draft);
                          setEditing(false);
                        }}
                      >
                        {tx("saveDraft")}
                      </Button>
                    ) : (
                      <Button
                        onClick={() => {
                          setDraft(draftText());
                          setEditing(true);
                        }}
                      >
                        {tx("edit")}
                      </Button>
                    )
                  ) : null}
                  {canApplyOps ? (
                    <Button variant="primary" onClick={() => applyMailOps(mail.id)}>
                      {tx("applyOps")}
                    </Button>
                  ) : null}
                  <Button variant="ghost" onClick={() => rejectMail(mail.id)}>
                    {tx("reject")}
                  </Button>
                </div>

                <div className="human-actions">
                  <p className="human-actions-hint">{tx("sendHumanHint")}</p>
                  <Button variant="primary" onClick={onSend} busy={sending} disabled={!hasDraft}>
                    {sending ? tx("sending") : tx("sendHuman")}
                  </Button>
                </div>
              </article>
            </div>
          ) : (
            <p className="empty">{tx("noOpenMail")}</p>
          )}
        </div>
      )}
    </div>
  );
}
