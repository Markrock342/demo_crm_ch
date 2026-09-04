import { Tag } from "antd";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "default",
  OPEN: "processing",
  BOOKED: "blue",
  IN_TRANSIT: "geekblue",
  ARRIVED: "cyan",
  DELIVERED: "green",
  CLOSED: "default",
  PAID: "green",
  OVERDUE: "red",
  WAIT: "orange",
  LATE: "red",
  risk: "red",
  watch: "orange",
};

type Props = {
  status: string;
  label?: string;
};

export function StatusTag({ status, label }: Props) {
  const key = status.toUpperCase().replace(/\s+/g, "_");
  const color = STATUS_COLORS[key] ?? STATUS_COLORS[status] ?? "default";
  return <Tag color={color}>{label ?? status}</Tag>;
}
