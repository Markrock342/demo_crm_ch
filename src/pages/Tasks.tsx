import { useMemo, useState, type FormEvent } from "react";
import { customerName, type Customer } from "../data";
import { useShellCrm } from "../shell/crmStore.tsx";
import { useShellJobs } from "../shell/jobStore.tsx";
import { useShellSupport } from "../shell/supportStore.tsx";
import { useIsShellMode } from "../shell/session.tsx";
import { useStore } from "../store";
import { Button } from "../ui/Button";
import { Check } from "../ui/Check";
import { PageToolbar } from "../ui/PageToolbar";

export function TasksPage() {
  const shell = useIsShellMode();
  const store = useStore();
  const crm = useShellCrm();
  const jobs = useShellJobs();
  const support = useShellSupport();
  const { tx, locale, query } = store;
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [jobId, setJobId] = useState("");
  const [filter, setFilter] = useState<"open" | "done" | "all">("open");
  const q = query.trim().toLowerCase();

  const tasks = shell ? support.tasks : store.tasks;
  const customers = shell ? crm.customers : store.customers;

  const rows = useMemo(
    () =>
      tasks.filter((t) => {
        if (filter === "open" && t.done) return false;
        if (filter === "done" && !t.done) return false;
        return !q || t.title.toLowerCase().includes(q);
      }),
    [filter, q, tasks],
  );

  const counts = useMemo(
    () => ({
      open: tasks.filter((t) => !t.done).length,
      done: tasks.filter((t) => t.done).length,
      all: tasks.length,
    }),
    [tasks],
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    if (shell) {
      support.addTask({ title, customerId: customerId || undefined, jobId: jobId || undefined });
    } else {
      store.addTask(title);
    }
    setTitle("");
    setOpen(false);
  }

  function toggle(id: string) {
    if (shell) support.toggleTask(id);
    else store.toggleTask(id);
  }

  return (
    <div className="page page--workspace page--tasks">
      <PageToolbar
        title={tx("tasksTitle")}
        count={rows.length}
        hint={shell ? tx("shellDataBadge") : tx("tasksHint")}
        actions={
          <Button variant="primary" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {tx("addTask")}
          </Button>
        }
        filters={
          <div className="filter-row" role="tablist">
            {(["open", "done", "all"] as const).map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={filter === f}
                className={`filter-chip${filter === f ? " is-on" : ""}`}
                onClick={() => setFilter(f)}
              >
                <span>{f === "open" ? tx("taskFilterOpen") : f === "done" ? tx("taskFilterDone") : tx("filterAll")}</span>
                <em>{counts[f]}</em>
              </button>
            ))}
          </div>
        }
      />

      {open ? (
        <form className="form form-stack task-form" onSubmit={submit}>
          <label>
            {tx("colTitle")}
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </label>
          {shell ? (
            <>
              <label>
                {tx("colCustomer")}
                <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                  <option value="">—</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {customerName(c as Customer, locale)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {tx("navJobs")}
                <select value={jobId} onChange={(e) => setJobId(e.target.value)}>
                  <option value="">—</option>
                  {jobs.jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.jobNumber}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : null}
          <button type="submit" className="btn btn-primary">
            {tx("save")}
          </button>
        </form>
      ) : null}

      <ul className="task-list">
        {rows.map((t) => {
          const c = "customerId" in t && t.customerId ? customers.find((x) => x.id === t.customerId) : null;
          return (
            <li key={t.id} className={`task-card pri-${"priority" in t ? t.priority : "normal"} ${t.done ? "is-done" : ""}`}>
              <div className="task-main">
                <Check checked={t.done} onChange={() => toggle(t.id)} label={t.title} />
                <div className="task-meta">
                  {c ? <span>{customerName(c as Customer, locale)}</span> : null}
                  {"jobId" in t && t.jobId ? <span className="mono">{t.jobId}</span> : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
