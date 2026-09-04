import { Button, Card, Col, Input, List, Row, Space, Typography } from "antd";
import { useMemo, useState, type FormEvent } from "react";
import { customerName } from "../../data";
import { useStore } from "../../store";
import { AiBriefCard } from "../components/AiBriefCard.tsx";
import { AiMailPanel } from "../components/AiMailPanel.tsx";
import { PageHeader } from "../components/PageHeader.tsx";

export function InboxPageV2() {
  const {
    tx,
    locale,
    mails,
    customers,
    query,
    sendMail,
    saveDraft,
    rejectMail,
    markRead,
    applyMailAnalysis,
    applyMailOps,
    addPastedMail,
  } = useStore();

  const open = mails.filter((m) => m.state === "open");
  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () =>
      open.filter((m) => {
        const c = customers.find((x) => x.id === m.customerId);
        const blob = `${m.from} ${m.subjectZh} ${m.subjectTh} ${m.subjectEn} ${c ? customerName(c, locale) : ""}`.toLowerCase();
        return !q || blob.includes(q);
      }),
    [customers, locale, open, q],
  );

  const [active, setActive] = useState<string | null>(shown[0]?.id ?? null);
  const mail = mails.find((m) => m.id === active) ?? shown[0];
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteFrom, setPasteFrom] = useState("");
  const [pasteSubject, setPasteSubject] = useState("");
  const [pasteBody, setPasteBody] = useState("");

  const facts = {
    openMails: open.length,
    unread: mails.filter((m) => m.unread).length,
    shown: shown.length,
  };
  const localBrief = `Inbox: ${open.length} open threads, ${mails.filter((m) => m.unread).length} unread. Select a mail and run AI analysis to extract BL, containers, and missing docs.`;

  function subjectText(m: typeof mail) {
    if (!m) return "";
    if (locale === "th") return m.subjectTh;
    if (locale === "en") return m.subjectEn;
    return m.subjectZh;
  }

  function bodyText(m: typeof mail) {
    if (!m) return "";
    if (locale === "th") return m.bodyTh;
    if (locale === "en") return m.bodyEn;
    return m.bodyZh;
  }

  async function runPaste(e: FormEvent) {
    e.preventDefault();
    if (!pasteBody.trim()) return;
    const id = addPastedMail({ from: pasteFrom, subject: pasteSubject, body: pasteBody, analysis: undefined });
    setActive(id);
    setPasteOpen(false);
    setPasteBody("");
    setPasteSubject("");
    setPasteFrom("");
  }

  return (
    <div style={{ padding: "0 8px 24px" }}>
      <PageHeader title={tx("navInbox")} subtitle={`${open.length} open · ${tx("shellDataBadge")}`} />

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={14}>
          <AiBriefCard title={tx("aiMailIntel")} buttonLabel={tx("aiMgmtReport")} facts={facts} localFallback={localBrief} />
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} md={8}>
          <Card
            size="small"
            title={tx("navInbox")}
            extra={
              <Button size="small" onClick={() => setPasteOpen((v) => !v)}>
                {tx("pasteMail")}
              </Button>
            }
          >
            {pasteOpen ? (
              <form onSubmit={(e) => void runPaste(e)} style={{ marginBottom: 12 }}>
                <Space direction="vertical" style={{ width: "100%" }}>
                  <Input placeholder="From" value={pasteFrom} onChange={(e) => setPasteFrom(e.target.value)} />
                  <Input placeholder="Subject" value={pasteSubject} onChange={(e) => setPasteSubject(e.target.value)} />
                  <Input.TextArea rows={4} placeholder={tx("pasteHint")} value={pasteBody} onChange={(e) => setPasteBody(e.target.value)} />
                  <Button type="primary" htmlType="submit" block>
                    {tx("pasteMail")}
                  </Button>
                </Space>
              </form>
            ) : null}
            <List
              size="small"
              dataSource={shown}
              locale={{ emptyText: tx("noOpenMail") }}
              renderItem={(m) => (
                <List.Item
                  style={{ cursor: "pointer", background: mail?.id === m.id ? "#f0f5ff" : undefined }}
                  onClick={() => {
                    setActive(m.id);
                    markRead(m.id);
                  }}
                >
                  <List.Item.Meta
                    title={subjectText(m) || m.from}
                    description={
                      <Typography.Text type="secondary" ellipsis>
                        {m.from}
                      </Typography.Text>
                    }
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>
        <Col xs={24} md={16}>
          {mail ? (
            <Card size="small" title={subjectText(mail) || mail.from}>
              <Typography.Paragraph type="secondary">{mail.from}</Typography.Paragraph>
              <Typography.Paragraph style={{ whiteSpace: "pre-wrap" }}>{bodyText(mail)}</Typography.Paragraph>

              <AiMailPanel
                mail={mail}
                onResult={(r) => {
                  applyMailAnalysis(mail.id, r);
                }}
              />

              <Space style={{ marginTop: 16 }} wrap>
                <Button
                  onClick={() => {
                    const draft = locale === "th" ? mail.draftTh : locale === "en" ? mail.draftEn : mail.draftZh;
                    saveDraft(mail.id, draft);
                  }}
                >
                  {tx("saveDraft")}
                </Button>
                <Button type="primary" onClick={() => {
                  if (!window.confirm(tx("confirmApplyExtract"))) return;
                  applyMailOps(mail.id);
                }}>
                  {tx("applyOps")}
                </Button>
                <Button danger onClick={() => rejectMail(mail.id)}>
                  {tx("reject")}
                </Button>
                <Button
                  onClick={() => {
                    if (!window.confirm(tx("confirmSendMail"))) return;
                    sendMail(mail.id);
                  }}
                >
                  {tx("sendMail")}
                </Button>
              </Space>
            </Card>
          ) : (
            <Card size="small">
              <Typography.Text type="secondary">{tx("noOpenMail")}</Typography.Text>
            </Card>
          )}
        </Col>
      </Row>
    </div>
  );
}
