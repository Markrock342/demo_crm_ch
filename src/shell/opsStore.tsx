import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ShellBox, ShellBoxDir, ShellBoxStatus, ShellDemurrageRisk, ShellShipment, ShellShipmentStatus } from "../ports/ops.port.ts";
import { loadPersisted, savePersisted } from "./persist.ts";
import { LCS_BOXES, LCS_SHIPMENTS } from "./seedLcs.ts";

const STORAGE_KEY = "cangzhan-shell-ops-v3";
const VERSION = 3;

export const YARD_SLOTS = ["A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4", "C1", "C2", "C3", "C4"] as const;
export type YardSlot = (typeof YARD_SLOTS)[number];

type OpsSnapshot = {
  boxes: ShellBox[];
  shipments: ShellShipment[];
};

function yardLabel(slot: string) {
  return {
    yardZh: `林查班 ${slot}`,
    yardTh: `แหลมฉบัง ${slot}`,
    yardEn: `Laem Chabang ${slot}`,
  };
}

function seedOps(): OpsSnapshot {
  return { boxes: LCS_BOXES, shipments: LCS_SHIPMENTS };
}

function loadInitial(): OpsSnapshot {
  return loadPersisted<OpsSnapshot>(STORAGE_KEY, VERSION) ?? seedOps();
}

type ShellOpsValue = {
  boxes: ShellBox[];
  shipments: ShellShipment[];
  addBox: (input: {
    id: string;
    customerId: string;
    type: string;
    dir: ShellBoxDir;
    status: ShellBoxStatus;
    slot?: string;
    bl: string;
    teu: number;
    shipmentId?: string;
  }) => string | null;
  setBoxStatus: (id: string, status: ShellBoxStatus) => void;
  patchBox: (
    id: string,
    patch: Partial<Pick<ShellBox, "seal" | "freeTimeDays" | "lastFreeDay" | "demurrageRisk" | "status">>,
  ) => void;
  moveBox: (id: string, slot: YardSlot) => void;
  addShipment: (input: {
    customerId: string;
    bookingNo: string;
    bl: string;
    vessel: string;
    voyage: string;
    carrier: string;
    pol: string;
    pod: string;
    etd: string;
    eta: string;
    teu: number;
    jobId?: string;
  }) => string | null;
  setShipmentStatus: (id: string, status: ShellShipmentStatus) => void;
  linkBoxToShipment: (boxId: string, shipmentId: string) => void;
  createShipmentFromJob: (input: {
    jobId: string;
    customerId: string;
    pol: string;
    pod: string;
    teu: number;
  }) => string;
};

const OpsCtx = createContext<ShellOpsValue | null>(null);

export function ShellOpsProvider({ children }: { children: ReactNode }) {
  const [boxes, setBoxes] = useState<ShellBox[]>(() => loadInitial().boxes);
  const [shipments, setShipments] = useState<ShellShipment[]>(() => loadInitial().shipments);

  useEffect(() => {
    savePersisted(STORAGE_KEY, VERSION, { boxes, shipments });
  }, [boxes, shipments]);

  const addBox = useCallback(
    (input: {
      id: string;
      customerId: string;
      type: string;
      dir: ShellBoxDir;
      status: ShellBoxStatus;
      slot?: string;
      bl: string;
      teu: number;
      shipmentId?: string;
    }) => {
      const id = input.id.trim().toUpperCase();
      if (!id || !input.customerId) return "errorName";
      if (boxes.some((b) => b.id === id)) return "errorName";
      const slot = input.slot && YARD_SLOTS.includes(input.slot as YardSlot) ? input.slot : "A1";
      const labels = yardLabel(slot);
      setBoxes((list) => [
        {
          id,
          customerId: input.customerId,
          shipmentId: input.shipmentId,
          type: input.type.trim() || "40HC",
          dir: input.dir,
          status: input.status,
          ...labels,
          eta: "—",
          teu: input.teu || 1,
          bl: input.bl.trim() || "—",
          seal: "",
          freeTimeDays: 7,
          lastFreeDay: "—",
          demurrageRisk: "none" as ShellDemurrageRisk,
        },
        ...list,
      ]);
      return null;
    },
    [boxes],
  );

  const setBoxStatus = useCallback((id: string, status: ShellBoxStatus) => {
    setBoxes((list) => list.map((b) => (b.id === id ? { ...b, status } : b)));
  }, []);

  const patchBox = useCallback(
    (id: string, patch: Partial<Pick<ShellBox, "seal" | "freeTimeDays" | "lastFreeDay" | "demurrageRisk" | "status">>) => {
      setBoxes((list) => list.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    },
    [],
  );

  const moveBox = useCallback((id: string, slot: YardSlot) => {
    const labels = yardLabel(slot);
    setBoxes((list) => list.map((b) => (b.id === id ? { ...b, ...labels, status: b.status === "empty" ? "empty" : "yard" } : b)));
  }, []);

  const addShipment = useCallback(
    (input: {
      customerId: string;
      bookingNo: string;
      bl: string;
      vessel: string;
      voyage: string;
      carrier: string;
      pol: string;
      pod: string;
      etd: string;
      eta: string;
      teu: number;
      jobId?: string;
    }) => {
      if (!input.customerId || !input.bookingNo.trim()) return "errorName";
      const id = `ssh${Date.now()}`;
      setShipments((list) => [
        {
          id,
          customerId: input.customerId,
          jobId: input.jobId,
          bookingNo: input.bookingNo.trim(),
          bl: input.bl.trim() || input.bookingNo.trim(),
          vessel: input.vessel.trim() || "—",
          voyage: input.voyage.trim() || "—",
          carrier: input.carrier.trim() || "—",
          pol: input.pol.trim() || "CNSHA",
          pod: input.pod.trim() || "THLCH",
          etd: input.etd.trim() || "—",
          eta: input.eta.trim() || "—",
          teu: input.teu || 1,
          status: "booking",
          mode: "FCL",
        },
        ...list,
      ]);
      return null;
    },
    [],
  );

  const setShipmentStatus = useCallback((id: string, status: ShellShipmentStatus) => {
    setShipments((list) => list.map((s) => (s.id === id ? { ...s, status } : s)));
  }, []);

  const linkBoxToShipment = useCallback((boxId: string, shipmentId: string) => {
    const ship = shipments.find((s) => s.id === shipmentId);
    setBoxes((list) =>
      list.map((b) =>
        b.id === boxId
          ? {
              ...b,
              shipmentId,
              bl: ship?.bl ?? b.bl,
              vessel: ship?.vessel ?? b.vessel,
              pol: ship?.pol ?? b.pol,
              pod: ship?.pod ?? b.pod,
              customerId: ship?.customerId ?? b.customerId,
            }
          : b,
      ),
    );
  }, [shipments]);

  const createShipmentFromJob = useCallback(
    (input: { jobId: string; customerId: string; pol: string; pod: string; teu: number }) => {
      const id = `ssh${Date.now()}`;
      const bookingNo = `JOB-${input.jobId.slice(-4)}-${String(Date.now()).slice(-4)}`;
      setShipments((list) => [
        {
          id,
          customerId: input.customerId,
          jobId: input.jobId,
          bookingNo,
          bl: bookingNo,
          vessel: "TBN",
          voyage: "TBN",
          carrier: "TBN",
          pol: input.pol || "CNSHA",
          pod: input.pod || "THLCH",
          etd: "—",
          eta: "—",
          teu: input.teu || 1,
          status: "booking",
          mode: "FCL",
        },
        ...list,
      ]);
      return id;
    },
    [],
  );

  const value = useMemo(
    () => ({
      boxes,
      shipments,
      addBox,
      setBoxStatus,
      patchBox,
      moveBox,
      addShipment,
      setShipmentStatus,
      linkBoxToShipment,
      createShipmentFromJob,
    }),
    [boxes, shipments, addBox, setBoxStatus, patchBox, moveBox, addShipment, setShipmentStatus, linkBoxToShipment, createShipmentFromJob],
  );

  return <OpsCtx.Provider value={value}>{children}</OpsCtx.Provider>;
}

export function useShellOps() {
  const ctx = useContext(OpsCtx);
  if (!ctx) throw new Error("useShellOps");
  return ctx;
}
