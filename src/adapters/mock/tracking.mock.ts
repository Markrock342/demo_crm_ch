import type { TrackingPort, TrackingSnapshot } from "../../ports/tracking.port.ts";
import { mapLegacyBoxStatus, type ShellBoxStatus } from "../../ports/ops.port.ts";

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

const CYCLE: ShellBoxStatus[] = [
  "gate_in",
  "loaded",
  "in_transit",
  "arrived",
  "customs",
  "do_ready",
  "delivered",
];

export const trackingMock: TrackingPort = {
  async refresh(input) {
    const h = hash(input.containerNo + (input.bl || ""));
    const status = CYCLE[h % CYCLE.length]!;
    const dayShift = (h % 5) + 1;
    const base = input.currentEta && input.currentEta !== "—" ? new Date(input.currentEta) : new Date();
    if (Number.isNaN(base.getTime())) base.setTime(Date.now());
    const etaDate = new Date(base.getTime() + dayShift * 86400000);
    const eta = etaDate.toISOString().slice(0, 10);
    const lfd = new Date(etaDate.getTime() + 5 * 86400000).toISOString().slice(0, 10);
    const snap: TrackingSnapshot = {
      containerNo: input.containerNo,
      status,
      eta,
      vessel: `MOCK-${(h % 90) + 10}`,
      carrier: h % 2 === 0 ? "COSCO" : "MSC",
      lastFreeDay: lfd,
      provider: "mock",
      events: [
        { at: new Date().toISOString(), code: status, note: "mock refresh" },
        { at: new Date(Date.now() - 86400000).toISOString(), code: "gate_in", note: "prior" },
      ],
    };
    return snap;
  },
};

export function snapshotStatusToShell(raw: string): ShellBoxStatus {
  return mapLegacyBoxStatus(raw);
}
