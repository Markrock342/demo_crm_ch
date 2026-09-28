import { Select } from "antd";
import { useCallback } from "react";
import { useStore } from "../../store";
import { PersonAvatar } from "../components";
import { useDemoText } from "../lib/useDemoText.ts";
import { userDisplayName, useUserLookup } from "../hooks/useUserLookup.ts";
import "./ops/fields.css";

/*
 * Staff owner for leads / deals: a picker over GET /api/users (with avatars) and a
 * resolver that prefers the user record and falls back to the legacy owner text.
 */

export type OwnedRow = { ownerUserId?: string | null; owner?: string | null };

export function useOwnerName() {
  const { users, nameOf } = useUserLookup();
  const { locale } = useStore();
  const dt = useDemoText();
  return useCallback(
    (row: OwnedRow) => {
      if (row.ownerUserId) {
        const u = users.find((x) => x.id === row.ownerUserId);
        if (u) return userDisplayName(u, locale);
        return nameOf(row.ownerUserId, dt(row.owner ?? "") || "");
      }
      const text = row.owner && row.owner !== "—" ? row.owner : "";
      return text ? dt(text) : "";
    },
    [dt, locale, nameOf, users],
  );
}

/** Owner key for filters: the user id when known, else the legacy text. */
export const ownerKey = (row: OwnedRow) => row.ownerUserId || (row.owner && row.owner !== "—" ? `name:${row.owner}` : "");

export function OwnerSelect({
  value,
  onChange,
  id,
  allowClear = true,
}: {
  value?: string | null;
  onChange?: (v: string | null) => void;
  id?: string;
  allowClear?: boolean;
}) {
  const { tx, locale } = useStore();
  const { users, loading } = useUserLookup();
  return (
    <Select
      id={id}
      showSearch
      allowClear={allowClear}
      loading={loading}
      placeholder={tx("fd_pickOwner")}
      value={value ?? undefined}
      onChange={(v) => onChange?.((v as string | undefined) ?? null)}
      optionFilterProp="search"
      options={users.map((u) => {
        const name = userDisplayName(u, locale);
        return {
          value: u.id,
          search: `${name} ${u.name} ${u.nameZh ?? ""} ${u.nameTh ?? ""} ${u.email}`,
          label: (
            <span className="fd-owner-opt">
              <PersonAvatar name={name} size={22} />
              {name}
            </span>
          ),
        };
      })}
    />
  );
}

/** Menu items (for a Dropdown submenu) to reassign the owner. */
export function useOwnerMenu() {
  const { users } = useUserLookup();
  const { locale } = useStore();
  return users.map((u) => {
    const name = userDisplayName(u, locale);
    return {
      key: `owner:${u.id}`,
      label: (
        <span className="fd-owner-opt">
          <PersonAvatar name={name} size={20} />
          {name}
        </span>
      ),
    };
  });
}
