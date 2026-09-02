import { useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { priI18n } from "../crm";
import { customerName } from "../data";
import { useStore } from "../store";
import { Button } from "../ui/Button";
import { Check } from "../ui/Check";
import { Segment } from "../ui/Segment";

export function TasksPage() {
  const { tx, locale, tasks, customers, query, toggleTask, addTask } = useStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [filter, setFilter] = useState<"open" | "done" | "all">("open");
  const q = query.trim().toLowerCase();

  const rows = useMemo(
    () =>
      tasks.filter((t) => {
        if (filter === "open" && t.done) return false;
        if (filter === "done" && !t.done) return false;
        return !q || t.title.toLowerCase().includes(q);
      }),
    [filter, q, tasks],
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    addTask(title);
    setTitle("");
    setOpen(false);
  }

  return (
    <div className="page page--tasks">
      <div className="page-head">
        <div>
          <h1>{tx("tasksTitle")}</h1>
          <p>{tx("tasksHint")}</p>
        </div>
        <Button variant="primary" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {tx("addTask")}
        </Button>
      </div>

      <div className="task-toolbar">
        <Segment
          label={tx("colStatus")}
          value={filter}
          onChange={setFilter}
          options={[
            { value: "open", label: tx("taskFilterOpen") },
            { value: "done", label: tx("taskFilterDone") },
            { value: "all", label: tx("filterAll") },
          ]}
        />
        <span className="task-count">{tx("taskCount", { n: rows.length })}</span>
      </div>

      <div className={`fold${open ? " is-open" : ""}`}>
        <div className="fold-inner">
          <form className="form task-form" onSubmit={submit} aria-hidden={!open}>
            <label className="form-wide">
              {tx("addTask")}
              <input value={title} onChange={(e) => setTitle(e.target.value)} required={open} />
            </label>
            <div className="form-actions">
              <Button onClick={() => setOpen(false)}>{tx("cancel")}</Button>
              <Button type="submit" variant="primary">
                {tx("save")}
              </Button>
            </div>
          </form>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="task-empty">
          <p>{tx("emptyTasks")}</p>
        </div>
      ) : (
        <ul className="task-list">
          {rows.map((t) => {
            const c = t.customerId ? customers.find((x) => x.id === t.customerId) : undefined;
            return (
              <li key={t.id} className={`task-card pri-${t.priority} ${t.done ? "is-done" : ""}`}>
                <div className="task-main">
                  <Check checked={t.done} onChange={() => toggleTask(t.id)} label={t.title} />
                  <div className="task-meta">
                    {c ? (
                      <button type="button" className="linkish" onClick={() => navigate(`/customers/${c.id}`)}>
                        {customerName(c, locale)}
                      </button>
                    ) : null}
                    <time className="num">{t.due}</time>
                    <span>{t.owner}</span>
                  </div>
                </div>
                <span className={`task-pri pri-${t.priority}`}>{tx(priI18n[t.priority])}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
