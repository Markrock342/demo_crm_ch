/**
 * Goods presets with a photo (public/demo/goods-*.webp) for the customer commodities picker and thumbnails.
 * Customers keep commodities as free text, so `goodsPreset()` matches any language / synonym (case-insensitive, contains).
 */
type Locale = "zh" | "th" | "en";

export type GoodsPreset = { key: string; image: string; labels: Record<Locale, string>; synonyms: string[] };

const preset = (key: string, labels: Record<Locale, string>, synonyms: string[]): GoodsPreset => ({
  key,
  image: `/demo/goods-${key}.webp`,
  labels,
  synonyms,
});

export const GOODS: readonly GoodsPreset[] = [
  preset("rubber", { th: "ยางพารา", en: "Rubber", zh: "橡胶" }, ["rubber", "latex", "ยางแผ่น", "น้ำยาง", "天然橡胶", "胶乳"]),
  preset("frozen", { th: "อาหารแช่แข็ง", en: "Frozen food", zh: "冷冻食品" }, ["frozen", "seafood", "shrimp", "แช่แข็ง", "อาหารทะเล", "冷冻", "冻品", "海鲜"]),
  preset("furniture", { th: "เฟอร์นิเจอร์", en: "Furniture", zh: "家具" }, ["furniture", "เฟอร์นิเจอร์", "家具"]),
  preset("rice", { th: "ข้าว", en: "Rice", zh: "大米" }, ["rice", "ข้าวสาร", "ข้าวหอมมะลิ", "大米", "稻米", "香米"]),
  preset("chemicals", { th: "เคมีภัณฑ์", en: "Chemicals", zh: "化工品" }, ["chemical", "resin", "เคมี", "化工", "化学"]),
  preset("fruit", { th: "ผลไม้", en: "Fruit", zh: "水果" }, ["fruit", "durian", "longan", "mango", "ผลไม้", "ทุเรียน", "ลำไย", "มังคุด", "มะม่วง", "水果", "榴莲", "龙眼", "芒果"]),
  preset("electronics", { th: "อิเล็กทรอนิกส์", en: "Electronics", zh: "电子产品" }, ["electronic", "pcb", "อิเล็กทรอนิกส์", "电子"]),
  preset("auto-parts", { th: "ชิ้นส่วนรถยนต์", en: "Auto parts", zh: "汽车配件" }, ["auto part", "car part", "spare part", "ชิ้นส่วนรถ", "อะไหล่", "汽配", "汽车配件", "汽车零件"]),
  preset("sugar", { th: "น้ำตาล", en: "Sugar", zh: "糖" }, ["sugar", "น้ำตาล", "อ้อย", "白糖", "砂糖", "蔗糖", "甘蔗"]),
  preset("garments", { th: "สิ่งทอ เสื้อผ้า", en: "Garments & textiles", zh: "纺织服装" }, ["garment", "textile", "apparel", "clothing", "fabric", "สิ่งทอ", "เสื้อผ้า", "ผ้า", "纺织", "服装", "棉纱", "布料"]),
];

const ascii = /^[\x20-\x7e]+$/;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Every term of a preset → a test. Latin terms match at a word start ("rice" ≠ "price"); Thai / Chinese terms match anywhere. */
const MATCHERS = GOODS.map((g) => {
  const terms = [...Object.values(g.labels), ...g.synonyms].map((t) => t.trim().toLowerCase()).filter(Boolean);
  return {
    g,
    tests: terms.map((t) => (ascii.test(t) ? (s: string) => new RegExp(`(^|[^a-z])${escape(t)}`).test(s) : (s: string) => s.includes(t))),
  };
});

const cache = new Map<string, GoodsPreset | null>();

/** The preset a free-text commodity label belongs to (any language / synonym), or undefined. */
export function goodsPreset(label: string | null | undefined): GoodsPreset | undefined {
  const s = (label ?? "").trim().toLowerCase();
  if (!s) return undefined;
  let hit = cache.get(s);
  if (hit === undefined) {
    hit = MATCHERS.find((m) => m.tests.some((test) => test(s)))?.g ?? null;
    cache.set(s, hit);
  }
  return hit ?? undefined;
}

/** Photo URL for a commodity label, or null when it matches no preset. */
export const goodsImage = (label: string | null | undefined): string | null => goodsPreset(label)?.image ?? null;
