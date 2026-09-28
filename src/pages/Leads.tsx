import { ChatCircleDots, CheckCircle, Cube, DotsThree, Sparkle, UserPlus, XCircle, type Icon } from "@phosphor-icons/react";
import { App, Button, Drawer, Dropdown, Form, Input, InputNumber, Popconfirm, Space, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { leadStages, type Lead, type LeadStage } from "../crm";
import { useShellCrm } from "../shell/crmStore.tsx";
import { useIsShellMode } from "../shell/session.tsx";
import { useStore } from "../store";
import { demoSearchText } from "../v2/lib/demoText.ts";
import { useDemoText } from "../v2/lib/useDemoText.ts";
import {
  Board,
  DataTable,
  EmptyState,
  EntityCard,
  FilterBar,
  PageHeader,
  PersonAvatar,
  StatusTag,
  ViewSwitch,
  readView,
  writeView,
} from "../v2/components";
import { CompanyMark, LaneRoute, SalesLane, SalesMobileList } from "../v2/pages/SalesMobileList.tsx";
import { useMedia } from "../ui/useMedia";
import { crmDate, daysUntil, leadStageTone, matches, uniqueSorted, type GfxTone } from "../v2/pages/salesUtil.ts";
import "../v2/pages/sales.css";

const STAGE_ICON: Record<LeadStage, { icon: Icon; tone: GfxTone }> = {
  new: { icon: Sparkle, tone: "info" },
  working: { icon: ChatCircleDots, tone: "primary" },
  qualified: { icon: CheckCircle, tone: "success" },
  lost: { icon: XCircle, tone: "neutral" },
};

/** Open leads untouched this long get an amber card. */
const STALE_DAYS = 14;

type LeadForm = { company: string; city: string; lane: string; contact: string; source: string; teu: number; owner: string };

export function LeadsPage() {
  const shell = useIsShellMode();
  const store = useStore();
  const crm = useShellCrm();
  const { user } = useAuth();
  const { tx } = store;
  const dt = useDemoText();
  const leads = (shell ? crm.leads : store.leads) as Lead[];
  const setLeadStage = shell ? crm.setLeadStage : store.setLeadStage;
  const addLead = shell ? crm.addLead : store.addLead;
  const canConvert = !shell;
  const mobile = useMedia("(max-width: 640px)");
  const { modal } = App.useApp();

  const [params, setParams] = useSearchParams();
  const open = params.get("new") === "1";
  const setOpen = (v: boolean) => {
    const next = new URLSearchParams(params);
    if (v) next.set("new", "1");
    else next.delete("new");
    setParams(next, { replace: true });
  };

  const [view, setViewState] = useState(() => readView("leads"));
  const setView = (v: "cards" | "list") => {
    setViewState(v);
    writeView("leads", v);
  };
  const [stage, setStage] = useState<LeadStage | "all">("all");
  const [q, setQ] = useState("");
  const [owner, setOwner] = useState<string | undefined>();
  const [form] = Form.useForm<LeadForm>();

  const stageLabel = (s: LeadStage) => tx(`sales_stage_${s}`);

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: leads.length };
    for (const s of leadStages) map[s] = 0;
    for (const l of leads) map[l.stage] = (map[l.stage] ?? 0) + 1;
    return map;
  }, [leads]);

  const rows = useMemo(
    () =>
      leads.filter(
        (l) =>
          (view === "cards" || stage === "all" || l.stage === stage) &&
          (!owner || l.owner === owner) &&
          matches(q, ...[l.company, l.city, l.lane, l.contact, l.source, l.owner].map(demoSearchText)),
      ),
    [leads, stage, owner, q, view],
  );

  const owners = useMemo(() => uniqueSorted(leads.map((l) => l.owner)), [leads]);

  function submit(values: LeadForm) {
    addLead({
      company: values.company,
      city: values.city ?? "",
      lane: values.lane ?? "",
      contact: values.contact ?? "",
      source: values.source ?? "",
      teu: values.teu ?? 0,
      owner: values.owner ?? "",
    });
    form.resetFields();
    setOpen(false);
  }

  const convertable = (l: Lead) => canConvert && l.stage !== "lost" && l.stage !== "qualified";

  const mobileActions = (l: Lead) => (
    <Dropdown
      trigger={["click"]}
      menu={{
        items: [
          ...(convertable(l) ? [{ key: "convert", label: tx("sales_convert") }, { type: "divider" as const }] : []),
          { key: "h", type: "group" as const, label: tx("sales_changeStage") },
          ...leadStages.map((s) => ({ key: s, label: stageLabel(s), disabled: s === l.stage })),
        ],
        onClick: ({ key }) => {
          if (key === "convert") {
            modal.confirm({
              title: tx("sales_convertConfirm", { name: dt(l.company) }),
              okText: tx("sales_convert"),
              cancelText: tx("sales_cancel"),
              onOk: () => store.convertLead(l.id),
            });
          } else setLeadStage(l.id, key as LeadStage);
        },
      }}
    >
      <Button type="text" aria-label={tx("sales_moreActions")} icon={<DotsThree size={20} weight="bold" />} />
    </Dropdown>
  );

  const rowActions = (l: Lead) => (
    <Space size={4} className="sales-row-actions">
      {convertable(l) ? (
        <Popconfirm
          title={tx("sales_convertConfirm", { name: dt(l.company) })}
          okText={tx("sales_convert")}
          cancelText={tx("sales_cancel")}
          onConfirm={() => store.convertLead(l.id)}
        >
          <Button type="link" size="small">
            {tx("sales_convert")}
          </Button>
        </Popconfirm>
      ) : null}
      <Dropdown
        trigger={["click"]}
        menu={{
          items: [
            { key: "h", type: "group", label: tx("sales_changeStage") },
            ...leadStages.map((s) => ({ key: s, label: stageLabel(s), disabled: s === l.stage })),
          ],
          onClick: ({ key }) => setLeadStage(l.id, key as LeadStage),
        }}
      >
        <Button type="text" size="small" aria-label={tx("sales_moreActions")} icon={<DotsThree size={18} weight="bold" />} />
      </Dropdown>
    </Space>
  );

  const stageTag = (l: Lead) => <StatusTag status={l.stage} label={stageLabel(l.stage)} tone={leadStageTone[l.stage]} />;
  const subLine = (l: Lead) => [dt(l.contact), dt(l.city)].filter((x) => x && x !== "—").join(" · ") || "—";

  const columns: ColumnsType<Lead> = [
    {
      title: tx("sales_colCompany"),
      key: "company",
      render: (_, l) => (
        <>
          <span className="cz-cell-main">{dt(l.company)}</span>
          <span className="cz-cell-sub">{subLine(l)}</span>
        </>
      ),
    },
    { title: tx("sales_colStage"), key: "stage", render: (_, l) => stageTag(l) },
    { title: tx("sales_colLane"), dataIndex: "lane", render: (v: string) => <SalesLane lane={v} /> },
    {
      title: "TEU",
      dataIndex: "teu",
      align: "right",
      className: "cz-num",
      render: (v: number) => (v ? v : <span className="cz-muted">—</span>),
    },
    { title: tx("sales_owner"), dataIndex: "owner", align: "center", render: (v: string) => <PersonAvatar name={v} /> },
    {
      title: <span className="sr-only">{tx("sales_moreActions")}</span>,
      key: "actions",
      align: "right",
      render: (_, l) => rowActions(l),
    },
  ];

  const isStale = (l: Lead) => {
    if (l.stage !== "new" && l.stage !== "working") return false;
    const d = daysUntil(crmDate(l.updated));
    return d !== null && d < -STALE_DAYS;
  };

  const leadCard = (l: Lead) => (
    <EntityCard
      key={l.id}
      tone={isStale(l) ? "warning" : "default"}
      media={<CompanyMark name={l.company} />}
      title={dt(l.company)}
      subtitle={[dt(l.contact), dt(l.city)].filter((x) => x && x !== "—").join(" · ") || undefined}
      badge={mobileActions(l)}
      footer={
        <>
          {l.teu ? (
            <Tooltip title={tx("sales_fTeu")}>
              <span className="sales-chip">
                <Cube size={14} weight="duotone" aria-hidden />
                <strong>{l.teu}</strong> TEU
              </span>
            </Tooltip>
          ) : null}
          <span className="sales-grow" />
          {convertable(l) ? (
            <Popconfirm
              title={tx("sales_convertConfirm", { name: dt(l.company) })}
              okText={tx("sales_convert")}
              cancelText={tx("sales_cancel")}
              onConfirm={() => store.convertLead(l.id)}
            >
              <Tooltip title={tx("sales_convert")}>
                <Button size="small" type="text" aria-label={tx("sales_convert")} icon={<UserPlus size={18} aria-hidden />} />
              </Tooltip>
            </Popconfirm>
          ) : null}
          <PersonAvatar name={l.owner} size={26} />
        </>
      }
    >
      <LaneRoute lane={l.lane} />
    </EntityCard>
  );

  const newButton = (
    <Button type="primary" onClick={() => setOpen(true)}>
      {tx("sales_newLead")}
    </Button>
  );
  const emptyState =
    leads.length === 0 ? (
      <EmptyState title={tx("sales_leadsEmpty")} description={tx("sales_leadsEmptyHint")} action={newButton} />
    ) : (
      <EmptyState description={tx("noResults")} />
    );

  const tabOptions = [
    { value: "all", label: tx("sales_tabAll"), count: counts.all },
    ...leadStages.map((s) => ({ value: s, label: stageLabel(s), count: counts[s] })),
  ];

  return (
    <div className="cz-stack sales-page">
      <PageHeader
        title={tx("sales_leadsTitle")}
        subtitle={tx("sales_leadsSub", { n: leads.length, w: counts.working ?? 0 })}
        extra={
          <>
            <ViewSwitch value={view} onChange={setView} labels={{ cards: tx("viewCards"), list: tx("viewList") }} />
            {newButton}
          </>
        }
      >
        <FilterBar
          tabs={
            mobile || view === "cards"
              ? undefined
              : { value: stage, options: tabOptions, onChange: (v) => setStage(v as LeadStage | "all") }
          }
          search={{ value: q, onChange: setQ, placeholder: tx("sales_leadSearch") }}
          selects={[
            ...(mobile && view === "list"
              ? [
                  {
                    key: "stage",
                    placeholder: tx("sales_colStage"),
                    value: stage === "all" ? undefined : stage,
                    options: tabOptions.slice(1).map((o) => ({ value: o.value, label: `${o.label} (${o.count})` })),
                    onChange: (v: string | undefined) => setStage((v as LeadStage) ?? "all"),
                    width: 150,
                  },
                ]
              : []),
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
            setStage("all");
            setQ("");
            setOwner(undefined);
          }}
          count={rows.length}
        />
      </PageHeader>

      {view === "cards" ? (
        leads.length === 0 ? (
          emptyState
        ) : (
          <Board
            columns={leadStages.map((s) => {
              const col = rows.filter((l) => l.stage === s);
              return {
                key: s,
                icon: STAGE_ICON[s].icon,
                tone: STAGE_ICON[s].tone,
                title: stageLabel(s),
                count: col.length,
                children: col.length ? col.map(leadCard) : <p className="sales-col-empty">{tx("sales_colEmptyLeads")}</p>,
              };
            })}
          />
        )
      ) : mobile ? (
        <SalesMobileList
          rows={rows.map((l) => ({
            key: l.id,
            title: dt(l.company),
            status: stageTag(l),
            sub: (
              <>
                <PersonAvatar name={l.owner} size={20} />
                {subLine(l)}
              </>
            ),
            aside: l.teu ? `${l.teu} TEU` : undefined,
            actions: mobileActions(l),
          }))}
          empty={emptyState}
        />
      ) : (
        <DataTable<Lead>
          rowKey="id"
          columns={columns}
          dataSource={rows}
          emptyText={leads.length === 0 ? tx("sales_leadsEmptyHint") : undefined}
          emptyAction={leads.length === 0 ? newButton : undefined}
        />
      )}

      <Drawer
        title={tx("sales_newLead")}
        open={open}
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
        <Form<LeadForm>
          form={form}
          layout="vertical"
          requiredMark
          onFinish={submit}
          initialValues={{ teu: 4, owner: user?.nameZh || user?.name || "" }}
        >
          <Form.Item
            name="company"
            label={tx("sales_fCompany")}
            rules={[{ required: true, whitespace: true, message: tx("sales_required", { field: tx("sales_fCompany") }) }]}
          >
            <Input autoFocus />
          </Form.Item>
          <Form.Item name="contact" label={tx("sales_fContact")}>
            <Input />
          </Form.Item>
          <div className="sales-form-row">
            <Form.Item name="city" label={tx("sales_fCity")}>
              <Input />
            </Form.Item>
            <Form.Item name="teu" label={tx("sales_fTeu")}>
              <InputNumber min={0} style={{ width: "100%" }} />
            </Form.Item>
          </div>
          <Form.Item name="lane" label={tx("sales_fLane")}>
            <Input placeholder={tx("sales_fLanePh")} />
          </Form.Item>
          <Form.Item name="source" label={tx("sales_fSource")}>
            <Input placeholder={tx("sales_fSourcePh")} />
          </Form.Item>
          <Form.Item name="owner" label={tx("sales_fOwner")}>
            <Input />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
