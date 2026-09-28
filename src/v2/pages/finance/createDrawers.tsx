import { Plus, Trash } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, DatePicker, Drawer, Form, Input, InputNumber, Select } from "antd";
import type { Dayjs } from "dayjs";
import {
  createInvoice,
  createVendor,
  createVendorBill,
  fetchJobs,
  fetchVendors,
  vendorDisplayName,
  type ManualLine,
} from "../../../api/commercial.ts";
import { useStore } from "../../../store";
import { useCrmBundle } from "../../hooks/useCommercial.ts";
import { useCustomerLookup } from "../../hooks/useCustomerLookup.ts";
import { fmtMoney } from "../../lib/format.ts";

/**
 * Live-mode "create from scratch" drawers for finance (invoice, vendor bill, vendor).
 * They post to POST /api/invoices, /api/vendor-bills and /api/vendors.
 */

const CURRENCIES = ["THB", "USD", "CNY"];
const TAX_CODES = ["", "VAT7", "VAT0"] as const;
const TAX_RATE: Record<string, number> = { VAT7: 0.07, VAT0: 0 };

type LineValues = { description?: string; qty?: number; unitPrice?: number; taxCode?: string };

function toLines(lines: LineValues[] | undefined): ManualLine[] {
  return (lines ?? []).map((l) => ({
    description: (l.description ?? "").trim(),
    qty: Number(l.qty ?? 0),
    unitPrice: Number(l.unitPrice ?? 0),
    taxCode: l.taxCode || null,
  }));
}

function ymd(d: Dayjs | null | undefined) {
  return d ? d.format("YYYY-MM-DD") : undefined;
}

const KNOWN_ERRORS = ["customer_not_found", "vendor_not_found", "job_not_found", "job_customer_mismatch", "invalid_tax_code", "invalid_body", "forbidden"];

/** Server error code → readable text (falls back to the raw code). */
function useErrText() {
  const { tx } = useStore();
  return (e: unknown) => {
    const code = e instanceof Error ? e.message : "";
    return KNOWN_ERRORS.includes(code) ? tx(`be_err_${code}`) : code;
  };
}

/** Line items editor + running totals (shared by invoice and vendor bill drawers). */
function LinesField({ currency }: { currency: string }) {
  const { tx, locale } = useStore();
  const form = Form.useFormInstance();
  const lines = (Form.useWatch("lines", form) as LineValues[] | undefined) ?? [];
  const round = (n: number) => Math.round(n * 100) / 100;
  const subtotal = lines.reduce((s, l) => s + round(Number(l?.qty ?? 0) * Number(l?.unitPrice ?? 0)), 0);
  const tax = lines.reduce((s, l) => s + round(round(Number(l?.qty ?? 0) * Number(l?.unitPrice ?? 0)) * (TAX_RATE[l?.taxCode ?? ""] ?? 0)), 0);

  return (
    <fieldset className="be-lines" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <legend className="be-lines-title" style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>
        {tx("be_lines")}
      </legend>
      <Form.List name="lines">
        {(fields, { add, remove }) => (
          <>
            {fields.map((field, i) => (
              <div key={field.key} className="be-line" style={{ borderTop: i ? "1px solid var(--cz-border, #e5e7eb)" : undefined, paddingTop: i ? 12 : 0 }}>
                <Form.Item
                  name={[field.name, "description"]}
                  label={tx("be_lineDesc")}
                  rules={[{ required: true, whitespace: true, message: tx("be_descRequired") }]}
                  style={{ marginBottom: 8 }}
                >
                  <Input placeholder={tx("be_lineDescPh")} maxLength={300} />
                </Form.Item>
                <div style={{ display: "grid", gridTemplateColumns: "72px minmax(0,1fr) 110px 32px", gap: 8, alignItems: "end" }}>
                  <Form.Item name={[field.name, "qty"]} label={tx("be_qty")} rules={[{ required: true, message: " " }]} style={{ marginBottom: 12 }}>
                    <InputNumber min={0.0001} step={1} style={{ width: "100%" }} />
                  </Form.Item>
                  <Form.Item
                    name={[field.name, "unitPrice"]}
                    label={tx("be_unitPrice")}
                    rules={[{ required: true, message: tx("fin_amountRequired") }]}
                    style={{ marginBottom: 12 }}
                  >
                    <InputNumber min={0} step={100} style={{ width: "100%" }} />
                  </Form.Item>
                  <Form.Item name={[field.name, "taxCode"]} label={tx("be_tax")} style={{ marginBottom: 12 }}>
                    <Select options={TAX_CODES.map((c) => ({ value: c, label: c ? tx(`be_tax${c}`) : tx("be_taxNone") }))} />
                  </Form.Item>
                  <Button
                    type="text"
                    aria-label={tx("be_removeLine")}
                    title={tx("be_removeLine")}
                    icon={<Trash size={16} />}
                    disabled={fields.length <= 1}
                    onClick={() => remove(field.name)}
                    style={{ marginBottom: 12 }}
                  />
                </div>
              </div>
            ))}
            <Button type="dashed" block icon={<Plus size={16} />} onClick={() => add({ qty: 1, taxCode: "" })}>
              {tx("be_addLine")}
            </Button>
          </>
        )}
      </Form.List>
      <dl className="fin-summary" style={{ marginTop: 16 }}>
        <div>
          <dt>{tx("be_subtotal")}</dt>
          <dd>{fmtMoney(subtotal, currency, locale)}</dd>
        </div>
        <div>
          <dt>{tx("be_taxTotal")}</dt>
          <dd>{fmtMoney(tax, currency, locale)}</dd>
        </div>
        <div>
          <dt>{tx("be_total")}</dt>
          <dd className="fin-strong">{fmtMoney(subtotal + tax, currency, locale)}</dd>
        </div>
      </dl>
    </fieldset>
  );
}

function DrawerFoot({ onCancel, onOk, busy, okLabel }: { onCancel: () => void; onOk: () => void; busy: boolean; okLabel: string }) {
  const { tx } = useStore();
  return (
    <div className="fin-drawer-foot">
      <Button type="text" onClick={onCancel}>
        {tx("fin_cancel")}
      </Button>
      <Button type="primary" loading={busy} onClick={onOk}>
        {okLabel}
      </Button>
    </div>
  );
}

/** Live: create a DRAFT invoice from scratch. */
export function LiveInvoiceDrawer({ open, onClose, defaultJobId }: { open: boolean; onClose: () => void; defaultJobId?: string }) {
  const { tx } = useStore();
  const { message } = App.useApp();
  const errText = useErrText();
  const qc = useQueryClient();
  const [form] = Form.useForm();
  const { nameOf } = useCustomerLookup();
  // Live customers only (the demo store's customers don't exist on the server).
  const customers = useCrmBundle().data?.customers ?? [];
  const jobs = useQuery({ queryKey: ["fin", "jobs-lookup"], queryFn: () => fetchJobs(), enabled: open, staleTime: 60_000 });
  const customerId = Form.useWatch("customerId", form) as string | undefined;
  const currency = (Form.useWatch("currency", form) as string | undefined) ?? "USD";
  const defaultJob = defaultJobId ? jobs.data?.find((j) => j.id === defaultJobId) : undefined;

  const mut = useMutation({
    mutationFn: createInvoice,
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["invoices"] });
      void qc.invalidateQueries({ queryKey: ["jobs"] });
      message.success(tx("be_invoiceCreated", { no: res.invoiceNumber }));
      onClose();
    },
    onError: (e) => message.error(tx("fin_actionFailed", { err: errText(e) })),
  });

  const jobOptions = (jobs.data ?? [])
    .filter((j) => !customerId || j.customerId === customerId)
    .map((j) => ({ value: j.id, label: `${j.jobNumber} · ${j.pol} → ${j.pod}` }));

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={tx("fin_newDraft")}
      width={520}
      destroyOnClose
      footer={<DrawerFoot onCancel={onClose} onOk={() => form.submit()} busy={mut.isPending} okLabel={tx("be_createDraft")} />}
    >
      <p className="cz-muted fin-drawer-lead">{tx("be_newInvoiceHint")}</p>
      <Form
        form={form}
        layout="vertical"
        requiredMark
        initialValues={{
          customerId: defaultJob?.customerId,
          jobId: defaultJob?.id,
          currency: defaultJob?.currency ?? "USD",
          lines: [{ qty: 1, taxCode: "" }],
        }}
        onValuesChange={(changed) => {
          // A job only fits one customer — clear it when the customer changes.
          if ("customerId" in changed) form.setFieldsValue({ jobId: null });
        }}
        onFinish={(v: { customerId: string; jobId?: string; currency: string; dueDate?: Dayjs; lines: LineValues[] }) =>
          mut.mutate({ customerId: v.customerId, jobId: v.jobId || null, currency: v.currency, dueDate: ymd(v.dueDate), lines: toLines(v.lines) })
        }
      >
        <Form.Item name="customerId" label={tx("fin_customer")} rules={[{ required: true, message: tx("be_customerRequired") }]}>
          <Select
            showSearch
            optionFilterProp="label"
            placeholder={tx("be_customerRequired")}
            options={customers.map((c) => ({ value: c.id, label: nameOf(c.id) }))}
          />
        </Form.Item>
        <Form.Item name="jobId" label={tx("fin_colJob")} extra={customerId ? tx("be_jobForCustomer") : undefined}>
          <Select allowClear showSearch optionFilterProp="label" placeholder={tx("fin_optional")} options={jobOptions} loading={jobs.isLoading} />
        </Form.Item>
        <div className="fin-form-row" style={{ gridTemplateColumns: "minmax(0,1fr) 120px" }}>
          <Form.Item name="dueDate" label={tx("be_dueDate")} extra={tx("be_dueDateHint")}>
            <DatePicker style={{ width: "100%" }} placeholder={tx("be_pickDate")} />
          </Form.Item>
          <Form.Item name="currency" label={tx("fin_currency")} rules={[{ required: true }]}>
            <Select options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
          </Form.Item>
        </div>
        <LinesField currency={currency} />
      </Form>
    </Drawer>
  );
}

/** Live: create a vendor bill from scratch (saved as DRAFT, then approve → pay). */
export function LiveVendorBillDrawer({
  open,
  onClose,
  jobs,
  defaultVendorId,
}: {
  open: boolean;
  onClose: () => void;
  jobs: { value: string; label: string }[];
  defaultVendorId?: string;
}) {
  const { tx, locale } = useStore();
  const { message } = App.useApp();
  const errText = useErrText();
  const qc = useQueryClient();
  const [form] = Form.useForm();
  const vendors = useQuery({ queryKey: ["fin", "vendors"], queryFn: fetchVendors, enabled: open });
  const currency = (Form.useWatch("currency", form) as string | undefined) ?? "THB";

  const mut = useMutation({
    mutationFn: createVendorBill,
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["fin", "vendor-bills"] });
      message.success(tx("be_billCreated", { no: res.billNumber }));
      onClose();
    },
    onError: (e) => message.error(tx("fin_actionFailed", { err: errText(e) })),
  });

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={tx("fin_newBill")}
      width={520}
      destroyOnClose
      footer={<DrawerFoot onCancel={onClose} onOk={() => form.submit()} busy={mut.isPending} okLabel={tx("be_saveBill")} />}
    >
      <p className="cz-muted fin-drawer-lead">{tx("be_newBillHint")}</p>
      <Form
        form={form}
        layout="vertical"
        requiredMark
        initialValues={{ vendorId: defaultVendorId, currency: "THB", lines: [{ qty: 1, taxCode: "" }] }}
        onValuesChange={(changed) => {
          if (changed.vendorId) {
            const v = vendors.data?.find((x) => x.id === changed.vendorId);
            const cur = v?.currencies?.split(",")[0]?.trim();
            if (cur) form.setFieldValue("currency", cur);
          }
        }}
        onFinish={(v: { vendorId: string; jobId?: string; currency: string; dueDate?: Dayjs; lines: LineValues[] }) =>
          mut.mutate({ vendorId: v.vendorId, jobId: v.jobId || null, currency: v.currency, dueDate: ymd(v.dueDate), lines: toLines(v.lines) })
        }
      >
        <Form.Item name="vendorId" label={tx("fin_vendor")} rules={[{ required: true, message: tx("fin_pickVendor") }]}>
          <Select
            showSearch
            optionFilterProp="label"
            placeholder={tx("fin_pickVendor")}
            loading={vendors.isLoading}
            options={(vendors.data ?? []).map((v) => ({ value: v.id, label: vendorDisplayName(v, locale) }))}
          />
        </Form.Item>
        <Form.Item name="jobId" label={tx("fin_colJob")}>
          <Select allowClear showSearch optionFilterProp="label" placeholder={tx("fin_optional")} options={jobs} />
        </Form.Item>
        <div className="fin-form-row" style={{ gridTemplateColumns: "minmax(0,1fr) 120px" }}>
          <Form.Item name="dueDate" label={tx("be_dueDate")} extra={tx("be_dueDateHint")}>
            <DatePicker style={{ width: "100%" }} placeholder={tx("be_pickDate")} />
          </Form.Item>
          <Form.Item name="currency" label={tx("fin_currency")} rules={[{ required: true }]}>
            <Select options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
          </Form.Item>
        </div>
        <LinesField currency={currency} />
      </Form>
    </Drawer>
  );
}

const VENDOR_TYPES = ["shipping_line", "trucking", "customs", "depot", "warehouse", "other"] as const;

/** Live: add a vendor (names in each language, type, currency, credit term, contact). */
export function LiveVendorDrawer({ open, onClose, typeLabel }: { open: boolean; onClose: () => void; typeLabel: (t: string) => string }) {
  const { tx, locale } = useStore();
  const { message } = App.useApp();
  const errText = useErrText();
  const qc = useQueryClient();
  const [form] = Form.useForm();

  const mut = useMutation({
    mutationFn: createVendor,
    onSuccess: (row) => {
      void qc.invalidateQueries({ queryKey: ["fin", "vendors"] });
      message.success(tx("be_vendorSaved", { name: vendorDisplayName(row, locale) }));
      onClose();
    },
    onError: (e) => message.error(tx("fin_actionFailed", { err: errText(e) })),
  });

  type V = {
    company: string;
    nameZh?: string;
    nameTh?: string;
    vendorType: string;
    currency: string;
    paymentTermsDays?: number;
    services?: string;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={tx("fin_newVendor")}
      width={480}
      destroyOnClose
      footer={<DrawerFoot onCancel={onClose} onOk={() => form.submit()} busy={mut.isPending} okLabel={tx("fin_save")} />}
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark
        initialValues={{ vendorType: "shipping_line", currency: "THB", paymentTermsDays: 30 }}
        onFinish={(v: V) =>
          mut.mutate({
            ...v,
            vendorType: v.vendorType.toUpperCase(),
            paymentTermsDays: v.paymentTermsDays ?? undefined,
          })
        }
      >
        <Form.Item name="company" label={tx("be_vendorNameEn")} rules={[{ required: true, whitespace: true, message: tx("fin_vendorNameRequired") }]}>
          <Input placeholder={tx("be_vendorNameEnPh")} maxLength={200} />
        </Form.Item>
        <div className="fin-form-row" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
          <Form.Item name="nameZh" label={tx("be_vendorNameZh")}>
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item name="nameTh" label={tx("be_vendorNameTh")}>
            <Input maxLength={200} />
          </Form.Item>
        </div>
        <Form.Item name="vendorType" label={tx("fin_vendorType")} rules={[{ required: true }]}>
          <Select options={VENDOR_TYPES.map((t) => ({ value: t, label: typeLabel(t) }))} />
        </Form.Item>
        <div className="fin-form-row" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
          <Form.Item name="currency" label={tx("be_vendorCurrency")} rules={[{ required: true }]}>
            <Select options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
          </Form.Item>
          <Form.Item name="paymentTermsDays" label={tx("be_creditDays")}>
            <InputNumber min={0} max={365} style={{ width: "100%" }} />
          </Form.Item>
        </div>
        <Form.Item name="services" label={tx("be_services")}>
          <Input placeholder={tx("be_servicesPh")} maxLength={300} />
        </Form.Item>
        <Form.Item name="contactName" label={tx("be_contactName")}>
          <Input maxLength={200} />
        </Form.Item>
        <div className="fin-form-row" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
          <Form.Item name="contactEmail" label={tx("be_contactEmail")} rules={[{ type: "email", message: tx("be_emailInvalid") }]}>
            <Input type="email" maxLength={200} />
          </Form.Item>
          <Form.Item name="contactPhone" label={tx("be_contactPhone")}>
            <Input type="tel" maxLength={50} />
          </Form.Item>
        </div>
      </Form>
    </Drawer>
  );
}
