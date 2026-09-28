import { Table } from "antd";
import type { TableProps } from "antd";
import { useStore } from "../../store";
import { EmptyState } from "./states.tsx";
import "./kit.css";

type Props<T> = Omit<TableProps<T>, "onRow"> & {
  /** Whole row becomes a link-like target (keyboard accessible via Enter). */
  onRowClick?: (row: T) => void;
  /** Empty-state copy when there are no rows at all. */
  emptyText?: string;
  emptyAction?: React.ReactNode;
  pageSize?: number;
};

/**
 * Standard list table: no toolbar clutter, readable row height, clickable rows,
 * horizontal scroll instead of squashed columns, friendly empty state.
 */
export function DataTable<T extends object>({
  onRowClick,
  emptyText,
  emptyAction,
  pageSize = 20,
  pagination,
  className,
  scroll,
  ...rest
}: Props<T>) {
  const { tx } = useStore();
  const rows = rest.dataSource?.length ?? 0;
  return (
    <div className={`cz-table${onRowClick ? " is-clickable" : ""}${className ? ` ${className}` : ""}`}>
      <Table<T>
        size="middle"
        scroll={scroll ?? { x: "max-content" }}
        pagination={
          pagination === false || rows <= pageSize
            ? false
            : { pageSize, showSizeChanger: false, hideOnSinglePage: true, ...(pagination || {}) }
        }
        locale={{ emptyText: <EmptyState description={emptyText ?? tx("noResults")} action={emptyAction} /> }}
        onRow={
          onRowClick
            ? (r) => ({
                tabIndex: 0,
                onClick: (e) => {
                  if ((e.target as HTMLElement).closest("a,button,input,.ant-select,.ant-checkbox")) return;
                  onRowClick(r);
                },
                onKeyDown: (e) => {
                  if (e.key === "Enter") onRowClick(r);
                },
              })
            : undefined
        }
        {...rest}
      />
    </div>
  );
}
