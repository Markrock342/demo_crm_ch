import { Plus, Trash } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Alert, Button, DatePicker, Drawer, Form, Input, InputNumber, Popconfirm, Segmented, Select, Space } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { fetchVendors, vendorDisplayName } from "../../api/commercial.ts";
import { createRate, fetchRateLane, updateRateLane, type RateChargeInput } from "../../api/rates.ts";
import { useStore } from "../../store";
import { useMedia } from "../../ui/useMedia";
import { fmtMoney } from "../lib/format.ts";
import { SALES_PORTS } from "./salesUtil.ts";
import "./rate-form.css";

const CHARGE_CODES = ["OCEAN_FREIGHT", "THC_ORIGIN", "THC_DEST", "DOC_FEE", "BAF", "SEAL", "TRUCKING", "OTHER"];
const UNITS = ["PER_CONTAINER", "PER_BL"];
const CURRENCIES = ["USD", "THB", "CNY", "EUR"];

type ChargeRow = { chargeCode: string; side: "BUY" | "SELL"; unit: string; unitPrice: number | null };
type FormValues = {
  vendorId?: string;
  carrier?: string;
  pol?: string;
  pod?: string;
  containerType?: string;
  validity?: [Dayjs, Dayjs];
  currency: string;
  charges: ChargeRow[];
};

type PortOption = { value: string; search: string; label: ReactNode };

type Props = {
  open: boolean;
  /** Lane to edit; null/undefined = add a new rate. */
  laneId?: string | null;
  portOptions: PortOption[];
  containerTypes: string[];
  onClose: () => void;
  /** Called with the saved lane so the page can show it in the results. */
  onSaved: (lane: { pol: string; pod: string; containerType?: string }) => void;
};

const DEFAULTS: FormValues = {
  currency: "USD",
  charges: [
    { chargeCode: "OCEAN_FREIGHT", side: "BUY", unit: "PER_CONTAINER", unitPrice: null },
    { chargeCode: "OCEAN_FREIGHT", side: "SELL", unit: "PER_CONTAINER", unitPrice: null },
  ],
};

/** Add / edit / expire a rate (one lane) — posts to the tenant-scoped rate API. */
export function RateFormDrawer({ open, laneId, portOptions, containerTypes, onClose, onSaved }: Props) {
  const { tx, locale } = useStore();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const mobile = useMedia("(max-width: 640px)");
  const [form] = Form.useForm<FormValues>();
  const editing = Boolean(laneId);
  const [sellError, setSellError] = useState(false);

  const vendors = useQuery({ queryKey: ["vendors"], queryFn: fetchVendors, enabled: open, staleTime: 60_000 });
  const detail = useQuery({ queryKey: ["rates", "lane", laneId], queryFn: () => fetchRateLane(laneId!), enabled: open && editing });
  const buyHidden = Boolean(detail.data?.charges.some((c) => c.unitPrice === null));

  useEffect(() => {
    if (!open) return;
    setSellError(false);
    if (!editing) {
      form.resetFields();
      form.setFieldsValue({ ...DEFAULTS, validity: [dayjs().startOf("day"), dayjs().add(30, "day").startOf("day")] });
      return;
    }
    const d = detail.data;
    if (!d) return;
    form.setFieldsValue({
      vendorId: d.sheet.vendorId,
      carrier: d.sheet.carrier ?? undefined,
      pol: d.lane.pol,
      pod: d.lane.pod,
      containerType: d.lane.containerType ?? undefined,
      validity: [dayjs(d.sheet.validFrom), dayjs(d.sheet.validUntil)],
      currency: d.sheet.currency,
      charges: d.charges.map((c) => ({
        chargeCode: c.chargeCode,
        side: c.side,
        unit: c.unit,
        unitPrice: c.unitPrice === null ? null : Number(c.unitPrice),
      })),
    });
  }, [open, editing, detail.data, form]);

  const done = (key: string, lane: { pol: string; pod: string; containerType?: string }) => {
    void qc.invalidateQueries({ queryKey: ["rates"] });
    message.success(tx(key));
    onSaved(lane);
    onClose();
  };

  const save = useMutation({
    mutationFn: async (v: FormValues) => {
      const [from, until] = v.validity!;
      const charges: RateChargeInput[] = v.charges.map((c) => ({
        chargeCode: c.chargeCode,
        description: tx(`rt_code_${c.chargeCode}`),
        side: c.side,
        unit: c.unit,
        quantity: "1",
        unitPrice: String(c.unitPrice ?? 0),
        currency: v.currency,
      }));
      const common = {
        vendorId: v.vendorId!,
        carrier: v.carrier?.trim() || undefined,
        validFrom: from.format("YYYY-MM-DD"),
        validUntil: until.format("YYYY-MM-DD"),
        currency: v.currency,
      };
      if (editing) {
        await updateRateLane(laneId!, { ...common, containerType: v.containerType ?? null, ...(buyHidden ? {} : { charges }) });
      } else {
        const name = (code: string) => SALES_PORTS.find((p) => p.code === code)?.en ?? code;
        await createRate({
          ...common,
          lane: { pol: v.pol!, pod: v.pod!, origin: name(v.pol!), destination: name(v.pod!), containerType: v.containerType },
          charges,
        });
      }
      return { pol: v.pol!, pod: v.pod!, containerType: v.containerType };
    },
    onSuccess: (lane) => done(editing ? "rt_saved" : "rt_created", lane),
    onError: () => message.error(tx("rt_saveFailed")),
  });

  const expire = useMutation({
    mutationFn: () => updateRateLane(laneId!, { expire: true }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["rates"] });
      message.success(tx("rt_expired"));
      onClose();
    },
    onError: () => message.error(tx("rt_saveFailed")),
  });

  const charges = Form.useWatch("charges", form) ?? [];
  const currency = Form.useWatch("currency", form) ?? "USD";
  const sum = (side: "BUY" | "SELL") => charges.filter((c) => c?.side === side).reduce((a, c) => a + (Number(c?.unitPrice) || 0), 0);
  const buy = sum("BUY");
  const sell = sum("SELL");
  const pct = sell > 0 ? Math.round(((sell - buy) / sell) * 1000) / 10 : null;

  const vendorOptions = (vendors.data ?? []).map((v) => ({ value: v.id, label: vendorDisplayName(v, locale) }));
  const portSelect = (label: string) => (
    <Select
      showSearch
      aria-label={label}
      placeholder={label}
      options={portOptions}
      disabled={editing}
      filterOption={(input, opt) => Boolean(opt?.search.includes(input.trim().toLowerCase()))}
    />
  );
  const required = [{ required: true, message: tx("rt_required") }];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={mobile ? "100%" : 520}
      title={editing ? tx("rt_edit") : tx("rt_add")}
      destroyOnHidden
      footer={
        <div className="rt-foot">
          {editing ? (
            <Popconfirm title={tx("rt_expireQ")} onConfirm={() => expire.mutate()} okText={tx("rt_expire")} cancelText={tx("rt_cancel")}>
              <Button danger loading={expire.isPending}>
                {tx("rt_expire")}
              </Button>
            </Popconfirm>
          ) : null}
          <Space className="rt-foot-end">
            <Button onClick={onClose}>{tx("rt_cancel")}</Button>
            <Button type="primary" loading={save.isPending} onClick={() => form.submit()}>
              {tx("rt_save")}
            </Button>
          </Space>
        </div>
      }
    >
      {vendors.data && vendors.data.length === 0 ? (
        <Alert
          type="warning"
          showIcon
          className="rt-alert"
          message={tx("rt_noVendors")}
          action={<Link to="/vendors">{tx("rt_goVendors")}</Link>}
        />
      ) : null}
      <Form<FormValues>
        form={form}
        layout="vertical"
        requiredMark={false}
        initialValues={DEFAULTS}
        onFinish={(v) => {
          const hasSell = v.charges?.some((c) => c?.side === "SELL" && Number(c.unitPrice) > 0);
          setSellError(!hasSell);
          if (hasSell) save.mutate(v);
        }}
        onValuesChange={(changed) => {
          if (sellError && "charges" in changed) setSellError(false);
        }}
        disabled={editing && detail.isLoading}
      >
        <div className="rt-grid">
          <Form.Item name="pol" label={tx("rt_pol")} rules={required}>
            {portSelect(tx("rt_pol"))}
          </Form.Item>
          <Form.Item
            name="pod"
            label={tx("rt_pod")}
            dependencies={["pol"]}
            rules={[
              ...required,
              ({ getFieldValue }) => ({
                validator: (_, v) => (v && v === getFieldValue("pol") ? Promise.reject(new Error(tx("rt_samePort"))) : Promise.resolve()),
              }),
            ]}
          >
            {portSelect(tx("rt_pod"))}
          </Form.Item>
          <Form.Item name="vendorId" label={tx("rt_vendor")} rules={required}>
            <Select showSearch optionFilterProp="label" placeholder={tx("rt_vendorPh")} options={vendorOptions} loading={vendors.isLoading} />
          </Form.Item>
          <Form.Item name="carrier" label={tx("rt_carrier")}>
            <Input placeholder={tx("rt_carrierPh")} maxLength={120} />
          </Form.Item>
          <Form.Item name="containerType" label={tx("rt_container")} rules={required}>
            <Select showSearch options={containerTypes.map((t) => ({ value: t, label: t }))} />
          </Form.Item>
          <Form.Item name="currency" label={tx("rt_currency")} rules={required}>
            <Select options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
          </Form.Item>
        </div>
        <Form.Item name="validity" label={tx("rt_validity")} rules={required}>
          <DatePicker.RangePicker style={{ width: "100%" }} format="D MMM YYYY" allowClear={false} inputReadOnly={mobile} />
        </Form.Item>

        <p className="rt-section">{tx("rt_charges")}</p>
        {buyHidden ? <Alert type="info" showIcon className="rt-alert" message={tx("rt_buyHidden")} /> : null}
        <Form.List name="charges">
          {(fields, { add, remove }) => (
            <div className="rt-charges">
              {fields.map((f) => (
                <div key={f.key} className="rt-charge">
                  <Form.Item name={[f.name, "side"]} noStyle>
                    <Segmented
                      disabled={buyHidden}
                      options={[
                        { value: "BUY", label: tx("rt_buy") },
                        { value: "SELL", label: tx("rt_sell") },
                      ]}
                    />
                  </Form.Item>
                  <Form.Item name={[f.name, "chargeCode"]} noStyle>
                    <Select
                      disabled={buyHidden}
                      className="rt-code"
                      aria-label={tx("rt_charges")}
                      options={CHARGE_CODES.map((c) => ({ value: c, label: tx(`rt_code_${c}`) }))}
                    />
                  </Form.Item>
                  <Form.Item name={[f.name, "unitPrice"]} noStyle rules={required}>
                    <InputNumber disabled={buyHidden} min={0} step={10} className="rt-price" aria-label={tx("rt_price")} placeholder={tx("rt_price")} />
                  </Form.Item>
                  <Form.Item name={[f.name, "unit"]} noStyle>
                    <Select
                      disabled={buyHidden}
                      className="rt-unit"
                      aria-label="unit"
                      options={UNITS.map((u) => ({ value: u, label: tx(`rt_unit_${u}`) }))}
                    />
                  </Form.Item>
                  <Button
                    type="text"
                    disabled={buyHidden || fields.length <= 1}
                    icon={<Trash size={16} aria-hidden />}
                    aria-label={tx("rt_cancel")}
                    onClick={() => remove(f.name)}
                  />
                </div>
              ))}
              {sellError ? <Form.ErrorList errors={[tx("rt_needSell")]} /> : null}
              <Button
                type="dashed"
                disabled={buyHidden}
                icon={<Plus size={14} aria-hidden />}
                onClick={() => add({ chargeCode: "THC_ORIGIN", side: "SELL", unit: "PER_CONTAINER", unitPrice: null })}
              >
                {tx("rt_addCharge")}
              </Button>
            </div>
          )}
        </Form.List>

        {!buyHidden ? (
          <div className="rt-totals" aria-live="polite">
            <span>
              {tx("rt_totalBuy")} <strong>{fmtMoney(buy, currency, locale)}</strong>
            </span>
            <span>
              {tx("rt_totalSell")} <strong>{fmtMoney(sell, currency, locale)}</strong>
            </span>
            {pct !== null ? (
              <span className={pct < 5 ? "is-danger" : pct < 10 ? "is-warning" : "is-success"}>
                {tx("rt_margin")} <strong>{pct}%</strong>
              </span>
            ) : null}
          </div>
        ) : null}
      </Form>
    </Drawer>
  );
}
