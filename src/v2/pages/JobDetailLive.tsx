import { Button, Card, Col, Descriptions, Row, Space, Steps, Table, Tabs, Typography } from "antd";
import { Link } from "react-router-dom";
import { customerName, type Customer } from "../../data";
import type { ShellJob } from "../../ports/job.port.ts";
import { useShellCrm } from "../../shell/crmStore.tsx";
import { useStore } from "../../store";
import { Money } from "../components/Money.tsx";
import { PageHeader } from "../components/PageHeader.tsx";
import { ErrorState, LoadingState } from "../components/states.tsx";
import { StatusTag } from "../components/StatusTag.tsx";
import { useJobCharges, useJobFinancials, useJobMilestones } from "../hooks/useJobs.ts";
import { useCustomerDocs, useJobContainers, useLiveInvoices } from "../hooks/useCommercial.ts";

type Props = {
  job: ShellJob;
};

export function JobDetailLiveV2({ job }: Props) {
  const { tx, locale } = useStore();
  const crm = useShellCrm();
  const customer = crm.customers.find((c) => c.id === job.customerId);

  const financials = useJobFinancials(job.id);
  const charges = useJobCharges(job.id);
  const milestones = useJobMilestones(job.id);
  const containers = useJobContainers(job.id);
  const docs = useCustomerDocs(job.customerId);
  const invoices = useLiveInvoices(job.customerId);

  const gp = financials.data?.grossProfit ? parseFloat(financials.data.grossProfit) : null;
  const revenue = financials.data?.totalRevenue ? parseFloat(financials.data.totalRevenue) : null;
  const cost = financials.data?.totalCost ? parseFloat(financials.data.totalCost) : null;
  const margin = financials.data?.marginPct ? parseFloat(financials.data.marginPct) : null;
  const localeTag = locale === "zh" ? "zh-CN" : locale === "th" ? "th-TH" : "en-US";

  const msItems = (milestones.data ?? []).map((m) => ({
    title: m.label,
    description: m.actualAt ? m.actualAt.slice(0, 10) : m.plannedAt?.slice(0, 10) ?? "—",
    status: (m.actualAt ? "finish" : m.plannedAt ? "process" : "wait") as "finish" | "process" | "wait",
  }));

  const chargeRows = [
    ...(charges.data ?? []).map((c) => ({
      key: c.id,
      type: c.chargeType,
      description: c.description,
      amount: parseFloat(c.totalAmount),
      currency: c.currency,
    })),
  ];

  const tabItems = [
    {
      key: "overview",
      label: tx("tabOverview"),
      children: (
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={16}>
            <Card size="small" title={tx("tabOverview")}>
              <Descriptions column={{ xs: 1, sm: 2 }} size="small">
                <Descriptions.Item label={tx("colCustomer")}>
                  {customer ? customerName(customer as Customer, locale) : job.customerId}
                </Descriptions.Item>
                <Descriptions.Item label={tx("colStatus")}>
                  <StatusTag status={job.status} />
                </Descriptions.Item>
                <Descriptions.Item label="Lane">
                  <Typography.Text code>
                    {job.pol} → {job.pod}
                  </Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label={tx("colCarrier")}>{job.carrier || "—"}</Descriptions.Item>
                <Descriptions.Item label="Vessel / Voyage">
                  {[job.vessel, job.voyage].filter(Boolean).join(" / ") || "—"}
                </Descriptions.Item>
                <Descriptions.Item label={tx("calEtd")}>{job.etd}</Descriptions.Item>
                <Descriptions.Item label={tx("calEta")}>{job.eta}</Descriptions.Item>
                <Descriptions.Item label={tx("jobOwners")}>
                  {job.salesOwner || "—"} / {job.opsOwner || "—"}
                </Descriptions.Item>
                <Descriptions.Item label="Incoterm">{job.incoterm || "—"}</Descriptions.Item>
                <Descriptions.Item label="Container">{job.containerType} × {job.quantity}</Descriptions.Item>
              </Descriptions>
            </Card>
          </Col>
          <Col xs={24} lg={8}>
            <Card size="small" title={tx("jobGrossProfit")}>
              {financials.isLoading ? (
                <LoadingState />
              ) : financials.isError ? (
                <Typography.Text type="secondary">—</Typography.Text>
              ) : (
                <Space direction="vertical" size={4}>
                  <div>
                    <Typography.Text type="secondary">Sell </Typography.Text>
                    {revenue != null ? <Money amount={revenue} currency={job.currency} locale={localeTag} strong /> : "—"}
                  </div>
                  <div>
                    <Typography.Text type="secondary">Cost </Typography.Text>
                    {cost != null ? <Money amount={cost} currency={job.currency} locale={localeTag} /> : "—"}
                  </div>
                  <div>
                    <Typography.Text type="secondary">GP </Typography.Text>
                    {gp != null ? <Money amount={gp} currency={job.currency} locale={localeTag} strong /> : "—"}
                    {margin != null ? ` (${margin.toFixed(1)}%)` : null}
                  </div>
                </Space>
              )}
            </Card>
          </Col>
        </Row>
      ),
    },
    {
      key: "milestones",
      label: "Milestones",
      children: (
        <Card size="small">
          {milestones.isLoading ? (
            <LoadingState />
          ) : msItems.length === 0 ? (
            <Typography.Text type="secondary">—</Typography.Text>
          ) : (
            <Steps direction="vertical" size="small" items={msItems} />
          )}
        </Card>
      ),
    },
    {
      key: "containers",
      label: tx("navBoxes"),
      children: (
        <Card size="small">
          {containers.isLoading ? (
            <LoadingState />
          ) : (
            <Table
              size="small"
              pagination={false}
              dataSource={(containers.data ?? []).map((c) => ({ ...c, key: c.id }))}
              columns={[
                { title: tx("colBox"), dataIndex: "containerNo" },
                { title: tx("colType"), dataIndex: "type", width: 80 },
                { title: tx("colStatus"), dataIndex: "status", render: (s) => <StatusTag status={s} /> },
                { title: "Seal", dataIndex: "seal" },
                { title: tx("colEta"), dataIndex: "eta" },
              ]}
            />
          )}
        </Card>
      ),
    },
    {
      key: "documents",
      label: tx("navDocs"),
      children: (
        <Card size="small">
          {docs.isLoading ? (
            <LoadingState />
          ) : (
            <Table
              size="small"
              pagination={false}
              dataSource={(docs.data ?? []).map((d) => ({ ...d, key: d.id }))}
              columns={[
                { title: tx("colKind"), dataIndex: "kind" },
                { title: tx("colFile"), dataIndex: "name" },
                { title: tx("colStatus"), dataIndex: "status", render: (s) => <StatusTag status={s} /> },
                { title: tx("colUpdated"), dataIndex: "updated" },
              ]}
            />
          )}
        </Card>
      ),
    },
    {
      key: "invoices",
      label: tx("navInvoices"),
      children: (
        <Card size="small">
          {invoices.isLoading ? (
            <LoadingState />
          ) : (
            <Table
              size="small"
              pagination={false}
              dataSource={(invoices.data ?? [])
                .filter((i) => i.jobId === job.id)
                .map((i) => ({ ...i, key: i.id }))}
              columns={[
                { title: "Invoice", dataIndex: "invoiceNumber" },
                { title: tx("colStatus"), dataIndex: "status", render: (s) => <StatusTag status={s} /> },
                {
                  title: "Total",
                  dataIndex: "total",
                  align: "right",
                  render: (v, row) => <Money amount={parseFloat(v)} currency={row.currency} locale={localeTag} />,
                },
                {
                  title: "Balance",
                  dataIndex: "balanceDue",
                  align: "right",
                  render: (v, row) => <Money amount={parseFloat(v)} currency={row.currency} locale={localeTag} />,
                },
                { title: tx("invoiceDueDate"), dataIndex: "dueDate", render: (d) => String(d).slice(0, 10) },
              ]}
            />
          )}
        </Card>
      ),
    },
    {
      key: "charges",
      label: "Charges",
      children: (
        <Card size="small">
          {charges.isLoading ? (
            <LoadingState />
          ) : (
            <Table
              size="small"
              pagination={false}
              dataSource={chargeRows}
              columns={[
                { title: "Type", dataIndex: "type", width: 100 },
                { title: "Description", dataIndex: "description" },
                {
                  title: "Amount",
                  dataIndex: "amount",
                  align: "right",
                  render: (v: number, row) => <Money amount={v} currency={row.currency} locale={localeTag} />,
                },
              ]}
            />
          )}
        </Card>
      ),
    },
  ];

  return (
    <div style={{ padding: "0 8px 24px" }}>
      <PageHeader
        title={job.jobNumber}
        subtitle={
          <>
            {customer ? customerName(customer as Customer, locale) : job.customerId}
            {" · "}
            <StatusTag status={job.status} />
            {job.delayed ? (
              <>
                {" · "}
                <StatusTag status="OVERDUE" label="at risk" />
              </>
            ) : null}
          </>
        }
        breadcrumbs={[
          { title: tx("navJobs"), href: "/jobs" },
          { title: job.jobNumber },
        ]}
        extra={
          <Link to="/jobs">
            <Button>{tx("navJobs")}</Button>
          </Link>
        }
      />

      <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
        {job.pol} → {job.pod} · {job.carrier || "—"} · ETD {job.etd} · ETA {job.eta}
      </Typography.Paragraph>

      <Tabs items={tabItems} />
    </div>
  );
}

export function JobDetailLiveV2Loader({
  job,
  loading,
  error,
}: {
  job: ShellJob | null;
  loading: boolean;
  error: string | null;
}) {
  const { tx } = useStore();

  if (loading) {
    return (
      <div style={{ padding: 24 }}>
        <LoadingState tip={tx("loginBusy")} />
      </div>
    );
  }

  if (error || !job) {
    return (
      <div style={{ padding: 24 }}>
        <ErrorState subTitle={error ?? tx("emptyShellCrm")} />
        <Link to="/jobs">{tx("navJobs")}</Link>
      </div>
    );
  }

  return <JobDetailLiveV2 job={job} />;
}
