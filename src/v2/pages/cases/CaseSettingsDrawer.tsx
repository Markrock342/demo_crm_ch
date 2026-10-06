import { ChatCircleDots, ChatsCircle, CheckCircle, PencilSimple, Plus, Timer, Trash } from "@phosphor-icons/react";
import { App, Button, Drawer, Form, Input, InputNumber, Popconfirm, Segmented, Select, Space } from "antd";
import { useRef, useState, type ReactNode } from "react";
import type { TextAreaRef } from "antd/es/input/TextArea";
import {
  CANNED_VARIABLES,
  CASE_CATEGORIES,
  CASE_PRIORITIES,
  type CannedReply,
  type CaseCategory,
  type SlaPolicy,
} from "../../../api/cases.ts";
import { useStore } from "../../../store";
import { EmptyState, LoadingState } from "../../components";
import { useCan } from "../../hooks/useCan.ts";
import { useCaseActions, useCanned, useSlaPolicy } from "../../hooks/useCases.ts";
import { useIsPhone } from "../jobsShared.ts";
import { CATEGORY_LOOK, PriorityMeter } from "./caseLook.tsx";
import { LineChannelsManager, LineMark } from "./LineChannels.tsx";
import "./line.css";

type Tab = "line" | "canned" | "sla";

/** Admin / CS lead: company LINE OAs, canned replies and SLA targets. */
export function CaseSettingsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { tx } = useStore();
  const can = useCan();
  const phone = useIsPhone();
  const canLine = can("case.manage");
  const [tab, setTab] = useState<Tab>(canLine ? "line" : "canned");
  const label = (icon: ReactNode, text: string) => (
    <span className="cs-opt">
      {icon}
      {text}
    </span>
  );
  return (
    <Drawer open={open} onClose={onClose} width={phone ? "100%" : 600} title={tx("cs_settings")} destroyOnHidden>
      <Segmented
        block
        value={tab}
        onChange={(v) => setTab(v as Tab)}
        options={[
          ...(canLine ? [{ value: "line", label: label(<LineMark size={18} />, tx("inb_tab_line")) }] : []),
          { value: "canned", label: label(<ChatsCircle size={16} weight="duotone" aria-hidden className="cs-tab-ico" />, tx("inb_tab_canned")) },
          { value: "sla", label: label(<Timer size={16} weight="duotone" aria-hidden className="cs-tab-ico" />, tx("inb_tab_sla")) },
        ]}
        className="cs-settings-tabs"
      />
      {tab === "line" && canLine ? <LineChannelsManager /> : tab === "sla" ? <SlaEditor /> : <CannedManager />}
    </Drawer>
  );
}

function CannedManager() {
  const { tx } = useStore();
  const { message } = App.useApp();
  const canned = useCanned();
  const actions = useCaseActions();
  const [editing, setEditing] = useState<CannedReply | "new" | null>(null);

  if (canned.isLoading) return <LoadingState />;
  const items = canned.data ?? [];

  if (editing) {
    return (
      <CannedForm
        initial={editing === "new" ? null : editing}
        onCancel={() => setEditing(null)}
        onSave={async (v) => {
          try {
            if (editing === "new") await actions.createCanned.mutateAsync(v);
            else await actions.patchCanned.mutateAsync({ id: editing.id, patch: v });
            message.success(tx("cs_saved"));
            setEditing(null);
          } catch {
            message.error(tx("cs_error"));
          }
        }}
      />
    );
  }

  return (
    <div className="cs-canned-list">
      <Button type="dashed" block icon={<Plus size={16} />} onClick={() => setEditing("new")}>
        {tx("cs_canned_add")}
      </Button>
      {!items.length ? <EmptyState title={tx("cs_canned_empty")} /> : null}
      <ul>
        {items.map((c) => {
          const L = c.category ? CATEGORY_LOOK[c.category] : null;
          return (
            <li key={c.id} className="cs-canned-item">
              <div className="cs-canned-head">
                {L ? <L.icon size={16} weight="duotone" aria-label={tx(`cs_cat_${c.category}`)} /> : null}
                <strong>{c.title}</strong>
                <span className="cs-canned-actions">
                  <Button size="small" type="text" icon={<PencilSimple size={16} />} aria-label={tx("cs_edit")} onClick={() => setEditing(c)} />
                  <Popconfirm
                    title={tx("cs_delete_q")}
                    okText={tx("cs_delete")}
                    cancelText={tx("cs_cancel")}
                    okButtonProps={{ danger: true }}
                    onConfirm={() => actions.deleteCanned.mutate(c.id, { onError: () => message.error(tx("cs_error")) })}
                  >
                    <Button size="small" type="text" danger icon={<Trash size={16} />} aria-label={tx("cs_delete")} />
                  </Popconfirm>
                </span>
              </div>
              <p className="cs-canned-preview">{c.body.replace(/\{(customer|container|eta|vessel|job|agent)\}/g, (_m, k: string) => `[${tx(`cs_var_${k}`)}]`).replace(/\s+/g, " ")}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CannedForm({
  initial,
  onCancel,
  onSave,
}: {
  initial: CannedReply | null;
  onCancel: () => void;
  onSave: (v: { title: string; body: string; category: CaseCategory | null }) => Promise<void>;
}) {
  const { tx } = useStore();
  const [form] = Form.useForm<{ title: string; body: string; category?: CaseCategory }>();
  const [saving, setSaving] = useState(false);
  const bodyRef = useRef<TextAreaRef>(null);

  function insert(v: string) {
    const el = bodyRef.current?.resizableTextArea?.textArea;
    const cur: string = form.getFieldValue("body") ?? "";
    const at = el ? el.selectionStart : cur.length;
    const next = `${cur.slice(0, at)}{${v}}${cur.slice(at)}`;
    form.setFieldValue("body", next);
    requestAnimationFrame(() => {
      el?.focus();
      const pos = at + v.length + 2;
      el?.setSelectionRange(pos, pos);
    });
  }

  return (
    <Form
      form={form}
      layout="vertical"
      requiredMark={false}
      initialValues={{ title: initial?.title ?? "", body: initial?.body ?? "", category: initial?.category ?? undefined }}
      onFinish={async (v) => {
        setSaving(true);
        await onSave({ title: v.title, body: v.body, category: v.category ?? null });
        setSaving(false);
      }}
      className="cs-canned-form"
    >
      <Form.Item name="title" label={tx("cs_canned_name")} rules={[{ required: true, whitespace: true, message: tx("cs_subject_required") }]}>
        <Input maxLength={120} />
      </Form.Item>
      <Form.Item name="category" label={tx("cs_category")}>
        <Select allowClear placeholder={tx("cs_canned_all_cats")} options={CASE_CATEGORIES.map((c) => ({ value: c, label: tx(`cs_cat_${c}`) }))} />
      </Form.Item>
      <div className="cs-vars">
        <span>{tx("cs_canned_vars")}</span>
        {CANNED_VARIABLES.map((v) => (
          <button type="button" key={v} className="cs-var-chip" onClick={() => insert(v)}>
            {tx(`cs_var_${v}`)}
          </button>
        ))}
      </div>
      <Form.Item name="body" label={tx("cs_canned_body")} rules={[{ required: true, whitespace: true, message: tx("cs_subject_required") }]}>
        <Input.TextArea ref={bodyRef} autoSize={{ minRows: 6, maxRows: 16 }} maxLength={8000} />
      </Form.Item>
      <div className="cs-drawer-foot">
        <Button onClick={onCancel}>{tx("cs_cancel")}</Button>
        <Button type="primary" htmlType="submit" loading={saving}>
          {tx("cs_save")}
        </Button>
      </div>
    </Form>
  );
}

type DurUnit = "min" | "hr" | "day";
const UNIT_MIN: Record<DurUnit, number> = { min: 1, hr: 60, day: 1440 };
const bestUnit = (m: number): DurUnit => (m >= 1440 && m % 1440 === 0 ? "day" : m >= 60 && m % 60 === 0 ? "hr" : "min");

/** Minutes, typed as a number + unit (นาที / ชม. / วัน). Changing the unit keeps the typed number. */
function DurationInput({ minutes, onChange, label, invalid }: { minutes: number; onChange: (m: number) => void; label: string; invalid?: boolean }) {
  const { tx } = useStore();
  const [unit, setUnit] = useState<DurUnit>(() => bestUnit(minutes));
  const num = Math.round((minutes / UNIT_MIN[unit]) * 100) / 100;
  return (
    <Space.Compact className="sla-ed-dur">
      <InputNumber
        min={unit === "min" ? 5 : 0.25}
        max={unit === "min" ? 129600 : unit === "hr" ? 2160 : 90}
        step={unit === "min" ? 5 : unit === "hr" ? 1 : 1}
        value={num}
        status={invalid ? "error" : undefined}
        inputMode="decimal"
        aria-label={label}
        onChange={(v) => {
          const n = Number(v);
          if (n > 0) onChange(Math.max(5, Math.round(n * UNIT_MIN[unit])));
        }}
      />
      <Select
        value={unit}
        aria-label={`${label} (${tx(`inb_u_${unit}`)})`}
        onChange={(u: DurUnit) => {
          setUnit(u);
          onChange(Math.max(5, Math.round(num * UNIT_MIN[u])));
        }}
        options={(["min", "hr", "day"] as const).map((u) => ({ value: u, label: tx(`inb_u_${u}`) }))}
        popupMatchSelectWidth={false}
      />
    </Space.Compact>
  );
}

function SlaEditor() {
  const { tx } = useStore();
  const { message } = App.useApp();
  const sla = useSlaPolicy();
  const actions = useCaseActions();
  // Local edits over the saved policy (minutes).
  const [edits, setEdits] = useState<Record<string, { f: number; r: number }>>({});

  if (sla.isLoading || !sla.data) return <LoadingState />;
  const saved = sla.data;
  const draft: Record<string, { f: number; r: number }> = Object.fromEntries(
    CASE_PRIORITIES.map((p) => [p, edits[p] ?? { f: saved[p].firstResponseMinutes, r: saved[p].resolveMinutes }]),
  );
  const setDraft = (p: string, v: { f: number; r: number }) => setEdits((e) => ({ ...e, [p]: v }));

  const bad = CASE_PRIORITIES.filter((p) => draft[p]!.r < draft[p]!.f);

  async function save() {
    const policy = Object.fromEntries(
      CASE_PRIORITIES.map((p) => [p, { firstResponseMinutes: draft[p]!.f, resolveMinutes: draft[p]!.r }]),
    ) as SlaPolicy;
    try {
      await actions.saveSla.mutateAsync(policy);
      message.success(tx("inb_saved_ok"));
    } catch {
      message.error(tx("inb_error"));
    }
  }

  return (
    <div className="sla-ed">
      <div className="sla-ed-grid" role="table">
        <span role="columnheader" className="sla-ed-corner" />
        <span role="columnheader" className="sla-ed-head">
          <ChatCircleDots size={16} weight="duotone" aria-hidden />
          {tx("inb_sla_first")}
        </span>
        <span role="columnheader" className="sla-ed-head">
          <CheckCircle size={16} weight="duotone" aria-hidden />
          {tx("inb_sla_resolve")}
        </span>
        {CASE_PRIORITIES.map((p) => (
          <div className="sla-ed-row" role="row" key={p}>
            <span role="rowheader" className="cs-opt">
              <PriorityMeter priority={p} tx={tx} />
              {tx(`cs_pri_${p}`)}
            </span>
            <DurationInput
              minutes={draft[p]!.f}
              label={`${tx(`cs_pri_${p}`)} ${tx("inb_sla_first")}`}
              onChange={(m) => setDraft(p, { ...draft[p]!, f: m })}
            />
            <DurationInput
              minutes={draft[p]!.r}
              invalid={bad.includes(p)}
              label={`${tx(`cs_pri_${p}`)} ${tx("inb_sla_resolve")}`}
              onChange={(m) => setDraft(p, { ...draft[p]!, r: m })}
            />
          </div>
        ))}
      </div>
      {bad.length ? (
        <p className="sla-ed-error" role="alert">
          {tx("inb_sla_order")}
        </p>
      ) : null}
      <div className="cs-drawer-foot">
        <Button type="primary" onClick={save} loading={actions.saveSla.isPending} disabled={bad.length > 0}>
          {tx("inb_save")}
        </Button>
      </div>
    </div>
  );
}
