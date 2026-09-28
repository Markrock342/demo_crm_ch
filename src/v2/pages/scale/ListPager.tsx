import { Pagination } from "antd";
import { useStore } from "../../../store";
import "./scale.css";

/** Server-side pager under a list: "51–100 / 5,000" + page buttons. Hidden when everything fits. */
export function ListPager({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const { tx } = useStore();
  if (total <= pageSize) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="sc-pager">
      <span className="sc-pager-count">{tx("sc_showing", { shown: `${from}–${to}`, total: total.toLocaleString() })}</span>
      <Pagination simple={{ readOnly: false }} current={page} pageSize={pageSize} total={total} showSizeChanger={false} onChange={onChange} />
    </div>
  );
}

/** "Load more" row under a card list / board column. */
export function LoadMore({ left, loading, onClick }: { left: number; loading?: boolean; onClick: () => void }) {
  const { tx } = useStore();
  if (left <= 0) return null;
  return (
    <button type="button" className="sc-more" onClick={onClick} disabled={loading} aria-busy={loading}>
      {loading ? "…" : tx("sc_loadMore")}
      <span className="sc-more-n">{tx("sc_moreLeft", { n: left.toLocaleString() })}</span>
    </button>
  );
}
