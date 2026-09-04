import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Col, Row, Space } from "antd";
import { useAuth } from "../../auth/AuthProvider";
import { customerName, type Customer } from "../../data";
import { useShellCrm } from "../../shell/crmStore.tsx";
import { useShellJobs } from "../../shell/jobStore.tsx";
import { useIsShellMode } from "../../shell/session.tsx";
import { useStore } from "../../store";
import { JobsProTable } from "../components/JobsProTable.tsx";
import { PageHeader } from "../components/PageHeader.tsx";
import { AiBriefCard } from "../components/AiBriefCard.tsx";
import { ErrorState, LoadingState } from "../components/states.tsx";
import { useLiveJobsList } from "../hooks/useJobs.ts";

type StatusFilter = "all" | "OPEN" | "IN_PROGRESS" | "CLOSED";
type BillingFilter = "all" | "UNBILLED" | "INVOICED" | "PARTIAL" | "PAID";

export function JobsPageV2() {
  const shell = useIsShellMode();
  const { mode, user } = useAuth();
  const live = !shell && mode === "production" && Boolean(user);
  const { tx, locale, query } = useStore();
  const crm = useShellCrm();
  const jobStore = useShellJobs();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const liveQuery = useLiveJobsList(undefined, undefined);
  const rows = shell ? jobStore.jobs : (liveQuery.data ?? []);
  const loading = live && liveQuery.isLoading;
  const error = live && liveQuery.isError ? (liveQuery.error instanceof Error ? liveQuery.error.message : "load_failed") : null;

  const [status, setStatus] = useState<StatusFilter>("all");
  const [billing, setBilling] = useState<BillingFilter>("all");
  const [delayedOnly, setDelayedOnly] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [milestoneFilter, setMilestoneFilter] = useState<"all" | "at_risk">("all");

  useEffect(() => {
    const selected = params.get("selected");
    if (selected && rows.some((j) => j.id === selected)) {
      navigate(`/jobs/${selected}`, { replace: true });
    }
  }, [params, navigate, rows]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    return rows.filter((j) => {
      if (status !== "all" && j.status !== status) return false;
      if (billing !== "all" && j.billingStatus !== billing) return false;
      if (delayedOnly && !j.delayed) return false;
      if (customerId && j.customerId !== customerId) return false;
      if (milestoneFilter === "at_risk" && !j.delayed) return false;
      const c = crm.customers.find((x) => x.id === j.customerId);
      const blob = `${j.jobNumber} ${j.shipper} ${j.consignee} ${j.carrier} ${j.salesOwner} ${j.opsOwner} ${j.origin} ${j.destination} ${j.pol} ${j.pod} ${c ? customerName(c as Customer, locale) : ""}`.toLowerCase();
      return !q || blob.includes(q);
    });
  }, [billing, crm.customers, customerId, delayedOnly, locale, milestoneFilter, q, rows, status]);

  const hint = shell ? tx("shellDataBadge") : live ? tx("liveApiBadge") : tx("apiNotConfigured");

  const fleetFacts = {
    visibleJobs: filtered.length,
    delayed: filtered.filter((j) => j.delayed).length,
    open: filtered.filter((j) => j.status === "OPEN").length,
    inProgress: filtered.filter((j) => j.status === "IN_PROGRESS").length,
    unbilled: filtered.filter((j) => j.billingStatus === "UNBILLED").length,
  };
  const fleetLocal = `Fleet view: ${filtered.length} jobs shown, ${fleetFacts.delayed} delayed, ${fleetFacts.unbilled} unbilled.`;

  if (!shell && !live) {
    return (
      <div style={{ padding: 24 }}>
        <PageHeader title={tx("jobsTitle")} subtitle={tx("apiNotConfigured")} />
        <Alert type="info" message={tx("jobConnectApi")} />
      </div>
    );
  }

  const filterBar = (
    <Space wrap size="small">
      {(["all", "OPEN", "IN_PROGRESS", "CLOSED"] as const).map((s) => (
        <Button key={s} size="small" type={status === s ? "primary" : "default"} onClick={() => setStatus(s)}>
          {s === "all" ? tx("filterAll") : s}
        </Button>
      ))}
      {(["all", "UNBILLED", "INVOICED", "PARTIAL", "PAID"] as const).map((b) => (
        <Button key={b} size="small" type={billing === b ? "primary" : "default"} onClick={() => setBilling(b)}>
          {b === "all" ? "AR" : b}
        </Button>
      ))}
      <Button size="small" type={delayedOnly ? "primary" : "default"} onClick={() => setDelayedOnly((v) => !v)}>
        delayed
      </Button>
      <Button
        size="small"
        type={milestoneFilter === "at_risk" ? "primary" : "default"}
        onClick={() => setMilestoneFilter((v) => (v === "at_risk" ? "all" : "at_risk"))}
      >
        {tx("navExceptions")}
      </Button>
      <select
        value={customerId}
        onChange={(e) => setCustomerId(e.target.value)}
        aria-label={tx("colCustomer")}
        style={{ height: 24, fontSize: 12 }}
      >
        <option value="">{tx("colCustomer")}</option>
        {crm.customers.map((c) => (
          <option key={c.id} value={c.id}>
            {customerName(c as Customer, locale)}
          </option>
        ))}
      </select>
    </Space>
  );

  return (
    <div style={{ padding: "0 8px 24px" }}>
      <PageHeader
        title={tx("jobsTitle")}
        subtitle={`${filtered.length} · ${hint}`}
        extra={
          <Link to="/quotations">
            <Button type="default">{tx("navQuotations")}</Button>
          </Link>
        }
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24}>
          <AiBriefCard title={tx("aiJobSummary")} facts={fleetFacts} localFallback={fleetLocal} compact />
        </Col>
      </Row>

      {loading ? <LoadingState tip={tx("loginBusy")} /> : null}
      {error ? <ErrorState subTitle={error} /> : null}

      {!loading ? (
        <JobsProTable
          rows={filtered}
          customers={crm.customers as Customer[]}
          loading={loading}
          error={error}
          onReload={live ? () => void liveQuery.refetch() : undefined}
          extraToolbar={filterBar}
        />
      ) : null}
    </div>
  );
}
