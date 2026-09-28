import { ArrowsLeftRight, Boat, FilePlus, PencilSimple, Plus } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Button, Select, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { searchRates, type RateSearchRow } from "../../api/commercial.ts";
import { useShellSupport } from "../../shell/supportStore.tsx";
import { useStore } from "../../store";
import { useMedia } from "../../ui/useMedia";
import {
  CardGrid,
  DataTable,
  EmptyState,
  EntityCard,
  ErrorState,
  Flag,
  IconBadge,
  LaneCell,
  LoadingState,
  PageHeader,
  Panel,
  RouteTrack,
  StatusTag,
  ViewSwitch,
  readView,
  writeView,
} from "../components";
import { useAppMode } from "../hooks/useAppMode.ts";
import { useCan } from "../hooks/useCan.ts";
import { RateFormDrawer } from "./RateFormDrawer.tsx";
import "./rate-form.css";
import { fmtDate, fmtMoney } from "../lib/format.ts";
import { queryKeys } from "../queries/keys.ts";
import { ContainerChip, DateChip, SalesMobileList } from "./SalesMobileList.tsx";
import { SALES_PORTS, fmtShortDate, placeCode, portName, uniqueSorted } from "./salesUtil.ts";
import "./sales.css";
import { ImportButton } from "./ImportButton.tsx";

const STANDARD_TYPES = ["20GP", "40GP", "40HC", "45HC", "20RF", "40RF"];

function useDebounced<T>(value: T, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function RatesPageV2() {
  const { shell, live } = useAppMode();
  const { tx, locale } = useStore();
  const support = useShellSupport();
  const navigate = useNavigate();
  const mobile = useMedia("(max-width: 640px)");
  const can = useCan();
  const canCreate = live && can("rate.create");
  const canEdit = live && can("rate.edit");
  /** Rate drawer: undefined = closed, null = add, string = edit that lane. */
  const [rateForm, setRateForm] = useState<string | null | undefined>(undefined);

  const [view, setViewState] = useState(() => readView("rates"));
  const setView = (v: "cards" | "list") => {
    setViewState(v);
    writeView("rates", v);
  };
  /** Port codes (UN/LOCODE) picked in the search panel. */
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [containerType, setContainerType] = useState<string | undefined>();

  const params = useDebounced(
    useMemo(() => {
      const p: Record<string, string> = {};
      if (origin.trim()) p.pol = origin.trim();
      if (destination.trim()) p.pod = destination.trim();
      if (containerType) p.containerType = containerType;
      return p;
    }, [origin, destination, containerType]),
  );

  const liveRates = useQuery({
    queryKey: queryKeys.rates.search(params),
    queryFn: () => searchRates(params),
    enabled: live,
  });

  const shellRows = useMemo<RateSearchRow[]>(
    () =>
      support.rates
        .filter(
          (r) =>
            (!params.pol || placeCode(r.origin) === params.pol) &&
            (!params.pod || placeCode(r.destination) === params.pod) &&
            (!params.containerType || r.containerType === params.containerType),
        )
        .map((r) => ({
          laneId: r.id,
          vendor: r.carrier,
          carrier: r.carrier,
          origin: r.origin,
          destination: r.destination,
          pol: "",
          pod: "",
          mode: "FCL",
          containerType: r.containerType,
          validFrom: r.validFrom,
          validUntil: r.validUntil,
          currency: r.currency,
          totalBuy: String(r.buyAmount),
          totalSell: String(r.sellAmount),
          margin: String(r.sellAmount - r.buyAmount),
          marginPct: r.sellAmount ? String(((r.sellAmount - r.buyAmount) / r.sellAmount) * 100) : "0",
          status: "ACTIVE" as const,
        })),
    [support.rates, params],
  );

  const rows: RateSearchRow[] = shell ? shellRows : (liveRates.data ?? []);
  const fromCode = (r: RateSearchRow) => r.pol || placeCode(r.origin) || "";
  const toCode = (r: RateSearchRow) => r.pod || placeCode(r.destination) || "";

  const portOptions = useMemo(() => {
    const codes = uniqueSorted([...SALES_PORTS.map((p) => p.code), ...rows.flatMap((r) => [fromCode(r), toCode(r)]), origin, destination]);
    return codes.map((code) => {
      const name =
        portName(code, locale) ?? rows.find((r) => fromCode(r) === code)?.origin ?? rows.find((r) => toCode(r) === code)?.destination ?? "";
      const def = SALES_PORTS.find((p) => p.code === code);
      return {
        value: code,
        search: [code, name, def?.zh, def?.th, def?.en, ...(def?.aliases ?? [])].filter(Boolean).join(" ").toLowerCase(),
        label: (
          <span className="sales-port-opt">
            <Flag code={code} size={20} />
            <strong>{code}</strong>
            {name ? <span>{name}</span> : null}
          </span>
        ),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, locale, origin, destination]);

  const portPicker = (value: string, onChange: (v: string) => void, placeholder: string, label: string) => (
    <Select
      showSearch
      allowClear
      size="large"
      aria-label={label}
      className="sales-port-select"
      placeholder={placeholder}
      value={value || undefined}
      onChange={(v) => onChange(v ?? "")}
      options={portOptions}
      filterOption={(input, opt) => Boolean(opt?.search.includes(input.trim().toLowerCase()))}
    />
  );
  const showBuy = rows.some((r) => r.totalBuy);
  const typeOptions = uniqueSorted([...STANDARD_TYPES, ...rows.map((r) => r.containerType)]).map((t) => ({ value: t, label: t }));
  const filtersOn = Boolean(origin || destination || containerType);

  function quoteFromRate(r: RateSearchRow) {
    const q = new URLSearchParams({
      origin: r.origin,
      destination: r.destination,
      ...(r.pol ? { pol: r.pol } : {}),
      ...(r.pod ? { pod: r.pod } : {}),
      ...(r.containerType ? { containerType: r.containerType } : {}),
      rateLaneId: r.laneId,
    });
    navigate(`/quotations/new?${q.toString()}`);
  }

  const validity = (r: RateSearchRow) => (
    <span className="sales-validity">
      <span className="cz-muted">
        {fmtDate(r.validFrom, locale)} – {fmtDate(r.validUntil, locale)}
      </span>
      {r.status !== "ACTIVE" ? (
        <StatusTag status={r.status} label={tx(`sales_rate_${r.status}`)} tone={r.status === "EXPIRED" ? "neutral" : "warning"} />
      ) : null}
    </span>
  );

  const marginPct = (r: RateSearchRow) => (r.marginPct ? `${Math.round(Number(r.marginPct) * 10) / 10}%` : null);

  const columns: ColumnsType<RateSearchRow> = [
    {
      title: tx("sales_colRoute"),
      key: "lane",
      render: (_, r) => (
        <LaneCell from={fromCode(r) || r.origin} to={toCode(r) || r.destination} title={`${r.origin} → ${r.destination}`} />
      ),
    },
    {
      title: tx("sales_colCarrier"),
      key: "carrier",
      render: (_, r) => (
        <>
          <span>{r.carrier || r.vendor}</span>
          <span className="cz-cell-sub">{r.containerType ?? "—"}</span>
        </>
      ),
    },
    { title: tx("sales_colValidity"), key: "valid", render: (_, r) => validity(r) },
    ...(showBuy
      ? [
          {
            title: tx("sales_colBuy"),
            key: "buy",
            align: "right" as const,
            className: "cz-num",
            render: (_: unknown, r: RateSearchRow) => (
              <span className="cz-muted">{r.totalBuy ? fmtMoney(r.totalBuy, r.currency, locale) : "—"}</span>
            ),
          },
        ]
      : []),
    {
      title: tx("sales_colSell"),
      key: "sell",
      align: "right",
      className: "cz-num",
      render: (_, r) => (
        <>
          <span className="sales-price">{r.totalSell ? fmtMoney(r.totalSell, r.currency, locale) : "—"}</span>
          {marginPct(r) ? (
            <span className="cz-cell-sub" title={tx("sales_colMargin")}>
              {tx("sales_colMargin")} {marginPct(r)}
            </span>
          ) : null}
        </>
      ),
    },
    {
      title: <span className="sr-only">{tx("sales_useInQuote")}</span>,
      key: "use",
      align: "right",
      render: (_, r) => (
        <span className="rt-row-actions">
          {canEdit ? (
            <Tooltip title={tx("rt_edit")}>
              <Button size="small" type="text" aria-label={tx("rt_edit")} icon={<PencilSimple size={16} aria-hidden />} onClick={() => setRateForm(r.laneId)} />
            </Tooltip>
          ) : null}
          <Button size="small" icon={<FilePlus size={16} aria-hidden />} onClick={() => quoteFromRate(r)} disabled={r.status === "EXPIRED"}>
            {tx("sales_useInQuote")}
          </Button>
        </span>
      ),
    },
  ];

  const rateCard = (r: RateSearchRow) => {
    const pct = r.marginPct ? Number(r.marginPct) : null;
    const expiring = r.status === "EXPIRING_SOON";
    const expired = r.status === "EXPIRED";
    return (
      <EntityCard
        key={r.laneId}
        tone={expiring ? "warning" : "default"}
        media={<IconBadge icon={Boat} tone={expired ? "neutral" : "primary"} size={36} />}
        title={r.carrier || r.vendor}
        subtitle={r.carrier && r.vendor && r.carrier !== r.vendor ? r.vendor : undefined}
        badge={
          <DateChip
            label={fmtShortDate(r.validUntil, locale)}
            tone={expired ? "danger" : expiring ? "warning" : undefined}
            title={`${tx("sales_colValidity")}: ${fmtDate(r.validFrom, locale)} – ${fmtDate(r.validUntil, locale)}`}
          />
        }
        footer={
          <>
            <ContainerChip type={r.containerType} />
            {canEdit ? (
              <Tooltip title={tx("rt_edit")}>
                <Button type="text" aria-label={tx("rt_edit")} icon={<PencilSimple size={16} aria-hidden />} onClick={() => setRateForm(r.laneId)} />
              </Tooltip>
            ) : null}
            <Button
              type={expired ? "default" : "primary"}
              ghost={!expired}
              icon={<FilePlus size={16} aria-hidden />}
              onClick={() => quoteFromRate(r)}
              disabled={expired}
            >
              {tx("sales_useInQuote")}
            </Button>
          </>
        }
      >
        <RouteTrack from={fromCode(r)} to={toCode(r)} fromName={r.origin} toName={r.destination} progress={null} size="sm" />
        <div className="sales-rate-money">
          <span className="sales-rate-sell">{r.totalSell ? fmtMoney(r.totalSell, r.currency, locale) : "—"}</span>
          {pct !== null ? (
            <Tooltip
              title={`${tx("sales_colMargin")} ${Math.round(pct * 10) / 10}%${r.totalBuy ? ` · ${tx("sales_colBuy")} ${fmtMoney(r.totalBuy, r.currency, locale)}` : ""}`}
            >
              <span className="sales-margin" aria-label={`${tx("sales_colMargin")} ${Math.round(pct)}%`}>
                <span className="sales-margin-track">
                  <span
                    className={pct < 5 ? "is-danger" : pct < 10 ? "is-warning" : "is-success"}
                    style={{ width: `${Math.min(100, (pct / 30) * 100)}%` }}
                  />
                </span>
                <span className="sales-margin-pct">{Math.round(pct)}%</span>
              </span>
            </Tooltip>
          ) : null}
        </div>
      </EntityCard>
    );
  };

  const emptyState = filtersOn ? (
    <EmptyState title={tx("sales_ratesEmpty")} description={tx("sales_ratesEmptyHint")} />
  ) : (
    <EmptyState
      description={tx("hp_emptyRates")}
      action={
        canCreate ? (
          <Button type="primary" icon={<Plus size={16} aria-hidden />} onClick={() => setRateForm(null)}>
            {tx("rt_add")}
          </Button>
        ) : (
          <Button type="primary" onClick={() => navigate("/quotations/new")}>
            {tx("hp_emptyRatesAction")}
          </Button>
        )
      }
    />
  );

  return (
    <div className="cz-stack sales-page">
      <PageHeader
        title={tx("sales_ratesTitle")}
        subtitle={tx("sales_ratesSubShort")}
        extra={
          <>
            <ViewSwitch value={view} onChange={setView} labels={{ cards: tx("viewCards"), list: tx("viewList") }} />
            <ImportButton entity="rates" />
            {canCreate ? (
              <Button type="primary" icon={<Plus size={16} aria-hidden />} onClick={() => setRateForm(null)}>
                {tx("rt_add")}
              </Button>
            ) : null}
          </>
        }
      />
      {canCreate || canEdit ? (
        <RateFormDrawer
          open={rateForm !== undefined}
          laneId={rateForm}
          portOptions={portOptions}
          containerTypes={STANDARD_TYPES}
          onClose={() => setRateForm(undefined)}
          onSaved={(lane) => {
            setOrigin(lane.pol);
            setDestination(lane.pod);
            setContainerType(lane.containerType);
          }}
        />
      ) : null}

      {!shell && !live ? (
        <Panel>
          <EmptyState title={tx("sales_ratesOffline")} />
        </Panel>
      ) : (
        <>
          <Panel>
            <form className="sales-rate-search" role="search" onSubmit={(e) => e.preventDefault()}>
              <label className="sales-field">
                <span>{tx("sales_fOrigin")}</span>
                {portPicker(origin, setOrigin, tx("sales_pickPort"), tx("sales_fOrigin"))}
              </label>
              <Tooltip title={tx("sales_swap")}>
                <Button
                  className="sales-swap"
                  type="text"
                  size="large"
                  aria-label={tx("sales_swap")}
                  icon={<ArrowsLeftRight size={20} aria-hidden />}
                  onClick={() => {
                    setOrigin(destination);
                    setDestination(origin);
                  }}
                />
              </Tooltip>
              <label className="sales-field">
                <span>{tx("sales_fDestination")}</span>
                {portPicker(destination, setDestination, tx("sales_pickPort"), tx("sales_fDestination"))}
              </label>
              <label className="sales-field sales-field--type">
                <span>{tx("sales_fContainer")}</span>
                <Select
                  allowClear
                  size="large"
                  placeholder={tx("sales_allContainers")}
                  value={containerType}
                  onChange={(v) => setContainerType(v ?? undefined)}
                  options={typeOptions}
                />
              </label>
              <div className="sales-rate-clear">
                {filtersOn ? (
                  <button
                    type="button"
                    className="cz-link-btn"
                    onClick={() => {
                      setOrigin("");
                      setDestination("");
                      setContainerType(undefined);
                    }}
                  >
                    {tx("clearFilters")}
                  </button>
                ) : (
                  <span className="cz-filter-count">{tx("sales_ratesCount", { n: rows.length })}</span>
                )}
              </div>
            </form>
          </Panel>

          {live && liveRates.isError ? (
            <Panel>
              <ErrorState
                title={tx("sales_ratesError")}
                action={<Button onClick={() => void liveRates.refetch()}>{tx("sales_retry")}</Button>}
              />
            </Panel>
          ) : view === "cards" ? (
            live && liveRates.isLoading ? (
              <LoadingState />
            ) : rows.length === 0 ? (
              emptyState
            ) : (
              <CardGrid min={300}>{rows.map(rateCard)}</CardGrid>
            )
          ) : mobile ? (
            <SalesMobileList
              empty={emptyState}
              rows={rows.map((r) => ({
                key: r.laneId,
                title: <LaneCell from={fromCode(r) || r.origin} to={toCode(r) || r.destination} />,
                status: <span className="sales-price">{r.totalSell ? fmtMoney(r.totalSell, r.currency, locale) : "—"}</span>,
                sub: [r.carrier || r.vendor, r.containerType, fmtDate(r.validUntil, locale)].filter(Boolean).join(" · "),
                actions: (
                  <Button
                    type="text"
                    aria-label={tx("sales_useInQuote")}
                    icon={<FilePlus size={18} aria-hidden />}
                    onClick={() => quoteFromRate(r)}
                    disabled={r.status === "EXPIRED"}
                  />
                ),
              }))}
            />
          ) : (
            <DataTable<RateSearchRow>
              rowKey="laneId"
              loading={live && liveRates.isFetching}
              columns={columns}
              dataSource={rows}
              emptyText={tx("sales_ratesEmpty")}
              emptyAction={
                filtersOn ? (
                  <Button
                    onClick={() => {
                      setOrigin("");
                      setDestination("");
                      setContainerType(undefined);
                    }}
                  >
                    {tx("clearFilters")}
                  </Button>
                ) : undefined
              }
            />
          )}
        </>
      )}
    </div>
  );
}
