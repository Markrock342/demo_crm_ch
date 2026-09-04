import { Button, Card, Checkbox, Col, Descriptions, Input, List, Modal, Row, Space, Table, Tabs, Typography, Upload, message } from "antd";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { customerName, type Customer, type Mail } from "../../data";
import type { ShellJob } from "../../ports/job.port.ts";
import { useShellCrm } from "../../shell/crmStore.tsx";
import { useShellJobs } from "../../shell/jobStore.tsx";
import { useShellSupport } from "../../shell/supportStore.tsx";
import { useStore } from "../../store";
import { Money } from "../components/Money.tsx";
import { PageHeader } from "../components/PageHeader.tsx";
import { AiBriefCard } from "../components/AiBriefCard.tsx";
import { AiMailPanel } from "../components/AiMailPanel.tsx";
import { ErrorState, LoadingState } from "../components/states.tsx";
import { StatusTag } from "../components/StatusTag.tsx";
import { useJobCharges, useJobFinancials, useJobMilestones, useJobTasks, useCreateJobTask, usePatchJobMilestone, usePatchJobTask } from "../hooks/useJobs.ts";
import { useCustomerDocs, useCustomerMails, useJobContainers, useLiveInvoices } from "../hooks/useCommercial.ts";
import { useAppMode } from "../hooks/useAppMode.ts";
import { uploadDocFile } from "../../api/operations.ts";
import { apiConfirmSendMail, apiCreateMail, apiPatchMail } from "../../api/comms.ts";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../queries/keys.ts";

type Props = {
  job: ShellJob;
};

export function JobDetailLiveV2({ job }: Props) {
  const { tx, locale, tasks: storeTasks } = useStore();
  const { live } = useAppMode();
  const qc = useQueryClient();
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [editMail, setEditMail] = useState<Mail | null>(null);
  const [mailDraft, setMailDraft] = useState({ subjectEn: "", draftEn: "", to: "" });
  const [emailAiId, setEmailAiId] = useState<string | null>(null);
  const crm = useShellCrm();
  const shellJobs = useShellJobs();
  const support = useShellSupport();
  const customer = crm.customers.find((c) => c.id === job.customerId);

  const financials = useJobFinancials(job.id);
  const charges = useJobCharges(job.id);
  const milestones = useJobMilestones(job.id);
  const patchMilestone = usePatchJobMilestone(job.id);
  const jobTasksQuery = useJobTasks(job.id);
  const createTask = useCreateJobTask(job.id);
  const patchTask = usePatchJobTask(job.id);
  const containers = useJobContainers(job.id);
  const docs = useCustomerDocs(job.customerId);
  const mails = useCustomerMails(job.customerId);
  const invoices = useLiveInvoices(job.customerId);

  const invalidateMails = () => void qc.invalidateQueries({ queryKey: queryKeys.mails.byCustomer(job.customerId) });

  const createMailMut = useMutation({
    mutationFn: () => {
      const now = new Date();
      const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      return apiCreateMail({
        id: `mail-${Date.now()}`,
        customerId: job.customerId,
        from: "ops@cangzhan.com",
        subjectZh: mailDraft.subjectEn,
        subjectTh: mailDraft.subjectEn,
        subjectEn: mailDraft.subjectEn,
        bodyZh: "",
        bodyTh: "",
        bodyEn: "",
        draftZh: mailDraft.draftEn,
        draftTh: mailDraft.draftEn,
        draftEn: mailDraft.draftEn,
        time,
        confidence: 1,
        unread: false,
        state: "open",
        summary: `jobId=${job.id}`,
      });
    },
    onSuccess: () => {
      invalidateMails();
      setComposeOpen(false);
      setMailDraft({ subjectEn: "", draftEn: "", to: "" });
      message.success("Draft created");
    },
    onError: (e: Error) => message.error(e.message),
  });

  const patchMailMut = useMutation({
    mutationFn: () =>
      apiPatchMail(editMail!.id, {
        draftEn: mailDraft.draftEn,
        subjectEn: mailDraft.subjectEn,
      }),
    onSuccess: () => {
      invalidateMails();
      setEditMail(null);
      message.success("Draft saved");
    },
    onError: (e: Error) => message.error(e.message),
  });

  const sendMailMut = useMutation({
    mutationFn: (mail: Mail) =>
      apiConfirmSendMail(mail.id, {
        to: mail.from || undefined,
        subject: mail.subjectEn,
        body: mail.draftEn || mail.bodyEn,
        jobId: job.id,
      }),
    onSuccess: () => {
      invalidateMails();
      message.success("Email sent (sandbox)");
    },
    onError: (e: Error) => message.error(e.message),
  });

  const shellJobTasks = storeTasks.filter((t) => t.customerId === job.customerId && !t.done);
  const liveJobTasks = jobTasksQuery.data ?? [];
  const jobTasks = live ? liveJobTasks : shellJobTasks;
  const shellMilestones = job.milestones;
  const liveMilestones = milestones.data ?? [];
  const milestoneRows = live ? liveMilestones : shellMilestones;

  const gp = financials.data?.grossProfit ? parseFloat(financials.data.grossProfit) : null;
  const revenue = financials.data?.totalRevenue ? parseFloat(financials.data.totalRevenue) : null;
  const cost = financials.data?.totalCost ? parseFloat(financials.data.totalCost) : null;
  const margin = financials.data?.marginPct ? parseFloat(financials.data.marginPct) : null;
  const localeTag = locale === "zh" ? "zh-CN" : locale === "th" ? "th-TH" : "en-US";

  const missingDocs = support.docs.filter((d) => d.jobId === job.id && (d.status === "late" || d.status === "wait")).length;
  const jobAiFacts = {
    jobNumber: job.jobNumber,
    status: job.status,
    pol: job.pol,
    pod: job.pod,
    etd: job.etd,
    eta: job.eta,
    carrier: job.carrier || "—",
    billing: job.billingStatus,
    delayed: Boolean(job.delayed),
    missingDocs,
    grossProfit: gp ?? 0,
    marginPct: margin ?? 0,
  };
  const jobAiLocal = `${job.jobNumber} is ${job.status}. ${job.pol}→${job.pod}. ETD ${job.etd} / ETA ${job.eta}. Billing ${job.billingStatus}.${job.delayed ? " Delayed." : ""}`;
  const mailRows = mails.data ?? [];
  const emailAiMail = mailRows.find((m) => m.id === emailAiId) ?? null;

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
            <AiBriefCard
              title={tx("aiJobSummary")}
              buttonLabel={tx("runAiJobSummary")}
              facts={jobAiFacts}
              localFallback={jobAiLocal}
              style={{ marginBottom: 16 }}
            />
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
          {live && milestones.isLoading ? (
            <LoadingState />
          ) : milestoneRows.length === 0 ? (
            <Typography.Text type="secondary">—</Typography.Text>
          ) : (
            <List
              size="small"
              dataSource={milestoneRows}
              renderItem={(m) => (
                <List.Item>
                  <Checkbox
                    checked={Boolean(m.actualAt)}
                    disabled={live && patchMilestone.isPending}
                    onChange={(e) => {
                      if (live) {
                        patchMilestone.mutate(
                          { code: m.code, complete: e.target.checked },
                          { onError: (err: Error) => message.error(err.message) },
                        );
                      } else {
                        shellJobs.toggleMilestone(job.id, m.code, e.target.checked);
                      }
                    }}
                  >
                    {m.label}
                  </Checkbox>
                  <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
                    {m.actualAt
                      ? m.actualAt.slice(0, 10)
                      : "plannedAt" in m && typeof m.plannedAt === "string"
                        ? m.plannedAt.slice(0, 10)
                        : "—"}
                  </Typography.Text>
                </List.Item>
              )}
            />
          )}
        </Card>
      ),
    },
    {
      key: "tasks",
      label: tx("navTasks"),
      children: (
        <Card size="small">
          {live ? (
            <Space.Compact style={{ width: "100%", marginBottom: 12 }}>
              <Input
                placeholder="New task…"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onPressEnter={() => {
                  if (!newTaskTitle.trim()) return;
                  createTask.mutate(
                    { title: newTaskTitle.trim() },
                    {
                      onSuccess: () => setNewTaskTitle(""),
                      onError: (e: Error) => message.error(e.message),
                    },
                  );
                }}
              />
              <Button
                type="primary"
                loading={createTask.isPending}
                onClick={() => {
                  if (!newTaskTitle.trim()) return;
                  createTask.mutate({ title: newTaskTitle.trim() }, { onSuccess: () => setNewTaskTitle("") });
                }}
              >
                Add
              </Button>
            </Space.Compact>
          ) : null}
          {live && jobTasksQuery.isLoading ? (
            <LoadingState />
          ) : jobTasks.length === 0 ? (
            <Typography.Text type="secondary">{tx("emptyTasks")}</Typography.Text>
          ) : live ? (
            <List
              size="small"
              dataSource={liveJobTasks}
              rowKey="id"
              renderItem={(t) => (
                <List.Item>
                  <Checkbox
                    checked={t.done}
                    onChange={(e) => patchTask.mutate({ taskId: t.id, patch: { done: e.target.checked } })}
                  />
                  <StatusTag status={t.priority === "high" ? "OVERDUE" : "OPEN"} label={t.priority} />
                  <span style={{ marginLeft: 8 }}>{t.title}</span>
                  {t.dueAt ? (
                    <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
                      {t.dueAt.slice(0, 10)}
                    </Typography.Text>
                  ) : null}
                </List.Item>
              )}
            />
          ) : (
            <List
              size="small"
              dataSource={shellJobTasks}
              rowKey="id"
              renderItem={(t) => (
                <List.Item>
                  <StatusTag status={t.priority === "high" ? "OVERDUE" : "OPEN"} label={t.priority} />
                  <span style={{ marginLeft: 8 }}>{t.title}</span>
                  {t.due ? <Typography.Text type="secondary" style={{ marginLeft: 8 }}>{t.due}</Typography.Text> : null}
                </List.Item>
              )}
            />
          )}
        </Card>
      ),
    },
    {
      key: "emails",
      label: tx("navInbox"),
      children: (
        <Card
          size="small"
          extra={
            live ? (
              <Button
                size="small"
                type="primary"
                onClick={() => {
                  setMailDraft({ subjectEn: `Re: ${job.jobNumber}`, draftEn: "", to: customer?.nameEn ?? "" });
                  setComposeOpen(true);
                }}
              >
                Compose
              </Button>
            ) : null
          }
        >
          {mails.isLoading ? (
            <LoadingState />
          ) : (
            <>
            <Table
              size="small"
              pagination={false}
              dataSource={mailRows.map((m) => ({ ...m, key: m.id }))}
              columns={[
                { title: "From", dataIndex: "from", width: 160 },
                { title: "Subject", dataIndex: locale === "zh" ? "subjectZh" : locale === "th" ? "subjectTh" : "subjectEn" },
                { title: tx("colStatus"), dataIndex: "state", render: (s: string) => <StatusTag status={s} /> },
                { title: "Time", dataIndex: "time", width: 80 },
                {
                  title: "AI",
                  width: 72,
                  render: (_: unknown, row: Mail) => (
                    <Button size="small" type={emailAiId === row.id ? "primary" : "default"} onClick={() => setEmailAiId(row.id)}>
                      AI
                    </Button>
                  ),
                },
                ...(live
                  ? [
                      {
                        title: "",
                        width: 140,
                        render: (_: unknown, row: Mail) =>
                          row.state === "open" ? (
                            <Space size="small">
                              <Button
                                size="small"
                                onClick={() => {
                                  setEditMail(row);
                                  setMailDraft({ subjectEn: row.subjectEn, draftEn: row.draftEn || row.bodyEn, to: row.from });
                                }}
                              >
                                Edit
                              </Button>
                              <Button size="small" type="primary" loading={sendMailMut.isPending} onClick={() => sendMailMut.mutate(row)}>
                                Send
                              </Button>
                            </Space>
                          ) : null,
                      },
                    ]
                  : []),
              ]}
            />
            {emailAiMail ? <AiMailPanel mail={emailAiMail} /> : null}
            </>
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
                { title: tx("colStatus"), dataIndex: "status", render: (s: string) => <StatusTag status={s} /> },
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
                { title: tx("colStatus"), dataIndex: "status", render: (s: string) => <StatusTag status={s} /> },
                { title: tx("colUpdated"), dataIndex: "updated" },
                live
                  ? {
                      title: "File",
                      width: 120,
                      render: (_: unknown, row: { id: string }) => (
                        <Upload
                          showUploadList={false}
                          customRequest={async ({ file, onSuccess, onError }) => {
                            try {
                              await uploadDocFile(row.id, file as File);
                              void qc.invalidateQueries({ queryKey: queryKeys.docs.byCustomer(job.customerId) });
                              onSuccess?.(file);
                              message.success("Uploaded");
                            } catch (e) {
                              onError?.(e as Error);
                              message.error((e as Error).message);
                            }
                          }}
                        >
                          <Button size="small">Upload</Button>
                        </Upload>
                      ),
                    }
                  : {},
              ].filter((c) => Object.keys(c).length > 0)}
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
                { title: tx("colStatus"), dataIndex: "status", render: (s: string) => <StatusTag status={s} /> },
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

      <Modal
        title="Compose email"
        open={composeOpen}
        onCancel={() => setComposeOpen(false)}
        onOk={() => createMailMut.mutate()}
        confirmLoading={createMailMut.isPending}
        okText="Save draft"
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Input placeholder="Subject" value={mailDraft.subjectEn} onChange={(e) => setMailDraft({ ...mailDraft, subjectEn: e.target.value })} />
          <Input.TextArea rows={6} placeholder="Message body" value={mailDraft.draftEn} onChange={(e) => setMailDraft({ ...mailDraft, draftEn: e.target.value })} />
        </Space>
      </Modal>

      <Modal
        title="Edit draft"
        open={Boolean(editMail)}
        onCancel={() => setEditMail(null)}
        onOk={() => patchMailMut.mutate()}
        confirmLoading={patchMailMut.isPending}
        okText="Save"
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Input placeholder="Subject" value={mailDraft.subjectEn} onChange={(e) => setMailDraft({ ...mailDraft, subjectEn: e.target.value })} />
          <Input.TextArea rows={6} placeholder="Draft body" value={mailDraft.draftEn} onChange={(e) => setMailDraft({ ...mailDraft, draftEn: e.target.value })} />
        </Space>
      </Modal>
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
