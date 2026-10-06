import { ArrowSquareOut, Boat, LinkSimple, MagnifyingGlass, ShippingContainer, Ticket, Warning } from "@phosphor-icons/react";
import { Button, Input } from "antd";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { CaseDto, LookupHit } from "../../../api/cases.ts";
import { useStore } from "../../../store";
import { LoadingState, Panel, RouteTrack, StageFlow, progressBetween, type StageKey } from "../../components";
import { useCan } from "../../hooks/useCan.ts";
import { useShipmentLookup } from "../../hooks/useCases.ts";
import { STAGE_KEYS, fmtShortDate } from "../jobsShared.ts";

const KIND_ICON = { container: ShippingContainer, job: Boat, booking: Ticket } as const;

/** Debounced value (typing in the lookup box shouldn't fire a request per key). */
function useDebounced<T>(v: T, ms = 300) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

export function linkPatchFor(h: LookupHit) {
  return {
    jobId: h.jobId ?? undefined,
    containerNo: h.containerNo ?? undefined,
    bookingId: !h.jobId && h.bookingId ? h.bookingId : undefined,
  };
}

/** Read-only shipment status (container / job / booking) to answer "where is my cargo?", with "link to case". */
export function StatusLookupPanel({
  kase,
  onLink,
  linking,
}: {
  kase: CaseDto;
  onLink?: (h: LookupHit) => void;
  linking?: boolean;
}) {
  const { tx, locale } = useStore();
  const can = useCan();
  const initial = kase.containerNo ?? kase.jobNumber ?? kase.bookingNumber ?? "";
  const [q, setQ] = useState(initial);
  useEffect(() => setQ(initial), [initial]);
  const needle = useDebounced(q);
  const res = useShipmentLookup(needle);
  const stageLabels = Object.fromEntries(STAGE_KEYS.map((k) => [k, tx(`stage_${k}`)])) as Record<StageKey, string>;

  const isLinked = (h: LookupHit) =>
    (h.kind === "container" && h.containerNo === kase.containerNo) ||
    (h.kind === "job" && h.jobId === kase.jobId) ||
    (h.kind === "booking" && h.bookingId === kase.bookingId);

  return (
    <Panel title={tx("cs_lookup")}>
      <Input
        allowClear
        prefix={<MagnifyingGlass size={16} aria-hidden />}
        placeholder={tx("cs_lookup_ph")}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label={tx("cs_lookup")}
      />
      <div className="cs-lookup-results" aria-live="polite">
        {needle.trim().length < 2 ? (
          <p className="cs-quiet">{tx("cs_lookup_hint")}</p>
        ) : res.isLoading ? (
          <LoadingState />
        ) : !res.data?.length ? (
          <p className="cs-quiet">{tx("cs_lookup_empty")}</p>
        ) : (
          res.data.slice(0, 4).map((h) => {
            const I = KIND_ICON[h.kind];
            const done = h.stage >= 5;
            const linked = isLinked(h);
            return (
              <article key={`${h.kind}:${h.ref}`} className={`cs-hit${h.problem ? " is-problem" : ""}`}>
                <header className="cs-hit-head">
                  <I size={18} weight="duotone" aria-hidden />
                  <strong className="cz-mono">{h.ref}</strong>
                  {h.problem ? (
                    <span className="cs-hit-flag">
                      <Warning size={14} weight="fill" aria-hidden />
                      {h.status === "hold" ? tx("cs_on_hold") : tx("cs_late")}
                    </span>
                  ) : null}
                  {h.kind === "job" && h.containers.length ? <span className="cs-quiet">{tx("cs_boxes", { n: h.containers.length })}</span> : null}
                </header>
                <StageFlow current={done ? STAGE_KEYS.length : h.stage} labels={stageLabels} problem={h.problem} size="sm" />
                {h.pol || h.pod ? (
                  <RouteTrack
                    size="sm"
                    from={h.pol}
                    to={h.pod}
                    progress={done ? 100 : progressBetween(h.etd, h.eta)}
                    fromDate={h.etd ? `${tx("cs_etd")} ${fmtShortDate(h.etd, locale)}` : undefined}
                    toDate={h.eta ? `${tx("cs_eta")} ${fmtShortDate(h.eta, locale)}` : undefined}
                    delayed={h.problem}
                    done={done}
                  />
                ) : null}
                {h.vessel ? (
                  <p className="cs-hit-vessel">
                    <Boat size={14} weight="fill" aria-hidden />
                    {h.vessel}
                    {h.voyage ? ` ${h.voyage}` : ""}
                  </p>
                ) : null}
                <footer className="cs-hit-actions">
                  {h.jobId && can("shipment.view") ? (
                    <Link to={`/jobs/${h.jobId}`} className="cz-link-btn">
                      <ArrowSquareOut size={14} aria-hidden />
                      {tx("cs_open_job")}
                    </Link>
                  ) : (
                    <span />
                  )}
                  {onLink ? (
                    linked ? (
                      <span className="cs-linked">
                        <LinkSimple size={14} aria-hidden />
                        {tx("cs_linked")}
                      </span>
                    ) : (
                      <Button size="small" icon={<LinkSimple size={14} />} loading={linking} onClick={() => onLink(h)}>
                        {tx("cs_link_case")}
                      </Button>
                    )
                  ) : null}
                </footer>
              </article>
            );
          })
        )}
      </div>
    </Panel>
  );
}
