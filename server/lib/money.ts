import { Decimal } from "decimal.js";

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export type MoneyInput = string | number | Decimal;

export function d(v: MoneyInput): Decimal {
  return v instanceof Decimal ? v : new Decimal(v || 0);
}

export function add(...vals: MoneyInput[]): Decimal {
  return vals.reduce<Decimal>((acc, v) => acc.plus(d(v)), new Decimal(0));
}

export function sub(a: MoneyInput, b: MoneyInput): Decimal {
  return d(a).minus(d(b));
}

export function mul(a: MoneyInput, b: MoneyInput): Decimal {
  return d(a).times(d(b));
}

export function div(a: MoneyInput, b: MoneyInput): Decimal {
  const denom = d(b);
  if (denom.isZero()) return new Decimal(0);
  return d(a).dividedBy(denom);
}

export function marginPct(totalSell: MoneyInput, totalBuy: MoneyInput): Decimal {
  const sell = d(totalSell);
  const buy = d(totalBuy);
  if (sell.isZero()) return new Decimal(0);
  return sell.minus(buy).dividedBy(sell).times(100);
}

export function grossProfit(totalSell: MoneyInput, totalBuy: MoneyInput): Decimal {
  return d(totalSell).minus(d(totalBuy));
}

export function toDb(v: MoneyInput): string {
  return d(v).toFixed(4);
}

export function toDisplay(v: MoneyInput, dp = 2): string {
  return d(v).toFixed(dp);
}

export function sumField<T>(rows: T[], pick: (r: T) => MoneyInput): Decimal {
  return rows.reduce((acc, r) => acc.plus(d(pick(r))), new Decimal(0));
}
