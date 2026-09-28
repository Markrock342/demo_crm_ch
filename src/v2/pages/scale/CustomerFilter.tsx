import { useQuery } from "@tanstack/react-query";
import { Select } from "antd";
import { useState } from "react";
import { searchCustomers } from "../../../api/lists.ts";
import { customerName, type Customer } from "../../../data";
import { useStore } from "../../../store";
import { useDebounced } from "./useDebounced.ts";

/**
 * Customer filter that searches the server (works with thousands of customers,
 * unlike a preloaded option list). `label` names the current value when it isn't in the results.
 */
export function CustomerFilter({
  value,
  onChange,
  placeholder,
  label,
  width = 200,
}: {
  value: string | undefined;
  onChange: (id: string | undefined, name?: string) => void;
  placeholder: string;
  label?: string;
  width?: number;
}) {
  const { tx, locale } = useStore();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const dq = useDebounced(q, 250);
  const res = useQuery({
    queryKey: ["customers", "search", dq],
    queryFn: () => searchCustomers(dq, 20),
    enabled: open,
    staleTime: 60_000,
  });
  const name = (c: Customer) => customerName(c, locale) || c.nameEn || c.nameZh || c.nameTh;
  const options = (res.data ?? []).map((c) => ({ value: c.id, label: name(c) }));
  if (value && !options.some((o) => o.value === value)) options.unshift({ value, label: label || value });
  return (
    <Select
      allowClear
      showSearch
      filterOption={false}
      value={value}
      placeholder={placeholder}
      aria-label={tx("sc_customer")}
      onSearch={setQ}
      onOpenChange={setOpen}
      loading={res.isFetching}
      onChange={(v, opt) => onChange(v ?? undefined, (opt as { label?: string } | undefined)?.label)}
      options={options}
      notFoundContent={res.isFetching ? null : undefined}
      style={{ minWidth: width, maxWidth: "100%" }}
    />
  );
}
