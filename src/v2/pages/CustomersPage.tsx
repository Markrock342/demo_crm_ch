import { Boat, CaretRight, Coins, Package } from "@phosphor-icons/react";
import { localizeDemo } from "../lib/demoText.ts";
import { Button } from "antd";
import type { ColumnsType } from "antd/es/table";
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { cityName, customerName, laneName } from "../../data";
import { fetchCustomersPage, type CustomerPageRow } from "../../api/lists.ts";
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
import { useUserLookup } from "../hooks/useUserLookup.ts";
import { fmtDate } from "../lib/format.ts";
import { CompanyMark, LaneRoute, SalesLane, SalesMobileList } from "./SalesMobileList.tsx";
import type { CustomerMoney } from "./salesData.ts";
import { crmDate, fmtCompact } from "./salesUtil.ts";
import { ListPager, LoadMore } from "./scale/ListPager.tsx";
import { useDebounced } from "./scale/useDebounced.ts";
import { CustomerFormDrawer } from "./CustomerForm.tsx";
import "./sales.css";
import { ImportButton } from "./ImportButton.tsx";

type Row = CustomerPageRow;
type Tab = "all" | "active" | "ar";

const AR_WARN = 30;
/** Server-side paging: table page size / cards per "load more". */
const PAGE = 50;
const CARDS = 36;

export function CustomersPageV2() {
  const store = useStore();
  const { tx, locale } = store;
  const people = useUserLookup();
  const navigate = useNavigate();
  const mobile = useMedia("(max-width: 640px)");
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

  const [view, setViewState] = useState(() => readView("customers"));
  const setView = (v: "cards" | "list") => {
    setViewState(v);
    writeView("customers", v);
  };
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState(params.get("q") ?? "");
  const dq = useDebounced(q.trim(), 300);
  const [owner, setOwner] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const filters = { q: dq, tab, owner };
  const filterKey = JSON.stringify(filters);
  useEffect(() => setPage(1), [filterKey, view]);

  // Search / tabs / owner / paging + money per row all come from the server (GET /api/customers?stats=1).
  const listQ = useQuery({
    queryKey: ["customers", "page", "list", filterKey, page],
    queryFn: () => fetchCustomersPage({ ...filters, limit: PAGE, offset: (page - 1) * PAGE }),
    enabled: view === "list",
    placeholderData: keepPreviousData,
  });
  const cardsQ = useInfiniteQuery({
    queryKey: ["customers", "page", "cards", filterKey],
    queryFn: ({ pageParam }) => fetchCustomersPage({ ...filters, limit: CARDS, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, all) => {
      const n = all.reduce((s, p) => s + p.items.length, 0);
      return n < last.total ? n : undefined;
    },
    enabled: view === "cards",
  });
  const head = view === "list" ? listQ.data : cardsQ.data?.pages[0];
  const rows: Row[] = useMemo(
    () => (view === "list" ? (listQ.data?.items ?? []) : (cardsQ.data?.pages ?? []).flatMap((p) => p.items)),
    [view, listQ.data, cardsQ.data],
  );
  const money: Record<string, CustomerMoney> = useMemo(() => Object.fromEntries(rows.map((r) => [r.id, r.money])), [rows]);
  const counts = head?.counts ?? { all: 0, active: 0, ar: 0 };
  const total = head?.total ?? 0;
  const owners = head?.owners ?? [];
  const activeCount = counts.active;
  const arCount = counts.ar;
  const hasAny = counts.all > 0 || Boolean(dq || owner);

  const isArRisk = (c: Row) => (c.arDays ?? 0) >= AR_WARN;

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
    !hasAny ? (
      <EmptyState title={tx("sales_customersEmpty")} description={tx("sales_customersEmptyHint")} action={newButton} />
    ) : (
      <EmptyState description={tx("noResults")} />
    );

  const facts = {
    customers: counts.all,
    withBoxesMoving: activeCount,
    arOver30Days: arCount,
  };

  return (
    <div className="cz-stack sales-page">
      <PageHeader
        title={tx("sales_customersTitle")}
        subtitle={head ? tx("sales_customersSub", { n: counts.all.toLocaleString(), b: activeCount.toLocaleString() }) : undefined}
        extra={
          <>
            <ViewSwitch value={view} onChange={setView} labels={{ cards: tx("viewCards"), list: tx("viewList") }} />
            <AiBriefCard
              title={tx("aiMgmtReport")}
              facts={facts}
              localFallback={`${counts.all} customers, ${activeCount} with boxes moving, ${arCount} with AR over 30 days.`}
            />
            <ImportButton entity="customers" />
            {newButton}
          </>
        }
      >
        <FilterBar
          tabs={{
            value: tab,
            onChange: (v) => setTab(v as Tab),
            options: [
              { value: "all", label: tx("sales_tabAll"), count: counts.all },
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
          count={head ? total : undefined}
        />
      </PageHeader>

      {view === "cards" ? (
        rows.length === 0 ? (
          empty
        ) : (
          <>
            <CardGrid min={300}>{rows.map(customerCard)}</CardGrid>
            <LoadMore left={total - rows.length} loading={cardsQ.isFetchingNextPage} onClick={() => void cardsQ.fetchNextPage()} />
          </>
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
      ) : null}
      {view === "list" && mobile ? <ListPager page={page} pageSize={PAGE} total={total} onChange={setPage} /> : null}
      {view === "list" && !mobile ? (
        <>
        <DataTable<Row>
          rowKey="id"
          columns={columns}
          dataSource={rows}
          loading={listQ.isLoading || (listQ.isFetching && listQ.isPlaceholderData)}
          pagination={false}
          onRowClick={open360}
          emptyText={!hasAny ? tx("sales_customersEmptyHint") : undefined}
          emptyAction={!hasAny ? newButton : undefined}
        />
        <ListPager page={page} pageSize={PAGE} total={total} onChange={setPage} />
        </>
      ) : null}

      <CustomerFormDrawer
        open={open}
        onClose={() => setOpen(false)}
        onSaved={(c) => navigate(`/customers/${c.id}`)}
      />
    </div>
  );
}
