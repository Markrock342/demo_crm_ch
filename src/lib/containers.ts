import type { ContainerDto } from "../api/operations.ts";
import type { Box, BoxStatus, Direction } from "../data.ts";

function formatEta(iso: string | null): string {
  if (!iso) return "";
  const d = iso.slice(0, 10);
  const [, m, day] = d.split("-");
  return m && day ? `${m}-${day}` : d;
}

export function containerToBox(row: ContainerDto): Box {
  const yard = row.yardCode ?? "";
  return {
    id: row.containerNo,
    customerId: row.customerId,
    shipmentId: row.jobId ?? undefined,
    type: row.type,
    dir: row.direction as Direction,
    status: row.status as BoxStatus,
    yardZh: yard,
    yardTh: yard,
    yardEn: yard,
    eta: formatEta(row.eta),
    teu: row.teu,
    bl: row.bl ?? "",
    vessel: row.vessel ?? undefined,
    pol: row.pol ?? undefined,
    pod: row.pod ?? undefined,
    seal: row.seal ?? undefined,
    commodity: row.commodity ?? undefined,
  };
}

export type ContainerRecord = ContainerDto & { box: Box };

export function withBox(row: ContainerDto): ContainerRecord {
  return { ...row, box: containerToBox(row) };
}
