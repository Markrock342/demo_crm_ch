/* Goods with photos: picker tiles for the customer form, thumbnails for cards, photo chips for the profile. */
import { Check } from "@phosphor-icons/react";
import { Select, Tooltip } from "antd";
import { useStore } from "../../store";
import { GOODS, goodsPreset } from "../lib/goods.ts";
import "./photos.css";

/** Photo tiles (click toggles that label) above the free-text tags input. Value = commodities as typed. */
export function GoodsPicker({ value = [], onChange, placeholder }: { value?: string[]; onChange?: (v: string[]) => void; placeholder?: string }) {
  const { tx, locale } = useStore();
  const onKeys = new Set(value.map((v) => goodsPreset(v)?.key).filter(Boolean));
  const toggle = (key: string, label: string) =>
    onChange?.(onKeys.has(key) ? value.filter((v) => goodsPreset(v)?.key !== key) : [...value, label]);
  return (
    <div className="ph-goods">
      <div className="ph-goods-grid" role="group" aria-label={tx("ph_goods")}>
        {GOODS.map((g) => {
          const on = onKeys.has(g.key);
          const label = g.labels[locale];
          return (
            <button key={g.key} type="button" aria-pressed={on} className={`ph-goods-tile${on ? " is-on" : ""}`} onClick={() => toggle(g.key, label)}>
              <img src={g.image} alt="" width={96} height={96} loading="lazy" decoding="async" />
              {on ? (
                <span className="ph-goods-check" aria-hidden>
                  <Check size={12} weight="bold" />
                </span>
              ) : null}
              <span title={label}>{label}</span>
            </button>
          );
        })}
      </div>
      <Select
        mode="tags"
        value={value}
        onChange={(v: string[]) => onChange?.(v)}
        tokenSeparators={[",", "，", "、"]}
        placeholder={placeholder}
        open={false}
        suffixIcon={null}
        aria-label={tx("ph_goods")}
      />
    </div>
  );
}

/** Up to `max` goods photos + "+n" (commodities without a photo only count in "+n"). */
export function GoodsThumbs({ items, max = 3 }: { items: readonly string[] | null | undefined; max?: number }) {
  const list = items ?? [];
  const seen = new Set<string>();
  const shown: { label: string; image: string }[] = [];
  for (const label of list) {
    const g = goodsPreset(label);
    if (!g || seen.has(g.key) || shown.length >= max) continue;
    seen.add(g.key);
    shown.push({ label, image: g.image });
  }
  if (!shown.length) return null;
  const more = list.length - shown.length;
  return (
    <Tooltip title={list.join(" · ")}>
      <span className="ph-thumbs">
        {shown.map((s) => (
          <img key={s.image} className="ph-thumb" src={s.image} alt={s.label} width={28} height={28} loading="lazy" decoding="async" />
        ))}
        {more > 0 ? <span className="ph-thumb-more">+{more}</span> : null}
      </span>
    </Tooltip>
  );
}

/** One chip per commodity, with its photo when it matches a preset. */
export function GoodsChips({ items }: { items: readonly string[] }) {
  return (
    <>
      {items.map((t) => {
        const img = goodsPreset(t)?.image;
        return (
          <span key={t} className={`ph-goods-chip${img ? "" : " is-plain"}`}>
            {img ? <img src={img} alt="" width={32} height={32} loading="lazy" decoding="async" /> : null}
            {t}
          </span>
        );
      })}
    </>
  );
}
