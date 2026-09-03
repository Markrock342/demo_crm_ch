import { useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { snapshotStatusToShell, trackingMock } from "../adapters/mock/tracking.mock.ts";
import { customerName, type BoxStatus, type Customer, type Direction } from "../data";
import { useContainers } from "../hooks/useContainers";
import { SHELL_BOX_STATUSES, type ShellBoxStatus } from "../ports/ops.port.ts";
import { canEditLogistics } from "../shell/nav.ts";
import { useShellCrm } from "../shell/crmStore.tsx";
import { useShellOps, YARD_SLOTS } from "../shell/opsStore.tsx";
import { useIsShellMode, useShellSession } from "../shell/session.tsx";
import { useStore } from "../store";
import { PageToolbar } from "../ui/PageToolbar";

const legacyStatuses: BoxStatus[] = ["yard", "sail", "clear", "hold", "empty"];

export function BoxesPage() {
  const shell = useIsShellMode();
  const { shellUser } = useShellSession();
  const store = useStore();
  const crm = useShellCrm();
  const ops = useShellOps();
  const containers = useContainers();
  const { tx, locale, query } = store;
  const [params] = useSearchParams();
  const jobIdFilter = params.get("jobId") ?? "";
  const shipmentIdFilter = params.get("shipmentId") ?? "";
  const canEdit = shell ? canEditLogistics(shellUser?.department ?? null) : true;
  const customers = shell ? crm.customers : store.customers;
  const boxes = shell ? ops.boxes : containers.boxes;
  const statusOptions = shell ? (SHELL_BOX_STATUSES as string[]) : legacyStatuses;
  const [status, setStatus] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [form, setForm] = useState({
    id: "",
    customerId: "",
    type: "40HC",
    dir: "in" as Direction,
    status: "gate_in" as string,
    slot: "A1",
    bl: "",
    teu: 2,
  });
  const q = query.trim().toLowerCase();

  const shipmentIdsForJob = useMemo(() => {
    if (!jobIdFilter || !shell) return new Set<string>();
    return new Set(ops.shipments.filter((s) => s.jobId === jobIdFilter).map((s) => s.id));
  }, [jobIdFilter, ops.shipments, shell]);

  const rows = useMemo(() => {
    return boxes.filter((b) => {
      if (status !== "all" && b.status !== status) return false;
      if (shipmentIdFilter && b.shipmentId !== shipmentIdFilter) return false;
      if (jobIdFilter) {
        const ship = ops.shipments.find((s) => s.id === b.shipmentId);
        if (!(shipmentIdsForJob.has(b.shipmentId ?? "") || ship?.jobId === jobIdFilter)) return false;
      }
      const c = customers.find((x) => x.id === b.customerId);
      const blob = `${b.id} ${b.bl} ${b.yardZh} ${c ? customerName(c as Customer, locale) : ""}`.toLowerCase();
      return !q || blob.includes(q);
    });
  }, [boxes, customers, jobIdFilter, locale, ops.shipments, q, shipmentIdFilter, shipmentIdsForJob, status]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!shell || !canEdit) return;
    const fail = ops.addBox({
      ...form,
      status: form.status as ShellBoxStatus,
      customerId: form.customerId || customers[0]?.id || "",
    });
    if (fail) return;
    setForm({ ...form, id: "", bl: "" });
    setOpen(false);
  }

  async function refreshTracking(boxId: string, bl: string, eta: string) {
    if (!shell) return;
    setBusyId(boxId);
    try {
      const snap = await trackingMock.refresh({ containerNo: boxId, bl, currentEta: eta });
      ops.applyTrackingSnapshot(boxId, {
        status: snapshotStatusToShell(snap.status),
        eta: snap.eta,
        vessel: snap.vessel,
        carrier: snap.carrier,
        lastFreeDay: snap.lastFreeDay,
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="page page--workspace">
      <PageToolbar
        title={tx("boxesTitle")}
        count={rows.length}
        hint={
          shell
            ? `${tx("shellDataBadge")}${canEdit ? "" : ` · ${tx("shellReadOnly")}`}${jobIdFilter ? ` · job ${jobIdFilter}` : ""}${shipmentIdFilter ? ` · ${shipmentIdFilter}` : ""}`
            : tx("boxesHint")
        }
        actions={
          shell ? (
            <>
              {jobIdFilter ? (
                <Link className="btn btn-ghost" to={`/jobs/${jobIdFilter}`}>
                  {tx("navJobs")}
                </Link>
              ) : null}
              {canEdit ? (
                <button type="button" className="btn btn-primary" onClick={() => setOpen((v) => !v)} disabled={customers.length === 0}>
                  {tx("createShellBox")}
                </button>
              ) : null}
            </>
          ) : null
        }
        filters={
          <div className="filter-row" role="tablist">
            {(["all", ...statusOptions] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={status === s}
                className={`filter-chip${status === s ? " is-on" : ""}`}
                onClick={() => setStatus(s)}
              >
                {s === "all" ? tx("filterAll") : s}
              </button>
            ))}
          </div>
        }
      />

      {shell && customers.length === 0 ? (
        <p className="meta">
          {tx("quoteNeedCustomer")} <Link to="/customers">{tx("shellCreateCustomer")}</Link>
        </p>
      ) : null}

      {open && shell && canEdit ? (
        <form className="form form-stack" onSubmit={submit}>
          <label>
            {tx("colBox")}
            <input value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} required />
          </label>
          <label>
            {tx("colCustomer")}
            <select value={form.customerId || customers[0]?.id || ""} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {customerName(c as Customer, locale)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Slot
            <select value={form.slot} onChange={(e) => setForm({ ...form, slot: e.target.value })}>
              {YARD_SLOTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label>
            BL
            <input value={form.bl} onChange={(e) => setForm({ ...form, bl: e.target.value })} />
          </label>
          <button type="submit" className="btn btn-primary">
            {tx("save")}
          </button>
        </form>
      ) : null}

      {rows.length === 0 ? (
        <p className="empty">{tx("emptyShellCrm")}</p>
      ) : (
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>{tx("colBox")}</th>
                <th>{tx("colCustomer")}</th>
                <th>{tx("colStatus")}</th>
                <th>{tx("colYard")}</th>
                <th>BL</th>
                <th>{tx("colTeu")}</th>
                {shell && canEdit ? <th /> : null}
                {shell && canEdit ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => {
                const c = customers.find((x) => x.id === b.customerId);
                return (
                  <tr key={b.id}>
                    <td className="mono cell-strong">{b.id}</td>
                    <td>{c ? customerName(c as Customer, locale) : b.customerId}</td>
                    <td>
                      <span className="pill">{b.status}</span>
                      {"etaChanged" in b && b.etaChanged ? <span className="pill pill-warn">ETA</span> : null}
                    </td>
                    <td>{b.yardZh}</td>
                    <td className="mono">{b.bl}</td>
                    <td className="num">{b.teu}</td>
                    {shell && canEdit ? (
                      <td>
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
                      </td>
                    ) : null}
                    {shell && canEdit ? (
                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={busyId === b.id}
                          onClick={() => void refreshTracking(b.id, b.bl, b.eta)}
                        >
                          {busyId === b.id ? "…" : tx("refreshTracking")}
                        </button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
