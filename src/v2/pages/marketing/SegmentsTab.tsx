import {
  ArrowRight,
  Briefcase,
  Buildings,
  ClockCounterClockwise,
  DownloadSimple,
  Factory,
  MapPin,
  Package,
  Phone,
  UserCircle,
  UsersThree,
  type Icon,
} from "@phosphor-icons/react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { App, Button, Input, Select } from "antd";
import { useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  downloadSegmentCsv,
  fetchSegment,
  fetchSegmentOptions,
  type Recency,
  type SegmentFilter,
  type Size,
} from "../../../api/marketing.ts";
import { useStore } from "../../../store";
import { EmptyState, Flag, Panel, PersonAvatar } from "../../components";
import { fmtNumber, fmtRelativeDay } from "../../lib/format.ts";
import { customerName, LanePair, ownerName } from "./mkShared.tsx";

const RECENCY: Recency[] = ["d30", "d90", "dormant", "never"];
const SIZES: Size[] = ["none", "small", "medium", "large"];
const PAGE = 30;

/** URL param ↔ filter field. Kept short so a segment link can be shared. */
const PARAM: Record<keyof SegmentFilter, string> = {
  pol: "pol",
  pod: "pod",
  businessType: "bt",
  industry: "ind",
  owner: "own",
  recency: "rec",
  size: "size",
  q: "q",
};

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="mk-chip" aria-pressed={active} onClick={onClick}>
      {children}
    </button>
  );
}

function FilterGroup({ icon: I, label, children }: { icon: Icon; label: string; children: ReactNode }) {
  return (
    <div className="mk-filter" role="group" aria-label={label}>
      <span className="mk-filter-label">
        <I size={15} aria-hidden />
        {label}
      </span>
      {children}
    </div>
  );
}

export function SegmentsTab() {
  const { tx, locale } = useStore();
  const { message } = App.useApp();
  const [params, setParams] = useSearchParams();
  const [pages, setPages] = useState(1);
  const [busy, setBusy] = useState(false);

  const filter: SegmentFilter = useMemo(() => {
    const f: SegmentFilter = {};
    for (const [k, p] of Object.entries(PARAM) as [keyof SegmentFilter, string][]) {
      const v = params.get(p);
      if (v) (f as Record<string, string>)[k] = v;
    }
    return f;
  }, [params]);

  const set = (k: keyof SegmentFilter, v: string | undefined) => {
    const next = new URLSearchParams(params);
    if (v) next.set(PARAM[k], v);
    else next.delete(PARAM[k]);
    setParams(next, { replace: true });
    setPages(1);
  };
  const toggle = (k: keyof SegmentFilter, v: string) => set(k, filter[k] === v ? undefined : v);
  const active = (Object.keys(PARAM) as (keyof SegmentFilter)[]).some((k) => filter[k]);
  const clear = () => {
    const next = new URLSearchParams(params);
    for (const p of Object.values(PARAM)) next.delete(p);
    setParams(next, { replace: true });
    setPages(1);
  };

  const opts = useQuery({ queryKey: ["marketing", "segment-options"], queryFn: fetchSegmentOptions, staleTime: 60_000 });
  const seg = useQuery({
    queryKey: ["marketing", "segment", filter, pages],
    queryFn: () => fetchSegment(filter, { limit: PAGE * pages }),
    placeholderData: keepPreviousData,
  });

  async function exportCsv() {
    setBusy(true);
    try {
      const n = await downloadSegmentCsv(filter, locale);
      if (n) message.success(tx("mk_exportDone", { n }));
      else message.info(tx("mk_exportNone"));
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const o = opts.data;
  const portOption = (code: string) => ({
    value: code,
    label: (
      <span className="mk-opt">
        <Flag code={code} size={16} />
        {code}
      </span>
    ),
    search: code,
  });
  const total = seg.data?.total ?? 0;
  const reachable = seg.data?.reachable ?? 0;
  const items = seg.data?.items ?? [];

  return (
    <div className="mk-seg-layout">
      <Panel
        title={tx("mk_filters")}
        extra={
          active ? (
            <button type="button" className="cz-link-btn" onClick={clear}>
              {tx("clearFilters")}
            </button>
          ) : undefined
        }
      >
        <div className="mk-filters">
          <Input.Search
            allowClear
            placeholder={tx("mk_search")}
            defaultValue={filter.q}
            onSearch={(v) => set("q", v.trim() || undefined)}
            aria-label={tx("mk_search")}
          />
          <FilterGroup icon={MapPin} label={`${tx("mk_seg_pol")} → ${tx("mk_seg_pod")}`}>
            <div className="mk-lane-pick">
              <Select
                allowClear
                showSearch
                placeholder={tx("mk_seg_pol")}
                aria-label={tx("mk_seg_pol")}
                value={filter.pol}
                onChange={(v) => set("pol", v ?? undefined)}
                options={(o?.pols ?? []).map(portOption)}
                optionFilterProp="search"
              />
              <ArrowRight size={14} aria-hidden />
              <Select
                allowClear
                showSearch
                placeholder={tx("mk_seg_pod")}
                aria-label={tx("mk_seg_pod")}
                value={filter.pod}
                onChange={(v) => set("pod", v ?? undefined)}
                options={(o?.pods ?? []).map(portOption)}
                optionFilterProp="search"
              />
            </div>
          </FilterGroup>
          {o?.businessTypes.length ? (
            <FilterGroup icon={Briefcase} label={tx("mk_seg_type")}>
              <div className="mk-chips">
                {o.businessTypes.map((bt) => {
                  const k = `cust_bt_${bt}`;
                  const label = tx(k);
                  return (
                    <Chip key={bt} active={filter.businessType === bt} onClick={() => toggle("businessType", bt)}>
                      {label === k ? bt : label}
                    </Chip>
                  );
                })}
              </div>
            </FilterGroup>
          ) : null}
          {o?.industries.length ? (
            <FilterGroup icon={Factory} label={tx("mk_seg_industry")}>
              <Select
                allowClear
                showSearch
                placeholder={tx("mk_seg_any")}
                aria-label={tx("mk_seg_industry")}
                value={filter.industry}
                onChange={(v) => set("industry", v ?? undefined)}
                options={o.industries.map((i) => ({ value: i, label: i }))}
              />
            </FilterGroup>
          ) : null}
          <FilterGroup icon={ClockCounterClockwise} label={tx("mk_seg_recency")}>
            <div className="mk-chips">
              {RECENCY.map((r) => (
                <Chip key={r} active={filter.recency === r} onClick={() => toggle("recency", r)}>
                  {tx(`mk_rec_${r}`)}
                </Chip>
              ))}
            </div>
          </FilterGroup>
          <FilterGroup icon={Package} label={tx("mk_seg_size")}>
            <div className="mk-chips">
              {SIZES.map((s) => (
                <Chip key={s} active={filter.size === s} onClick={() => toggle("size", s)}>
                  {tx(`mk_size_${s}`)}
                </Chip>
              ))}
            </div>
          </FilterGroup>
          {o?.owners.length ? (
            <FilterGroup icon={UserCircle} label={tx("mk_seg_owner")}>
              <div className="mk-chips">
                {o.owners.map((ow) => {
                  const name = ownerName(ow, locale, tx("mk_unassigned"));
                  return (
                    <Chip key={ow.key} active={filter.owner === ow.key} onClick={() => toggle("owner", ow.key)}>
                      <PersonAvatar name={name} size={20} />
                      {name}
                    </Chip>
                  );
                })}
              </div>
            </FilterGroup>
          ) : null}
        </div>
      </Panel>

      <Panel>
        <div className="mk-result-head">
          <div className="mk-result-count" aria-live="polite">
            <strong>{fmtNumber(total, locale)}</strong>
            <span>
              <Buildings size={15} aria-hidden />
              {tx("mk_seg_count", { n: fmtNumber(total, locale) })}
            </span>
            <span>
              <UsersThree size={15} aria-hidden />
              {tx("mk_seg_reachable", { n: fmtNumber(reachable, locale) })}
            </span>
          </div>
          <Button type="primary" icon={<DownloadSimple size={16} />} loading={busy} disabled={!reachable} onClick={() => void exportCsv()}>
            {tx("mk_export")}
          </Button>
        </div>
        {seg.isLoading ? null : items.length ? (
          <>
            <ul className="mk-seg-list">
              {items.map((r) => {
                const name = customerName(r, locale);
                const owner = ownerName(r.owner, locale, tx("mk_unassigned"));
                return (
                  <li key={r.id}>
                    <Link to={`/customers/${r.id}`} className="mk-seg-row">
                      <PersonAvatar name={name} size={34} />
                      <span className="mk-seg-main">
                        <span className="mk-seg-name">{name}</span>
                        <span className="mk-seg-meta">
                          {r.lane ? <LanePair pol={r.lane.pol} pod={r.lane.pod} /> : null}
                          {r.contact ? (
                            <span title={[r.contact.email, r.contact.phone].filter(Boolean).join(" · ")}>
                              <Phone size={13} aria-hidden />
                              {r.contact.name}
                            </span>
                          ) : (
                            <span>{tx("mk_noContact")}</span>
                          )}
                        </span>
                      </span>
                      <span className="mk-seg-side">
                        <span className={`mk-jobs-chip${r.jobs ? "" : " is-zero"}`}>{tx("mk_jobsN", { n: r.jobs })}</span>
                        <span>{r.lastAt ? fmtRelativeDay(r.lastAt, locale) : tx("mk_rec_never")}</span>
                        <span className="mk-opt" title={owner}>
                          <PersonAvatar name={owner} size={18} />
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            {items.length < total ? (
              <div className="mk-more">
                <Button loading={seg.isFetching} onClick={() => setPages((p) => p + 1)}>
                  {tx("mk_loadMore")}
                </Button>
              </div>
            ) : null}
          </>
        ) : (
          <div style={{ paddingTop: 16 }}>
            <EmptyState
              title={tx("mk_segEmpty")}
              description={tx("mk_segEmptyDesc")}
              action={
                active ? (
                  <Button onClick={clear}>
                    {tx("clearFilters")}
                  </Button>
                ) : undefined
              }
            />
          </div>
        )}
      </Panel>
    </div>
  );
}
