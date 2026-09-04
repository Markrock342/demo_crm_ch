import { Typography } from "antd";

type Props = {
  amount: number;
  currency?: string;
  locale?: string;
  strong?: boolean;
};

export function Money({ amount, currency = "USD", locale = "en-US", strong }: Props) {
  const text = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

  if (strong) {
    return (
      <Typography.Text strong style={{ fontVariantNumeric: "tabular-nums" }}>
        {text}
      </Typography.Text>
    );
  }

  return <span style={{ fontVariantNumeric: "tabular-nums" }}>{text}</span>;
}
