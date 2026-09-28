import { ArrowLeft, ArrowRight, Boat, CheckCircle, Circle, Cube } from "@phosphor-icons/react";
import { Alert, App, Button, Form, Input, InputNumber, Select, Steps } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  approveQuotation,
  createBookingFromQuote,
  createJobFromBooking,
  createQuotationFromRate,
  fetchBookingsForQuote,
  fetchQuotation,
  sendQuotation,
  signPublicQuotation,
  submitQuotationApproval,
  type RateSearchRow,
} from "../../api/commercial.ts";
import { useShellJobs } from "../../shell/jobStore.tsx";
import { useShellQuotes } from "../../shell/quoteStore.tsx";
import { useStore } from "../../store";
import {
  AiBriefCard,
  EmptyState,
  ErrorState,
  Flag,
  IconBadge,
  Legend,
  LoadingState,
  PageHeader,
  Panel,
  RouteTrack,
  SegmentBar,
  StatusTag,
} from "../components";
import { useAppMode } from "../hooks/useAppMode.ts";
import { useLiveRates } from "../hooks/useCommercial.ts";
import { useCustomerLookup } from "../hooks/useCustomerLookup.ts";
import { fmtDate, fmtMoney } from "../lib/format.ts";
import { queryKeys } from "../queries/keys.ts";
import { modeLabel, useIsPhone } from "./jobsShared.ts";
import { CompanyMark, DateChip } from "./SalesMobileList.tsx";
import { daysUntil, fmtShortDate } from "./salesUtil.ts";
import "./jobs.css";
import "./sales.css";

/** Demo-mode draft charges (see submitShell) — shown as the price breakdown before saving. */
const SHELL_CHARGES = { ocean: 1200, thc: 150, currency: "USD" };

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

type QuoteDetail = {
  quotation: {
    id: string;
    quotationNumber: string;
    customerId: string;
    origin: string;
    destination: string;
    pol: string;
    pod: string;
    mode: string;
    containerType: string | null;
    quantity: number;
    currency: string;
    status: string;
  };
  totals: { totalSell: string | null } | null;
};

const CLOSED = ["REJECTED", "EXPIRED", "CANCELLED", "VOID"];
const CONTAINER_TYPES = ["20GP", "40GP", "40HC", "45HC"];
const MODES = ["SEA_FCL", "SEA_LCL"];

/** Which wizard step an existing quotation belongs on. */
function stepForStatus(status: string): number {
  if (status === "SENT") return 4;
  if (status === "ACCEPTED") return 5;
  return 3;
}

export function QuoteWizardPageV2() {
  const { shell, live } = useAppMode();
  const { tx, locale } = useStore();
  const { message } = App.useApp();
  const quotesShell = useShellQuotes();
  const jobsShell = useShellJobs();
  const { customers, nameOf, loading: customersLoading } = useCustomerLookup();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const phone = useIsPhone();
  const [params] = useSearchParams();
  const existingId = params.get("quote");

  const [step, setStep] = useState(0);
  const [workflow, setWorkflow] = useState<WorkflowState | null>(null);
  const [existingTotal, setExistingTotal] = useState<{ amount: number; currency: string } | null>(null);
  // Pre-fill from links on other pages: Rates (?origin&destination&pol&pod&containerType&rateLaneId)
  // and customer detail (?customerId). Ignored when opening an existing quotation (?quote).
  const prefill = (key: string, fallback: string) => (!existingId && params.get(key)?.trim()) || fallback;
  const presetLaneId = existingId ? null : params.get("rateLaneId");
  const [form, setForm] = useState(() => ({
    customerId: prefill("customerId", ""),
    origin: prefill("origin", "Shanghai"),
    destination: prefill("destination", "Laem Chabang"),
    pol: prefill("pol", "CNSHA").toUpperCase(),
    pod: prefill("pod", "THLCH").toUpperCase(),
    mode: prefill("mode", "SEA_FCL"),
    containerType: prefill("containerType", "40HC"),
    quantity: 1,
    markupPct: "15",
  }));
  const [selectedLane, setSelectedLane] = useState<RateSearchRow | null>(null);
  const knownCustomer = form.customerId && (customersLoading || customers.some((c) => c.id === form.customerId));
  const customerId = (knownCustomer ? form.customerId : "") || customers[0]?.id || "";

  /* ── Open an existing quotation (?quote=<id>) ── */
  const shellExisting = shell && existingId ? quotesShell.getById(existingId) : undefined;
  const liveExisting = useQuery({
    queryKey: ["quotations", "detail", existingId ?? ""],
    queryFn: () => fetchQuotation(existingId!) as Promise<QuoteDetail>,
    enabled: live && Boolean(existingId),
  });

  useEffect(() => {
    if (!existingId) return;
    if (shellExisting) {
      const q = shellExisting;
      setForm((f) => ({
        ...f,
        customerId: q.customerId,
        origin: q.origin,
        destination: q.destination,
        pol: q.pol,
        pod: q.pod,
        mode: q.mode,
        containerType: q.containerType,
        quantity: q.quantity,
      }));
      setWorkflow({ quotationId: q.id, quotationNumber: q.quotationNumber, status: q.status });
      setExistingTotal({ amount: q.totalSell, currency: q.currency });
      setStep(2);
      return;
    }
    const d = liveExisting.data;
    if (!d?.quotation) return;
    const q = d.quotation;
    setForm((f) => ({
      ...f,
      customerId: q.customerId,
      origin: q.origin,
      destination: q.destination,
      pol: q.pol,
      pod: q.pod,
      mode: q.mode,
      containerType: q.containerType ?? f.containerType,
      quantity: q.quantity,
    }));
    setWorkflow((w) => (w?.quotationId === q.id ? w : { quotationId: q.id, quotationNumber: q.quotationNumber, status: q.status }));
    if (d.totals?.totalSell) setExistingTotal({ amount: parseFloat(d.totals.totalSell), currency: q.currency });
    setStep(stepForStatus(q.status));
    if (q.status === "ACCEPTED") {
      void fetchBookingsForQuote(q.id)
        .then((b) => {
          if (b[0]) setWorkflow((w) => (w ? { ...w, bookingId: b[0].id, bookingNumber: b[0].bookingNumber } : w));
        })
        .catch(() => undefined);
    }
  }, [existingId, shellExisting, liveExisting.data]);

  const rateParams = useMemo(
    () => ({
      origin: form.origin,
      destination: form.destination,
      pol: form.pol,
      pod: form.pod,
      mode: form.mode,
      containerType: form.containerType,
    }),
    [form.origin, form.destination, form.pol, form.pod, form.mode, form.containerType],
  );
  const rates = useLiveRates(rateParams, live && (step === 1 || (step === 0 && Boolean(presetLaneId))));

  // A rate chosen on the Rates page is pre-selected once the matching lane loads.
  const [presetApplied, setPresetApplied] = useState(false);
  useEffect(() => {
    if (!presetLaneId || presetApplied || !rates.data) return;
    const hit = rates.data.find((r) => r.laneId === presetLaneId);
    if (hit) setSelectedLane(hit);
    setPresetApplied(true);
  }, [presetLaneId, presetApplied, rates.data]);

  const stepItems = (
    live
      ? ["jobs_wStepRoute", "jobs_wStepRate", "jobs_wStepReview", "jobs_wStepApproval", "jobs_wStepSend", "jobs_wStepBooking"]
      : ["jobs_wStepRoute", "jobs_wStepRate", "jobs_wStepReview"]
  ).map((k) => ({ title: tx(k) }));

  /* ── Live mutations (unchanged flow) ── */
  const createLive = useMutation({
    mutationFn: () =>
      createQuotationFromRate({ customerId, rateLaneId: selectedLane!.laneId, quantity: form.quantity, markupPct: form.markupPct }),
    onSuccess: (data) => {
      const row = data as { id: string; quotationNumber?: string };
      void qc.invalidateQueries({ queryKey: queryKeys.quotations.list() });
      setWorkflow({ quotationId: row.id, quotationNumber: row.quotationNumber, status: "DRAFT" });
      setStep(3);
      message.success(tx("jobs_wCreated"));
    },
    onError: (e: Error) => message.error(e.message),
  });

  const submitApproval = useMutation({
    mutationFn: () => submitQuotationApproval(workflow!.quotationId),
    onSuccess: (data) => {
      const result = data as { status: string };
      setWorkflow((w) => (w ? { ...w, status: result.status } : w));
      void qc.invalidateQueries({ queryKey: queryKeys.quotations.list() });
      message.success(tx("jobs_wSubmitted"));
    },
    onError: (e: Error) => message.error(e.message),
  });

  const forceApprove = useMutation({
    mutationFn: () => approveQuotation(workflow!.quotationId, "APPROVED"),
    onSuccess: () => {
      setWorkflow((w) => (w ? { ...w, status: "APPROVED" } : w));
      void qc.invalidateQueries({ queryKey: queryKeys.quotations.list() });
      message.success(tx("jobs_wApproved"));
    },
    onError: (e: Error) => message.error(e.message),
  });

  const sendQuote = useMutation({
    mutationFn: () => sendQuotation(workflow!.quotationId),
    onSuccess: (data) => {
      const result = data as { token: string; publicUrl?: string };
      setWorkflow((w) => (w ? { ...w, status: "SENT", publicToken: result.token } : w));
      void qc.invalidateQueries({ queryKey: queryKeys.quotations.list() });
      message.success(tx("jobs_wSent"));
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
      void qc.invalidateQueries({ queryKey: queryKeys.quotations.list() });
      message.success(tx("jobs_wAccepted"));
      setStep(5);
    },
    onError: (e: Error) => message.error(e.message),
  });

  const createBooking = useMutation({
    mutationFn: () => createBookingFromQuote(workflow!.quotationId),
    onSuccess: (data) => {
      const result = data as { id: string; bookingNumber: string };
      setWorkflow((w) => (w ? { ...w, bookingId: result.id, bookingNumber: result.bookingNumber } : w));
      message.success(tx("jobs_wBookingCreated", { no: result.bookingNumber }));
    },
    onError: (e: Error) => message.error(e.message),
  });

  const createJob = useMutation({
    mutationFn: () => createJobFromBooking(workflow!.bookingId!),
    onSuccess: (data) => {
      const result = data as { id: string; jobNumber: string };
      setWorkflow((w) => (w ? { ...w, jobId: result.id, jobNumber: result.jobNumber } : w));
      void qc.invalidateQueries({ queryKey: queryKeys.jobs.all });
      message.success(tx("jobs_wJobCreated", { no: result.jobNumber }));
    },
    onError: (e: Error) => message.error(e.message),
  });

  /* ── Shell (demo) actions ── */
  function submitShell() {
    const fail = quotesShell.createDraft({
      customerId,
      origin: form.origin,
      destination: form.destination,
      pol: form.pol,
      pod: form.pod,
      mode: form.mode,
      containerType: form.containerType,
      quantity: form.quantity,
      currency: "USD",
      charges: [
        { description: "Ocean freight", sellAmount: SHELL_CHARGES.ocean, currency: SHELL_CHARGES.currency },
        { description: "THC", sellAmount: SHELL_CHARGES.thc, currency: SHELL_CHARGES.currency },
      ],
      validUntil: "",
      termsAndConditions: "",
    });
    if (fail) {
      message.error(tx(fail));
      return;
    }
    message.success(tx("jobs_wCreated"));
    navigate("/quotations");
  }

  function shellSetStatus(status: "PENDING_APPROVAL" | "SENT" | "ACCEPTED", note: string) {
    if (!workflow) return;
    quotesShell.setStatus(workflow.quotationId, status);
    setWorkflow({ ...workflow, status });
    message.success(tx(note));
  }

  function shellCreateJob() {
    if (!shellExisting) return;
    const r = jobsShell.createFromQuoteId({ ...shellExisting, status: "ACCEPTED" });
    if (r.error) {
      message.error(tx(r.error));
      return;
    }
    message.success(tx("jobs_wJobCreatedShort"));
    navigate(r.id ? `/jobs/${r.id}` : "/jobs");
  }

  /* ── Summary numbers ── */
  const markup = 1 + (parseFloat(form.markupPct) || 0) / 100;
  const laneUnit = selectedLane
    ? selectedLane.totalBuy
      ? parseFloat(selectedLane.totalBuy) * markup
      : selectedLane.totalSell
        ? parseFloat(selectedLane.totalSell)
        : null
    : null;
  const estimate =
    laneUnit !== null && selectedLane ? { amount: laneUnit * form.quantity, currency: selectedLane.currency } : existingTotal;

  const wizardFacts = {
    step: step + 1,
    customer: nameOf(customerId),
    lane: `${form.pol}→${form.pod}`,
    mode: form.mode,
    containerType: form.containerType,
    quantity: form.quantity,
    quotationStatus: workflow?.status ?? "new",
    selectedRate: selectedLane?.totalSell ?? "none",
  };
  const wizardLocal = `Quote wizard step ${step + 1}: ${form.pol}→${form.pod} ${form.containerType}×${form.quantity}. Status ${workflow?.status ?? "new"}.`;

  const title = workflow?.quotationNumber ? tx("jobs_wTitleExisting", { no: workflow.quotationNumber }) : tx("jobs_wTitle");
  const header = (
    <PageHeader
      title={title}
      back={{ to: "/quotations", label: tx("jobs_qTitle") }}
      extra={<AiBriefCard title={tx("aiJobSummary")} facts={wizardFacts} localFallback={wizardLocal} />}
    />
  );

  if (!shell && !live) {
    return (
      <>
        {header}
        <ErrorState title={tx("apiNotConfigured")} />
      </>
    );
  }
  if (existingId && live && liveExisting.isLoading) {
    return (
      <>
        {header}
        <LoadingState tip={tx("jobs_loading")} />
      </>
    );
  }
  if (existingId && ((live && liveExisting.isError) || (shell && !shellExisting))) {
    return (
      <>
        {header}
        <ErrorState
          title={tx("jobs_wNotFound")}
          action={
            <Link to="/quotations">
              <Button>{tx("jobs_wAllQuotes")}</Button>
            </Link>
          }
        />
      </>
    );
  }
  if (!customers.length && !customersLoading) {
    return (
      <>
        {header}
        <Alert
          type="warning"
          showIcon
          message={tx("quoteNeedCustomer")}
          action={
            <Link to="/customers?new=1">
              <Button size="small">{tx("shellCreateCustomer")}</Button>
            </Link>
          }
        />
      </>
    );
  }

  const status = workflow?.status ?? "";
  const closed = CLOSED.includes(status);
  const routeValid = Boolean(customerId && form.pol.trim() && form.pod.trim() && form.quantity >= 1);

  /* ── Step bodies + footer actions ── */
  let body: ReactNode = null;
  let back: ReactNode = null;
  let actions: ReactNode = null;

  const backBtn = (to: number) => (
    <Button icon={<ArrowLeft size={16} aria-hidden />} onClick={() => setStep(to)}>
      {tx("jobs_back")}
    </Button>
  );
  const allQuotes = (primary = false) => (
    <Link to="/quotations">
      <Button type={primary ? "primary" : "default"}>{tx("jobs_wAllQuotes")}</Button>
    </Link>
  );
  const statusBox = (help: string, extra?: ReactNode) => (
    <>
      <div className="jobs-wiz-status">
        <strong>{workflow?.quotationNumber ?? "—"}</strong>
        {status ? <StatusTag status={status} /> : null}
        {extra}
      </div>
      <p className="jobs-wiz-help" style={{ margin: 0 }}>
        {help}
      </p>
    </>
  );

  if (step === 0) {
    body = (
      <>
        <h2>{tx("jobs_wStepRoute")}</h2>
        <p className="jobs-wiz-help">{tx("jobs_wRouteHelp")}</p>
        <Form layout="vertical" requiredMark className="jobs-wiz-grid" component="div">
          <Form.Item label={tx("jobs_wCustomer")} required className="is-wide">
            <Select
              showSearch
              optionFilterProp="label"
              value={customerId || undefined}
              loading={customersLoading}
              onChange={(v) => setForm({ ...form, customerId: v })}
              options={customers.map((c) => ({ value: c.id, label: nameOf(c.id) }))}
            />
          </Form.Item>
          <Form.Item label={tx("jobs_wPol")} required>
            <Input
              prefix={<Flag code={form.pol} size={18} />}
              value={form.pol}
              maxLength={5}
              onChange={(e) => setForm({ ...form, pol: e.target.value.toUpperCase() })}
            />
          </Form.Item>
          <Form.Item label={tx("jobs_wPod")} required>
            <Input
              prefix={<Flag code={form.pod} size={18} />}
              value={form.pod}
              maxLength={5}
              onChange={(e) => setForm({ ...form, pod: e.target.value.toUpperCase() })}
            />
          </Form.Item>
          <Form.Item label={tx("jobs_wOrigin")}>
            <Input value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} />
          </Form.Item>
          <Form.Item label={tx("jobs_wDestination")}>
            <Input value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} />
          </Form.Item>
          <Form.Item label={tx("jobs_wMode")}>
            <Select
              value={form.mode}
              onChange={(v) => setForm({ ...form, mode: v })}
              options={MODES.map((m) => ({ value: m, label: modeLabel(tx, m) }))}
            />
          </Form.Item>
          <Form.Item label={tx("jobs_wContainer")}>
            <Select
              value={form.containerType}
              onChange={(v) => setForm({ ...form, containerType: v })}
              options={CONTAINER_TYPES.map((c) => ({ value: c, label: c }))}
            />
          </Form.Item>
          <Form.Item label={tx("jobs_wQty")} required>
            <InputNumber min={1} value={form.quantity} onChange={(v) => setForm({ ...form, quantity: v ?? 1 })} style={{ width: "100%" }} />
          </Form.Item>
          {live ? (
            <Form.Item label={tx("jobs_wMarkup")}>
              <InputNumber
                min={0}
                max={200}
                value={parseFloat(form.markupPct) || 0}
                onChange={(v) => setForm({ ...form, markupPct: String(v ?? 0) })}
                style={{ width: "100%" }}
              />
            </Form.Item>
          ) : null}
        </Form>
      </>
    );
    back = (
      <Link to="/quotations">
        <Button type="text">{tx("jobs_cancel")}</Button>
      </Link>
    );
    actions = (
      <Button type="primary" disabled={!routeValid} onClick={() => setStep(1)}>
        {tx("jobs_next")}
        <ArrowRight size={16} aria-hidden />
      </Button>
    );
  } else if (step === 1) {
    const rateRows = live ? (rates.data ?? []) : [];
    body = (
      <>
        <h2>{tx("jobs_wStepRate")}</h2>
        <p className="jobs-wiz-help">{live ? tx("jobs_wRateHelp") : tx("jobs_wRateShell")}</p>
        {live ? (
          rates.isLoading ? (
            <LoadingState />
          ) : rates.isError ? (
            <ErrorState title={tx("jobs_loadFailed")} action={<Button onClick={() => void rates.refetch()}>{tx("jobs_retry")}</Button>} />
          ) : !rateRows.length ? (
            <EmptyState
              title={tx("jobs_wRateEmpty")}
              description={tx("jobs_wRateEmptyDesc")}
              action={<Button onClick={() => setStep(0)}>{tx("jobs_wEditRoute")}</Button>}
            />
          ) : (
            <div className="sales-pick" role="radiogroup" aria-label={tx("jobs_wStepRate")}>
              {rateRows.map((r) => {
                const picked = selectedLane?.laneId === r.laneId;
                const left = daysUntil(r.validUntil);
                return (
                  <button
                    key={r.laneId}
                    type="button"
                    role="radio"
                    aria-checked={picked}
                    className={`sales-pick-card${picked ? " is-picked" : ""}`}
                    onClick={() => setSelectedLane(r)}
                  >
                    <span className="sales-pick-radio" aria-hidden>
                      {picked ? <CheckCircle size={22} weight="fill" /> : <Circle size={22} />}
                    </span>
                    <IconBadge icon={Boat} tone={picked ? "primary" : "neutral"} size={36} />
                    <span className="sales-pick-main">
                      <strong>{r.carrier || r.vendor}</strong>
                      {r.carrier && r.carrier !== r.vendor ? <span>{r.vendor}</span> : null}
                    </span>
                    <DateChip
                      label={fmtShortDate(r.validUntil, locale)}
                      tone={
                        r.status === "EXPIRED"
                          ? "danger"
                          : r.status === "EXPIRING_SOON" || (left !== null && left <= 7)
                            ? "warning"
                            : undefined
                      }
                      title={`${tx("jobs_wRateValid")} ${fmtDate(r.validUntil, locale)}`}
                    />
                    <span className="sales-pick-price">{r.totalSell ? fmtMoney(r.totalSell, r.currency, locale) : "—"}</span>
                  </button>
                );
              })}
            </div>
          )
        ) : null}
      </>
    );
    back = backBtn(0);
    actions = (
      <Button type="primary" disabled={live && !selectedLane} onClick={() => setStep(2)}>
        {tx("jobs_next")}
        <ArrowRight size={16} aria-hidden />
      </Button>
    );
  } else if (step === 2 && !(shell && workflow)) {
    body = (
      <>
        <h2>{tx("jobs_wStepReview")}</h2>
        <p className="jobs-wiz-help">{tx("jobs_wReviewHelp")}</p>
        <div>
          <Button onClick={() => setStep(0)}>{tx("jobs_wEditRoute")}</Button>
        </div>
      </>
    );
    back = backBtn(1);
    actions = live ? (
      <Button type="primary" loading={createLive.isPending} disabled={!selectedLane} onClick={() => createLive.mutate()}>
        {tx("jobs_wCreate")}
      </Button>
    ) : (
      <Button type="primary" onClick={submitShell}>
        {tx("jobs_wSaveDraft")}
      </Button>
    );
  } else if (shell && workflow) {
    // Demo mode: an existing quotation — move it along its simple status path.
    body = statusBox(
      closed
        ? tx("jobs_wClosedHelp", { status: tx(`status_${status}`) })
        : status === "DRAFT"
          ? tx("jobs_wApprovalHelp")
          : status === "PENDING_APPROVAL" || status === "SENT"
            ? tx("jobs_wSendHelp")
            : tx("jobs_wBookingHelp"),
    );
    back = allQuotes();
    actions =
      status === "DRAFT" ? (
        <Button type="primary" onClick={() => shellSetStatus("PENDING_APPROVAL", "jobs_wSubmitted")}>
          {tx("jobs_wSubmitApproval")}
        </Button>
      ) : status === "PENDING_APPROVAL" ? (
        <Button type="primary" onClick={() => shellSetStatus("SENT", "jobs_wSent")}>
          {tx("jobs_wSend")}
        </Button>
      ) : status === "SENT" ? (
        <Button type="primary" onClick={() => shellSetStatus("ACCEPTED", "jobs_wAccepted")}>
          {tx("jobs_wRecordAccept")}
        </Button>
      ) : status === "ACCEPTED" ? (
        jobsShell.jobs.some((j) => j.quotationId === workflow.quotationId) ? (
          <Link to={`/jobs/${jobsShell.jobs.find((j) => j.quotationId === workflow.quotationId)?.id ?? ""}`}>
            <Button type="primary">{tx("jobs_wOpenJobShort")}</Button>
          </Link>
        ) : (
          <Button type="primary" onClick={shellCreateJob}>
            {tx("jobs_wCreateJob")}
          </Button>
        )
      ) : null;
  } else if (closed) {
    body = statusBox(tx("jobs_wClosedHelp", { status: tx(`status_${status}`) }));
    back = null;
    actions = allQuotes(true);
  } else if (step === 3 && workflow) {
    body = statusBox(tx("jobs_wApprovalHelp"));
    back = allQuotes();
    actions = (
      <>
        {status === "DRAFT" ? (
          <>
            <Button onClick={() => setStep(4)}>{tx("jobs_wSkipToSend")}</Button>
            <Button type="primary" loading={submitApproval.isPending} onClick={() => submitApproval.mutate()}>
              {tx("jobs_wSubmitApproval")}
            </Button>
          </>
        ) : status === "PENDING_APPROVAL" ? (
          <Button type="primary" loading={forceApprove.isPending} onClick={() => forceApprove.mutate()}>
            {tx("jobs_wApprove")}
          </Button>
        ) : (
          <Button type="primary" onClick={() => setStep(4)}>
            {tx("jobs_next")}
            <ArrowRight size={16} aria-hidden />
          </Button>
        )}
      </>
    );
  } else if (step === 4 && workflow) {
    body = (
      <>
        {statusBox(tx("jobs_wSendHelp"))}
        {workflow.publicToken ? <Alert type="success" showIcon message={tx("jobs_wLinkReady")} /> : null}
      </>
    );
    back = ["DRAFT", "PENDING_APPROVAL", "APPROVED"].includes(status) ? backBtn(3) : allQuotes();
    actions =
      status === "ACCEPTED" ? (
        <Button type="primary" onClick={() => setStep(5)}>
          {tx("jobs_next")}
          <ArrowRight size={16} aria-hidden />
        </Button>
      ) : workflow.publicToken ? (
        <>
          <Button loading={sendQuote.isPending} onClick={() => sendQuote.mutate()}>
            {tx("jobs_wResend")}
          </Button>
          <Button type="primary" loading={acceptQuote.isPending} onClick={() => acceptQuote.mutate()}>
            {tx("jobs_wRecordAccept")}
          </Button>
        </>
      ) : (
        <Button
          type="primary"
          loading={sendQuote.isPending}
          disabled={!["APPROVED", "DRAFT", "SENT"].includes(status)}
          onClick={() => sendQuote.mutate()}
        >
          {status === "SENT" ? tx("jobs_wResend") : tx("jobs_wSend")}
        </Button>
      );
  } else if (step === 5 && workflow) {
    body = statusBox(
      tx("jobs_wBookingHelp"),
      workflow.jobId ? (
        <span className="jobs-status-cell">
          <CheckCircle size={18} weight="fill" aria-hidden style={{ color: "var(--success)" }} />
        </span>
      ) : null,
    );
    back = allQuotes();
    actions = !workflow.bookingId ? (
      <Button type="primary" loading={createBooking.isPending} onClick={() => createBooking.mutate()}>
        {tx("jobs_wCreateBooking")}
      </Button>
    ) : !workflow.jobId ? (
      <Button type="primary" loading={createJob.isPending} onClick={() => createJob.mutate()}>
        {tx("jobs_wCreateJob")}
      </Button>
    ) : (
      <Link to={`/jobs/${workflow.jobId}`}>
        <Button type="primary">{tx("jobs_wOpenJob", { no: workflow.jobNumber ?? "" })}</Button>
      </Link>
    );
  }

  /* Price breakdown: cost vs margin (live, from the chosen rate) or the demo draft charges. */
  const breakdown: {
    parts: { value: number; tone: "neutral" | "success" | "primary" | "info"; label: string }[];
    currency: string;
  } | null =
    !workflow && selectedLane?.totalBuy
      ? (() => {
          const buy = parseFloat(selectedLane.totalBuy!) * form.quantity;
          return {
            currency: selectedLane.currency,
            parts: [
              { value: buy, tone: "neutral" as const, label: tx("jobs_q_cost") },
              { value: buy * (markup - 1), tone: "success" as const, label: `${tx("jobs_q_margin")} ${parseFloat(form.markupPct) || 0}%` },
            ],
          };
        })()
      : !workflow && shell
        ? {
            currency: SHELL_CHARGES.currency,
            parts: [
              { value: SHELL_CHARGES.ocean, tone: "primary" as const, label: tx("jobs_q_ocean") },
              { value: SHELL_CHARGES.thc, tone: "info" as const, label: "THC" },
            ],
          }
        : null;
  const total = estimate ?? (breakdown ? { amount: breakdown.parts.reduce((n, p) => n + p.value, 0), currency: breakdown.currency } : null);
  const boxes = Math.max(1, form.quantity || 1);
  const customerName = nameOf(customerId);

  const summary = (
    <Panel title={tx("jobs_wSummary")}>
      <div className="sales-wsum">
        {workflow?.quotationNumber ? (
          <div className="sales-wsum-row">
            <strong className="cz-mono">{workflow.quotationNumber}</strong>
            {status ? <StatusTag status={status} /> : null}
          </div>
        ) : null}
        <div className="sales-wsum-row is-start">
          <CompanyMark name={customerName} size={32} />
          <strong className="sales-wsum-customer">{customerName}</strong>
        </div>
        <RouteTrack
          from={form.pol}
          to={form.pod}
          fromName={form.origin}
          toName={form.destination}
          progress={null}
          done={status === "ACCEPTED"}
          size="md"
        />
        <div className="sales-wsum-boxes" aria-label={`${form.containerType} × ${form.quantity}`}>
          <span className="sales-wsum-icons" aria-hidden>
            {Array.from({ length: Math.min(boxes, 6) }, (_, i) => (
              <Cube key={i} size={22} weight="duotone" />
            ))}
            {boxes > 6 ? <em>+{boxes - 6}</em> : null}
          </span>
          <span className="cz-mono">{form.containerType}</span>
          <strong>×{form.quantity}</strong>
        </div>
        {!workflow ? (
          <div className="sales-wsum-row is-start">
            <IconBadge icon={Boat} tone={selectedLane ? "primary" : "neutral"} size={28} />
            <span className={selectedLane ? undefined : "cz-muted"}>
              {selectedLane ? selectedLane.carrier || selectedLane.vendor : tx("jobs_wSumNoRate")}
            </span>
          </div>
        ) : null}
        {workflow?.bookingNumber || workflow?.jobId ? (
          <dl className="jobs-sum">
            {workflow?.bookingNumber ? (
              <div>
                <dt>{tx("jobs_wSumBooking")}</dt>
                <dd>{workflow.bookingNumber}</dd>
              </div>
            ) : null}
            {workflow?.jobId ? (
              <div>
                <dt>{tx("jobs_wSumJob")}</dt>
                <dd>
                  <Link to={`/jobs/${workflow.jobId}`}>{workflow.jobNumber ?? tx("jobs_open")}</Link>
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null}
        <div className="sales-wsum-total">
          <span>{tx("jobs_wSumTotal")}</span>
          <strong>{total ? fmtMoney(total.amount, total.currency, locale) : "—"}</strong>
          {breakdown ? (
            <>
              <SegmentBar parts={breakdown.parts} height={10} />
              <Legend
                items={breakdown.parts.map((p) => ({ tone: p.tone, label: p.label, value: fmtMoney(p.value, breakdown.currency, locale) }))}
              />
            </>
          ) : null}
        </div>
      </div>
    </Panel>
  );

  return (
    <>
      {header}
      <div className="cz-stack">
        <div className="jobs-wiz-steps">
          <Steps
            current={step}
            size="small"
            type={phone ? "inline" : "default"}
            responsive={false}
            items={stepItems.map((s, i) => ({ ...s, status: closed && i === step ? "error" : undefined }))}
          />
          {phone ? (
            <p className="jobs-wiz-help" style={{ margin: "8px 0 0" }}>
              {step + 1}/{stepItems.length} · {stepItems[step]?.title}
            </p>
          ) : null}
        </div>
        <div className="cz-split">
          <section className="jobs-wiz-main" aria-label={stepItems[step]?.title}>
            <div className="jobs-wiz-body">{body}</div>
            <div className="jobs-wiz-footer">
              {back}
              <div className="jobs-wiz-footer-end">{actions}</div>
            </div>
          </section>
          <aside className="jobs-wiz-side">{summary}</aside>
        </div>
      </div>
    </>
  );
}
