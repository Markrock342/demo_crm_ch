import { Alert, Button, Card, Col, Form, Input, InputNumber, Row, Select, Space, Steps, Table, Typography, message } from "antd";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  approveQuotation,
  createBookingFromQuote,
  createJobFromBooking,
  createQuotationFromRate,
  sendQuotation,
  signPublicQuotation,
  submitQuotationApproval,
  type RateSearchRow,
} from "../../api/commercial.ts";
import { customerName, type Customer } from "../../data";
import { useShellCrm } from "../../shell/crmStore.tsx";
import { useShellQuotes } from "../../shell/quoteStore.tsx";
import { useStore } from "../../store";
import { PageHeader } from "../components/PageHeader.tsx";
import { AiBriefCard } from "../components/AiBriefCard.tsx";
import { Money } from "../components/Money.tsx";
import { useAppMode } from "../hooks/useAppMode.ts";
import { useCrmBundle, useLiveRates } from "../hooks/useCommercial.ts";
import { queryKeys } from "../queries/keys.ts";

type WorkflowState = {
  quotationId: string;
  quotationNumber?: string;
  status: string;
  publicToken?: string;
  bookingId?: string;
  bookingNumber?: string;
  jobId?: string;
  jobNumber?: string;
};

export function QuoteWizardPageV2() {
  const { shell, live } = useAppMode();
  const { tx, locale } = useStore();
  const crmShell = useShellCrm();
  const quotesShell = useShellQuotes();
  const bundle = useCrmBundle();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const localeTag = locale === "zh" ? "zh-CN" : locale === "th" ? "th-TH" : "en-US";

  const customers = shell ? crmShell.customers : (bundle.data?.customers ?? []);
  const [step, setStep] = useState(0);
  const [workflow, setWorkflow] = useState<WorkflowState | null>(null);
  const [form, setForm] = useState({
    customerId: customers[0]?.id ?? "",
    origin: "Shanghai",
    destination: "Laem Chabang",
    pol: "CNSHA",
    pod: "THLCH",
    mode: "SEA_FCL",
    containerType: "40HC",
    quantity: 1,
    markupPct: "15",
  });
  const [selectedLane, setSelectedLane] = useState<RateSearchRow | null>(null);

  const rateParams = useMemo(
    () => ({
      origin: form.origin,
      destination: form.destination,
      pol: form.pol,
      pod: form.pod,
      mode: form.mode,
      containerType: form.containerType,
    }),
    [form],
  );
  const rates = useLiveRates(rateParams, live && step >= 1);

  const stepItems = live
    ? [
        { title: "Lane" },
        { title: "Rates" },
        { title: "Create" },
        { title: "Approval" },
        { title: "Send & accept" },
        { title: "Booking" },
      ]
    : [{ title: "Lane" }, { title: "Rates" }, { title: "Review" }];

  const createLive = useMutation({
    mutationFn: () =>
      createQuotationFromRate({
        customerId: form.customerId,
        rateLaneId: selectedLane!.laneId,
        quantity: form.quantity,
        markupPct: form.markupPct,
      }),
    onSuccess: (data) => {
      const row = data as { id: string; quotationNumber?: string };
      void qc.invalidateQueries({ queryKey: queryKeys.quotations.list() });
      setWorkflow({ quotationId: row.id, quotationNumber: row.quotationNumber, status: "DRAFT" });
      setStep(3);
      message.success("Quotation created");
    },
    onError: (e: Error) => message.error(e.message),
  });

  const submitApproval = useMutation({
    mutationFn: () => submitQuotationApproval(workflow!.quotationId),
    onSuccess: (data) => {
      const result = data as { status: string };
      setWorkflow((w) => (w ? { ...w, status: result.status } : w));
      message.success(`Status: ${result.status}`);
    },
    onError: (e: Error) => message.error(e.message),
  });

  const forceApprove = useMutation({
    mutationFn: () => approveQuotation(workflow!.quotationId, "APPROVED"),
    onSuccess: () => {
      setWorkflow((w) => (w ? { ...w, status: "APPROVED" } : w));
      message.success("Quotation approved");
    },
    onError: (e: Error) => message.error(e.message),
  });

  const sendQuote = useMutation({
    mutationFn: () => sendQuotation(workflow!.quotationId),
    onSuccess: (data) => {
      const result = data as { token: string; publicUrl?: string };
      setWorkflow((w) => (w ? { ...w, status: "SENT", publicToken: result.token } : w));
      message.success("Quotation sent to customer");
    },
    onError: (e: Error) => message.error(e.message),
  });

  const acceptQuote = useMutation({
    mutationFn: () =>
      signPublicQuotation(workflow!.publicToken!, {
        signerName: "Customer Representative",
        signerEmail: "customer@example.com",
        signatureMethod: "TYPED",
        acceptedTerms: true,
        decision: "ACCEPTED",
      }),
    onSuccess: () => {
      setWorkflow((w) => (w ? { ...w, status: "ACCEPTED" } : w));
      message.success("Quotation accepted");
      setStep(5);
    },
    onError: (e: Error) => message.error(e.message),
  });

  const createBooking = useMutation({
    mutationFn: () => createBookingFromQuote(workflow!.quotationId),
    onSuccess: (data) => {
      const result = data as { id: string; bookingNumber: string };
      setWorkflow((w) => (w ? { ...w, bookingId: result.id, bookingNumber: result.bookingNumber } : w));
      message.success(`Booking ${result.bookingNumber} created`);
    },
    onError: (e: Error) => message.error(e.message),
  });

  const createJob = useMutation({
    mutationFn: () => createJobFromBooking(workflow!.bookingId!),
    onSuccess: (data) => {
      const result = data as { id: string; jobNumber: string };
      setWorkflow((w) => (w ? { ...w, jobId: result.id, jobNumber: result.jobNumber } : w));
      void qc.invalidateQueries({ queryKey: queryKeys.jobs.all });
      message.success(`Job ${result.jobNumber} created`);
    },
    onError: (e: Error) => message.error(e.message),
  });

  function submitShell() {
    const fail = quotesShell.createDraft({
      customerId: form.customerId,
      origin: form.origin,
      destination: form.destination,
      pol: form.pol,
      pod: form.pod,
      mode: form.mode,
      containerType: form.containerType,
      quantity: form.quantity,
      currency: "USD",
      charges: [
        { description: "Ocean freight", sellAmount: 1200, currency: "USD" },
        { description: "THC", sellAmount: 150, currency: "USD" },
      ],
      validUntil: "",
      termsAndConditions: "",
    });
    if (fail) {
      message.error(tx(fail));
      return;
    }
    navigate("/quotations");
  }

  const rateColumns = [
    { title: "Vendor", dataIndex: "vendor" },
    { title: "Lane", render: (_: unknown, r: RateSearchRow) => `${r.pol} → ${r.pod}` },
    { title: "Container", dataIndex: "containerType", width: 100 },
    {
      title: "Sell",
      dataIndex: "totalSell",
      align: "right" as const,
      render: (v: string | null, r: RateSearchRow) =>
        v ? <Money amount={parseFloat(v)} currency={r.currency} locale={localeTag} /> : "—",
    },
    {
      title: "",
      width: 90,
      render: (_: unknown, r: RateSearchRow) => (
        <Button size="small" type={selectedLane?.laneId === r.laneId ? "primary" : "default"} onClick={() => setSelectedLane(r)}>
          Select
        </Button>
      ),
    },
  ];

  const wizardFacts = {
    step: step + 1,
    customerId: form.customerId,
    lane: `${form.pol}→${form.pod}`,
    mode: form.mode,
    containerType: form.containerType,
    quantity: form.quantity,
    quotationStatus: workflow?.status ?? "new",
    selectedRate: selectedLane?.totalSell ?? "none",
  };
  const wizardLocal = `Quote wizard step ${step + 1}: ${form.pol}→${form.pod} ${form.containerType}×${form.quantity}. Status ${workflow?.status ?? "new"}.`;

  return (
    <div style={{ padding: "0 8px 24px" }}>
      <PageHeader
        title={tx("quoteWizardTitle")}
        subtitle={tx("quoteWizardHint")}
        breadcrumbs={[
          { title: tx("navQuotations"), href: "/quotations" },
          { title: tx("quoteWizardTitle") },
        ]}
        extra={
          <Link to="/quotations">
            <Button>{tx("cancel")}</Button>
          </Link>
        }
      />

      {!customers.length ? (
        <Alert type="warning" message={tx("quoteNeedCustomer")} action={<Link to="/customers">{tx("shellCreateCustomer")}</Link>} />
      ) : (
        <>
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24}>
              <AiBriefCard title={tx("aiJobSummary")} facts={wizardFacts} localFallback={wizardLocal} compact />
            </Col>
          </Row>
          <Steps current={step} style={{ marginBottom: 24, maxWidth: 720 }} items={stepItems} />

          {step === 0 ? (
            <Card size="small" style={{ maxWidth: 560 }}>
              <Form layout="vertical">
                <Form.Item label={tx("colCustomer")}>
                  <Select
                    value={form.customerId || customers[0]?.id}
                    onChange={(v) => setForm({ ...form, customerId: v })}
                    options={customers.map((c) => ({
                      value: c.id,
                      label: customerName(c as Customer, locale),
                    }))}
                  />
                </Form.Item>
                <Form.Item label="Origin">
                  <Input value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} />
                </Form.Item>
                <Form.Item label="Destination">
                  <Input value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} />
                </Form.Item>
                <Space wrap>
                  <Form.Item label="POL">
                    <Input value={form.pol} onChange={(e) => setForm({ ...form, pol: e.target.value })} style={{ width: 120 }} />
                  </Form.Item>
                  <Form.Item label="POD">
                    <Input value={form.pod} onChange={(e) => setForm({ ...form, pod: e.target.value })} style={{ width: 120 }} />
                  </Form.Item>
                  <Form.Item label="Qty">
                    <InputNumber min={1} value={form.quantity} onChange={(v) => setForm({ ...form, quantity: v ?? 1 })} />
                  </Form.Item>
                  <Form.Item label="Markup %">
                    <Input value={form.markupPct} onChange={(e) => setForm({ ...form, markupPct: e.target.value })} style={{ width: 80 }} />
                  </Form.Item>
                </Space>
                <Button type="primary" onClick={() => setStep(1)}>
                  Next: Search rates
                </Button>
              </Form>
            </Card>
          ) : null}

          {step === 1 ? (
            <Card size="small" title="Matching rates">
              {live && rates.isLoading ? (
                <span>Loading…</span>
              ) : (
                <Table
                  size="small"
                  pagination={false}
                  rowKey="laneId"
                  dataSource={live ? (rates.data ?? []) : []}
                  columns={rateColumns}
                  locale={{ emptyText: shell ? "Switch to production mode for live rates" : "No rates — run db:seed" }}
                />
              )}
              <Space style={{ marginTop: 16 }}>
                <Button onClick={() => setStep(0)}>Back</Button>
                <Button type="primary" disabled={!selectedLane} onClick={() => setStep(2)}>
                  Next
                </Button>
              </Space>
            </Card>
          ) : null}

          {step === 2 ? (
            <Card size="small" title="Create quotation">
              <p>
                {customerName(customers.find((c) => c.id === form.customerId) as Customer, locale)} · {form.pol} → {form.pod} ·{" "}
                {form.quantity}× {form.containerType}
              </p>
              {selectedLane ? (
                <p>
                  Rate: {selectedLane.vendor} · Sell{" "}
                  {selectedLane.totalSell ? (
                    <Money amount={parseFloat(selectedLane.totalSell) * form.quantity} currency={selectedLane.currency} locale={localeTag} />
                  ) : (
                    "—"
                  )}
                </p>
              ) : null}
              <Space>
                <Button onClick={() => setStep(1)}>Back</Button>
                {live ? (
                  <Button type="primary" loading={createLive.isPending} disabled={!selectedLane} onClick={() => createLive.mutate()}>
                    Create quotation
                  </Button>
                ) : (
                  <Button type="primary" onClick={submitShell}>
                    Save draft (shell)
                  </Button>
                )}
              </Space>
            </Card>
          ) : null}

          {live && step === 3 && workflow ? (
            <Card size="small" title="Submit for approval">
              <Typography.Paragraph>
                Quotation <strong>{workflow.quotationNumber ?? workflow.quotationId}</strong> · Status:{" "}
                <Typography.Text code>{workflow.status}</Typography.Text>
              </Typography.Paragraph>
              <Space wrap>
                <Button loading={submitApproval.isPending} onClick={() => submitApproval.mutate()}>
                  Submit for approval
                </Button>
                {workflow.status === "PENDING_APPROVAL" ? (
                  <Button type="primary" loading={forceApprove.isPending} onClick={() => forceApprove.mutate()}>
                    Approve (manager)
                  </Button>
                ) : null}
                {["APPROVED", "DRAFT"].includes(workflow.status) ? (
                  <Button type="primary" onClick={() => setStep(4)}>
                    Continue to send
                  </Button>
                ) : null}
              </Space>
            </Card>
          ) : null}

          {live && step === 4 && workflow ? (
            <Card size="small" title="Send & customer acceptance">
              <Typography.Paragraph>
                Status: <Typography.Text code>{workflow.status}</Typography.Text>
              </Typography.Paragraph>
              <Space direction="vertical" style={{ width: "100%" }}>
                <Space wrap>
                  <Button
                    loading={sendQuote.isPending}
                    disabled={!["APPROVED", "DRAFT", "SENT"].includes(workflow.status)}
                    onClick={() => sendQuote.mutate()}
                  >
                    Send to customer
                  </Button>
                  {workflow.publicToken ? (
                    <Button type="primary" loading={acceptQuote.isPending} onClick={() => acceptQuote.mutate()}>
                      Record customer acceptance
                    </Button>
                  ) : null}
                  {workflow.status === "ACCEPTED" ? (
                    <Button type="primary" onClick={() => setStep(5)}>
                      Continue to booking
                    </Button>
                  ) : null}
                </Space>
                {workflow.publicToken ? (
                  <Alert type="info" showIcon message={`Public link token ready (sandbox sign flow)`} />
                ) : null}
              </Space>
            </Card>
          ) : null}

          {live && step === 5 && workflow ? (
            <Card size="small" title="Booking & job creation">
              <Typography.Paragraph>
                Quotation accepted · Status: <Typography.Text code>{workflow.status}</Typography.Text>
              </Typography.Paragraph>
              <Space direction="vertical">
                <Space wrap>
                  <Button loading={createBooking.isPending} disabled={Boolean(workflow.bookingId)} onClick={() => createBooking.mutate()}>
                    {workflow.bookingId ? `Booking ${workflow.bookingNumber}` : "Create booking"}
                  </Button>
                  {workflow.bookingId ? (
                    <Button loading={createJob.isPending} disabled={Boolean(workflow.jobId)} onClick={() => createJob.mutate()}>
                      {workflow.jobId ? `Job ${workflow.jobNumber}` : "Create job"}
                    </Button>
                  ) : null}
                  {workflow.jobId ? (
                    <Link to={`/jobs/${workflow.jobId}`}>
                      <Button type="primary">Open job detail</Button>
                    </Link>
                  ) : null}
                  <Link to="/quotations">
                    <Button>View all quotations</Button>
                  </Link>
                </Space>
              </Space>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
