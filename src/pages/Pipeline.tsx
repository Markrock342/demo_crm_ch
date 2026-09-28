import { ArrowRight, CalendarBlank, ClipboardText, DotsThree, Handshake, Receipt, Scales, Truck, type Icon } from "@phosphor-icons/react";
import { App, Button, DatePicker, Drawer, Dropdown, Form, Input, InputNumber, Select, Space, Tooltip } from "antd";
import type { Dayjs } from "dayjs";
import { useMemo, useState, type DragEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { DealRow } from "../api/pipeline.ts";
import { useAuth } from "../auth/AuthProvider";
import { dealStages, nextDealStage, type DealStage } from "../crm";
import { customerName, type Customer } from "../data";
import { useStore } from "../store";
import { demoSearchText } from "../v2/lib/demoText.ts";
import { useDemoText } from "../v2/lib/useDemoText.ts";
import { EmptyState, ErrorState, FilterBar, IconBadge, LoadingState, PageHeader, PersonAvatar } from "../v2/components";
import { sumByCurrency, useDealMutations, useDealRows } from "../v2/hooks/usePipeline.ts";
import { ownerKey, OwnerSelect, useOwnerMenu, useOwnerName } from "../v2/pages/OwnerPicker.tsx";
import { CompanyMark, LaneRoute } from "../v2/pages/SalesMobileList.tsx";
import { crmDate, daysUntil, fmtAmount, fmtCompact, fmtShortDate, matches, type GfxTone } from "../v2/pages/salesUtil.ts";
import "../v2/pages/sales.css";

type DealForm = { customerId: string; title: string; lane: string; value: number; currency: string; teu: number; close?: Dayjs; ownerUserId?: string | null };

/** Deal currencies offered in the form (THB first — the default). */
const CURRENCIES = ["THB", "USD", "CNY", "EUR"];

const STAGE_LOOK: Record<DealStage, { icon: Icon; tone: GfxTone }> = {
  qualify: { icon: Scales, tone: "neutral" },
  quote: { icon: ClipboardText, tone: "info" },
  won: { icon: Handshake, tone: "primary" },
  book: { icon: Truck, tone: "accent" },
  billed: { icon: Receipt, tone: "success" },
};

export function PipelinePage() {
  const store = useStore();
  const { user } = useAuth();
  const { tx, locale } = store;
  const { message } = App.useApp();
  const dt = useDemoText();
  const dealsQ = useDealRows();
  const deals = useMemo(() => dealsQ.data ?? [], [dealsQ.data]);
  const customers = store.customers as Customer[];
  const { create, patch } = useDealMutations();
  const ownerName = useOwnerName();
  const ownerMenu = useOwnerMenu();
  const moveDeal = (id: string, stage: DealStage) => {
    patch.mutate({ id, patch: { stage } }, { onSuccess: () => message.success(tx("dealMoved")) });
  };
  const assignOwner = (id: string, ownerUserId: string) => {
    patch.mutate({ id, patch: { ownerUserId } }, { onSuccess: () => message.success(tx("fd_ownerSaved")) });
  };
  /** "฿1.2M · $27K" — one compact figure per currency. */
  const moneyLine = (rows: DealRow[], compact = true) =>
    sumByCurrency(rows)
      .map(([cur, v]) => (compact ? fmtCompact(v, cur, locale) : fmtAmount(v, cur, locale)))
      .join(" · ") || fmtCompact(0, "THB", locale);

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
    () =>
      deals.filter(
        (d) => (!owner || ownerKey(d) === owner) && matches(q, demoSearchText(d.title), demoSearchText(d.lane), ownerName(d), nameOf(d.customerId)),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deals, owner, q, customers, locale, ownerName],
  );
  const owners = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of deals) {
      const k = ownerKey(d);
      if (k && !m.has(k)) m.set(k, ownerName(d));
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [deals, ownerName]);
  const openValue = moneyLine(
    deals.filter((d) => d.stage !== "billed"),
    false,
  );

  function onDrop(e: DragEvent, stage: DealStage) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || dragId;
    setOverStage(null);
    setDragId(null);
    const deal = deals.find((d) => d.id === id);
    if (deal && deal.stage !== stage) moveDeal(deal.id, stage);
  }

  function submit(v: DealForm) {
    create.mutate(
      {
        customerId: v.customerId,
        title: v.title.trim(),
        lane: v.lane?.trim() || undefined,
        value: v.value ?? 0,
        currency: v.currency || "THB",
        teu: v.teu ?? 0,
        close: v.close ? v.close.format("MM-DD") : undefined,
        ownerUserId: v.ownerUserId ?? null,
      },
      {
        onSuccess: () => {
          message.success(tx("savedDeal"));
          form.resetFields();
          setOpen(false);
        },
      },
    );
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
        subtitle={tx("sales_pipelineSub", { n: deals.length, v: openValue })}
        extra={noCustomers ? <Tooltip title={tx("sales_needCustomer")}>{newBtn}</Tooltip> : newBtn}
      >
        <FilterBar
          search={{ value: q, onChange: setQ, placeholder: tx("sales_dealSearch") }}
          selects={[
            {
              key: "owner",
              placeholder: tx("sales_allOwners"),
              value: owner,
              options: owners.map(([k, name]) => ({ value: k, label: name })),
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

      {dealsQ.isError ? (
        <ErrorState title={tx("jobs_loadFailed")} action={<Button onClick={() => void dealsQ.refetch()}>{tx("fd_retry")}</Button>} />
      ) : dealsQ.isLoading ? (
        <LoadingState />
      ) : deals.length === 0 ? (
        <EmptyState title={tx("sales_colEmpty")} description={noCustomers ? tx("sales_needCustomer") : undefined} action={newBtn} />
      ) : (
        <div className="sales-board">
          {dealStages.map((stage, stageIdx) => {
            const col = rows.filter((d) => d.stage === stage);
            const sums = sumByCurrency(col);
            // bar = share of the main currency's value across the columns
            const main = sums[0]?.[0] ?? "THB";
            const mainSum = (list: DealRow[]) => list.filter((d) => d.currency === main).reduce((n, d) => n + d.value, 0);
            const maxSum = Math.max(1, ...dealStages.map((st) => mainSum(rows.filter((d) => d.stage === st))));
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
                  <span className="sales-col-sum" title={moneyLine(col, false)}>
                    {col.length ? moneyLine(col) : fmtCompact(0, "THB", locale)}
                  </span>
                  <span className="sales-col-bar" aria-hidden>
                    <span className={`is-${look.tone}`} style={{ width: `${(mainSum(col) / maxSum) * 100}%` }} />
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
                              { type: "divider" as const },
                              { key: "owner", label: tx("fd_changeOwner"), children: ownerMenu.map((o) => ({ ...o, disabled: o.key === `owner:${d.ownerUserId}` })) },
                            ],
                            onClick: ({ key }) => (key.startsWith("owner:") ? assignOwner(d.id, key.slice(6)) : moveDeal(d.id, key as DealStage)),
                          }}
                        >
                          <Button type="text" size="small" aria-label={tx("sales_moveTo")} icon={<DotsThree size={18} weight="bold" />} />
                        </Dropdown>
                      </div>
                      <span className="sales-deal-value" title={fmtAmount(d.value, d.currency, locale)}>
                        {fmtAmount(d.value, d.currency, locale)}
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
                        {ownerName(d) ? <PersonAvatar name={ownerName(d)} size={24} /> : null}
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
            <Button type="primary" loading={create.isPending} onClick={() => form.submit()}>
              {tx("sales_save")}
            </Button>
          </div>
        }
      >
        <Form<DealForm>
          form={form}
          layout="vertical"
          onFinish={submit}
          initialValues={{ customerId: customers[0]?.id, value: 40000, currency: "THB", teu: 4, ownerUserId: user?.id }}
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
          <Form.Item label={tx("fd_value")}>
            <Space.Compact style={{ width: "100%" }}>
              <Form.Item name="currency" noStyle>
                <Select aria-label={tx("fd_currency")} style={{ width: 96 }} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
              </Form.Item>
              <Form.Item name="value" noStyle>
                <InputNumber min={0} step={1000} style={{ width: "100%" }} aria-label={tx("fd_value")} />
              </Form.Item>
            </Space.Compact>
          </Form.Item>
          <Form.Item name="teu" label={tx("sales_colTeu")}>
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
          <div className="sales-form-row">
            <Form.Item name="close" label={tx("sales_fClose")}>
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="ownerUserId" label={tx("sales_fOwner")}>
              <OwnerSelect />
            </Form.Item>
          </div>
        </Form>
      </Drawer>
    </div>
  );
}
