import { PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import { App, Button, Drawer, Form, Input, InputNumber, Popconfirm, Segmented, Select } from "antd";
import { useEffect, useRef, useState } from "react";
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
import { useCaseActions, useCanned, useSlaPolicy } from "../../hooks/useCases.ts";
import { useIsPhone } from "../jobsShared.ts";
import { CATEGORY_LOOK, PriorityMeter } from "./caseLook.tsx";

type Tab = "canned" | "sla";

/** Admin / CS lead: canned replies and SLA targets. */
export function CaseSettingsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { tx } = useStore();
  const phone = useIsPhone();
  const [tab, setTab] = useState<Tab>("canned");
  return (
    <Drawer open={open} onClose={onClose} width={phone ? "100%" : 560} title={tx("cs_settings")} destroyOnHidden>
      <Segmented
        block
        value={tab}
        onChange={(v) => setTab(v as Tab)}
        options={[
          { value: "canned", label: tx("cs_canned_title") },
          { value: "sla", label: tx("cs_sla_settings") },
        ]}
        className="cs-settings-tabs"
      />
      {tab === "canned" ? <CannedManager /> : <SlaEditor />}
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

function SlaEditor() {
  const { tx } = useStore();
  const { message } = App.useApp();
  const sla = useSlaPolicy();
  const actions = useCaseActions();
  const [draft, setDraft] = useState<Record<string, { f: number; r: number }>>({});

  useEffect(() => {
    if (!sla.data) return;
    setDraft(
      Object.fromEntries(
        CASE_PRIORITIES.map((p) => [p, { f: sla.data[p].firstResponseMinutes / 60, r: sla.data[p].resolveMinutes / 60 }]),
      ),
    );
  }, [sla.data]);

  if (sla.isLoading || !Object.keys(draft).length) return <LoadingState />;

  async function save() {
    const policy = Object.fromEntries(
      CASE_PRIORITIES.map((p) => [p, { firstResponseMinutes: Math.round(draft[p]!.f * 60), resolveMinutes: Math.round(draft[p]!.r * 60) }]),
    ) as SlaPolicy;
    try {
      await actions.saveSla.mutateAsync(policy);
      message.success(tx("cs_saved"));
    } catch {
      message.error(tx("cs_error"));
    }
  }

  return (
    <div className="cs-sla-editor">
      <div className="cs-sla-grid" role="table">
        <span role="columnheader" />
        <span role="columnheader">{tx("cs_sla_first_h")}</span>
        <span role="columnheader">{tx("cs_sla_resolve_h")}</span>
        {CASE_PRIORITIES.map((p) => (
          <div className="cs-sla-row" role="row" key={p}>
            <span role="rowheader" className="cs-opt">
              <PriorityMeter priority={p} tx={tx} />
              {tx(`cs_pri_${p}`)}
            </span>
            <InputNumber
              min={0.25}
              max={720}
              step={0.5}
              value={draft[p]!.f}
              aria-label={`${tx(`cs_pri_${p}`)} ${tx("cs_sla_first_h")}`}
              onChange={(v) => setDraft((d) => ({ ...d, [p]: { ...d[p]!, f: Number(v) || d[p]!.f } }))}
            />
            <InputNumber
              min={0.25}
              max={2160}
              step={1}
              value={draft[p]!.r}
              aria-label={`${tx(`cs_pri_${p}`)} ${tx("cs_sla_resolve_h")}`}
              onChange={(v) => setDraft((d) => ({ ...d, [p]: { ...d[p]!, r: Number(v) || d[p]!.r } }))}
            />
          </div>
        ))}
      </div>
      <div className="cs-drawer-foot">
        <Button type="primary" onClick={save} loading={actions.saveSla.isPending}>
          {tx("cs_save")}
        </Button>
      </div>
    </div>
  );
}
