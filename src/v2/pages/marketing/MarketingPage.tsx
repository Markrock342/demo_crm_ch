import { ChartPieSlice, UsersFour } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Button, DatePicker, Segmented } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useSearchParams } from "react-router-dom";
import { fetchMarketingOverview, type Period, type RangeQuery } from "../../../api/marketing.ts";
import { useStore } from "../../../store";
import { ErrorState, LoadingState, PageHeader } from "../../components";
import { fmtDate } from "../../lib/format.ts";
import { MarketingOverviewTab, OverviewTiles } from "./MarketingOverview.tsx";
import { SegmentsTab } from "./SegmentsTab.tsx";
import "./marketing.css";

const PERIODS: Period[] = ["month", "quarter", "year", "custom"];
type Tab = "overview" | "segments";
const isYmd = (v: string | null): v is string => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));

/** /reports/marketing — marketing analytics for the Marketing team (funnel, sources, pipeline, segments). */
export function MarketingPage() {
  const { tx, locale } = useStore();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("tab") === "segments" ? "segments" : "overview";
  const rawPeriod = params.get("period") as Period | null;
  const period: Period = rawPeriod && PERIODS.includes(rawPeriod) ? rawPeriod : "month";
  const from = params.get("from");
  const to = params.get("to");
  const range: RangeQuery = period === "custom" && isYmd(from) && isYmd(to) ? { period, from, to } : { period: period === "custom" ? "month" : period };

  const patch = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };

  const overview = useQuery({
    queryKey: ["marketing", "overview", range],
    queryFn: () => fetchMarketingOverview(range),
    enabled: tab === "overview",
    staleTime: 30_000,
  });

  const shown = overview.data?.range;
  const subtitle = tab === "overview" && shown ? `${fmtDate(`${shown.from}T00:00:00`, locale)} – ${fmtDate(`${shown.to}T00:00:00`, locale)}` : undefined;

  const pickerValue: [Dayjs, Dayjs] | null = isYmd(from) && isYmd(to) ? [dayjs(from), dayjs(to)] : null;

  return (
    <div className="cz-stack mk-page">
      <PageHeader
        title={tx("mk_title")}
        subtitle={subtitle}
        extra={
          tab === "overview" ? (
            <div className="mk-head-controls">
              <Segmented
                value={period}
                onChange={(v) => patch({ period: v === "month" ? null : String(v), ...(v === "custom" ? {} : { from: null, to: null }) })}
                options={PERIODS.map((p) => ({ value: p, label: tx(`mk_period_${p}`) }))}
              />
              {period === "custom" ? (
                <DatePicker.RangePicker
                  value={pickerValue}
                  allowClear={false}
                  disabledDate={(d) => d.isAfter(dayjs(), "day")}
                  onChange={(v) => {
                    if (v?.[0] && v[1]) patch({ from: v[0].format("YYYY-MM-DD"), to: v[1].format("YYYY-MM-DD") });
                  }}
                  aria-label={tx("mk_period_custom")}
                />
              ) : null}
            </div>
          ) : undefined
        }
      >
        <Segmented
          value={tab}
          onChange={(v) => patch({ tab: v === "overview" ? null : String(v) })}
          options={[
            { value: "overview", label: tx("mk_tabOverview"), icon: <ChartPieSlice size={15} aria-hidden /> },
            { value: "segments", label: tx("mk_tabSegments"), icon: <UsersFour size={15} aria-hidden /> },
          ]}
          style={{ width: "fit-content" }}
        />
        {tab === "overview" && overview.data ? <OverviewTiles data={overview.data} /> : null}
      </PageHeader>

      {tab === "segments" ? (
        <SegmentsTab />
      ) : overview.isLoading ? (
        <LoadingState />
      ) : overview.isError || !overview.data ? (
        <ErrorState
          title={tx("mk_error")}
          action={
            <Button type="primary" onClick={() => void overview.refetch()}>
              {tx("mk_retry")}
            </Button>
          }
        />
      ) : (
        <MarketingOverviewTab data={overview.data} />
      )}
    </div>
  );
}
