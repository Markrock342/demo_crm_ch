import { snapshotStatusToShell, trackingMock } from "../adapters/mock/tracking.mock.ts";
import { AiError, aiBrief } from "../ai/client";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { jobApiAdapter } from "../adapters/api/job.adapter.ts";
import { useAuth } from "../auth/AuthProvider";
import { customerName, type Customer } from "../data";
import { jobGrossProfit, jobMarginPct, jobTotalCost, type ShellJob } from "../ports/job.port.ts";
import { SHELL_BOX_STATUSES, type ShellBoxStatus } from "../ports/ops.port.ts";
import { useShellBilling } from "../shell/billingStore.tsx";
import { useShellCrm } from "../shell/crmStore.tsx";
import { useShellJobs } from "../shell/jobStore.tsx";
import { useShellOps } from "../shell/opsStore.tsx";
import { useIsShellMode } from "../shell/session.tsx";
import { useShellSupport, type ShellDocType } from "../shell/supportStore.tsx";
import { useStore } from "../store";
import { PageToolbar } from "../ui/PageToolbar";
import { JobDetailLiveV2Loader } from "../v2/pages/JobDetailLive.tsx";

const uiV2 = import.meta.env.VITE_UI_V2 !== "false";

const DOC_TYPES: ShellDocType[] = ["BOOKING", "BL", "CI", "PL", "CO", "DO", "POD", "OTHER"];

export function JobDetailPage() {
  const { id } = useParams();
  const shell = useIsShellMode();
  const { mode, user } = useAuth();
  const live = !shell && mode === "production" && Boolean(user);
  const { tx } = useStore();
  const jobs = useShellJobs();
  const shellJob = id && shell ? jobs.getById(id) : undefined;
  const [liveJob, setLiveJob] = useState<ShellJob | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveErr, setLiveErr] = useState<string | null>(null);

  useEffect(() => {
    if (!live || !id) {
      setLiveJob(null);
      return;
    }
    let cancelled = false;
    setLiveLoading(true);
    setLiveErr(null);
    void jobApiAdapter
      .get(id)
      .then((j) => {
        if (!cancelled) setLiveJob(j);
      })
      .catch((e) => {
        if (!cancelled) setLiveErr(e instanceof Error ? e.message : "load_failed");
      })
      .finally(() => {
        if (!cancelled) setLiveLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, live]);

  if (!shell && !live) {
    return (
      <div className="page page--workspace">
        <p className="meta">{tx("apiNotConfigured")}</p>
        <Link to="/jobs">{tx("navJobs")}</Link>
      </div>
    );
  }

  if (live) {
    if (liveLoading) {
      return uiV2 ? (
        <JobDetailLiveV2Loader job={null} loading error={null} />
      ) : (
        <div className="page page--workspace">
          <p className="meta">{tx("loginBusy")}</p>
        </div>
      );
    }
    if (liveErr || !liveJob) {
      return uiV2 ? (
        <JobDetailLiveV2Loader job={null} loading={false} error={liveErr ?? tx("emptyShellCrm")} />
      ) : (
        <div className="page page--workspace">
          <p className="field-err">{liveErr ?? tx("emptyShellCrm")}</p>
          <Link to="/jobs">{tx("navJobs")}</Link>
        </div>
      );
    }
    return uiV2 ? (
      <JobDetailLiveV2Loader job={liveJob} loading={false} error={null} />
    ) : (
      <LiveJobDetailBody job={liveJob} />
    );
  }

  if (!shellJob) {
    return <Navigate to="/jobs" replace />;
  }

  return <JobDetailBody job={shellJob} />;
}

function LiveJobDetailBody({ job }: { job: ShellJob }) {
  const { tx } = useStore();
  return (
    <div className="page page--workspace">
      <PageToolbar title={job.jobNumber} hint={tx("liveApiBadge")} actions={<Link className="btn btn-ghost" to="/jobs">{tx("navJobs")}</Link>} />
      <p className="meta">{tx("liveJobDetailHint")}</p>
      <dl className="kv-grid">
        <div>
          <dt>{tx("colStatus")}</dt>
          <dd>
            <span className="pill">{job.status}</span>
          </dd>
        </div>
        <div>
          <dt>Lane</dt>
          <dd className="mono">
            {job.pol}→{job.pod}
          </dd>
        </div>
        <div>
          <dt>{tx("colCarrier")}</dt>
          <dd>{job.carrier || "—"}</dd>
        </div>
        <div>
          <dt>{tx("calEtd")}</dt>
          <dd className="mono">{job.etd}</dd>
        </div>
        <div>
          <dt>{tx("calEta")}</dt>
          <dd className="mono">{job.eta}</dd>
        </div>
        <div>
          <dt>{tx("jobOwners")}</dt>
          <dd>
            {job.salesOwner || "—"} / {job.opsOwner || "—"}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function JobDetailBody({ job }: { job: ShellJob }) {
  const { tx, locale } = useStore();
  const jobs = useShellJobs();
  const crm = useShellCrm();
  const ops = useShellOps();
  const billing = useShellBilling();
  const support = useShellSupport();
  const [msg, setMsg] = useState<string | null>(null);
  const [costForm, setCostForm] = useState({ description: "", vendorId: "", amount: 0 });
  const [noteBody, setNoteBody] = useState("");
  const [docForm, setDocForm] = useState({ name: "B/L", docType: "BL" as ShellDocType });
  const [boxForm, setBoxForm] = useState({ id: "", type: "40HC", teu: 2 });
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  const customer = crm.customers.find((c) => c.id === job.customerId);
  const boxes = useMemo(
    () =>
      ops.boxes.filter((b) => {
        if (job.shipmentId && b.shipmentId === job.shipmentId) return true;
        const ship = ops.shipments.find((s) => s.id === b.shipmentId);
        return ship?.jobId === job.id;
      }),
    [job.id, job.shipmentId, ops.boxes, ops.shipments],
  );
  const docs = support.docs.filter((d) => d.jobId === job.id);
  const invoices = billing.invoices.filter((i) => i.jobId === job.id);
  const totalCost = jobTotalCost(job);
  const gp = jobGrossProfit(job);
  const margin = jobMarginPct(job);

  function ensureShipment() {
    if (job.shipmentId) return job.shipmentId;
    const sid = ops.createShipmentFromJob({
      jobId: job.id,
      customerId: job.customerId,
      pol: job.pol,
      pod: job.pod,
      teu: job.quantity * 2,
    });
    jobs.attachShipment(job.id, sid);
    return sid;
  }

  function onAddCost(e: FormEvent) {
    e.preventDefault();
    const v = support.vendors.find((x) => x.id === costForm.vendorId);
    jobs.addCost(job.id, {
      description: costForm.description,
      vendor: v?.name ?? "—",
      vendorId: costForm.vendorId || undefined,
      amount: costForm.amount,
    });
    setCostForm({ description: "", vendorId: "", amount: 0 });
    setMsg(tx("save"));
  }

  function onAddNote(e: FormEvent) {
    e.preventDefault();
    jobs.addNote(job.id, noteBody);
    setNoteBody("");
    setMsg(tx("save"));
  }

  function onAddDoc(e: FormEvent) {
    e.preventDefault();
    support.addDoc({
      name: docForm.name,
      docType: docForm.docType,
      jobId: job.id,
      shipmentId: job.shipmentId,
    });
    setMsg(tx("save"));
  }

  function onAddBox(e: FormEvent) {
    e.preventDefault();
    const sid = ensureShipment();
    const fail = ops.addBox({
      id: boxForm.id,
      customerId: job.customerId,
      type: boxForm.type,
      dir: "in",
      status: "gate_in",
      slot: "A1",
      bl: job.jobNumber,
      teu: boxForm.teu,
      shipmentId: sid,
    });
    if (fail) {
      setMsg(tx(fail));
      return;
    }
    setBoxForm({ id: "", type: "40HC", teu: 2 });
    setMsg(tx("save"));
  }

  function onInvoice() {
    const fail = billing.createFromJob(job);
    if (fail) {
      setMsg(tx(fail));
      return;
    }
    jobs.setBillingStatus(job.id, "INVOICED");
    setMsg(tx("invoiceCreated"));
  }

  async function runAiSummary() {
    setAiBusy(true);
    const local = `${job.jobNumber} is ${job.status}. Route ${job.pol}→${job.pod}. ETD ${job.etd} / ETA ${job.eta}. Carrier ${job.carrier || "—"}. Billing ${job.billingStatus}.${job.delayed ? " Delayed." : ""}`;
    try {
      const summary = await aiBrief(locale as "zh" | "th" | "en", {
        jobNumber: job.jobNumber,
        status: job.status,
        pol: job.pol,
        pod: job.pod,
        etd: job.etd,
        eta: job.eta,
        carrier: job.carrier,
        billing: job.billingStatus,
        delayed: Boolean(job.delayed),
        missingDocs: docs.filter((d) => d.status !== "ok").length,
      });
      setAiSummary(summary || local);
    } catch (e) {
      if (e instanceof AiError && e.code === "missing_key") setAiSummary(local);
      else setAiSummary(local);
    } finally {
      setAiBusy(false);
    }
  }

  async function refreshBoxTracking(boxId: string, bl: string, eta: string) {
    const snap = await trackingMock.refresh({ containerNo: boxId, bl, currentEta: eta });
    ops.applyTrackingSnapshot(boxId, {
      status: snapshotStatusToShell(snap.status),
      eta: snap.eta,
      vessel: snap.vessel,
      carrier: snap.carrier,
      lastFreeDay: snap.lastFreeDay,
    });
    setMsg(tx("refreshTracking"));
  }

  return (
    <div className="page page--workspace page--job-detail">
      <PageToolbar
        title={job.jobNumber}
        hint={`${tx("shellDataBadge")} · ${job.origin} → ${job.destination}`}
        actions={
          <>
            <Link className="btn btn-ghost" to="/jobs">
              {tx("navJobs")}
            </Link>
            <Link className="btn btn-ghost" to={`/customers/${job.customerId}`}>
              {tx("navCustomers")}
            </Link>
          </>
        }
      />
      {msg ? <p className="meta">{msg}</p> : null}

      <section className="panel">
        <h2>{tx("aiJobSummary")}</h2>
        <button type="button" className="btn btn-ghost" disabled={aiBusy} onClick={() => void runAiSummary()}>
          {aiBusy ? tx("runningGemini") : tx("runAiJobSummary")}
        </button>
        {aiSummary ? (
          <p className="meta" style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>
            {aiSummary}
          </p>
        ) : null}
      </section>

      <div className="job-detail-grid">
        <section className="panel">
          <h2>{tx("jobSectionGeneral")}</h2>
          <dl className="job-dl">
            <div>
              <dt>{tx("colCustomer")}</dt>
              <dd>{customer ? customerName(customer as Customer, locale) : job.customerId}</dd>
            </div>
            <div>
              <dt>Shipper</dt>
              <dd>{job.shipper}</dd>
            </div>
            <div>
              <dt>Consignee</dt>
              <dd>{job.consignee}</dd>
            </div>
            <div>
              <dt>Incoterm</dt>
              <dd>{job.incoterm}</dd>
            </div>
            <div>
              <dt>{tx("colStatus")}</dt>
              <dd>
                <span className="pill">{job.status}</span> · {job.billingStatus}
                {job.delayed ? <span className="pill pill-warn"> delayed</span> : null}
              </dd>
            </div>
            <div>
              <dt>Carrier / Vessel</dt>
              <dd>
                {job.carrier} · {job.vessel} {job.voyage}
              </dd>
            </div>
            <div>
              <dt>ETD / ETA</dt>
              <dd className="mono">
                {job.etd} → {job.eta}
              </dd>
            </div>
            <div>
              <dt>Owners</dt>
              <dd>
                Sales: {job.salesOwner || "—"} · Ops:{" "}
                <input
                  className="inline-input"
                  value={job.opsOwner}
                  onChange={(e) => jobs.patchJob(job.id, { opsOwner: e.target.value })}
                  placeholder="ops owner"
                />
              </dd>
            </div>
            <div>
              <dt>Service</dt>
              <dd>
                {job.serviceType} · {job.containerType} × {job.quantity}
              </dd>
            </div>
          </dl>
        </section>

        <section className="panel">
          <h2>{tx("jobSectionFinancial")}</h2>
          <div className="kpi-row">
            <div className="kpi">
              <span>{tx("colSell")}</span>
              <strong>
                {job.totalSell} {job.currency}
              </strong>
            </div>
            <div className="kpi">
              <span>{tx("jobTotalCost")}</span>
              <strong>
                {totalCost} {job.currency}
              </strong>
            </div>
            <div className="kpi">
              <span>{tx("jobGrossProfit")}</span>
              <strong>
                {gp} {job.currency} ({margin}%)
              </strong>
            </div>
          </div>
          <h3>{tx("colSell")}</h3>
          <ul className="list-plain">
            {job.charges.map((c, i) => (
              <li key={i}>
                {c.description} — {c.amount} {c.currency}
              </li>
            ))}
          </ul>
          <h3>{tx("jobCosts")}</h3>
          <ul className="list-plain">
            {job.costs.map((c) => (
              <li key={c.id}>
                {c.description} ({c.vendor}) — {c.amount} {c.currency}
              </li>
            ))}
          </ul>
          <form className="form form-stack" onSubmit={onAddCost}>
            <label>
              {tx("colTitle")}
              <input value={costForm.description} onChange={(e) => setCostForm({ ...costForm, description: e.target.value })} required />
            </label>
            <label>
              Vendor
              <select value={costForm.vendorId} onChange={(e) => setCostForm({ ...costForm, vendorId: e.target.value })}>
                <option value="">—</option>
                {support.vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {tx("colAmount")}
              <input type="number" value={costForm.amount} onChange={(e) => setCostForm({ ...costForm, amount: Number(e.target.value) })} />
            </label>
            <button type="submit" className="btn btn-primary">
              {tx("jobAddCost")}
            </button>
          </form>
        </section>

        <section className="panel">
          <h2>{tx("jobSectionContainers")}</h2>
          <div className="toolbar">
            <Link className="btn btn-ghost" to={`/boxes?jobId=${job.id}`}>
              {tx("navBoxes")}
            </Link>
            <Link className="btn btn-ghost" to="/yard">
              {tx("navYard")}
            </Link>
            {!job.shipmentId ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  ensureShipment();
                  setMsg(tx("bookingCreated"));
                }}
              >
                {tx("createShellShipment")}
              </button>
            ) : (
              <Link className="btn btn-ghost" to={`/shipments?jobId=${job.id}`}>
                {tx("navShipments")}
              </Link>
            )}
          </div>
          {boxes.length === 0 ? <p className="empty">{tx("emptyShellCrm")}</p> : null}
          <ul className="list-plain">
            {boxes.map((b) => (
              <li key={b.id}>
                <div>
                  <span className="mono cell-strong">{b.id}</span> · {b.type} · <span className="pill">{b.status}</span>
                  {b.demurrageRisk && b.demurrageRisk !== "none" ? (
                    <span className="pill pill-warn">{tx("jobDemurrage")}: {b.demurrageRisk}</span>
                  ) : null}
                </div>
                <div className="form pipe-form" style={{ marginTop: 6 }}>
                  <label>
                    {tx("jobSeal")}
                    <input
                      className="inline-input"
                      value={b.seal ?? ""}
                      onChange={(e) => ops.patchBox(b.id, { seal: e.target.value })}
                    />
                  </label>
                  <label>
                    {tx("jobFreeTime")}
                    <input
                      className="inline-input"
                      type="number"
                      value={b.freeTimeDays ?? 7}
                      onChange={(e) => ops.patchBox(b.id, { freeTimeDays: Number(e.target.value) || 0 })}
                    />
                  </label>
                  <label>
                    {tx("jobLastFreeDay")}
                    <input
                      className="inline-input"
                      value={b.lastFreeDay ?? ""}
                      onChange={(e) => ops.patchBox(b.id, { lastFreeDay: e.target.value })}
                    />
                  </label>
                  <label>
                    {tx("jobDemurrage")}
                    <select
                      className="deal-select"
                      value={b.demurrageRisk ?? "none"}
                      onChange={(e) => ops.patchBox(b.id, { demurrageRisk: e.target.value as "none" | "watch" | "risk" })}
                    >
                      <option value="none">none</option>
                      <option value="watch">watch</option>
                      <option value="risk">risk</option>
                    </select>
                  </label>
                  <label>
                    {tx("colStatus")}
                    <select
                      className="deal-select"
                      value={b.status}
                      onChange={(e) => ops.setBoxStatus(b.id, e.target.value as ShellBoxStatus)}
                    >
                      {SHELL_BOX_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="button" className="btn btn-ghost" onClick={() => void refreshBoxTracking(b.id, b.bl, b.eta)}>
                    {tx("refreshTracking")}
                  </button>
                  <label>
                    Flags
                    <span className="meta">
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={Boolean(b.etaChanged)}
                          onChange={(e) => ops.patchBox(b.id, { etaChanged: e.target.checked })}
                        />
                        ETA
                      </label>{" "}
                      <label className="check">
                        <input type="checkbox" checked={Boolean(b.coPending)} onChange={(e) => ops.patchBox(b.id, { coPending: e.target.checked })} />
                        C/O
                      </label>{" "}
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={Boolean(b.missingDoc)}
                          onChange={(e) => ops.patchBox(b.id, { missingDoc: e.target.checked })}
                        />
                        Doc
                      </label>
                    </span>
                  </label>
                </div>
              </li>
            ))}
          </ul>
          <form className="form form-stack" onSubmit={onAddBox}>
            <label>
              {tx("colBox")}
              <input value={boxForm.id} onChange={(e) => setBoxForm({ ...boxForm, id: e.target.value })} required />
            </label>
            <label>
              {tx("colBoxType")}
              <input value={boxForm.type} onChange={(e) => setBoxForm({ ...boxForm, type: e.target.value })} />
            </label>
            <button type="submit" className="btn btn-primary">
              {tx("createShellBox")}
            </button>
          </form>
        </section>

        <section className="panel">
          <h2>{tx("jobSectionDocuments")}</h2>
          <Link className="btn btn-ghost" to={`/docs?jobId=${job.id}`}>
            {tx("navDocs")}
          </Link>
          <ul className="list-plain">
            {docs.map((d) => (
              <li key={d.id}>
                <strong>{d.docType}</strong> {d.name}{" "}
                <select
                  className="deal-select"
                  value={d.status}
                  onChange={(e) => support.patchDoc(d.id, { status: e.target.value as "ok" | "wait" | "late" })}
                >
                  <option value="ok">ok</option>
                  <option value="wait">wait</option>
                  <option value="late">late / missing</option>
                </select>{" "}
                <select
                  className="deal-select"
                  value={d.approval ?? "none"}
                  onChange={(e) => support.patchDoc(d.id, { approval: e.target.value as "none" | "pending" | "approved" })}
                >
                  <option value="none">{tx("docApprovalNone")}</option>
                  <option value="pending">{tx("docApprovalPending")}</option>
                  <option value="approved">{tx("docApprovalApproved")}</option>
                </select>
                <input
                  className="inline-input"
                  style={{ marginTop: 4 }}
                  placeholder={tx("docNote")}
                  value={d.note ?? ""}
                  onChange={(e) => support.patchDoc(d.id, { note: e.target.value })}
                />
              </li>
            ))}
          </ul>
          {docs.some((d) => d.status !== "ok") ? <p className="meta field-err">{tx("jobMissingDocs")}</p> : null}
          <form className="form form-stack" onSubmit={onAddDoc}>
            <label>
              Type
              <select value={docForm.docType} onChange={(e) => setDocForm({ ...docForm, docType: e.target.value as ShellDocType })}>
                {DOC_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {tx("colTitle")}
              <input value={docForm.name} onChange={(e) => setDocForm({ ...docForm, name: e.target.value })} required />
            </label>
            <button type="submit" className="btn btn-primary">
              {tx("jobAddDoc")}
            </button>
          </form>
        </section>

        <section className="panel">
          <h2>{tx("jobSectionTimeline")}</h2>
          <ul className="list-plain">
            {job.milestones.map((m) => (
              <li key={m.code}>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={Boolean(m.actualAt)}
                    onChange={(e) => jobs.toggleMilestone(job.id, m.code, e.target.checked)}
                  />
                  <span>
                    {m.label}
                    {m.actualAt ? ` · ${m.actualAt.slice(0, 10)}` : ""}
                  </span>
                </label>
              </li>
            ))}
            {invoices.map((inv) => (
              <li key={inv.id} className="meta">
                Invoice {inv.invoiceNumber} · {inv.status}
                {inv.dueDate ? ` · due ${inv.dueDate}` : ""}
                {inv.overdue ? " · OVERDUE" : ""}
              </li>
            ))}
            {billing.payments
              .filter((p) => invoices.some((i) => i.id === p.invoiceId))
              .map((p) => (
                <li key={p.id} className="meta">
                  Payment {p.amount} {p.currency} · {p.createdAt}
                </li>
              ))}
          </ul>
        </section>

        <section className="panel">
          <h2>{tx("jobSectionEmail")}</h2>
          <p className="meta">{tx("jobEmailDeferred")}</p>
        </section>

        <section className="panel">
          <h2>{tx("jobSectionNotes")}</h2>
          <ul className="list-plain">
            {job.notes.map((n) => (
              <li key={n.id}>
                <strong>{n.author}</strong> · {n.createdAt}
                <br />
                {n.body}
              </li>
            ))}
          </ul>
          <form className="form form-stack" onSubmit={onAddNote}>
            <label>
              Note
              <input value={noteBody} onChange={(e) => setNoteBody(e.target.value)} required />
            </label>
            <button type="submit" className="btn btn-primary">
              {tx("jobAddNote")}
            </button>
          </form>
        </section>

        <section className="panel">
          <h2>{tx("jobSectionBilling")}</h2>
          <p>
            {tx("colStatus")}: <span className="pill">{job.billingStatus}</span>
          </p>
          <ul className="list-plain">
            {invoices.map((inv) => (
              <li key={inv.id}>
                <Link to={`/invoices?jobId=${job.id}`}>{inv.invoiceNumber}</Link> — {inv.total} {inv.currency} · {inv.status} · bal{" "}
                {inv.balanceDue}
              </li>
            ))}
          </ul>
          <div className="toolbar">
            <button type="button" className="btn btn-primary" onClick={onInvoice}>
              {tx("invoiceFromJob")}
            </button>
            <Link className="btn btn-ghost" to={`/invoices?jobId=${job.id}`}>
              {tx("recordShellPayment")}
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
