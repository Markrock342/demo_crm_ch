import { Card, Col, Row, Segmented } from "antd";
import { useMemo, useState } from "react";
import { useShellBilling } from "../../shell/billingStore.tsx";
import { useShellSupport } from "../../shell/supportStore.tsx";
import { useStore } from "../../store";
import { AiBriefCard } from "../components/AiBriefCard.tsx";
import { PageHeader } from "../components/PageHeader.tsx";
import { useAppMode } from "../hooks/useAppMode.ts";

const depts = ["sales", "ops", "finance", "yard"] as const;

export function ReportsPageV2() {
  const { shell } = useAppMode();
  const { tx, locale, boxes, deals, invoices } = useStore();
  const billing = useShellBilling();
  const support = useShellSupport();
  const [dept, setDept] = useState<(typeof depts)[number]>("ops");

  const hold = boxes.filter((b) => b.status === "hold").length;
  const teu = boxes.reduce((n, b) => n + b.teu, 0);
  const openPipe = deals.filter((d) => d.stage !== "billed").reduce((n, d) => n + d.value, 0);
  const overdue = shell
    ? billing.invoices.filter((i) => i.overdue).length
    : invoices.filter((i) => i.status === "overdue").length;
  const missingDocs = shell ? support.docs.filter((d) => d.status === "late" || d.status === "wait").length : 0;

  const facts = useMemo(
    () => ({
      department: dept,
      holdContainers: hold,
      teuInLedger: teu,
      pipelineUsd: openPipe,
      overdueInvoices: overdue,
      missingDocs,
      openDeals: deals.filter((d) => d.stage !== "billed").length,
    }),
    [deals, dept, hold, missingDocs, openPipe, overdue, teu],
  );

  const localFallback = `${dept.toUpperCase()} report: ${hold} containers on hold, ${teu} TEU tracked, pipeline $${Math.round(openPipe)}, ${overdue} overdue invoices, ${missingDocs} doc exceptions.`;

  return (
    <div style={{ padding: "0 8px 24px" }}>
      <PageHeader title={tx("navAnalytics")} subtitle={`${tx("shellDataBadge")} · Gemini`} />
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24}>
          <Segmented
            options={depts.map((d) => ({ label: d, value: d }))}
            value={dept}
            onChange={(v) => setDept(v as (typeof depts)[number])}
          />
        </Col>
        <Col xs={24}>
          <AiBriefCard title={tx("aiMgmtReport")} facts={facts} localFallback={localFallback} />
        </Col>
      </Row>
      <Card size="small" title={tx("navAnalytics")}>
        <p style={{ margin: 0, color: "#666" }}>
          {locale === "th"
            ? "เลือกแผนกแล้วกด AI เพื่อสรุป KPI — ข้อมูลจาก demo ledger"
            : locale === "en"
              ? "Pick a department and run AI for a KPI brief from the demo ledger."
              : "选择部门后点 AI 生成 KPI 摘要（演示账册数据）。"}
        </p>
      </Card>
    </div>
  );
}
