import { ClockCountdown } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { App, Button, DatePicker, Tooltip } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useState } from "react";
import type { Locale } from "../../../i18n";
import { patchJobCutoffs, type Cutoffs } from "../../../api/bookings.ts";
import { useStore } from "../../../store";
import { queryKeys } from "../../queries/keys.ts";
import "./fields.css";

/*
 * SI / VGM / CY cut-offs: coloured pills for cards (amber ≤ 48h, red once passed)
 * and a three-picker editor for booking / job drawers.
 */

export const CUTOFF_KEYS = ["siCutoff", "vgmCutoff", "cyCutoff"] as const;
export type CutoffKey = (typeof CUTOFF_KEYS)[number];
const SHORT: Record<CutoffKey, string> = { siCutoff: "SI", vgmCutoff: "VGM", cyCutoff: "CY" };
const LABEL: Record<CutoffKey, string> = { siCutoff: "fd_cut_si", vgmCutoff: "fd_cut_vgm", cyCutoff: "fd_cut_cy" };

const intlLocale: Record<Locale, string> = { zh: "zh-CN", th: "th-TH-u-ca-gregory", en: "en-GB" };
const HOUR = 3_600_000;

export type CutoffTone = "danger" | "warning" | "neutral";

/** Tone + hours left (negative once passed). */
export function cutoffState(iso: string | null | undefined, now = Date.now()): { tone: CutoffTone; hours: number } | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const hours = (t - now) / HOUR;
  return { tone: hours < 0 ? "danger" : hours <= 48 ? "warning" : "neutral", hours };
}

export function fmtCutoff(iso: string, locale: Locale) {
  return new Intl.DateTimeFormat(intlLocale[locale], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

/** "5h" / "2d" — compact time distance for a pill. */
function span(hours: number, tx: (k: string, v?: Record<string, string | number>) => string) {
  const h = Math.abs(hours);
  return h < 48 ? tx("fd_hours", { n: Math.max(1, Math.round(h)) }) : tx("fd_days", { n: Math.round(h / 24) });
}

/** Key that changes whenever the saved cut-offs change (resets an editor's draft). */
export const cutoffKey = (v: Partial<Cutoffs>) => CUTOFF_KEYS.map((k) => v[k] ?? "").join("|");

/** Worst tone across the cut-offs (for card tone / sorting). */
export function worstCutoff(v: Partial<Cutoffs>): CutoffTone | null {
  let worst: CutoffTone | null = null;
  for (const k of CUTOFF_KEYS) {
    const s = cutoffState(v[k]);
    if (!s) continue;
    if (s.tone === "danger") return "danger";
    if (s.tone === "warning") worst = "warning";
    else if (!worst) worst = "neutral";
  }
  return worst;
}

/** Card pills: SI · VGM · CY with time left / passed; only the ones that are set. */
export function CutoffChips({ values }: { values: Partial<Cutoffs> }) {
  const { tx, locale } = useStore();
  const set = CUTOFF_KEYS.filter((k) => cutoffState(values[k]));
  if (!set.length) return null;
  return (
    <span className="fd-cuts" aria-label={tx("fd_cutoffs")}>
      <ClockCountdown size={15} weight="duotone" aria-hidden className="fd-cuts-icon" />
      {set.map((k) => {
        const s = cutoffState(values[k])!;
        const when = span(s.hours, tx);
        return (
          <Tooltip key={k} title={`${tx(LABEL[k])} · ${fmtCutoff(values[k]!, locale)}`}>
            <span className={`fd-cut is-${s.tone}`}>
              <b>{SHORT[k]}</b>
              <span>{s.hours < 0 ? `−${when}` : when}</span>
            </span>
          </Tooltip>
        );
      })}
    </span>
  );
}

/** Three date-time pickers + save. `onSave` receives ISO strings (null = cleared). Re-key it (cutoffKey) when saved values change. */
export function CutoffEditor({
  values,
  onSave,
  saving,
  disabled,
}: {
  values: Partial<Cutoffs>;
  onSave: (next: Cutoffs) => void;
  saving?: boolean;
  disabled?: boolean;
}) {
  const { tx, locale } = useStore();
  const toDay = (v?: string | null) => (v ? dayjs(v) : null);
  const [draft, setDraft] = useState<Record<CutoffKey, Dayjs | null>>({
    siCutoff: toDay(values.siCutoff),
    vgmCutoff: toDay(values.vgmCutoff),
    cyCutoff: toDay(values.cyCutoff),
  });
  const dirty = CUTOFF_KEYS.some((k) => (draft[k]?.toISOString() ?? null) !== (values[k] ? new Date(values[k]!).toISOString() : null));

  return (
    <div className="fd-cut-editor">
      {CUTOFF_KEYS.map((k) => {
        const s = cutoffState(draft[k]?.toISOString());
        return (
          <label key={k} className="fd-cut-row">
            <span className={`fd-cut is-${s?.tone ?? "neutral"}${s ? "" : " is-empty"}`}>
              <b>{SHORT[k]}</b>
            </span>
            <span className="fd-cut-name">{tx(LABEL[k])}</span>
            <DatePicker
              showTime={{ format: "HH:mm", minuteStep: 15 }}
              format={(d) => fmtCutoff(d.toISOString(), locale)}
              value={draft[k]}
              disabled={disabled}
              aria-label={tx(LABEL[k])}
              onChange={(d) => setDraft((prev) => ({ ...prev, [k]: d }))}
              className="fd-cut-picker"
            />
          </label>
        );
      })}
      {disabled ? null : (
        <div className="fd-cut-actions">
          <Button
            type="primary"
            size="small"
            loading={saving}
            disabled={!dirty}
            onClick={() =>
              onSave({
                siCutoff: draft.siCutoff?.toISOString() ?? null,
                vgmCutoff: draft.vgmCutoff?.toISOString() ?? null,
                cyCutoff: draft.cyCutoff?.toISOString() ?? null,
              })
            }
          >
            {tx("fd_save")}
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Job detail panel: shows and edits a job's cut-offs (PATCH /api/jobs/:id/cutoffs).
 * Mount it in the job page with the job row from GET /api/jobs/:id.
 */
export function JobCutoffsPanel({ jobId, values, canEdit }: { jobId: string; values: Partial<Cutoffs>; canEdit: boolean }) {
  const { tx } = useStore();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: (next: Cutoffs) => patchJobCutoffs(jobId, next),
    onSuccess: async () => {
      message.success(tx("fd_saved"));
      await qc.invalidateQueries({ queryKey: queryKeys.jobs.detail(jobId) });
      await qc.invalidateQueries({ queryKey: ["bookings"] });
    },
    onError: () => message.error(tx("fd_saveFailed")),
  });
  return (
    <section className="fd-panel" aria-label={tx("fd_cutoffs")}>
      <h3 className="fd-panel-h">
        <ClockCountdown size={18} weight="duotone" aria-hidden />
        {tx("fd_cutoffs")}
      </h3>
      <CutoffEditor key={cutoffKey(values)} values={values} disabled={!canEdit} saving={save.isPending} onSave={(v) => save.mutate(v)} />
    </section>
  );
}
