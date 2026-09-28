import { Boat, CaretRight, Coins, Package } from "@phosphor-icons/react";
import { demoSearchText, localizeDemo } from "../lib/demoText.ts";
import { Button } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { cityName, customerName, laneName, type Customer } from "../../data";
import { useShellCrm } from "../../shell/crmStore.tsx";
import { useStore } from "../../store";
import { useMedia } from "../../ui/useMedia";
import {
  AiBriefCard,
  CardGrid,
  DataTable,
  EmptyState,
  EntityCard,
  FilterBar,
  IconBadge,
  PageHeader,
  PersonAvatar,
  SegmentBar,
  ViewSwitch,
  readView,
  writeView,
} from "../components";
import { useAppMode } from "../hooks/useAppMode.ts";
import { useUserLookup } from "../hooks/useUserLookup.ts";
import { fmtDate } from "../lib/format.ts";
import { CompanyMark, LaneRoute, SalesLane, SalesMobileList } from "./SalesMobileList.tsx";
import { useCustomerMoney, type CustomerMoney } from "./salesData.ts";
import { crmDate, fmtCompact, matches, uniqueSorted } from "./salesUtil.ts";
import { CustomerFormDrawer } from "./CustomerForm.tsx";
import "./sales.css";

type Row = Customer & { boxes?: number; arDays?: number; ownerUserId?: string | null };
type Tab = "all" | "active" | "ar";

const AR_WARN = 30;

export function CustomersPageV2() {
  const store = useStore();
  const { tx, locale } = store;
  const crm = useShellCrm();
  const { shell } = useAppMode();
  const people = useUserLookup();
  const navigate = useNavigate();
  const mobile = useMedia("(max-width: 640px)");
  const customers = (shell ? crm.customers : store.customers) as Row[];
  /** Owner in the UI language (staff directory), falling back to the stored name. */
  const ownerName = (c: Row) => (c.ownerUserId ? people.nameOf(c.ownerUserId, c.owner) : c.owner);

  const [params, setParams] = useSearchParams();
  const open = params.get("new") === "1";
  const setOpen = (v: boolean) => {
    const next = new URLSearchParams(params);
    if (v) next.set("new", "1");
    else next.delete("new");
    setParams(next, { replace: true });
  };

  const money = useCustomerMoney();
  const [view, setViewState] = useState(() => readView("customers"));
  const setView = (v: "cards" | "list") => {
    setViewState(v);
    writeView("customers", v);
  };
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState(params.get("q") ?? "");
  const [owner, setOwner] = useState<string | undefined>();

  const isActive = (c: Row) => (c.boxes ?? 0) > 0;
  const isArRisk = (c: Row) => (c.arDays ?? 0) >= AR_WARN;

  const rows = useMemo(
    () =>
      customers.filter(
        (c) =>
          (tab === "all" || (tab === "active" ? isActive(c) : isArRisk(c))) &&
          (!owner || c.owner === owner) &&
          matches(q, c.nameZh, c.nameTh, c.nameEn, c.cityZh, c.cityTh, c.cityEn, c.laneZh, c.laneTh, c.laneEn, demoSearchText(c.owner)),
      ),
    [customers, tab, owner, q],
  );
  const owners = useMemo(() => uniqueSorted(customers.map((c) => c.owner)), [customers]);
  const activeCount = customers.filter(isActive).length;
  const arCount = customers.filter(isArRisk).length;

  const open360 = (c: Row) => navigate(`/customers/${c.id}`);

  const arCell = (c: Row) => {
    const d = c.arDays;
    if (d === undefined || d === null) return <span className="cz-muted">—</span>;
    if (d <= 0) return <span className="cz-muted">—</span>;
    return <span className={d >= 60 ? "sales-ar-bad" : d >= AR_WARN ? "sales-ar-warn" : undefined}>{tx("sales_days", { n: d })}</span>;
  };

  const agingBar = (m: CustomerMoney) => (
    <SegmentBar
      height={6}
      parts={[
        { value: m.aging.current, tone: "success", label: tx("sales_arCurrent") },
        { value: m.aging.late, tone: "warning", label: tx("sales_arLate") },
        { value: m.aging.veryLate, tone: "danger", label: tx("sales_arVeryLate") },
      ]}
    />
  );

  const customerCard = (c: Row) => {
    const name = customerName(c, locale);
    const m = money[c.id];
    const ar = c.arDays ?? 0;
    const arTone = ar >= 60 || (m?.aging.veryLate ?? 0) > 0 ? "danger" : ar >= AR_WARN || (m?.aging.late ?? 0) > 0 ? "warning" : "default";
    return (
      <EntityCard
        key={c.id}
        to={`/customers/${c.id}`}
        tone={arTone}
        media={<CompanyMark name={name} size={44} />}
        title={name}
        subtitle={cityName(c, locale)}
        badge={<PersonAvatar name={ownerName(c)} size={28} />}
        footer={
          <div className="sales-mini">
            <span className="sales-mini-tile">
              <IconBadge icon={Boat} tone="primary" size={30} />
              <span className="sales-mini-body">
                <strong>{m?.activeJobs ?? 0}</strong>
                <em>{tx("sales_miniJobs")}</em>
              </span>
            </span>
            <span className="sales-mini-tile">
              <IconBadge icon={Coins} tone={arTone === "default" ? "success" : arTone} size={30} />
              <span className="sales-mini-body">
                <strong className={arTone === "danger" ? "sales-ar-bad" : arTone === "warning" ? "sales-ar-warn" : undefined}>
                  {m?.balance ? fmtCompact(m.balance, m.currency, locale) : "—"}
                </strong>
                {m?.balance ? agingBar(m) : null}
                <em>{tx("sales_miniAr")}</em>
              </span>
            </span>
          </div>
        }
      >
        <LaneRoute lane={laneName(c, locale)} />
      </EntityCard>
    );
  };

  const columns: ColumnsType<Row> = [
    {
      title: tx("sales_colCustomer"),
      key: "name",
      render: (_, c) => (
        <>
          <span className="cz-cell-main">{customerName(c, locale)}</span>
          <span className="cz-cell-sub">{cityName(c, locale)}</span>
        </>
      ),
    },
    { title: tx("sales_colMainLane"), key: "lane", render: (_, c) => <SalesLane lane={laneName(c, locale)} /> },
    { title: tx("sales_owner"), key: "owner", align: "center", render: (_, c) => <PersonAvatar name={ownerName(c)} /> },
    {
      title: tx("sales_colBoxes"),
      key: "boxes",
      align: "right",
      className: "cz-num",
      render: (_, c) => (c.boxes ? c.boxes : <span className="cz-muted">—</span>),
    },
    { title: tx("sales_colArDays"), key: "ar", align: "right", className: "cz-num", render: (_, c) => arCell(c) },
    {
      title: tx("sales_updated"),
      dataIndex: "updated",
      render: (v: string) => <span className="cz-muted">{fmtDate(crmDate(v), locale)}</span>,
    },
    {
      title: <span className="sr-only">{tx("sales_openDetail")}</span>,
      key: "go",
      width: 40,
      render: () => <CaretRight size={16} className="sales-chevron" aria-hidden />,
    },
  ];

  const newButton = (
    <Button type="primary" onClick={() => setOpen(true)}>
      {tx("sales_newCustomer")}
    </Button>
  );
  const empty =
    customers.length === 0 ? (
      <EmptyState title={tx("sales_customersEmpty")} description={tx("sales_customersEmptyHint")} action={newButton} />
    ) : (
      <EmptyState description={tx("noResults")} />
    );

  const facts = {
    customers: customers.length,
    withBoxesMoving: activeCount,
    arOver30Days: arCount,
    lanes: new Set(customers.map((c) => c.laneZh)).size,
  };

  return (
    <div className="cz-stack sales-page">
      <PageHeader
        title={tx("sales_customersTitle")}
        subtitle={tx("sales_customersSub", { n: customers.length, b: activeCount })}
        extra={
          <>
            <ViewSwitch value={view} onChange={setView} labels={{ cards: tx("viewCards"), list: tx("viewList") }} />
            <AiBriefCard
              title={tx("aiMgmtReport")}
              facts={facts}
              localFallback={`${customers.length} customers, ${activeCount} with boxes moving, ${arCount} with AR over 30 days.`}
            />
            {newButton}
          </>
        }
      >
        <FilterBar
          tabs={{
            value: tab,
            onChange: (v) => setTab(v as Tab),
            options: [
              { value: "all", label: tx("sales_tabAll"), count: customers.length },
              { value: "active", label: tx("sales_tabActive"), count: activeCount },
              { value: "ar", label: tx("sales_tabArRisk"), count: arCount },
            ],
          }}
          search={{ value: q, onChange: setQ, placeholder: tx("sales_customerSearch") }}
          selects={[
            {
              key: "owner",
              placeholder: tx("sales_allOwners"),
              value: owner,
              options: owners.map((o) => ({ value: o, label: localizeDemo(o, locale) })),
              onChange: setOwner,
              width: 160,
            },
          ]}
          onClear={() => {
            setTab("all");
            setQ("");
            setOwner(undefined);
          }}
          count={rows.length}
        />
      </PageHeader>

      {view === "cards" ? (
        rows.length === 0 ? (
          empty
        ) : (
          <CardGrid min={300}>{rows.map(customerCard)}</CardGrid>
        )
      ) : mobile ? (
        <SalesMobileList
          empty={empty}
          rows={rows.map((c) => ({
            key: c.id,
            title: customerName(c, locale),
            status: isArRisk(c) ? arCell(c) : undefined,
            sub: (
              <>
                <PersonAvatar name={ownerName(c)} size={20} />
                <SalesLane lane={laneName(c, locale)} />
              </>
            ),
            aside: c.boxes ? (
              <span className="sales-boxes">
                <Package size={14} aria-hidden />
                {c.boxes}
              </span>
            ) : undefined,
            onClick: () => open360(c),
          }))}
        />
      ) : (
        <DataTable<Row>
          rowKey="id"
          columns={columns}
          dataSource={rows}
          onRowClick={open360}
          emptyText={customers.length === 0 ? tx("sales_customersEmptyHint") : undefined}
          emptyAction={customers.length === 0 ? newButton : undefined}
        />
      )}

      <CustomerFormDrawer
        open={open}
        onClose={() => setOpen(false)}
        onSaved={(c) => navigate(`/customers/${c.id}`)}
      />
    </div>
  );
}
