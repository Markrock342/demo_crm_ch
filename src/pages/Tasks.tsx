import { CalendarBlank, CalendarCheck, Check, CheckCircle, Fire, Package, Plus, Truck, WarningCircle, type Icon } from "@phosphor-icons/react";
import { App, Button, Checkbox, Input, Select, Tooltip, type InputRef } from "antd";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type { Locale } from "../i18n";
import { useShellJobs } from "../shell/jobStore.tsx";
import { useStore } from "../store";
import { EmptyState, FilterBar, IconBadge, PageHeader, Panel, PersonAvatar } from "../v2/components";
import type { Tone } from "../v2/components/Graphics.tsx";
import { useCustomerLookup } from "../v2/hooks/useCustomerLookup.ts";
import { fmtDateTime, fmtRelativeDay } from "../v2/lib/format.ts";
import { useModeTasks, type DueBucket, type TaskRow } from "../v2/pages/home/tasks.ts";
import "../v2/pages/home/home.css";

type Filter = "open" | "done" | "all";
const BUCKETS: DueBucket[] = ["overdue", "today", "later"];
const GROUP_LOOK: Record<string, { icon: Icon; tone: Tone }> = {
  overdue: { icon: WarningCircle, tone: "danger" },
  today: { icon: CalendarCheck, tone: "warning" },
  later: { icon: CalendarBlank, tone: "info" },
  done: { icon: CheckCircle, tone: "success" },
};

export function TasksPage() {
  const { tx, locale } = useStore();
  const loc = locale as Locale;
  const { message } = App.useApp();
  const { tasks, toggle, add, shell } = useModeTasks();
  const jobs = useShellJobs();
  const { nameOf, customers } = useCustomerLookup();
  const [filter, setFilter] = useState<Filter>("open");
  const [q, setQ] = useState("");
  const [title, setTitle] = useState("");
  const [customerId, setCustomerId] = useState<string | undefined>();
  const [jobId, setJobId] = useState<string | undefined>();
  const [high, setHigh] = useState(false);
  const inputRef = useRef<InputRef>(null);

  const jobNumber = (id?: string) => (id ? jobs.jobs.find((j) => j.id === id)?.jobNumber : undefined);

  const searched = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return tasks;
    return tasks.filter((t) => `${t.title} ${t.titleRaw} ${nameOf(t.customerId, "")} ${t.boxId ?? ""}`.toLowerCase().includes(needle));
  }, [nameOf, q, tasks]);

  const open = searched.filter((t) => !t.done);
  const done = searched.filter((t) => t.done);
  const allOpen = tasks.filter((t) => !t.done);
  const overdueCount = allOpen.filter((t) => t.bucket === "overdue").length;
  const todayCount = allOpen.filter((t) => t.bucket === "today").length;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      inputRef.current?.focus();
      return;
    }
    add({ title: title.trim(), customerId, jobId, high });
    message.success(tx("home_task_added"));
    setTitle("");
    setJobId(undefined);
    setHigh(false);
    inputRef.current?.focus();
  }

  function card(t: TaskRow) {
    const job = jobNumber(t.jobId);
    const late = t.bucket === "overdue" && !t.done;
    const dueTone = t.done ? "neutral" : late ? "danger" : t.bucket === "today" ? "warning" : "info";
    return (
      <li key={t.id} className={`hm-tcard${t.done ? " is-done" : ""}${late ? " is-late" : ""}`}>
        <label className="hm-tcheck">
          <input type="checkbox" checked={t.done} onChange={() => toggle(t.id)} aria-label={t.title} />
          <span className="hm-tcheck-box" aria-hidden>
            <Check size={16} weight="bold" />
          </span>
        </label>
        <div className="hm-tcard-body">
          <span className="hm-tcard-title">
            {t.high && !t.done ? (
              <Tooltip title={tx("home_task_urgent")}>
                <Fire size={16} weight="fill" className="hm-fire" aria-label={tx("home_task_urgent")} />
              </Tooltip>
            ) : null}
            {t.title}
          </span>
          <span className="hm-tcard-meta">
            {t.due ? (
              <span className={`hm-age is-${dueTone}`}>{t.hasTime ? fmtDateTime(t.due, loc) : fmtRelativeDay(t.due, loc)}</span>
            ) : null}
            {job ? (
              <Link to={`/jobs/${t.jobId}`} className="hm-chip">
                <Truck size={13} aria-hidden />
                {job}
              </Link>
            ) : null}
            {t.boxId ? (
              <Link to={`/boxes?q=${t.boxId}`} className="hm-chip cz-mono">
                <Package size={13} aria-hidden />
                {t.boxId}
              </Link>
            ) : null}
          </span>
        </div>
        <span className="hm-tcard-people">
          {t.customerId ? (
            <Link to={`/customers/${t.customerId}`} aria-label={nameOf(t.customerId)}>
              <PersonAvatar name={nameOf(t.customerId)} size={30} />
            </Link>
          ) : null}
          {t.owner ? <PersonAvatar name={t.owner} size={22} /> : null}
        </span>
      </li>
    );
  }

  const groups: { key: string; title: string; rows: TaskRow[]; tone?: "danger" }[] = [];
  if (filter !== "done") {
    for (const b of BUCKETS) {
      const rows = open.filter((t) => t.bucket === b);
      if (rows.length) groups.push({ key: b, title: tx(`home_bucket_${b}`), rows, tone: b === "overdue" ? "danger" : undefined });
    }
  }
  if (filter !== "open" && done.length) groups.push({ key: "done", title: tx("home_bucket_done"), rows: done });

  return (
    <>
      <PageHeader
        title={tx("home_tasks_page")}
        subtitle={
          allOpen.length
            ? tx("home_tasks_sub", { n: allOpen.length, o: overdueCount, t: todayCount })
            : tx("home_tasks_none")
        }
      >
        <form className="hm-quickadd" onSubmit={submit}>
          <Input
            ref={inputRef}
            className="hm-quickadd-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={tx("home_task_placeholder")}
            aria-label={tx("home_task_placeholder")}
            prefix={<Plus size={16} aria-hidden />}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={tx("home_task_customer")}
            value={customerId}
            onChange={(v) => setCustomerId(v ?? undefined)}
            options={customers.map((c) => ({ value: c.id, label: nameOf(c.id) }))}
            className="hm-quickadd-select"
          />
          {shell ? (
            <>
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder={tx("home_task_job")}
                value={jobId}
                onChange={(v) => setJobId(v ?? undefined)}
                options={jobs.jobs.map((j) => ({ value: j.id, label: j.jobNumber }))}
                className="hm-quickadd-select"
              />
              <Checkbox checked={high} onChange={(e) => setHigh(e.target.checked)}>
                {tx("home_task_urgent")}
              </Checkbox>
            </>
          ) : null}
          <Button type="primary" htmlType="submit">
            {tx("home_task_add")}
          </Button>
        </form>
        <FilterBar
          tabs={{
            value: filter,
            onChange: (v) => setFilter(v as Filter),
            options: [
              { value: "open", label: tx("home_task_open"), count: open.length },
              { value: "done", label: tx("home_task_done"), count: done.length },
              { value: "all", label: tx("home_filter_all"), count: searched.length },
            ],
          }}
          search={{ value: q, onChange: setQ, placeholder: tx("home_task_search") }}
          onClear={() => {
            setQ("");
            setFilter("open");
          }}
        />
      </PageHeader>

      {groups.length ? (
        <div className="cz-stack">
          {groups.map((g) => {
            const look = GROUP_LOOK[g.key];
            return (
              <section key={g.key} className="hm-tgroup">
                <h2 className="hm-sec-title">
                  <IconBadge icon={look.icon} tone={look.tone} size={28} />
                  <span>{g.title}</span>
                  <span className={`hm-count is-${look.tone}`}>{g.rows.length}</span>
                </h2>
                <ul className="hm-tgrid">{g.rows.map(card)}</ul>
              </section>
            );
          })}
        </div>
      ) : (
        <Panel>
          <EmptyState
            title={q ? tx("home_task_no_match") : filter === "done" ? tx("home_task_none_done") : tx("home_task_all_done")}
            description={q ? undefined : tx("home_task_empty_desc")}
            action={
              q ? undefined : (
                <Button type="primary" onClick={() => inputRef.current?.focus()}>
                  {tx("home_task_add_first")}
                </Button>
              )
            }
          />
        </Panel>
      )}
    </>
  );
}
