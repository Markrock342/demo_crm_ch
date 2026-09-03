import { useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useShellJobs } from "../shell/jobStore.tsx";
import { useShellOps } from "../shell/opsStore.tsx";
import { useIsShellMode } from "../shell/session.tsx";
import { useShellSupport, type ShellDocType } from "../shell/supportStore.tsx";
import { useStore } from "../store";
import { PageToolbar } from "../ui/PageToolbar";

const statuses = ["all", "ok", "wait", "late", "missing"] as const;
const DOC_TYPES: ShellDocType[] = ["BOOKING", "BL", "CI", "PL", "CO", "DO", "POD", "OTHER"];

export function DocsPage() {
  const shell = useIsShellMode();
  const store = useStore();
  const support = useShellSupport();
  const ops = useShellOps();
  const jobStore = useShellJobs();
  const { tx, query } = store;
  const [params] = useSearchParams();
  const jobIdFilter = params.get("jobId") ?? "";
  const [status, setStatus] = useState<(typeof statuses)[number]>(params.get("missing") === "1" ? "missing" : "all");
  const [docType, setDocType] = useState<ShellDocType | "all">("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "B/L", docType: "BL" as ShellDocType, boxId: "", shipmentId: "", jobId: jobIdFilter });
  const q = query.trim().toLowerCase();

  const docs = shell ? support.docs : store.docs;

  const rows = useMemo(
    () =>
      docs.filter((d) => {
        if (status === "missing") {
          if (d.status !== "wait" && d.status !== "late") return false;
        } else if (status !== "all" && d.status !== status) return false;
        if (docType !== "all" && "docType" in d && d.docType !== docType) return false;
        if (jobIdFilter && "jobId" in d && d.jobId !== jobIdFilter) return false;
        const note = "note" in d ? d.note ?? "" : "";
        const job = "jobId" in d && d.jobId ? jobStore.getById(d.jobId) : undefined;
        const blob = `${d.name} ${"docType" in d ? d.docType : ""} ${"boxId" in d ? d.boxId ?? "" : ""} ${"jobId" in d ? d.jobId ?? "" : ""} ${note} ${job?.jobNumber ?? ""}`.toLowerCase();
        return !q || blob.includes(q);
      }),
    [docType, docs, jobIdFilter, jobStore, q, status],
  );

  const missingByJob = useMemo(() => {
    if (!shell) return [];
    const map = new Map<string, number>();
    for (const d of support.docs) {
      if ((d.status === "wait" || d.status === "late") && d.jobId) {
        map.set(d.jobId, (map.get(d.jobId) ?? 0) + 1);
      }
    }
    return [...map.entries()]
      .map(([jobId, count]) => ({ jobId, count, job: jobStore.getById(jobId) }))
      .sort((a, b) => b.count - a.count);
  }, [jobStore, shell, support.docs]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!shell) return;
    support.addDoc({
      name: form.name,
      docType: form.docType,
      jobId: form.jobId || undefined,
      boxId: form.boxId || undefined,
      shipmentId: form.shipmentId || undefined,
    });
    setOpen(false);
  }

  return (
    <div className="page page--workspace">
      <PageToolbar
        title={tx("docsTitle")}
        count={rows.length}
        hint={shell ? `${tx("shellDataBadge")}${jobIdFilter ? ` · job ${jobIdFilter}` : ""}` : tx("docsHint")}
        actions={
          shell ? (
            <>
              {jobIdFilter ? (
                <Link className="btn btn-ghost" to={`/jobs/${jobIdFilter}`}>
                  {tx("navJobs")}
                </Link>
              ) : null}
              <Link className="btn btn-ghost" to="/exceptions">
                {tx("navExceptions")}
              </Link>
              <button type="button" className="btn btn-primary" onClick={() => setOpen((v) => !v)}>
                {tx("jobAddDoc")}
              </button>
            </>
          ) : null
        }
        filters={
          <div className="filter-row" role="tablist">
            {statuses.map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={status === s}
                className={`filter-chip${status === s ? " is-on" : ""}`}
                onClick={() => setStatus(s)}
              >
                {s === "all" ? tx("filterAll") : s === "missing" ? tx("docsMissingMode") : s}
              </button>
            ))}
            <select className="deal-select" value={docType} onChange={(e) => setDocType(e.target.value as ShellDocType | "all")}>
              <option value="all">Type</option>
              {DOC_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        }
      />

      {shell && status === "missing" && missingByJob.length > 0 ? (
        <section className="panel">
          <h2>{tx("docsMissingByJob")}</h2>
          <ul className="list-plain">
            {missingByJob.map((row) => (
              <li key={row.jobId}>
                <Link to={`/jobs/${row.jobId}`}>{row.job?.jobNumber ?? row.jobId}</Link> — {row.count} {tx("docsMissingCount")}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {open && shell ? (
        <form className="form form-stack" onSubmit={submit}>
          <label>
            Type
            <select value={form.docType} onChange={(e) => setForm({ ...form, docType: e.target.value as ShellDocType })}>
              {DOC_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label>
            {tx("colTitle")}
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label>
            {tx("navJobs")}
            <select value={form.jobId} onChange={(e) => setForm({ ...form, jobId: e.target.value })}>
              <option value="">—</option>
              {jobStore.jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.jobNumber}
                </option>
              ))}
            </select>
          </label>
          <label>
            {tx("colBox")}
            <select value={form.boxId} onChange={(e) => setForm({ ...form, boxId: e.target.value })}>
              <option value="">—</option>
              {ops.boxes.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.id}
                </option>
              ))}
            </select>
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
                <th>Type</th>
                <th>{tx("colTitle")}</th>
                <th>{tx("navJobs")}</th>
                <th>{tx("colBox")}</th>
                <th>{tx("colStatus")}</th>
                <th>{tx("docNote")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td>{"docType" in d ? d.docType : "—"}</td>
                  <td className="cell-strong">{d.name}</td>
                  <td>
                    {"jobId" in d && d.jobId ? (
                      <Link to={`/jobs/${d.jobId}`}>{jobStore.getById(d.jobId)?.jobNumber ?? d.jobId}</Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="mono">{"boxId" in d ? d.boxId ?? "—" : "—"}</td>
                  <td>
                    {shell ? (
                      <select
                        className="deal-select"
                        value={d.status}
                        onChange={(e) => support.setDocStatus(d.id, e.target.value as "ok" | "wait" | "late")}
                      >
                        <option value="ok">ok</option>
                        <option value="wait">wait</option>
                        <option value="late">late</option>
                      </select>
                    ) : (
                      <span className="pill">{d.status}</span>
                    )}
                  </td>
                  <td className="meta">{"note" in d ? d.note || "—" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
