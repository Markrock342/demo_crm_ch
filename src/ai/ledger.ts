import type { Box, Customer } from "../data";
import type { Locale } from "../i18n";

export function ledgerPayload(locale: Locale, customers: Customer[], boxes: Box[]) {
  return {
    locale,
    customers: customers.map((c) => ({
      id: c.id,
      name: locale === "th" ? c.nameTh : locale === "en" ? c.nameEn : c.nameZh,
      lane: locale === "th" ? c.laneTh : locale === "en" ? c.laneEn : c.laneZh,
    })),
    boxes: boxes.map((b) => ({
      id: b.id,
      customerId: b.customerId,
      status: b.status,
      bl: b.bl,
      dir: b.dir,
      type: b.type,
    })),
  };
}
