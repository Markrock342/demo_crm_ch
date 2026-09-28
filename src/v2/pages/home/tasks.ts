import { useCallback, useMemo } from "react";
import { useShellSupport } from "../../../shell/supportStore.tsx";
import { useIsShellMode } from "../../../shell/session.tsx";
import { useStore } from "../../../store";
import { daysAgo, parseLooseDate } from "./attention.ts";
import { localizeDemo } from "../../lib/demoText.ts";

export type DueBucket = "overdue" | "today" | "later";

export type TaskRow = {
  id: string;
  /** Title in the UI language (sample text translated; typed text as-is). */
  title: string;
  /** Title as stored — kept for search. */
  titleRaw: string;
  done: boolean;
  due: Date | null;
  /** Legacy due strings may carry a time ("09-02 16:00"). */
  hasTime: boolean;
  bucket: DueBucket;
  customerId?: string;
  jobId?: string;
  boxId?: string;
  owner?: string;
  high: boolean;
};

/** Tasks for the current mode (shell support store or the legacy local store), normalized. */
export function useModeTasks() {
  const shell = useIsShellMode();
  const store = useStore();
  const support = useShellSupport();

  const tasks: TaskRow[] = useMemo(() => {
    if (shell) {
      return support.tasks.map((t) => ({
        id: t.id,
        title: localizeDemo(t.title, store.locale),
        titleRaw: t.title,
        done: t.done,
        due: null,
        hasTime: false,
        bucket: "later" as const,
        customerId: t.customerId,
        jobId: t.jobId,
        high: t.priority === "high",
      }));
    }
    return store.tasks.map((t) => {
      const due = parseLooseDate(t.due);
      const ago = daysAgo(due);
      const bucket: DueBucket = ago === null ? "later" : ago > 0 ? "overdue" : ago === 0 ? "today" : "later";
      return {
        id: t.id,
        title: localizeDemo(t.title, store.locale),
        titleRaw: t.title,
        done: t.done,
        due,
        hasTime: /\d{2}:\d{2}/.test(t.due),
        bucket,
        customerId: t.customerId,
        boxId: t.boxId,
        owner: t.owner,
        high: t.priority === "high",
      };
    });
  }, [shell, store.tasks, store.locale, support.tasks]);

  const toggle = useCallback(
    (id: string) => {
      if (shell) support.toggleTask(id);
      else store.toggleTask(id);
    },
    [shell, store, support],
  );

  const add = useCallback(
    (input: { title: string; customerId?: string; jobId?: string; high?: boolean }) => {
      if (shell) {
        support.addTask({
          title: input.title,
          customerId: input.customerId,
          jobId: input.jobId,
          priority: input.high ? "high" : "normal",
        });
      } else {
        store.addTask(input.title, input.customerId);
      }
    },
    [shell, store, support],
  );

  return { tasks, toggle, add, shell };
}
