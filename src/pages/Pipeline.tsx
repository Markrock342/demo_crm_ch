import { ArrowRight, CalendarBlank, ClipboardText, DotsThree, Handshake, Receipt, Scales, Truck, type Icon } from "@phosphor-icons/react";
import { Button, DatePicker, Drawer, Dropdown, Form, Input, InputNumber, Select, Tooltip } from "antd";
import type { Dayjs } from "dayjs";
import { useMemo, useState, type DragEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { dealStages, nextDealStage, type Deal, type DealStage } from "../crm";
import { customerName, type Customer } from "../data";
import { useShellCrm } from "../shell/crmStore.tsx";
import { useIsShellMode } from "../shell/session.tsx";
import { useStore } from "../store";
import { demoSearchText } from "../v2/lib/demoText.ts";
import { useDemoText } from "../v2/lib/useDemoText.ts";
import { EmptyState, FilterBar, IconBadge, PageHeader, PersonAvatar } from "../v2/components";
import { CompanyMark, LaneRoute } from "../v2/pages/SalesMobileList.tsx";
import { crmDate, daysUntil, fmtAmount, fmtCompact, fmtShortDate, matches, uniqueSorted, type GfxTone } from "../v2/pages/salesUtil.ts";
import "../v2/pages/sales.css";

type DealForm = { customerId: string; title: string; lane: string; value: number; teu: number; close?: Dayjs; owner: string };

const CURRENCY = "CNY";

const STAGE_LOOK: Record<DealStage, { icon: Icon; tone: GfxTone }> = {
  qualify: { icon: Scales, tone: "neutral" },
  quote: { icon: ClipboardText, tone: "info" },
  won: { icon: Handshake, tone: "primary" },
  book: { icon: Truck, tone: "accent" },
  billed: { icon: Receipt, tone: "success" },
};

export function PipelinePage() {
  const shell = useIsShellMode();
  const store = useStore();
  const crm = useShellCrm();
  const { user } = useAuth();
  const { tx, locale } = store;
  const dt = useDemoText();
  const deals = (shell ? crm.deals : store.deals) as Deal[];
  const customers = (shell ? crm.customers : store.customers) as Customer[];
  const moveDeal = shell ? crm.moveDeal : store.moveDeal;
  const addDeal = shell ? crm.addDeal : store.addDeal;

  const [params, setParams] = useSearchParams();
  const open = params.get("new") === "1";
  const setOpen = (v: boolean) => {
    const next = new URLSearchParams(params);
    if (v) next.set("new", "1");
    else next.delete("new");
    setParams(next, { replace: true });
  };

  const [q, setQ] = useState("");
  const [owner, setOwner] = useState<string | undefined>();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<DealStage | null>(null);
  const [form] = Form.useForm<DealForm>();

  const stageLabel = (s: DealStage) => tx(`sales_dstage_${s}`);
  const nameOf = (id: string) => {
    const c = customers.find((x) => x.id === id);
    return c ? customerName(c, locale) : "—";
  };

  const rows = useMemo(
    () => deals.filter((d) => (!owner || d.owner === owner) && matches(q, demoSearchText(d.title), demoSearchText(d.lane), demoSearchText(d.owner), nameOf(d.customerId))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deals, owner, q, customers, locale],
  );
  const owners = useMemo(() => uniqueSorted(deals.map((d) => d.owner)), [deals]);
  const openValue = deals.filter((d) => d.stage !== "billed").reduce((n, d) => n + d.value, 0);

  function onDrop(e: DragEvent, stage: DealStage) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || dragId;
    setOverStage(null);
    setDragId(null);
    const deal = deals.find((d) => d.id === id);
    if (deal && deal.stage !== stage) moveDeal(deal.id, stage);
  }

  function submit(v: DealForm) {
    addDeal({
      customerId: v.customerId,
      title: v.title,
      lane: v.lane ?? "",
      value: v.value ?? 0,
      teu: v.teu ?? 0,
      close: v.close ? v.close.format("MM-DD") : "",
      owner: v.owner ?? "",
    });
    form.resetFields();
    setOpen(false);
  }

  const noCustomers = customers.length === 0;
  const newBtn = (
    <Button type="primary" onClick={() => setOpen(true)} disabled={noCustomers}>
      {tx("sales_newDeal")}
    </Button>
  );

  return (
    <div className="cz-stack sales-page">
      <PageHeader
        title={tx("sales_pipelineTitle")}
        subtitle={tx("sales_pipelineSub", { n: deals.length, v: fmtAmount(openValue, CURRENCY, locale) })}
        extra={noCustomers ? <Tooltip title={tx("sales_needCustomer")}>{newBtn}</Tooltip> : newBtn}
      >
        <FilterBar
          search={{ value: q, onChange: setQ, placeholder: tx("sales_dealSearch") }}
          selects={[
            {
              key: "owner",
              placeholder: tx("sales_allOwners"),
              value: owner,
              options: owners.map((o) => ({ value: o, label: dt(o) })),
              onChange: setOwner,
              width: 160,
            },
          ]}
          onClear={() => {
            setQ("");
            setOwner(undefined);
          }}
          count={rows.length}
        />
      </PageHeader>

      {deals.length === 0 ? (
        <EmptyState title={tx("sales_colEmpty")} description={noCustomers ? tx("sales_needCustomer") : undefined} action={newBtn} />
      ) : (
        <div className="sales-board">
          {dealStages.map((stage, stageIdx) => {
            const col = rows.filter((d) => d.stage === stage);
            const sum = col.reduce((n, d) => n + d.value, 0);
            const maxSum = Math.max(1, ...dealStages.map((st) => rows.filter((d) => d.stage === st).reduce((n, d) => n + d.value, 0)));
            const look = STAGE_LOOK[stage];
            return (
              <section
                key={stage}
                className={`sales-col${overStage === stage ? " is-over" : ""}`}
                aria-label={stageLabel(stage)}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (overStage !== stage) setOverStage(stage);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverStage(null);
                }}
                onDrop={(e) => onDrop(e, stage)}
              >
                <header className="sales-col-head">
                  <div className="sales-col-title">
                    <IconBadge icon={look.icon} tone={look.tone} size={28} />
                    <h2>{stageLabel(stage)}</h2>
                    <span className="sales-col-count">{col.length}</span>
                  </div>
                  <span className="sales-col-sum" title={fmtAmount(sum, CURRENCY, locale)}>
                    {fmtCompact(sum, CURRENCY, locale)}
                  </span>
                  <span className="sales-col-bar" aria-hidden>
                    <span className={`is-${look.tone}`} style={{ width: `${(sum / maxSum) * 100}%` }} />
                  </span>
                </header>
                {col.length === 0 ? <p className="sales-col-empty">{dragId ? tx("sales_dropHere") : tx("sales_colEmpty")}</p> : null}
                {col.map((d) => {
                  const next = nextDealStage(d.stage);
                  const close = crmDate(d.close);
                  const left = daysUntil(close);
                  const closed = d.stage === "billed";
                  const late = !closed && left !== null && left < 0;
                  const soon = !closed && left !== null && left >= 0 && left <= 3;
                  const customer = nameOf(d.customerId);
                  return (
                    <article
                      key={d.id}
                      className={`sales-deal${dragId === d.id ? " is-dragging" : ""}${late ? " is-late" : ""}`}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", d.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDragId(d.id);
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setOverStage(null);
                      }}
                    >
                      <div className="sales-deal-head">
                        <CompanyMark name={customer} size={32} />
                        <span className="sales-deal-names">
                          <Link className="sales-deal-company" to={`/customers/${d.customerId}`} draggable={false}>
                            {customer}
                          </Link>
                          <span className="sales-deal-title" title={dt(d.title)}>
                            {dt(d.title)}
                          </span>
                        </span>
                        <Dropdown
                          trigger={["click"]}
                          menu={{
                            items: [
                              { key: "h", type: "group", label: tx("sales_moveTo") },
                              ...dealStages.map((s) => ({ key: s, label: stageLabel(s), disabled: s === d.stage })),
                            ],
                            onClick: ({ key }) => moveDeal(d.id, key as DealStage),
                          }}
                        >
                          <Button type="text" size="small" aria-label={tx("sales_moveTo")} icon={<DotsThree size={18} weight="bold" />} />
                        </Dropdown>
                      </div>
                      <span className="sales-deal-value" title={fmtAmount(d.value, CURRENCY, locale)}>
                        {fmtAmount(d.value, CURRENCY, locale)}
                      </span>
                      <span className="sales-deal-progress" aria-label={`${stageIdx + 1}/${dealStages.length}`} title={stageLabel(stage)}>
                        {dealStages.map((st, i) => (
                          <span key={st} className={i <= stageIdx ? `is-on is-${look.tone}` : undefined} />
                        ))}
                      </span>
                      {d.lane ? <LaneRoute lane={d.lane} names={false} /> : null}
                      <div className="sales-deal-foot">
                        {close ? (
                          <span
                            className={`sales-chip${late ? " is-danger is-toned" : soon ? " is-warning is-toned" : ""}`}
                            title={tx("sales_fClose")}
                          >
                            <CalendarBlank size={14} aria-hidden />
                            {fmtShortDate(close, locale)}
                          </span>
                        ) : null}
                        {d.teu ? <span className="sales-deal-teu">{d.teu} TEU</span> : null}
                        <span className="sales-grow" />
                        {next ? (
                          <Tooltip title={tx("sales_nextStep", { stage: stageLabel(next) })}>
                            <Button
                              size="small"
                              className="sales-deal-next"
                              aria-label={tx("sales_nextStep", { stage: stageLabel(next) })}
                              icon={<ArrowRight size={14} aria-hidden />}
                              onClick={() => moveDeal(d.id, next)}
                            />
                          </Tooltip>
                        ) : null}
                        <PersonAvatar name={d.owner} size={24} />
                      </div>
                    </article>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}

      <Drawer
        title={tx("sales_newDeal")}
        open={open && !noCustomers}
        onClose={() => setOpen(false)}
        width={440}
        destroyOnClose
        footer={
          <div className="sales-drawer-foot">
            <Button type="text" onClick={() => setOpen(false)}>
              {tx("sales_cancel")}
            </Button>
            <Button type="primary" onClick={() => form.submit()}>
              {tx("sales_save")}
            </Button>
          </div>
        }
      >
        <Form<DealForm>
          form={form}
          layout="vertical"
          onFinish={submit}
          initialValues={{ customerId: customers[0]?.id, value: 40000, teu: 4, owner: user?.nameZh || user?.name || "" }}
        >
          <Form.Item
            name="customerId"
            label={tx("sales_fCustomer")}
            rules={[{ required: true, message: tx("sales_required", { field: tx("sales_fCustomer") }) }]}
          >
            <Select showSearch optionFilterProp="label" options={customers.map((c) => ({ value: c.id, label: customerName(c, locale) }))} />
          </Form.Item>
          <Form.Item
            name="title"
            label={tx("sales_fDealTitle")}
            rules={[{ required: true, whitespace: true, message: tx("sales_required", { field: tx("sales_fDealTitle") }) }]}
          >
            <Input placeholder={tx("sales_fDealTitlePh")} />
          </Form.Item>
          <Form.Item name="lane" label={tx("sales_fLane")}>
            <Input placeholder={tx("sales_fLanePh")} />
          </Form.Item>
          <div className="sales-form-row">
            <Form.Item name="value" label={tx("sales_fValue")}>
              <InputNumber min={0} step={1000} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="teu" label={tx("sales_colTeu")}>
              <InputNumber min={0} style={{ width: "100%" }} />
            </Form.Item>
          </div>
          <div className="sales-form-row">
            <Form.Item name="close" label={tx("sales_fClose")}>
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="owner" label={tx("sales_fOwner")}>
              <Input />
            </Form.Item>
          </div>
        </Form>
      </Drawer>
    </div>
  );
}
