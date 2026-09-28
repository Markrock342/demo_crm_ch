import {
  Anchor,
  Boat,
  CalendarCheck,
  CheckCircle,
  Clock,
  CurrencyCircleDollar,
  FileText,
  PencilSimple,
  Plus,
  Seal,
  ShippingContainer,
  Sparkle,
  UploadSimple,
  Warning,
} from "@phosphor-icons/react";
import { App, Button, Checkbox, Input, Modal, Space, Tabs, Tooltip, Upload } from "antd";
import { useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Mail } from "../../data";
import type { ShellJob } from "../../ports/job.port.ts";
import { useShellJobs } from "../../shell/jobStore.tsx";
import { useShellSupport } from "../../shell/supportStore.tsx";
import { useStore } from "../../store";
import {
  AiBriefCard,
  CardGrid,
  DataTable,
  EntityCard,
  ErrorState,
  IconBadge,
  Legend,
  LoadingState,
  PageHeader,
  Panel,
  PeopleStack,
  RouteTrack,
  SegmentBar,
  StageFlow,
  StatusTag,
  StepMeter,
  Tile,
  TileRow,
  progressBetween,
  type StageKey,
} from "../components";
import { AiMailPanel } from "../components/AiMailPanel.tsx";
import { useJobCharges, useJobFinancials, useJobMilestones, useJobTasks, usePatchJobMilestone, usePatchJobTask } from "../hooks/useJobs.ts";
import { useCustomerDocs, useCustomerMails, useJobContainers } from "../hooks/useCommercial.ts";
import { fetchInvoicesPage } from "../../api/lists.ts";
import { useAppMode } from "../hooks/useAppMode.ts";
import { useCan } from "../hooks/useCan.ts";
import { useTaskActions, useTasks } from "../hooks/useTasks.ts";
import { fetchJob } from "../../api/commercial.ts";
import type { Cutoffs } from "../../api/bookings.ts";
import { JobCutoffsPanel } from "./ops/Cutoffs.tsx";
import { useCustomerLookup } from "../hooks/useCustomerLookup.ts";
import { useUserLookup } from "../hooks/useUserLookup.ts";
import { fmtMailTime } from "../lib/time.ts";
import { localizeDemo } from "../lib/demoText.ts";
import { fmtDate, fmtMoney } from "../lib/format.ts";
import { uploadDocFile } from "../../api/operations.ts";
import { apiConfirmSendMail, apiCreateMail, apiPatchMail } from "../../api/comms.ts";
import { queryKeys } from "../queries/keys.ts";
import { fmtShortDate, known, milestoneLabel, STAGE_KEYS, stageDates, stageFromMilestones } from "./jobsShared.ts";
import "./jobs.css";

type Props = {
  job: ShellJob;
};

type MsRow = { code: string; label: string; actualAt: string | null; plannedAt?: string | null };

export function JobDetailLiveV2({ job }: Props) {
  const { tx, locale } = useStore();
  const { message } = App.useApp();
  const { live } = useAppMode();
  const qc = useQueryClient();
  const { nameOf } = useCustomerLookup();
  const { nameOf: userName } = useUserLookup();
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [editMail, setEditMail] = useState<Mail | null>(null);
  const [mailDraft, setMailDraft] = useState({ subjectEn: "", draftEn: "", to: "" });
  const [emailAiId, setEmailAiId] = useState<string | null>(null);
  // Active tab lives in the URL (?tab=) so tiles can link straight to it.
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "overview";
  const setTab = (k: string) => {
    const next = new URLSearchParams(params);
    if (k === "overview") next.delete("tab");
    else next.set("tab", k);
    setParams(next, { replace: true });
  };
  const shellJobs = useShellJobs();
  const support = useShellSupport();
  const customerName = nameOf(job.customerId);

  const financials = useJobFinancials(job.id);
  const charges = useJobCharges(job.id);
  const milestones = useJobMilestones(job.id);
  const patchMilestone = usePatchJobMilestone(job.id);
  const jobTasksQuery = useJobTasks(job.id);
  const patchTask = usePatchJobTask(job.id);
  const can = useCan();
  // Org to-dos linked to this job (also listed on /tasks); the legacy job checklist (job_tasks) is merged in below.
  const orgTasks = useTasks({ jobId: job.id, scope: "all", status: "all", limit: 200 });
  const taskActions = useTaskActions();
  // Cut-offs live on the raw job row; keyed under the job detail key so the panel's invalidation refreshes it.
  const cutoffQuery = useQuery({
    queryKey: [...queryKeys.jobs.detail(job.id), "cutoffs"],
    queryFn: async (): Promise<Cutoffs> => {
      const row = (await fetchJob(job.id)) as Record<string, unknown>;
      const pick = (k: string) => (typeof row[k] === "string" ? (row[k] as string) : null);
      return { siCutoff: pick("siCutoff"), cyCutoff: pick("cyCutoff"), vgmCutoff: pick("vgmCutoff") };
    },
    enabled: live,
  });
  const containers = useJobContainers(job.id);
  const docs = useCustomerDocs(job.customerId);
  const mails = useCustomerMails(job.customerId);
  // This job's invoices only (paged list filtered by jobId), not the customer's whole history.
  const invoices = useQuery({
    queryKey: [...queryKeys.invoices.list(job.customerId), "job", job.id],
    queryFn: async () => (await fetchInvoicesPage({ jobId: job.id, limit: 200 })).items,
    enabled: live && can("invoice.view"),
  });

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
      message.success(tx("jobs_mailDraftCreated"));
    },
    onError: (e: Error) => message.error(e.message),
  });

  const patchMailMut = useMutation({
    mutationFn: () => apiPatchMail(editMail!.id, { draftEn: mailDraft.draftEn, subjectEn: mailDraft.subjectEn }),
    onSuccess: () => {
      invalidateMails();
      setEditMail(null);
      message.success(tx("jobs_mailDraftSaved"));
    },
    onError: (e: Error) => message.error(e.message),
  });

  const sendMailMut = useMutation({
    mutationFn: (mail: Mail) =>
      apiConfirmSendMail(mail.id, { to: mail.from || undefined, subject: mail.subjectEn, body: mail.draftEn || mail.bodyEn, jobId: job.id }),
    onSuccess: () => {
      invalidateMails();
      message.success(tx("jobs_mailSent"));
    },
    onError: (e: Error) => message.error(e.message),
  });

  /* ── Milestones ── */
  const milestoneRows: MsRow[] = useMemo(() => {
    if (!live) return job.milestones;
    return [...(milestones.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [live, job.milestones, milestones.data]);
  const doneCount = milestoneRows.filter((m) => m.actualAt).length;
  const nextMs = milestoneRows.find((m) => !m.actualAt) ?? null;
  // Same rule as the list API's "at risk" flag: planned time already passed and not done.
  const isLate = (m: MsRow) => !m.actualAt && Boolean(m.plannedAt) && new Date(String(m.plannedAt)).getTime() < Date.now();

  function toggleMilestone(m: MsRow, complete: boolean) {
    const name = milestoneLabel(tx, m.code, m.label);
    if (live) {
      patchMilestone.mutate(
        { code: m.code, complete },
        {
          onSuccess: () => {
            if (complete) message.success(tx("jobs_markedDone", { step: name }));
          },
          onError: (err: Error) => message.error(err.message),
        },
      );
    } else {
      shellJobs.toggleMilestone(job.id, m.code, complete);
      if (complete) message.success(tx("jobs_markedDone", { step: name }));
    }
  }

  /* ── Tasks ── */
  // Shell-only branch (unused): org to-dos now come from /api/tasks.
  const shellJobTasks: { id: string; title: string; priority: string; due: string }[] = [];
  type MergedTask = { id: string; source: "org" | "job"; title: string; done: boolean; priority: string; dueAt: string | null };
  const liveJobTasks: MergedTask[] = [
    ...(orgTasks.data?.items ?? []).map((t) => ({ id: t.id, source: "org" as const, title: t.title, done: t.done, priority: t.priority, dueAt: t.dueAt })),
    ...(jobTasksQuery.data ?? []).map((t) => ({ id: t.id, source: "job" as const, title: t.title, done: t.done, priority: t.priority, dueAt: t.dueAt })),
  ].sort((a, b) => Number(a.done) - Number(b.done) || (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999"));

  function toggleTask(t: MergedTask, done: boolean) {
    if (t.source === "org") taskActions.toggle.mutate({ id: t.id, done }, { onError: (e: Error) => message.error(e.message) });
    else patchTask.mutate({ taskId: t.id, patch: { done } });
  }

  function addTask() {
    const title = newTaskTitle.trim();
    if (!title) return;
    // New to-dos go through /api/tasks so they also show on /tasks and the owner's badge.
    taskActions.create.mutate(
      { title, jobId: job.id, customerId: job.customerId || null },
      { onSuccess: () => setNewTaskTitle(""), onError: (e: Error) => message.error(e.message) },
    );
  }

  /* ── Money ── */
  const num = (v: string | null | undefined) => (v ? parseFloat(v) : null);
  // Demo mode has no financials API — work it out from the job's own sell / cost lines.
  const shellCost = job.costs.reduce((a, c) => a + (c.amount || 0), 0);
  const shellMoney = !live && (job.totalSell > 0 || shellCost > 0);
  const revenue = shellMoney ? job.totalSell : num(financials.data?.totalRevenue);
  const cost = shellMoney ? shellCost : num(financials.data?.totalCost);
  const gp = shellMoney ? job.totalSell - shellCost : num(financials.data?.grossProfit);
  const margin = shellMoney ? (job.totalSell > 0 ? ((job.totalSell - shellCost) / job.totalSell) * 100 : null) : num(financials.data?.marginPct);
  const money = (v: number | null, currency = job.currency) => (v == null ? "—" : fmtMoney(v, currency, locale));

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
  const jobInvoices = (invoices.data ?? []).filter((i) => i.jobId === job.id);

  const vessel = [known(job.vessel), known(job.voyage)].filter(Boolean).join(" / ");
  // Owners are user ids in live data — show the person's name (never the raw id).
  const people = [...new Set([userName(job.salesOwner), userName(job.opsOwner)].filter(Boolean))];

  /* ── Where the shipment is ── */
  const stage = stageFromMilestones(job, milestoneRows);
  const delivered = stage >= 5;
  // Detail rows carry no "at risk" flag — an overdue next milestone means late too.
  const late = !delivered && (Boolean(job.delayed) || Boolean(nextMs && isLate(nextMs)));
  const stageLabels = Object.fromEntries(STAGE_KEYS.map((k) => [k, tx(`stage_${k}`)])) as Record<StageKey, string>;
  const shortOrUndef = (v: string) => (known(v) ? fmtShortDate(v, locale) : undefined);
  const progress = stage >= 3 ? 100 : stage < 2 ? (known(job.etd) ? 0 : null) : (progressBetween(known(job.etd) || null, known(job.eta) || null) ?? 50);

  /* ── Documents ── */
  const docRows = docs.data ?? [];
  const docOk = docRows.filter((d) => d.status === "ok").length;
  const docWait = docRows.filter((d) => d.status === "wait").length;
  const docLate = docRows.filter((d) => d.status === "late").length;

  /* ── Overview facts: only what the pictures above don't already say ── */
  const facts: { label: string; value: ReactNode }[] = [
    { label: tx("jobs_fShipper"), value: known(job.shipper) },
    { label: tx("jobs_fConsignee"), value: known(job.consignee) },
    { label: tx("jobs_fIncoterm"), value: known(job.incoterm) },
    { label: tx("jobs_fOwner"), value: people.length ? <PeopleStack names={people} /> : "" },
    { label: tx("jobs_fBilling"), value: <StatusTag status={job.billingStatus} /> },
  ].filter((f) => Boolean(f.value));

  const emptyLine = (text: string) => <p className="jobs-empty-line">{text}</p>;

  /* Sell vs cost as bars, profit highlighted. */
  const moneyViz = financials.isLoading && !shellMoney ? (
    <LoadingState />
  ) : revenue == null && cost == null ? (
    emptyLine(tx("jobs_chargesEmpty"))
  ) : (
    <div className="jobs-moneyviz">
      <div className={`jobs-moneyviz-gp${gp != null && gp < 0 ? " is-neg" : ""}`}>
        <IconBadge icon={CurrencyCircleDollar} tone={gp != null && gp < 0 ? "danger" : "success"} size={44} />
        <span>
          <strong>{money(gp)}</strong>
          <em>
            {tx("jobs_gp")}
            {margin != null ? ` · ${margin.toFixed(1)}%` : ""}
          </em>
        </span>
      </div>
      {[
        { key: "sell", label: tx("jobs_sell"), value: revenue, tone: "primary" },
        { key: "cost", label: tx("jobs_cost"), value: cost, tone: "neutral" },
      ].map((r) => {
        const max = Math.max(revenue ?? 0, cost ?? 0, 1);
        return (
          <div key={r.key} className="jobs-moneyviz-row">
            <span className="jobs-moneyviz-label">{r.label}</span>
            <span className="jobs-moneyviz-track">
              <span className={`jobs-moneyviz-bar is-${r.tone}`} style={{ width: `${((r.value ?? 0) / max) * 100}%` }} />
            </span>
            <span className="jobs-moneyviz-value">{money(r.value)}</span>
          </div>
        );
      })}
    </div>
  );

  const moneyPanel = <Panel title={tx("jobs_money")}>{moneyViz}</Panel>;

  const timeline = (compact = false) =>
    milestoneRows.length === 0 ? (
      emptyLine(tx("jobs_msEmpty"))
    ) : (
      <ol className="jobs-timeline">
        {milestoneRows.map((m) => {
          const name = milestoneLabel(tx, m.code, m.label);
          const late = isLate(m);
          const id = `ms-${job.id}-${m.code}`;
          if (compact && m.actualAt && m !== nextMs) return null;
          return (
            <li key={m.code} className={`${m.actualAt ? "is-done" : ""}${m === nextMs ? " is-next" : ""}`}>
              <Checkbox
                id={id}
                checked={Boolean(m.actualAt)}
                disabled={live && patchMilestone.isPending}
                onChange={(e) => toggleMilestone(m, e.target.checked)}
              />
              <label htmlFor={id} className="jobs-ms-label">
                {name}
              </label>
              <span className={`jobs-ms-date${late ? " is-late" : ""}`}>
                {m.actualAt
                  ? tx("jobs_msDone", { date: fmtShortDate(m.actualAt, locale) })
                  : m.plannedAt
                    ? late
                      ? `${tx("jobs_msOverdue")} · ${fmtShortDate(m.plannedAt, locale)}`
                      : tx("jobs_msPlanned", { date: fmtShortDate(m.plannedAt, locale) })
                    : ""}
              </span>
            </li>
          );
        })}
      </ol>
    );

  const tabItems = [
    {
      key: "overview",
      label: tx("jobs_tabOverview"),
      children: (
        <div className="cz-stack">
          <div className="cz-split">
            <Panel title={tx("jobs_shipment")}>
              <dl className="jobs-dl">
                {facts.map((f) => (
                  <div key={f.label}>
                    <dt>{f.label}</dt>
                    <dd>{f.value}</dd>
                  </div>
                ))}
              </dl>
            </Panel>
            {moneyPanel}
          </div>
          {live && cutoffQuery.data ? (
            <Panel>
              <JobCutoffsPanel jobId={job.id} values={cutoffQuery.data} canEdit={can("shipment.edit")} />
            </Panel>
          ) : null}
        </div>
      ),
    },
    {
      key: "milestones",
      label: tx("jobs_tabMilestones"),
      children: (
        <Panel title={tx("jobs_tabMilestones")} extra={<StepMeter done={doneCount} total={milestoneRows.length} />}>
          {live && milestones.isLoading ? <LoadingState /> : timeline()}
        </Panel>
      ),
    },
    {
      key: "containers",
      label: tx("jobs_tabContainers"),
      children: containers.isLoading ? (
        <LoadingState />
      ) : !(containers.data ?? []).length ? (
        <div className="cz-table">{emptyLine(tx("jobs_ctrEmpty"))}</div>
      ) : (
        <CardGrid min={300}>
          {(containers.data ?? []).map((c) => (
            <EntityCard
              key={c.id}
              media={<IconBadge icon={ShippingContainer} tone={delivered ? "success" : "primary"} />}
              title={<span className="cz-mono">{c.containerNo}</span>}
              subtitle={c.type}
              badge={<StatusTag status={c.status} />}
            >
              <span className="jobs-ctr-facts">
                <Tooltip title={tx("jobs_ctrSeal")}>
                  <span>
                    <Seal size={16} aria-label={tx("jobs_ctrSeal")} />
                    {c.seal ? <span className="cz-mono">{c.seal}</span> : <span className="cz-muted">—</span>}
                  </span>
                </Tooltip>
                {c.eta ? (
                  <Tooltip title={tx("jobs_ctrEta")}>
                    <span>
                      <Anchor size={16} aria-label={tx("jobs_ctrEta")} />
                      {fmtShortDate(c.eta, locale)}
                    </span>
                  </Tooltip>
                ) : null}
              </span>
            </EntityCard>
          ))}
        </CardGrid>
      ),
    },
    {
      key: "documents",
      label: tx("jobs_tabDocs"),
      children: docs.isLoading ? (
        <LoadingState />
      ) : !docRows.length ? (
        <div className="cz-table">{emptyLine(tx("jobs_docEmpty"))}</div>
      ) : (
        <Panel
          title={tx("jobs_tabDocs")}
          extra={
            <Legend
              items={[
                { tone: "success", label: tx("jobs_doc_ok"), value: docOk },
                { tone: "warning", label: tx("jobs_doc_wait"), value: docWait },
                { tone: "danger", label: tx("jobs_doc_late"), value: docLate },
              ]}
            />
          }
        >
          <ul className="jobs-docs">
            {docRows.map((d) => {
              const tone = d.status === "ok" ? "success" : d.status === "late" ? "danger" : "warning";
              const StateIcon = d.status === "ok" ? CheckCircle : d.status === "late" ? Warning : Clock;
              return (
                <li key={d.id} className={`jobs-doc is-${tone}`}>
                  <span className="jobs-doc-icon">
                    <FileText size={30} weight="duotone" aria-hidden />
                    <span className="jobs-doc-state">
                      <StateIcon size={16} weight="fill" aria-label={tx(`jobs_doc_${d.status}`)} />
                    </span>
                  </span>
                  <span className="jobs-doc-kind">{d.kind === "BOOK" ? "Booking" : d.kind}</span>
                  <Tooltip title={`${d.name} · ${d.updated}`}>
                    <span className="jobs-doc-name">{d.name}</span>
                  </Tooltip>
                  {live ? (
                    <Upload
                      showUploadList={false}
                      customRequest={async ({ file, onSuccess, onError }) => {
                        try {
                          await uploadDocFile(d.id, file as File);
                          void qc.invalidateQueries({ queryKey: queryKeys.docs.byCustomer(job.customerId) });
                          onSuccess?.(file);
                          message.success(tx("jobs_docUploaded"));
                        } catch (e) {
                          onError?.(e as Error);
                          message.error((e as Error).message);
                        }
                      }}
                    >
                      <Button size="small" type="text" icon={<UploadSimple size={16} aria-hidden />} aria-label={`${tx("jobs_docUpload")} ${d.name}`} />
                    </Upload>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Panel>
      ),
    },
    {
      key: "money",
      label: tx("jobs_tabMoney"),
      children: (
        <div className="cz-stack">
          {moneyPanel}
          <Panel title={tx("jobs_charges")} flush>
            {charges.isLoading ? (
              <LoadingState />
            ) : !(charges.data ?? []).length ? (
              emptyLine(tx("jobs_chargesEmpty"))
            ) : (
              <DataTable
                rowKey="id"
                dataSource={charges.data ?? []}
                emptyText={tx("jobs_chargesEmpty")}
                columns={[
                  {
                    title: tx("jobs_chargeDesc"),
                    key: "desc",
                    render: (_, c) => (
                      <>
                        <span>{c.description}</span>
                        <span className="cz-cell-sub">
                          {c.chargeType === "REVENUE" ? tx("jobs_sell") : c.chargeType === "COST" ? tx("jobs_cost") : c.chargeType}
                        </span>
                      </>
                    ),
                  },
                  {
                    title: tx("jobs_amount"),
                    key: "amount",
                    align: "right",
                    render: (_, c) => <span className="cz-num">{fmtMoney(c.totalAmount, c.currency, locale)}</span>,
                  },
                ]}
              />
            )}
          </Panel>
          <Panel title={tx("jobs_invoices")} flush>
            {invoices.isLoading ? (
              <LoadingState />
            ) : jobInvoices.length === 0 ? (
              emptyLine(tx("jobs_invoicesEmpty"))
            ) : (
              <DataTable
                rowKey="id"
                dataSource={jobInvoices}
                columns={[
                  {
                    title: tx("jobs_invoiceNo"),
                    key: "no",
                    render: (_, i) => (
                      <>
                        <span className="cz-cell-main jobs-nowrap">{i.invoiceNumber}</span>
                        <span className="cz-cell-sub">
                          {tx("jobs_invoiceDue")} {fmtDate(i.dueDate, locale)}
                        </span>
                      </>
                    ),
                  },
                  { title: tx("jobs_colStatus"), key: "status", render: (_, i) => <StatusTag status={i.status} /> },
                  {
                    title: tx("jobs_invoiceTotal"),
                    key: "total",
                    align: "right",
                    render: (_, i) => <span className="cz-num">{fmtMoney(i.total, i.currency, locale)}</span>,
                  },
                  {
                    title: tx("jobs_invoiceBalance"),
                    key: "bal",
                    align: "right",
                    render: (_, i) => <span className="cz-num">{fmtMoney(i.balanceDue, i.currency, locale)}</span>,
                  },
                ]}
              />
            )}
          </Panel>
        </div>
      ),
    },
    {
      key: "tasks",
      label: tx("jobs_tabTasks"),
      children: (
        <Panel title={tx("jobs_tabTasks")}>
          {live ? (
            <div className="jobs-task-add">
              <Input
                aria-label={tx("jobs_taskNew")}
                placeholder={tx("jobs_taskNew")}
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onPressEnter={addTask}
              />
              <Button type="primary" icon={<Plus size={16} aria-hidden />} loading={taskActions.create.isPending} onClick={addTask}>
                {tx("jobs_taskAdd")}
              </Button>
            </div>
          ) : null}
          {live && (jobTasksQuery.isLoading || orgTasks.isLoading) ? (
            <LoadingState />
          ) : (live ? liveJobTasks.length : shellJobTasks.length) === 0 ? (
            emptyLine(tx("jobs_taskEmpty"))
          ) : (
            <ul className="jobs-list">
              {live
                ? liveJobTasks.map((t) => (
                    <li key={`${t.source}-${t.id}`}>
                      <Checkbox
                        checked={t.done}
                        aria-label={localizeDemo(t.title, locale)}
                        onChange={(e) => toggleTask(t, e.target.checked)}
                      />
                      <span className="grow">{localizeDemo(t.title, locale)}</span>
                      {t.priority === "high" ? <StatusTag status="OVERDUE" label={tx("jobs_prio_high")} /> : null}
                      {t.dueAt ? <span className="cz-muted jobs-nowrap">{fmtShortDate(t.dueAt, locale)}</span> : null}
                    </li>
                  ))
                : shellJobTasks.map((t) => (
                    <li key={t.id}>
                      <span className="grow">{t.title}</span>
                      {t.priority === "high" ? <StatusTag status="OVERDUE" label={tx("jobs_prio_high")} /> : null}
                      {t.due ? <span className="cz-muted jobs-nowrap">{t.due}</span> : null}
                    </li>
                  ))}
            </ul>
          )}
        </Panel>
      ),
    },
    {
      key: "emails",
      label: tx("jobs_tabEmails"),
      children: (
        <div className="cz-stack">
          <Panel
            title={tx("jobs_tabEmails")}
            flush
            extra={
              live ? (
                <Button
                  size="small"
                  icon={<PencilSimple size={14} aria-hidden />}
                  onClick={() => {
                    setMailDraft({ subjectEn: `Re: ${job.jobNumber}`, draftEn: "", to: "" });
                    setComposeOpen(true);
                  }}
                >
                  {tx("jobs_mailCompose")}
                </Button>
              ) : null
            }
          >
            {mails.isLoading ? (
              <LoadingState />
            ) : mailRows.length === 0 ? (
              emptyLine(tx("jobs_mailEmpty"))
            ) : (
              <DataTable<Mail>
                rowKey="id"
                dataSource={mailRows}
                columns={[
                  {
                    title: tx("jobs_mailSubject"),
                    key: "subject",
                    render: (_, m) => (
                      <>
                        <span className="cz-cell-main">{locale === "zh" ? m.subjectZh : locale === "th" ? m.subjectTh : m.subjectEn}</span>
                        <span className="cz-cell-sub">
                          {m.from} · {fmtMailTime(m.time, locale)}
                        </span>
                      </>
                    ),
                  },
                  { title: tx("jobs_colStatus"), key: "state", render: (_, m) => <StatusTag status={m.state} /> },
                  {
                    key: "actions",
                    align: "right",
                    render: (_, row) => (
                      <Space size={4}>
                        <Button
                          size="small"
                          type={emailAiId === row.id ? "primary" : "text"}
                          icon={<Sparkle size={14} aria-hidden />}
                          aria-label={tx("jobs_mailAi")}
                          onClick={() => setEmailAiId(row.id)}
                        />
                        {live && row.state === "open" ? (
                          <>
                            <Button
                              size="small"
                              type="text"
                              onClick={() => {
                                setEditMail(row);
                                setMailDraft({ subjectEn: row.subjectEn, draftEn: row.draftEn || row.bodyEn, to: row.from });
                              }}
                            >
                              {tx("jobs_mailEdit")}
                            </Button>
                            <Button size="small" loading={sendMailMut.isPending} onClick={() => sendMailMut.mutate(row)}>
                              {tx("jobs_mailSend")}
                            </Button>
                          </>
                        ) : null}
                      </Space>
                    ),
                  },
                ]}
              />
            )}
          </Panel>
          {emailAiMail ? <AiMailPanel mail={emailAiMail} /> : null}
        </div>
      ),
    },
  ];

  const nextName = nextMs ? milestoneLabel(tx, nextMs.code, nextMs.label) : "";

  return (
    <>
      <PageHeader
        title={job.jobNumber}
        back={{ to: "/jobs", label: tx("jobs_backToList") }}
        subtitle={
          <span className="jobs-head-sub">
            <span>{customerName}</span>
            {late ? <StatusTag status="DELAYED" label={tx("jobs_delayed")} /> : null}
          </span>
        }
        extra={
          <>
            <AiBriefCard title={tx("aiJobSummary")} buttonLabel={tx("runAiJobSummary")} facts={jobAiFacts} localFallback={jobAiLocal} />
            {nextMs ? (
              <Button
                type="primary"
                icon={<CheckCircle size={16} aria-hidden />}
                loading={live && patchMilestone.isPending}
                onClick={() => toggleMilestone(nextMs, true)}
              >
                {tx("jobs_markDone", { step: nextName })}
              </Button>
            ) : null}
          </>
        }
      />

      <div className="cz-stack jobs-detail-top">
        <Panel>
          <div className={`jobs-hero${late ? " is-late" : ""}`}>
            <StageFlow
              current={delivered ? STAGE_KEYS.length : stage}
              labels={stageLabels}
              dates={stageDates(job, milestoneRows, (v) => fmtShortDate(v, locale))}
              problem={late}
              size="lg"
            />
            <div className="jobs-hero-route">
              <RouteTrack
                size="lg"
                from={job.pol}
                to={job.pod}
                fromName={known(job.origin)}
                toName={known(job.destination)}
                progress={progress}
                fromDate={shortOrUndef(job.etd) ? `ETD ${shortOrUndef(job.etd)}` : undefined}
                toDate={shortOrUndef(job.eta) ? `ETA ${shortOrUndef(job.eta)}` : undefined}
                delayed={late}
                done={delivered}
              />
              {vessel || known(job.carrier) ? (
                <p className="jobs-hero-vessel">
                  <Boat size={16} weight="fill" aria-hidden />
                  {vessel ? <strong>{vessel}</strong> : null}
                  {known(job.carrier) ? <span>{job.carrier}</span> : null}
                </p>
              ) : null}
            </div>
          </div>
        </Panel>

        <TileRow>
          <Tile
            icon={ShippingContainer}
            tone="primary"
            value={
              <span className="jobs-tile-ctr">
                {job.quantity}
                <small>× {job.containerType}</small>
              </span>
            }
            label={tx("jobs_tileContainers")}
            to={`/jobs/${job.id}?tab=containers`}
          />
          <Tile
            icon={CurrencyCircleDollar}
            tone={(gp ?? job.listGrossProfit ?? 0) < 0 ? "danger" : "success"}
            value={money(gp ?? job.listGrossProfit ?? null)}
            label={margin != null ? `${tx("jobs_gp")} · ${margin.toFixed(0)}%` : tx("jobs_gp")}
            visual={
              revenue && cost != null ? (
                <SegmentBar
                  height={6}
                  parts={[
                    { value: Math.max(0, cost), tone: "neutral", label: tx("jobs_cost") },
                    { value: Math.max(0, revenue - cost), tone: "success", label: tx("jobs_gp") },
                  ]}
                />
              ) : undefined
            }
            to={`/jobs/${job.id}?tab=money`}
          />
          <Tile
            icon={FileText}
            tone={docLate ? "danger" : docWait ? "warning" : "info"}
            value={docRows.length ? `${docOk}/${docRows.length}` : "—"}
            label={tx("jobs_tileDocs")}
            visual={
              docRows.length ? (
                <SegmentBar
                  height={6}
                  parts={[
                    { value: docOk, tone: "success", label: tx("jobs_doc_ok") },
                    { value: docWait, tone: "warning", label: tx("jobs_doc_wait") },
                    { value: docLate, tone: "danger", label: tx("jobs_doc_late") },
                  ]}
                />
              ) : undefined
            }
            to={`/jobs/${job.id}?tab=documents`}
          />
          <Tile
            icon={nextMs ? CalendarCheck : CheckCircle}
            tone={nextMs && isLate(nextMs) ? "danger" : nextMs ? "accent" : "success"}
            value={nextMs ? (nextMs.plannedAt ? fmtShortDate(nextMs.plannedAt, locale) : "—") : <CheckCircle className="jobs-tile-ok" size={28} weight="fill" aria-label={tx("jobs_allDone")} />}
            label={nextMs ? nextName : tx("jobs_allDone")}
            visual={milestoneRows.length ? <StepMeter done={doneCount} total={milestoneRows.length} /> : undefined}
            to={`/jobs/${job.id}?tab=milestones`}
          />
        </TileRow>
      </div>

      <Tabs className="jobs-tabs" activeKey={tab} onChange={setTab} items={tabItems} />

      <Modal
        title={tx("jobs_mailCompose")}
        open={composeOpen}
        onCancel={() => setComposeOpen(false)}
        onOk={() => createMailMut.mutate()}
        confirmLoading={createMailMut.isPending}
        okText={tx("jobs_mailSaveDraft")}
        cancelText={tx("jobs_cancel")}
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Input
            aria-label={tx("jobs_mailSubjectPh")}
            placeholder={tx("jobs_mailSubjectPh")}
            value={mailDraft.subjectEn}
            onChange={(e) => setMailDraft({ ...mailDraft, subjectEn: e.target.value })}
          />
          <Input.TextArea
            aria-label={tx("jobs_mailBodyPh")}
            rows={6}
            placeholder={tx("jobs_mailBodyPh")}
            value={mailDraft.draftEn}
            onChange={(e) => setMailDraft({ ...mailDraft, draftEn: e.target.value })}
          />
        </Space>
      </Modal>

      <Modal
        title={tx("jobs_mailEditTitle")}
        open={Boolean(editMail)}
        onCancel={() => setEditMail(null)}
        onOk={() => patchMailMut.mutate()}
        confirmLoading={patchMailMut.isPending}
        okText={tx("jobs_mailSave")}
        cancelText={tx("jobs_cancel")}
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Input
            aria-label={tx("jobs_mailSubjectPh")}
            placeholder={tx("jobs_mailSubjectPh")}
            value={mailDraft.subjectEn}
            onChange={(e) => setMailDraft({ ...mailDraft, subjectEn: e.target.value })}
          />
          <Input.TextArea
            aria-label={tx("jobs_mailBodyPh")}
            rows={6}
            placeholder={tx("jobs_mailBodyPh")}
            value={mailDraft.draftEn}
            onChange={(e) => setMailDraft({ ...mailDraft, draftEn: e.target.value })}
          />
        </Space>
      </Modal>
    </>
  );
}

export function JobDetailLiveV2Loader({ job, loading, error }: { job: ShellJob | null; loading: boolean; error: string | null }) {
  const { tx } = useStore();

  if (loading) return <LoadingState tip={tx("jobs_loading")} />;

  if (error || !job) {
    return (
      <>
        <PageHeader title={tx("jobs_notFound")} back={{ to: "/jobs", label: tx("jobs_backToList") }} />
        <ErrorState
          title={tx("jobs_notFound")}
          subTitle={error && error !== tx("emptyShellCrm") ? error : undefined}
          action={
            <Link to="/jobs">
              <Button type="primary">{tx("jobs_backToList")}</Button>
            </Link>
          }
        />
      </>
    );
  }

  return <JobDetailLiveV2 job={job} />;
}
