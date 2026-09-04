import { Card, Col, List, Row, Statistic } from "antd";
import { Link } from "react-router-dom";
import { useMemo } from "react";
import { jobDateIsToday, todayMonthDay } from "../../lib/dates.ts";
import { jobGrossProfit } from "../../ports/job.port.ts";
import { useShellBilling } from "../../shell/billingStore.tsx";
import { useShellJobs } from "../../shell/jobStore.tsx";
import { useShellOps } from "../../shell/opsStore.tsx";
import { useShellSupport } from "../../shell/supportStore.tsx";
import { useStore } from "../../store";
import { PageHeader } from "../components/PageHeader.tsx";
import { useAppMode } from "../hooks/useAppMode.ts";
import { useLiveInvoices } from "../hooks/useCommercial.ts";
import { useLiveJobsList } from "../hooks/useJobs.ts";
import { isBeforeToday } from "../../lib/dates.ts";

export function OverviewPageV2() {
  const { tx } = useStore();
  const { shell, enabled } = useAppMode();
  const jobsShell = useShellJobs();
  const ops = useShellOps();
  const billing = useShellBilling();
  const support = useShellSupport();
  const liveJobs = useLiveJobsList();
  const liveInv = useLiveInvoices();

  const jobs = shell ? jobsShell.jobs : (liveJobs.data ?? []);
  const invoices = shell ? billing.invoices : (liveInv.data ?? []).map((i) => ({
    balanceDue: parseFloat(i.balanceDue),
    dueDate: i.dueDate,
    status: i.status,
    overdue: i.status !== "PAID" && parseFloat(i.balanceDue) > 0 && isBeforeToday(String(i.dueDate).slice(0, 10)),
  }));

  const activeJobs = jobs.filter((j) => j.status !== "CLOSED");
  const delayed = jobs.filter((j) => j.delayed);
  const departing = jobs.filter((j) => jobDateIsToday(j.etd)).length;
  const arriving = jobs.filter((j) => jobDateIsToday(j.eta)).length;
  const gpTotal = jobs.reduce((n, j) => n + (j.listGrossProfit ?? jobGrossProfit(j)), 0);
  const missingDocs = shell ? support.docs.filter((d) => d.status === "late" || d.status === "wait") : [];
  const outstanding = invoices.filter((i) => i.balanceDue > 0);
  const teu = shell ? ops.boxes.reduce((n, b) => n + b.teu, 0) : jobs.reduce((n, j) => n + (j.quantity ?? 1) * 2, 0);

  const exceptions = useMemo(() => {
    const rows: { id: string; label: string; meta: string; to: string }[] = [];
    for (const j of delayed.slice(0, 5)) {
      rows.push({ id: j.id, label: j.jobNumber, meta: "delayed", to: `/jobs/${j.id}` });
    }
    for (const d of missingDocs.slice(0, 5)) {
      rows.push({
        id: d.id,
        label: d.name,
        meta: d.status,
        to: d.jobId ? `/jobs/${d.jobId}` : "/docs",
      });
    }
    return rows;
  }, [delayed, missingDocs]);

  if (!enabled) {
    return (
      <div style={{ padding: 24 }}>
        <PageHeader title={tx("navOverview")} subtitle={tx("apiNotConfigured")} />
        <Link to="/login">{tx("loginPickDept")}</Link>
      </div>
    );
  }

  const hint = shell ? tx("shellDataBadge") : tx("liveApiBadge");

  return (
    <div style={{ padding: "0 8px 24px" }}>
      <PageHeader
        title={tx("navOverview")}
        subtitle={`LogisticsOS · ${hint} · ${todayMonthDay()}`}
        extra={
          <>
            <Link to="/exceptions">{tx("navActionCenter")}</Link>
            {" · "}
            <Link to="/jobs">{tx("navJobs")}</Link>
          </>
        }
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={8} lg={4}>
          <Card size="small"><Statistic title={tx("dashActiveJobs")} value={activeJobs.length} /></Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card size="small"><Statistic title={tx("dashDeparting")} value={departing} /></Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card size="small"><Statistic title={tx("dashArriving")} value={arriving} /></Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card size="small"><Statistic title="TEU" value={teu} /></Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card size="small"><Statistic title={tx("dashGpMonth")} value={Math.round(gpTotal)} prefix="$" /></Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card size="small"><Statistic title="AR open" value={outstanding.length} /></Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} lg={12}>
          <Card size="small" title={tx("navActionCenter")}>
            <List
              size="small"
              dataSource={exceptions}
              locale={{ emptyText: "—" }}
              renderItem={(item) => (
                <List.Item>
                  <Link to={item.to}>{item.label}</Link>
                  <span style={{ color: "#888", marginLeft: 8 }}>{item.meta}</span>
                </List.Item>
              )}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card size="small" title={tx("dashDocs")}>
            <Statistic value={missingDocs.length} suffix={tx("docsMissingCount")} />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
