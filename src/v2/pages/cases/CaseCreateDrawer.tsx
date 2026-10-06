import { Boat, MagnifyingGlass, ShippingContainer, Ticket } from "@phosphor-icons/react";
import { App, Button, Drawer, Form, Input, Segmented, Select } from "antd";
import { useEffect, useMemo, useState } from "react";
import {
  CASE_CATEGORIES,
  CASE_CHANNELS,
  CASE_PRIORITIES,
  type CaseCategory,
  type CaseChannel,
  type CaseDto,
  type CasePriority,
  type LookupHit,
} from "../../../api/cases.ts";
import { ApiError } from "../../../api/crm.ts";
import { useAuth } from "../../../auth/AuthProvider";
import { useStore } from "../../../store";
import { useCaseActions, useShipmentLookup } from "../../hooks/useCases.ts";
import { useCrmBundle } from "../../hooks/useCommercial.ts";
import { useCustomerLookup } from "../../hooks/useCustomerLookup.ts";
import { useUserLookup } from "../../hooks/useUserLookup.ts";
import { CATEGORY_LOOK, CHANNEL_ICON, PriorityMeter } from "./caseLook.tsx";
import { useIsPhone } from "../jobsShared.ts";
import "./cases.css";

export type CasePrefill = {
  customerId?: string;
  subject?: string;
  description?: string;
  sourceMailId?: string;
  channel?: CaseChannel;
  /** Sender address — used to pick the matching contact. */
  fromEmail?: string;
};

type FormValues = {
  subject: string;
  description?: string;
  customerId?: string;
  contactId?: string;
  channel: CaseChannel;
  category: CaseCategory;
  priority: CasePriority;
  assigneeUserId?: string | null;
};

const KIND_ICON = { container: ShippingContainer, job: Boat, booking: Ticket } as const;

/** Users who usually work cases come first in the owner picker. */
const ROLE_RANK = (roles: string[]) => (roles.includes("CUSTOMER_SERVICE") ? 0 : roles.includes("MANAGEMENT") || roles.includes("SUPER_ADMIN") ? 1 : 2);

export function useAssigneeOptions() {
  const { users, nameOf } = useUserLookup();
  return useMemo(
    () =>
      [...users]
        .sort((a, b) => ROLE_RANK(a.roles) - ROLE_RANK(b.roles) || nameOf(a.id).localeCompare(nameOf(b.id)))
        .map((u) => ({ value: u.id, label: nameOf(u.id, u.email) })),
    [users, nameOf],
  );
}

export function CaseCreateDrawer({
  open,
  prefill,
  onClose,
  onCreated,
}: {
  open: boolean;
  prefill?: CasePrefill;
  onClose: () => void;
  onCreated?: (c: CaseDto) => void;
}) {
  const { tx } = useStore();
  const { message } = App.useApp();
  const { user } = useAuth();
  const phone = useIsPhone();
  const [form] = Form.useForm<FormValues>();
  const { customers, nameOf } = useCustomerLookup();
  const bundle = useCrmBundle();
  const assignees = useAssigneeOptions();
  const actions = useCaseActions();
  const [shipQ, setShipQ] = useState("");
  const [link, setLink] = useState<LookupHit | null>(null);
  const lookup = useShipmentLookup(shipQ);
  const customerId = Form.useWatch("customerId", form);

  const contacts = useMemo(
    () => (bundle.data?.contacts ?? []).filter((c) => c.customerId === customerId),
    [bundle.data, customerId],
  );

  useEffect(() => {
    if (!open) return;
    const from = prefill?.fromEmail?.toLowerCase();
    const contact = from ? (bundle.data?.contacts ?? []).find((c) => c.email && c.email.toLowerCase() === from) : undefined;
    form.resetFields();
    form.setFieldsValue({
      subject: prefill?.subject ?? "",
      description: prefill?.description ?? "",
      customerId: prefill?.customerId ?? contact?.customerId,
      contactId: contact?.id,
      channel: prefill?.channel ?? "phone",
      category: "status_inquiry",
      priority: "normal",
      assigneeUserId: user?.id ?? null,
    });
    setLink(null);
    setShipQ("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function submit(v: FormValues) {
    try {
      const created = await actions.create.mutateAsync({
        subject: v.subject,
        description: v.description || null,
        customerId: v.customerId || null,
        contactId: v.contactId || null,
        channel: v.channel,
        category: v.category,
        priority: v.priority,
        assigneeUserId: v.assigneeUserId ?? null,
        jobId: link?.jobId ?? null,
        containerNo: link?.containerNo ?? null,
        bookingId: link && !link.jobId ? link.bookingId : null,
        sourceMailId: prefill?.sourceMailId ?? null,
      });
      message.success(tx("cs_created", { no: created.caseNo }));
      onClose();
      onCreated?.(created);
    } catch (e) {
      const issue = e instanceof ApiError ? e.issues[0] : undefined;
      if (issue?.path === "subject") form.setFields([{ name: "subject", errors: [tx("cs_subject_required")] }]);
      else message.error(tx("cs_error"));
    }
  }

  const hitLabel = (h: LookupHit) => [h.ref, h.kind === "container" ? h.jobNumber : h.containerNo, nameOf(h.customerId, "")].filter(Boolean).join(" · ");

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={tx("cs_create_title")}
      width={phone ? "100%" : 520}
      destroyOnHidden
      footer={
        <div className="cs-drawer-foot">
          <Button onClick={onClose}>{tx("cs_cancel")}</Button>
          <Button type="primary" loading={actions.create.isPending} onClick={() => form.submit()}>
            {tx("cs_create")}
          </Button>
        </div>
      }
    >
      <Form form={form} layout="vertical" onFinish={submit} requiredMark={false}>
        <Form.Item name="channel" label={tx("cs_channel")}>
          <Segmented
            block
            options={CASE_CHANNELS.map((ch) => {
              const I = CHANNEL_ICON[ch];
              return { value: ch, label: <I size={18} aria-label={tx(`cs_ch_${ch}`)} />, title: tx(`cs_ch_${ch}`) };
            })}
          />
        </Form.Item>
        <Form.Item name="customerId" label={tx("cs_customer")}>
          <Select
            showSearch
            allowClear
            optionFilterProp="label"
            options={customers.map((c) => ({ value: c.id, label: nameOf(c.id) }))}
            onChange={() => form.setFieldValue("contactId", undefined)}
          />
        </Form.Item>
        {contacts.length ? (
          <Form.Item name="contactId" label={tx("cs_contact")}>
            <Select allowClear options={contacts.map((c) => ({ value: c.id, label: c.email ? `${c.name} · ${c.email}` : c.name }))} />
          </Form.Item>
        ) : null}
        <Form.Item name="subject" label={tx("cs_subject")} rules={[{ required: true, whitespace: true, message: tx("cs_subject_required") }]}>
          <Input maxLength={300} />
        </Form.Item>
        <Form.Item name="description" label={tx("cs_description")}>
          <Input.TextArea autoSize={{ minRows: 3, maxRows: 10 }} maxLength={8000} />
        </Form.Item>
        <Form.Item name="category" label={tx("cs_category")}>
          <Select
            options={CASE_CATEGORIES.map((c) => {
              const L = CATEGORY_LOOK[c];
              return {
                value: c,
                label: (
                  <span className="cs-opt">
                    <L.icon size={16} weight="duotone" aria-hidden />
                    {tx(`cs_cat_${c}`)}
                  </span>
                ),
              };
            })}
          />
        </Form.Item>
        <Form.Item name="priority" label={tx("cs_priority")}>
          <Segmented
            block
            options={[...CASE_PRIORITIES].reverse().map((p) => ({
              value: p,
              label: (
                <span className="cs-opt">
                  <PriorityMeter priority={p} tx={tx} />
                  {tx(`cs_pri_${p}`)}
                </span>
              ),
            }))}
          />
        </Form.Item>
        <Form.Item name="assigneeUserId" label={tx("cs_assignee")}>
          <Select allowClear showSearch optionFilterProp="label" placeholder={tx("cs_unassigned")} options={assignees} />
        </Form.Item>
        <Form.Item label={`${tx("cs_container")} / ${tx("cs_job")} / ${tx("cs_booking")}`}>
          <Select
            showSearch
            allowClear
            filterOption={false}
            suffixIcon={<MagnifyingGlass size={14} />}
            placeholder={tx("cs_lookup_ph")}
            onSearch={setShipQ}
            notFoundContent={shipQ.trim().length < 2 ? tx("cs_lookup_hint") : lookup.isFetching ? null : tx("cs_lookup_empty")}
            loading={lookup.isFetching}
            value={link ? `${link.kind}:${link.ref}` : undefined}
            onClear={() => setLink(null)}
            onChange={(v) => {
              const hit = (lookup.data ?? []).find((h) => `${h.kind}:${h.ref}` === v) ?? null;
              setLink(hit);
              if (hit?.customerId && !form.getFieldValue("customerId")) form.setFieldValue("customerId", hit.customerId);
            }}
            options={(lookup.data ?? []).map((h) => {
              const I = KIND_ICON[h.kind];
              return {
                value: `${h.kind}:${h.ref}`,
                label: (
                  <span className="cs-opt">
                    <I size={16} aria-hidden />
                    {hitLabel(h)}
                  </span>
                ),
              };
            })}
          />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
