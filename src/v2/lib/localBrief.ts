import type { AiBriefResult, Locale } from "../../ai/client.ts";

const HEADINGS = {
  zh: { situation: "现状分析", risks: "风险与缺口", recommendations: "建议", actions: "今日应做" },
  th: { situation: "สถานการณ์", risks: "ความเสี่ยงและช่องว่าง", recommendations: "ข้อเสนอแนะ", actions: "สิ่งที่ควรทำวันนี้" },
  en: { situation: "Situation", risks: "Risks & gaps", recommendations: "Recommendations", actions: "Actions for today" },
} as const;

/** Heuristic local brief when Gemini is unavailable — still structured and actionable. */
export function buildLocalBrief(
  locale: Locale,
  facts: Record<string, string | number | boolean>,
  oneLiner: string,
): AiBriefResult {
  const n = (k: string) => Number(facts[k] ?? 0);
  const s = (k: string) => String(facts[k] ?? "");

  const risks: string[] = [];
  const recommendations: string[] = [];
  const actions: string[] = [];

  if (n("delayed") > 0) {
    risks.push(locale === "th" ? `มีงาน delay ${n("delayed")} รายการ — ตรวจ ETD/ETA และแจ้งลูกค้า` : locale === "zh" ? `${n("delayed")} 票延误，需核对船期并通知客户` : `${n("delayed")} delayed job(s) — verify ETD/ETA and notify customers`);
    actions.push(locale === "th" ? "เปิดศูนย์ Action → จัดลำดับงาน delay ก่อน" : locale === "zh" ? "打开异常中心，优先处理延误票" : "Open Action Center and prioritize delayed jobs first");
  }
  if (n("missingDocs") > 0) {
    risks.push(locale === "th" ? `เอกสารค้าง/ขาด ${n("missingDocs")} รายการ — อาจ hold ปล่อยตู้หรือ customs` : locale === "zh" ? `${n("missingDocs")} 份单证缺失，可能 hold 放货` : `${n("missingDocs")} missing/late doc(s) — may block release or customs`);
    actions.push(locale === "th" ? "ไล่ chase เอกสารจากลูกค้าและ ops วันนี้" : locale === "zh" ? "今日跟进客户与营运补单" : "Chase missing docs with customer and ops today");
  }
  if (n("outstanding") > 0 || n("openBalance") > 0) {
    risks.push(locale === "th" ? "มี AR ค้าง — กระทบ cash flow" : locale === "zh" ? "有未收 AR，影响现金流" : "Outstanding AR affects cash flow");
    actions.push(locale === "th" ? "โทร/อีเมลเก็บเงิน invoice ที่ครบ due" : locale === "zh" ? "联系客户催收到期发票" : "Follow up on due invoices");
  }
  if (n("unbilled") > 0) {
    recommendations.push(locale === "th" ? `มี ${n("unbilled")} งานยังไม่วางบิล — ตรวจ charges ก่อนปิดงาน` : locale === "zh" ? `${n("unbilled")} 票未开票，关票前核对费用` : `${n("unbilled")} unbilled job(s) — verify charges before closing`);
  }
  if (s("jobNumber")) {
    recommendations.push(locale === "th" ? `โฟกัส ${s("jobNumber")}: ตรวจ milestone, เอกสาร, และ billing ${s("billing")}` : locale === "zh" ? `聚焦 ${s("jobNumber")}：查里程碑、单证与 ${s("billing")} 状态` : `Focus ${s("jobNumber")}: check milestones, docs, billing ${s("billing")}`);
    if (facts.delayed) actions.push(locale === "th" ? "อัปเดตลูกค้าเรื่อง delay และ plan B ท่า/เรือ" : locale === "zh" ? "向客户更新延误并评估备选船期" : "Update customer on delay and evaluate backup sailing");
  }

  if (recommendations.length === 0) {
    recommendations.push(locale === "th" ? "สถานการณ์โดยรวมนิ่ง — ใช้เวลา review pipeline และ rate ใหม่" : locale === "zh" ? "整体平稳 — 可复查 pipeline 与新运价" : "Overall stable — review pipeline and fresh rates");
  }
  if (actions.length === 0) {
    actions.push(locale === "th" ? "สแกน Exceptions และ Jobs ที่ ETD/ETA ใกล้ 48 ชม." : locale === "zh" ? "扫描异常与 48 小时内 ETD/ETA 的票" : "Scan exceptions and jobs with ETD/ETA within 48h");
    actions.push(locale === "th" ? "เช็ค inbox อีเมลลูกค้า — รัน AI วิเคราะห์เมลค้าง" : locale === "zh" ? "处理收件箱 — 对未读邮件跑 AI 分析" : "Clear inbox — run AI on open customer mails");
  }

  const situation = oneLiner + (locale === "th" ? " รายละเอียดด้านล่างอิงตัวเลขจากหน้านี้เท่านั้น — ไม่ได้สมมติข้อมูลเพิ่ม." : locale === "zh" ? " 以下基于本页数据，未臆造数字。" : " Details below use only on-screen facts.");

  return {
    situation,
    risks,
    recommendations,
    actions,
    summary: formatBriefText(locale, { situation, risks, recommendations, actions }),
  };
}

export function formatBriefText(locale: Locale, r: Omit<AiBriefResult, "summary">): string {
  const h = HEADINGS[locale];
  const lines = [h.situation, r.situation, "", h.risks, ...r.risks.map((x) => `• ${x}`), "", h.recommendations, ...r.recommendations.map((x, i) => `${i + 1}. ${x}`), "", h.actions, ...r.actions.map((x) => `→ ${x}`)];
  return lines.join("\n");
}
