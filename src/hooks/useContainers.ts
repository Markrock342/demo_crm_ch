import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createContainerApi,
  fetchContainers,
  patchContainerApi,
  type ContainerDto,
} from "../api/operations.ts";
import { useAuth } from "../auth/AuthProvider.tsx";
import { withBox, type ContainerRecord } from "../lib/containers.ts";
import type { Box, BoxStatus } from "../data.ts";
import { useStore } from "../store.tsx";

type YardOpts = { yardOnly?: boolean };

export function useContainers(opts?: YardOpts) {
  const { mode, user } = useAuth();
  const { boxes: demoBoxes, addBox, setBoxStatus, moveBox, flash, tx } = useStore();
  const isDemo = mode === "demo";
  const [records, setRecords] = useState<ContainerRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (isDemo || !user) return;
    setLoading(true);
    setErr(null);
    try {
      const rows = await fetchContainers(opts?.yardOnly ? { yard: true } : undefined);
      setRecords(rows.map(withBox));
    } catch {
      setErr("errorLoad");
    } finally {
      setLoading(false);
    }
  }, [isDemo, opts?.yardOnly, user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const idMap = useMemo(() => new Map(records.map((r) => [r.box.id, r])), [records]);

  const boxes: Box[] = isDemo
    ? opts?.yardOnly
      ? demoBoxes.filter((b) => b.status === "yard" || b.status === "empty" || b.status === "hold")
      : demoBoxes
    : records.map((r) => r.box);

  const apiAddBox = useCallback(
    async (b: Pick<Box, "id" | "customerId" | "type" | "dir" | "status" | "yardZh" | "eta" | "bl" | "teu">) => {
      if (isDemo) return addBox(b);
      try {
        await createContainerApi({
          customerId: b.customerId,
          containerNo: b.id,
          type: b.type,
          direction: b.dir,
          status: b.status,
          bl: b.bl,
          yardCode: b.yardZh,
          teu: b.teu,
        });
        await reload();
        flash("savedBox");
        return null;
      } catch {
        return "errorBox";
      }
    },
    [addBox, flash, isDemo, reload],
  );

  const apiSetStatus = useCallback(
    async (containerNo: string, status: BoxStatus) => {
      if (isDemo) {
        setBoxStatus(containerNo, status);
        return;
      }
      const rec = idMap.get(containerNo);
      if (!rec) return;
      await patchContainerApi(rec.id, { status });
      await reload();
      flash("statusChanged");
    },
    [flash, idMap, isDemo, reload, setBoxStatus],
  );

  const apiMoveBox = useCallback(
    async (containerNo: string, yard: string) => {
      if (isDemo) {
        moveBox(containerNo, yard);
        return;
      }
      const rec = idMap.get(containerNo);
      if (!rec) return;
      await patchContainerApi(rec.id, { yardCode: yard });
      await reload();
      flash("movedYard");
    },
    [flash, idMap, isDemo, moveBox, reload],
  );

  return {
    boxes,
    loading,
    err: err ? tx(err) : null,
    isDemo,
    isApi: !isDemo && !!user,
    reload,
    addBox: apiAddBox,
    setBoxStatus: apiSetStatus,
    moveBox: apiMoveBox,
    containerIdFor: (containerNo: string) => idMap.get(containerNo)?.id ?? null,
  };
}

export type { ContainerDto };
