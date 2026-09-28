import {
  CheckCircle,
  CheckSquare,
  EnvelopeSimple,
  NotePencil,
  Phone,
  Trash,
  UsersThree,
  type Icon,
} from "@phosphor-icons/react";
import { App, Button, Input, Popconfirm, Segmented, Tooltip } from "antd";
import { useMemo, useState, type FormEvent } from "react";
import type { ActivityType } from "../../../api/tasks.ts";
import { useAuth } from "../../../auth/AuthProvider";
import type { Locale } from "../../../i18n";
import { useStore } from "../../../store";
import { EmptyState, IconBadge, LoadingState, PersonAvatar } from "../../components";
import type { Tone } from "../../components/Graphics.tsx";
import { useCan } from "../../hooks/useCan.ts";
import { useUserLookup } from "../../hooks/useUserLookup.ts";
import { useActivities, useActivityActions, useTaskActions, useTasks } from "../../hooks/useTasks.ts";
import { localizeDemo } from "../../lib/demoText.ts";
import { fmtDateTime, fmtRelativeDay } from "../../lib/format.ts";
import { QuickAddTask, TaskCard, TaskDrawer } from "./TaskParts.tsx";
import { toTaskRow, type TaskRow } from "./tasks.ts";
import "./tasks.css";

export const ACTIVITY_LOOK: Record<ActivityType, { icon: Icon; tone: Tone }> = {
  call: { icon: Phone, tone: "info" },
  mail: { icon: EnvelopeSimple, tone: "accent" },
  meet: { icon: UsersThree, tone: "primary" },
  note: { icon: NotePencil, tone: "neutral" },
  task: { icon: CheckCircle, tone: "success" },
};

const LOG_TYPES: ActivityType[] = ["call", "mail", "meet", "note"];

/** Newest-first activity log for a customer or job, with a one-line composer. */
export function ActivityTimeline({ customerId, jobId }: { customerId?: string; jobId?: string }) {
  const { tx, locale } = useStore();
  const loc = locale as Locale;
  const { message } = App.useApp();
  const { user } = useAuth();
  const can = useCan();
  const staff = useUserLookup();
  const [limit, setLimit] = useState(30);
  const q = useActivities({ customerId, jobId, limit });
  const { create, remove } = useActivityActions();
  const [type, setType] = useState<ActivityType>("call");
  const [body, setBody] = useState("");
  const canLog = can("activity.create");

  async function submit(e: FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    try {
      await create.mutateAsync({ type, body: text, customerId: customerId ?? null, jobId: jobId ?? null });
      setBody("");
      message.success(tx("tk_act_saved"));
    } catch {
      message.error(tx("tk_error"));
    }
  }

  const items = q.data?.items ?? [];

  return (
    <section className="tk-timeline-wrap" aria-label={tx("tk_act_title")}>
      {canLog ? (
        <form className="tk-composer" onSubmit={submit}>
          <Segmented
            value={type}
            onChange={(v) => setType(v as ActivityType)}
            options={LOG_TYPES.map((k) => {
              const I = ACTIVITY_LOOK[k].icon;
              return {
                value: k,
                label: (
                  <Tooltip title={tx(`tk_act_${k}`)}>
                    <span className="tk-type-opt">
                      <I size={18} weight={type === k ? "fill" : "regular"} aria-hidden />
                      <span className="tk-type-label">{tx(`tk_act_${k}`)}</span>
                    </span>
                  </Tooltip>
                ),
              };
            })}
          />
          <Input
            className="tk-composer-input"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={tx("tk_act_placeholder")}
            aria-label={tx("tk_act_placeholder")}
            maxLength={4000}
          />
          <Button type="primary" htmlType="submit" loading={create.isPending} disabled={!body.trim()}>
            {tx("tk_act_add")}
          </Button>
        </form>
      ) : null}

      {q.isLoading ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState description={tx("tk_act_empty")} />
      ) : (
        <ol className="tk-timeline">
          {items.map((a) => {
            const look = ACTIVITY_LOOK[a.type] ?? ACTIVITY_LOOK.note;
            const who = a.userId ? staff.nameOf(a.userId, "") : "";
            const mine = a.userId === user?.id || can("task.view_all");
            return (
              <li key={a.id} className={`tk-tl-item is-${a.type}`}>
                <IconBadge icon={look.icon} tone={look.tone} size={34} />
                <div className="tk-tl-body">
                  <p className="tk-tl-text">{localizeDemo(a.body, locale)}</p>
                  <span className="tk-tl-meta">
                    {who ? <PersonAvatar name={who} size={18} /> : null}
                    <Tooltip title={fmtDateTime(a.occurredAt, loc)}>
                      <time dateTime={a.occurredAt}>{relTime(a.occurredAt, loc)}</time>
                    </Tooltip>
                    <span className="tk-tl-kind">{tx(`tk_act_${a.type}`)}</span>
                  </span>
                </div>
                {mine && a.type !== "task" ? (
                  <Popconfirm
                    title={tx("tk_act_delete")}
                    okText={tx("tk_delete")}
                    okButtonProps={{ danger: true }}
                    onConfirm={() => remove.mutate(a.id, { onError: () => message.error(tx("tk_error")) })}
                  >
                    <Button type="text" size="small" className="tk-tl-del" aria-label={tx("tk_delete")} icon={<Trash size={15} />} />
                  </Popconfirm>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
      {q.data && q.data.total > items.length ? (
        <Button block onClick={() => setLimit((n) => n + 30)} loading={q.isFetching}>
          {tx("tk_more")}
        </Button>
      ) : null}
    </section>
  );
}

function relTime(iso: string, loc: Locale) {
  const d = new Date(iso);
  const time = new Intl.DateTimeFormat(loc === "th" ? "th-TH" : loc === "zh" ? "zh-CN" : "en-GB", { hour: "2-digit", minute: "2-digit" }).format(d);
  return `${fmtRelativeDay(d, loc)} ${time}`;
}

/** Customer page tab: open to-dos for this customer (quick add) + the activity log. */
export function CustomerActivityTab({ customerId }: { customerId: string }) {
  const { tx, locale } = useStore();
  const { message } = App.useApp();
  const tasksQ = useTasks({ scope: "all", customerId, status: "open", limit: 100 });
  const [editing, setEditing] = useState<TaskRow | null>(null);
  const { toggle } = useTaskActions();
  const rows = useMemo(() => (tasksQ.data?.items ?? []).map((t) => toTaskRow(t, locale)), [tasksQ.data, locale]);

  return (
    <div className="tk-customer">
      <section className="tk-customer-tasks">
        <h3 className="hm-sec-title">
          <IconBadge icon={CheckSquare} tone={rows.some((r) => r.bucket === "overdue") ? "danger" : "accent"} size={28} />
          <span>{tx("tk_open_tasks")}</span>
          <span className="hm-count is-accent">{rows.length}</span>
        </h3>
        <QuickAddTask customerId={customerId} compact />
        {rows.length ? (
          <ul className="hm-tgrid">
            {rows.map((t) => (
              <TaskCard
                key={t.id}
                t={t}
                hideCustomer
                onOpen={setEditing}
                onToggle={(row) =>
                  toggle.mutate(
                    { id: row.id, done: !row.done },
                    { onSuccess: () => message.success(tx(row.done ? "tk_reopened" : "tk_done_toast")), onError: () => message.error(tx("tk_error")) },
                  )
                }
              />
            ))}
          </ul>
        ) : tasksQ.isLoading ? null : (
          <p className="cz-muted tk-quiet">{tx("tk_no_open")}</p>
        )}
      </section>
      <section>
        <h3 className="hm-sec-title">
          <IconBadge icon={NotePencil} tone="info" size={28} />
          <span>{tx("tk_act_title")}</span>
        </h3>
        <ActivityTimeline customerId={customerId} />
      </section>
      <TaskDrawer task={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

