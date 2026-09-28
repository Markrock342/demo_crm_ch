import { Check, Fire, Package, Plus, Trash, Truck } from "@phosphor-icons/react";
import { App, Button, DatePicker, Drawer, Form, Input, Popconfirm, Segmented, Select, Tooltip, type InputRef } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { TaskPriority } from "../../../api/tasks.ts";
import { useAuth } from "../../../auth/AuthProvider";
import type { Locale } from "../../../i18n";
import { useStore } from "../../../store";
import { PersonAvatar } from "../../components";
import { useCustomerLookup } from "../../hooks/useCustomerLookup.ts";
import { useUserLookup, userDisplayName } from "../../hooks/useUserLookup.ts";
import { useTaskActions } from "../../hooks/useTasks.ts";
import { fmtDateTime, fmtRelativeDay } from "../../lib/format.ts";
import { useModeJobs } from "./attention.ts";
import type { TaskRow } from "./tasks.ts";
import "./home.css";
import "./tasks.css";

/** "today 16:00" / "tomorrow" / "12 Oct" */
export function dueLabel(t: Pick<TaskRow, "due" | "hasTime">, locale: Locale) {
  if (!t.due) return "";
  const day = fmtRelativeDay(t.due, locale);
  if (!t.hasTime) return day;
  const time = new Intl.DateTimeFormat(locale === "th" ? "th-TH" : locale === "zh" ? "zh-CN" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(t.due);
  return `${day} ${time}`;
}

/** Staff picker (GET /api/users). */
export function OwnerSelect({
  value,
  onChange,
  className,
  allowClear = true,
  placeholder,
}: {
  value?: string;
  onChange?: (v: string | undefined) => void;
  className?: string;
  allowClear?: boolean;
  placeholder?: string;
}) {
  const { tx, locale } = useStore();
  const { user } = useAuth();
  const { users } = useUserLookup();
  const options = useMemo(
    () =>
      users
        .map((u) => ({ value: u.id, label: u.id === user?.id ? `${userDisplayName(u, locale)} (${tx("tk_owner_me")})` : userDisplayName(u, locale) }))
        .sort((a, b) => (a.value === user?.id ? -1 : b.value === user?.id ? 1 : a.label.localeCompare(b.label))),
    [users, user?.id, locale, tx],
  );
  return (
    <Select
      allowClear={allowClear}
      showSearch
      optionFilterProp="label"
      placeholder={placeholder ?? tx("tk_owner")}
      aria-label={tx("tk_owner")}
      value={value}
      onChange={(v) => onChange?.(v ?? undefined)}
      options={options}
      className={className}
      optionRender={(o) => (
        <span className="tk-person-opt">
          <PersonAvatar name={String(o.label ?? "")} size={20} />
          {o.label}
        </span>
      )}
    />
  );
}

const PRESETS = () => [
  { key: "tk_today", value: dayjs().startOf("day") },
  { key: "tk_tomorrow", value: dayjs().add(1, "day").startOf("day") },
  { key: "tk_next_week", value: dayjs().add(7, "day").startOf("day") },
];

/** A due date picker; time is optional (00:00 = any time that day). */
export function DuePicker({ value, onChange, className }: { value?: Dayjs | null; onChange?: (v: Dayjs | null) => void; className?: string }) {
  const { tx } = useStore();
  return (
    <DatePicker
      className={className}
      value={value}
      onChange={(v) => onChange?.(v ?? null)}
      showTime={{ format: "HH:mm", defaultValue: dayjs().startOf("day") }}
      format={(v) => (v.hour() || v.minute() ? v.format("D MMM HH:mm") : v.format("D MMM"))}
      placeholder={tx("tk_due")}
      aria-label={tx("tk_due")}
      presets={PRESETS().map((p) => ({ label: tx(p.key), value: p.value }))}
      needConfirm={false}
    />
  );
}

/** Quick add: title + due + owner (+ customer). Enter saves. */
export function QuickAddTask({ customerId: fixedCustomer, jobId: fixedJob, compact = false }: { customerId?: string; jobId?: string; compact?: boolean }) {
  const { tx } = useStore();
  const { message } = App.useApp();
  const { user } = useAuth();
  const { nameOf, customers } = useCustomerLookup();
  const { create } = useTaskActions();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState<Dayjs | null>(null);
  const [owner, setOwner] = useState<string | undefined>(user?.id);
  const [customerId, setCustomerId] = useState<string | undefined>();
  const [high, setHigh] = useState(false);
  const inputRef = useRef<InputRef>(null);

  useEffect(() => {
    if (user?.id) setOwner((o) => o ?? user.id);
  }, [user?.id]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const text = title.trim();
    if (!text) {
      inputRef.current?.focus();
      return;
    }
    try {
      await create.mutateAsync({
        title: text,
        dueAt: due ? due.toISOString() : null,
        ownerUserId: owner ?? null,
        customerId: fixedCustomer ?? customerId ?? null,
        jobId: fixedJob ?? null,
        priority: high ? "high" : "mid",
      });
      message.success(tx("home_task_added"));
      setTitle("");
      setDue(null);
      setHigh(false);
      inputRef.current?.focus();
    } catch {
      message.error(tx("tk_error"));
    }
  }

  return (
    <form className={`hm-quickadd tk-quickadd${compact ? " is-compact" : ""}`} onSubmit={submit}>
      <Input
        ref={inputRef}
        id={compact ? undefined : "tk-quickadd-title"}
        className="hm-quickadd-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={tx("home_task_placeholder")}
        aria-label={tx("home_task_placeholder")}
        prefix={<Plus size={16} aria-hidden />}
        maxLength={300}
      />
      <DuePicker value={due} onChange={setDue} className="tk-quickadd-due" />
      <OwnerSelect value={owner} onChange={setOwner} className="hm-quickadd-select" />
      {fixedCustomer || fixedJob ? null : (
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder={tx("home_task_customer")}
          aria-label={tx("home_task_customer")}
          value={customerId}
          onChange={(v) => setCustomerId(v ?? undefined)}
          options={customers.map((c) => ({ value: c.id, label: nameOf(c.id) }))}
          className="hm-quickadd-select"
        />
      )}
      <Tooltip title={tx("home_task_urgent")}>
        <Button
          htmlType="button"
          className={`tk-urgent${high ? " is-on" : ""}`}
          aria-pressed={high}
          aria-label={tx("home_task_urgent")}
          icon={<Fire size={18} weight={high ? "fill" : "regular"} />}
          onClick={() => setHigh((v) => !v)}
        />
      </Tooltip>
      <Button type="primary" htmlType="submit" loading={create.isPending}>
        {tx("home_task_add")}
      </Button>
    </form>
  );
}

/** One task as a card: check box · title + chips · owner / customer avatars. Click opens the editor. */
export function TaskCard({
  t,
  onToggle,
  onOpen,
  hideCustomer = false,
}: {
  t: TaskRow;
  onToggle: (t: TaskRow) => void;
  onOpen?: (t: TaskRow) => void;
  hideCustomer?: boolean;
}) {
  const { tx, locale } = useStore();
  const loc = locale as Locale;
  const { nameOf } = useCustomerLookup();
  const staff = useUserLookup();
  const late = t.bucket === "overdue" && !t.done;
  const dueTone = t.done ? "neutral" : late ? "danger" : t.bucket === "today" ? "warning" : "info";
  const ownerName = t.owner ? staff.nameOf(t.owner) : "";
  return (
    <li className={`hm-tcard tk-card${t.done ? " is-done" : ""}${late ? " is-late" : ""}`}>
      <label className="hm-tcheck">
        <input type="checkbox" checked={t.done} onChange={() => onToggle(t)} aria-label={t.title} />
        <span className="hm-tcheck-box" aria-hidden>
          <Check size={16} weight="bold" />
        </span>
      </label>
      <div className="hm-tcard-body">
        {onOpen ? (
          <button type="button" className="hm-tcard-title tk-card-open" onClick={() => onOpen(t)}>
            {t.high && !t.done ? <Fire size={16} weight="fill" className="hm-fire" aria-label={tx("home_task_urgent")} /> : null}
            {t.title}
          </button>
        ) : (
          <span className="hm-tcard-title">
            {t.high && !t.done ? <Fire size={16} weight="fill" className="hm-fire" aria-label={tx("home_task_urgent")} /> : null}
            {t.title}
          </span>
        )}
        <span className="hm-tcard-meta">
          {t.due ? <span className={`hm-age is-${dueTone}`}>{dueLabel(t, loc)}</span> : null}
          {t.jobId && t.jobNumber ? (
            <Link to={`/jobs/${t.jobId}`} className="hm-chip cz-mono">
              <Truck size={13} aria-hidden />
              {t.jobNumber}
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
        {t.customerId && !hideCustomer ? (
          <Link to={`/customers/${t.customerId}`} aria-label={nameOf(t.customerId)}>
            <PersonAvatar name={nameOf(t.customerId)} size={30} />
          </Link>
        ) : null}
        {ownerName ? <PersonAvatar name={ownerName} size={22} /> : null}
      </span>
    </li>
  );
}

type EditValues = {
  title: string;
  notes?: string;
  due?: Dayjs | null;
  priority: TaskPriority;
  ownerUserId?: string;
  customerId?: string;
  jobId?: string;
  containerNo?: string;
};

/** Side drawer to edit / complete / delete one task. */
export function TaskDrawer({ task, onClose }: { task: TaskRow | null; onClose: () => void }) {
  const { tx, locale } = useStore();
  const { message } = App.useApp();
  const staff = useUserLookup();
  const { nameOf, customers } = useCustomerLookup();
  const { jobs } = useModeJobs();
  const { update, remove, toggle } = useTaskActions();
  const [form] = Form.useForm<EditValues>();

  useEffect(() => {
    if (!task) return;
    form.setFieldsValue({
      title: task.titleRaw,
      notes: task.notes ?? "",
      due: task.due ? dayjs(task.due) : null,
      priority: task.priority,
      ownerUserId: task.owner,
      customerId: task.customerId,
      jobId: task.jobId,
      containerNo: task.boxId ?? "",
    });
  }, [task, form]);

  async function save(v: EditValues) {
    if (!task) return;
    try {
      await update.mutateAsync({
        id: task.id,
        patch: {
          title: v.title.trim(),
          notes: v.notes?.trim() || null,
          dueAt: v.due ? v.due.toISOString() : null,
          priority: v.priority,
          ownerUserId: v.ownerUserId ?? null,
          customerId: v.customerId ?? null,
          jobId: v.jobId ?? null,
          containerNo: v.containerNo?.trim() || null,
        },
      });
      message.success(tx("tk_saved"));
      onClose();
    } catch {
      message.error(tx("tk_error"));
    }
  }

  const footer: ReactNode = task ? (
    <div className="tk-drawer-foot">
      <Popconfirm
        title={tx("tk_delete_confirm")}
        okText={tx("tk_delete")}
        okButtonProps={{ danger: true }}
        onConfirm={async () => {
          try {
            await remove.mutateAsync(task.id);
            message.success(tx("tk_deleted"));
            onClose();
          } catch {
            message.error(tx("tk_error"));
          }
        }}
      >
        <Button danger type="text" icon={<Trash size={16} aria-hidden />}>
          {tx("tk_delete")}
        </Button>
      </Popconfirm>
      <span className="tk-drawer-grow" />
      <Button
        onClick={() => {
          toggle.mutate({ id: task.id, done: !task.done });
          message.success(tx(task.done ? "tk_reopened" : "tk_done_toast"));
          onClose();
        }}
      >
        {task.done ? tx("tk_reopened") : tx("home_task_done")}
      </Button>
      <Button type="primary" loading={update.isPending} onClick={() => form.submit()}>
        {tx("tk_save")}
      </Button>
    </div>
  ) : null;

  return (
    <Drawer open={Boolean(task)} onClose={onClose} title={tx("tk_edit")} width={440} footer={footer} destroyOnClose>
      {task ? (
        <Form form={form} layout="vertical" onFinish={save} requiredMark={false}>
          <Form.Item name="title" label={tx("tk_title")} rules={[{ required: true, whitespace: true, message: tx("tk_title_required") }]}>
            <Input maxLength={300} />
          </Form.Item>
          <div className="tk-form-row">
            <Form.Item name="due" label={tx("tk_due")}>
              <DuePicker className="tk-full" />
            </Form.Item>
            <Form.Item name="priority" label={tx("tk_priority")}>
              <Segmented
                options={(["high", "mid", "low"] as const).map((p) => ({ value: p, label: tx(`tk_pri_${p}`) }))}
              />
            </Form.Item>
          </div>
          <Form.Item name="ownerUserId" label={tx("tk_owner")}>
            <OwnerSelect placeholder={tx("tk_unassigned")} />
          </Form.Item>
          <Form.Item name="customerId" label={tx("tk_customer")}>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              options={customers.map((c) => ({ value: c.id, label: nameOf(c.id) }))}
            />
          </Form.Item>
          <div className="tk-form-row">
            <Form.Item name="jobId" label={tx("tk_job")}>
              <Select allowClear showSearch optionFilterProp="label" options={jobs.map((j) => ({ value: j.id, label: j.jobNumber }))} />
            </Form.Item>
            <Form.Item name="containerNo" label={tx("tk_container")}>
              <Input maxLength={20} className="cz-mono" />
            </Form.Item>
          </div>
          <Form.Item name="notes" label={tx("tk_notes")}>
            <Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} maxLength={4000} />
          </Form.Item>
          <p className="cz-muted tk-drawer-meta">
            {task.createdBy ? tx("tk_created_by", { name: staff.nameOf(task.createdBy, "—") }) : null}
            {task.done ? ` · ${tx("home_bucket_done")}` : task.due ? ` · ${fmtDateTime(task.due, locale as Locale)}` : null}
          </p>
        </Form>
      ) : null}
    </Drawer>
  );
}
