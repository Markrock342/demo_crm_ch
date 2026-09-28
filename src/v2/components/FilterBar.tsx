import { MagnifyingGlass, X } from "@phosphor-icons/react";
import { Input, Segmented, Select } from "antd";
import type { ReactNode } from "react";
import { useStore } from "../../store";
import "./kit.css";

export type FilterOption = { value: string; label: string; count?: number };

type SelectFilter = {
  key: string;
  placeholder: string;
  value: string | undefined;
  options: FilterOption[];
  onChange: (v: string | undefined) => void;
  width?: number;
};

type Props = {
  search?: { value: string; onChange: (v: string) => void; placeholder?: string };
  /** Primary status switch — shown as a segmented control. Keep it to ≤6 options. */
  tabs?: { value: string; options: FilterOption[]; onChange: (v: string) => void };
  selects?: SelectFilter[];
  /** Shown when any filter is active. */
  onClear?: () => void;
  /** Result count shown at the right. */
  count?: number;
  extra?: ReactNode;
};

/** One-row filter bar: search, a status switch, a few selects, clear, count. */
export function FilterBar({ search, tabs, selects, onClear, count, extra }: Props) {
  const { tx } = useStore();
  const active = Boolean(search?.value) || (tabs && tabs.value !== (tabs.options[0]?.value ?? "")) || selects?.some((s) => s.value);

  return (
    <div className="cz-filter-bar">
      {tabs ? (
        <Segmented
          value={tabs.value}
          onChange={(v) => tabs.onChange(String(v))}
          options={tabs.options.map((o) => ({
            value: o.value,
            label: (
              <span className="cz-seg-label">
                {o.label}
                {o.count !== undefined ? <span className="cz-seg-count">{o.count}</span> : null}
              </span>
            ),
          }))}
        />
      ) : null}
      {search ? (
        <Input
          className="cz-filter-search"
          allowClear
          prefix={<MagnifyingGlass size={16} aria-hidden />}
          placeholder={search.placeholder ?? tx("filterSearch")}
          value={search.value}
          onChange={(e) => search.onChange(e.target.value)}
        />
      ) : null}
      {selects?.map((s) => (
        <Select
          key={s.key}
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder={s.placeholder}
          value={s.value}
          onChange={(v) => s.onChange(v ?? undefined)}
          options={s.options}
          style={{ minWidth: s.width ?? 170 }}
        />
      ))}
      {active && onClear ? (
        <button type="button" className="cz-link-btn" onClick={onClear}>
          <X size={14} aria-hidden />
          {tx("clearFilters")}
        </button>
      ) : null}
      <div className="cz-filter-end">
        {extra}
        {count !== undefined ? <span className="cz-filter-count">{tx("resultsCount", { n: count })}</span> : null}
      </div>
    </div>
  );
}
