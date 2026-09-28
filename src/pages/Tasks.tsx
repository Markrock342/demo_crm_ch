import { CalendarBlank, CalendarCheck, CheckCircle, WarningCircle, type Icon } from "@phosphor-icons/react";
import { App, Button, Segmented } from "antd";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useStore } from "../store";
import { EmptyState, ErrorState, FilterBar, IconBadge, LoadingState, PageHeader, Panel } from "../v2/components";
import type { Tone } from "../v2/components/Graphics.tsx";
import { useCan } from "../v2/hooks/useCan.ts";
import { useCustomerLookup } from "../v2/hooks/useCustomerLookup.ts";
import { OwnerSelect, QuickAddTask, TaskCard, TaskDrawer } from "../v2/pages/home/TaskParts.tsx";
import { useModeTasks, type DueBucket, type TaskRow } from "../v2/pages/home/tasks.ts";
import "../v2/pages/home/home.css";
import "../v2/pages/home/tasks.css";

type Filter = "open" | "done" | "all";
type Scope = "mine" | "all";
const BUCKETS: DueBucket[] = ["overdue", "today", "later"];
const GROUP_LOOK: Record<string, { icon: Icon; tone: Tone }> = {
  overdue: { icon: WarningCircle, tone: "danger" },
  today: { icon: CalendarCheck, tone: "warning" },
  later: { icon: CalendarBlank, tone: "info" },
  done: { icon: CheckCircle, tone: "success" },
};
const PAGE = 200;

export function TasksPage() {
  const { tx } = useStore();
  const { message } = App.useApp();
  const can = useCan();
  const viewAll = can("task.view_all");
  const { nameOf } = useCustomerLookup();
  const [params, setParams] = useSearchParams();
  const scope: Scope = params.get("scope") === "all" ? "all" : "mine";
  const owner = scope === "all" ? (params.get("owner") ?? undefined) : undefined;
  const [filter, setFilter] = useState<Filter>("open");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [editing, setEditing] = useState<TaskRow | null>(null);

  const { tasks, total, loading, error, actions } = useModeTasks({ scope, owner, status: "all", limit });

  const setParam = (k: string, v: string | undefined) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k === "scope" && v !== "all") next.delete("owner");
    setParams(next, { replace: true });
    setLimit(PAGE);
  };

  const searched = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return tasks;
    return tasks.filter((t) =>
      `${t.title} ${t.titleRaw} ${nameOf(t.customerId, "")} ${t.boxId ?? ""} ${t.jobNumber ?? ""}`.toLowerCase().includes(needle),
    );
  }, [nameOf, q, tasks]);

  const open = searched.filter((t) => !t.done);
  const done = searched.filter((t) => t.done);
  const allOpen = tasks.filter((t) => !t.done);
  const overdueCount = allOpen.filter((t) => t.bucket === "overdue").length;
  const todayCount = allOpen.filter((t) => t.bucket === "today").length;

  function toggle(t: TaskRow) {
    actions.toggle.mutate(
      { id: t.id, done: !t.done },
      {
        onSuccess: () => message.success(tx(t.done ? "tk_reopened" : "tk_done_toast")),
        onError: () => message.error(tx("tk_error")),
      },
    );
  }

  const groups: { key: string; title: string; rows: TaskRow[] }[] = [];
  if (filter !== "done") {
    for (const b of BUCKETS) {
      const rows = open.filter((t) => t.bucket === b);
      if (rows.length) groups.push({ key: b, title: tx(`home_bucket_${b}`), rows });
    }
  }
  if (filter !== "open" && done.length) groups.push({ key: "done", title: tx("home_bucket_done"), rows: done });

  let body;
  if (loading) body = <LoadingState />;
  else if (error)
    body = (
      <Panel>
        <ErrorState title={tx("tk_load_error")} />
      </Panel>
    );
  else if (groups.length)
    body = (
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
              <ul className="hm-tgrid">
                {g.rows.map((t) => (
                  <TaskCard key={t.id} t={t} onToggle={toggle} onOpen={setEditing} />
                ))}
              </ul>
            </section>
          );
        })}
        {total > tasks.length ? (
          <Button block onClick={() => setLimit((n) => n + PAGE)}>
            {tx("tk_more")}
          </Button>
        ) : null}
      </div>
    );
  else
    body = (
      <Panel>
        {tasks.length === 0 && !q ? (
          <EmptyState
            title={tx("tk_empty_title")}
            description={tx("tk_empty_desc")}
            action={
              <Button type="primary" onClick={() => document.getElementById("tk-quickadd-title")?.focus()}>
                {tx("tk_empty_action")}
              </Button>
            }
          />
        ) : (
          <EmptyState
            title={q ? tx("home_task_no_match") : filter === "done" ? tx("home_task_none_done") : tx("home_task_all_done")}
            description={q ? undefined : tx("home_task_empty_desc")}
          />
        )}
      </Panel>
    );

  return (
    <>
      <PageHeader
        title={tx("home_tasks_page")}
        subtitle={
          allOpen.length ? tx("home_tasks_sub", { n: allOpen.length, o: overdueCount, t: todayCount }) : tx("home_tasks_none")
        }
      >
        <QuickAddTask />
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
          extra={
            <span className="tk-scope">
              <Segmented
                value={scope}
                onChange={(v) => setParam("scope", v === "all" ? "all" : undefined)}
                options={[
                  { value: "mine", label: tx("tk_scope_mine") },
                  { value: "all", label: viewAll ? tx("tk_scope_team") : tx("tk_scope_involved") },
                ]}
              />
              {viewAll && scope === "all" ? (
                <OwnerSelect
                  value={owner}
                  onChange={(v) => setParam("owner", v)}
                  placeholder={tx("tk_all_owners")}
                  className="tk-owner-filter"
                />
              ) : null}
            </span>
          }
          onClear={() => {
            setQ("");
            setFilter("open");
          }}
        />
      </PageHeader>
      {body}
      <TaskDrawer task={editing} onClose={() => setEditing(null)} />
    </>
  );
}
