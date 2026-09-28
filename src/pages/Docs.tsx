import {
  Certificate,
  Check,
  CheckCircle,
  ClipboardText,
  Clock,
  DotsThree,
  FileDashed,
  Files,
  FileText,
  Package,
  Plus,
  Receipt,
  Scroll,
  Signature,
  Stamp,
  Truck,
  UploadSimple,
  Warning,
  WarningCircle,
  type Icon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { App, Button, Drawer, Dropdown, Form, Input, Select, Upload } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { fetchContainers, uploadDocFile } from "../api/operations.ts";
import type { DocStatus } from "../crm";
import { useShellJobs } from "../shell/jobStore.tsx";
import { useShellOps } from "../shell/opsStore.tsx";
import { useIsShellMode } from "../shell/session.tsx";
import { useShellSupport, type ShellDocType } from "../shell/supportStore.tsx";
import { useStore } from "../store";
import {
  CardGrid,
  DataTable,
  EntityCard,
  FilterBar,
  IconBadge,
  PageHeader,
  Panel,
  readView,
  SegmentBar,
  StatusTag,
  StepMeter,
  Tile,
  TileRow,
  ViewSwitch,
  writeView,
} from "../v2/components";
import { useAppMode } from "../v2/hooks/useAppMode.ts";
import { OpsMobileList, useIsNarrow } from "../v2/pages/ops/OpsMobileList.tsx";
import { useCustomerName, useJobNumbers } from "../v2/pages/ops/opsHooks.ts";
import { DOC_TONE, fmtOpsDate } from "../v2/pages/ops/opsShared.ts";
import { queryKeys } from "../v2/queries/keys.ts";
import "../v2/pages/ops/ops.css";
import "../v2/pages/ops/opsVisual.css";

/** One picture per document type. */
const DOC_ICON: Record<string, Icon> = {
  BOOKING: ClipboardText,
  BOOK: ClipboardText,
  BL: Scroll,
  CI: Receipt,
  INV: Receipt,
  PL: Package,
  CO: Certificate,
  CUSTOMS: Stamp,
  DO: Truck,
  POD: Signature,
};
const DOC_STATE_TONE = { ok: "success", wait: "warning", late: "danger" } as const;

type Tab = "all" | "missing" | "late" | "ok";
const TABS: Tab[] = ["all", "missing", "late", "ok"];
const DOC_TYPES: ShellDocType[] = ["BOOKING", "BL", "CI", "PL", "CO", "DO", "POD", "OTHER"];

type DocRow = {
  id: string;
  name: string;
  type: string;
  jobId?: string;
  boxId?: string;
  customerId?: string;
  status: DocStatus;
  note?: string;
  updated?: string;
};

type Group = { key: string; jobId?: string; boxId?: string; customerId?: string; rows: DocRow[]; missing: number; late: number; ok: number };

type AddValues = { docType: ShellDocType; name: string; jobId?: string; boxId?: string };

export function DocsPage() {
  const shell = useIsShellMode();
  const { live } = useAppMode();
  const store = useStore();
  const support = useShellSupport();
  const ops = useShellOps();
  const jobStore = useShellJobs();
  const { tx, query, locale } = store;
  const { message } = App.useApp();
  const narrow = useIsNarrow();
  const customerNameOf = useCustomerName();
  const { jobNumberOf, jobCustomerOf } = useJobNumbers();
  const [params, setParams] = useSearchParams();
  const jobIdFilter = params.get("jobId") ?? "";
  const tab = (params.get("missing") === "1" ? "missing" : TABS.includes(params.get("tab") as Tab) ? params.get("tab") : "all") as Tab;
  const [docType, setDocType] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [view, setViewState] = useState(() => readView("docs"));
  const setView = (v: "cards" | "list") => {
    setViewState(v);
    writeView("docs", v);
  };
  const [open, setOpen] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [form] = Form.useForm<AddValues>();
  const q = `${query} ${search}`.trim().toLowerCase();

  /** Live docs only know their container — map container → job so we can group by job. */
  const containersQ = useQuery({
    queryKey: queryKeys.containers.all,
    queryFn: () => fetchContainers(),
    enabled: live,
  });
  const boxInfo = useMemo(() => {
    const m = new Map<string, { jobId?: string; customerId?: string }>();
    for (const b of ops.boxes) {
      const ship = ops.shipments.find((s) => s.id === b.shipmentId);
      m.set(b.id, { jobId: ship?.jobId, customerId: b.customerId });
    }
    for (const c of containersQ.data ?? []) m.set(c.containerNo, { jobId: c.jobId ?? undefined, customerId: c.customerId });
    return m;
  }, [containersQ.data, ops.boxes, ops.shipments]);

  const all: DocRow[] = useMemo(() => {
    if (shell) {
      return support.docs.map((d) => ({
        id: d.id,
        name: d.name,
        type: d.docType,
        jobId: d.jobId ?? (d.boxId ? boxInfo.get(d.boxId)?.jobId : undefined),
        boxId: d.boxId,
        customerId: d.jobId ? jobStore.getById(d.jobId)?.customerId : d.boxId ? boxInfo.get(d.boxId)?.customerId : undefined,
        status: d.status,
        note: d.note,
      }));
    }
    return store.docs.map((d) => ({
      id: d.id,
      name: d.name,
      type: d.kind === "BOOK" ? "BOOKING" : d.kind,
      jobId: d.boxId ? boxInfo.get(d.boxId)?.jobId : undefined,
      boxId: d.boxId,
      customerId: d.customerId,
      status: d.status,
      updated: d.updated,
    }));
  }, [boxInfo, jobStore, shell, store.docs, support.docs]);

  const scoped = useMemo(() => all.filter((d) => !jobIdFilter || d.jobId === jobIdFilter), [all, jobIdFilter]);

  const counts = useMemo(
    () => ({
      all: scoped.length,
      missing: scoped.filter((d) => d.status !== "ok").length,
      late: scoped.filter((d) => d.status === "late").length,
      ok: scoped.filter((d) => d.status === "ok").length,
    }),
    [scoped],
  );

  const rows = useMemo(
    () =>
      scoped.filter((d) => {
        if (tab === "missing" && d.status === "ok") return false;
        if ((tab === "late" || tab === "ok") && d.status !== tab) return false;
        if (docType && d.type !== docType) return false;
        if (!q) return true;
        const blob = `${d.name} ${d.type} ${d.boxId ?? ""} ${jobNumberOf(d.jobId) ?? ""} ${customerNameOf(d.customerId)} ${d.note ?? ""}`.toLowerCase();
        return q.split(/\s+/).every((w) => blob.includes(w));
      }),
    [customerNameOf, docType, jobNumberOf, q, scoped, tab],
  );

  const groups: Group[] = useMemo(() => {
    const map = new Map<string, Group>();
    for (const d of rows) {
      const key = d.jobId ? `job:${d.jobId}` : d.boxId ? `box:${d.boxId}` : "none";
      const g = map.get(key) ?? { key, jobId: d.jobId, boxId: d.jobId ? undefined : d.boxId, customerId: d.customerId, rows: [], missing: 0, late: 0, ok: 0 };
      g.rows.push(d);
      if (d.status === "ok") g.ok += 1;
      else g.missing += 1;
      if (d.status === "late") g.late += 1;
      g.customerId ??= d.customerId ?? jobCustomerOf(d.jobId);
      map.set(key, g);
    }
    const order = { late: 0, wait: 1, ok: 2 } as Record<string, number>;
    for (const g of map.values()) g.rows.sort((a, b) => order[a.status] - order[b.status]);
    return [...map.values()].sort((a, b) => b.late - a.late || b.missing - a.missing || a.key.localeCompare(b.key));
  }, [jobCustomerOf, rows]);

  function setTab(next: string) {
    const p = new URLSearchParams(params);
    p.delete("missing");
    if (next === "all") p.delete("tab");
    else p.set("tab", next);
    setParams(p, { replace: true });
  }

  function changeStatus(id: string, status: DocStatus) {
    if (shell) support.setDocStatus(id, status);
    else store.setDocStatus(id, status);
  }

  function submit(v: AddValues) {
    if (!shell) return;
    support.addDoc({ name: v.name, docType: v.docType, jobId: v.jobId || undefined, boxId: v.boxId || undefined, shipmentId: undefined });
    message.success(tx("ops_doc_added"));
    form.resetFields();
    setOpen(false);
  }

  /** Quiet "…" menu to set a document's status; the tag already shows the current one. */
  const statusMenu = (d: DocRow) => (
    <Dropdown
      trigger={["click"]}
      menu={{
        selectedKeys: [d.status],
        items: (["ok", "wait", "late"] as const).map((s) => ({ key: s, label: tx(`ops_doc_${s}`) })),
        onClick: ({ key }) => {
          changeStatus(d.id, key as DocStatus);
          message.success(tx("ops_statusSaved"));
        },
      }}
    >
      <Button size="small" type="text" icon={<DotsThree size={18} weight="bold" />} aria-label={tx("ops_changeStatus")} />
    </Dropdown>
  );

  const markReceived = (d: DocRow, node = false) =>
    d.status !== "ok" && !live ? (
      <Button size="small" type={node ? "primary" : "default"} icon={<Check size={14} />} onClick={() => changeStatus(d.id, "ok")}>
        {tx("ops_doc_markOk")}
      </Button>
    ) : null;

  const uploadButton = (d: DocRow, node = false) =>
    live && d.status !== "ok" ? (
      <Upload
        showUploadList={false}
        customRequest={async ({ file, onSuccess, onError }) => {
          setUploadingId(d.id);
          try {
            await uploadDocFile(d.id, file as File);
            onSuccess?.(file);
            message.success(tx("ops_doc_uploaded"));
          } catch (e) {
            onError?.(e as Error);
            message.error(tx("ops_doc_uploadFailed"));
          } finally {
            setUploadingId(null);
          }
        }}
      >
        <Button size="small" type="primary" ghost={!node} loading={uploadingId === d.id} icon={<UploadSimple size={14} />}>
          {tx("ops_doc_upload")}
        </Button>
      </Upload>
    ) : null;

  const columns: ColumnsType<DocRow> = [
    {
      title: tx("ops_doc_col"),
      key: "name",
      render: (_, d) => (
        <span className="ops-doc-cell">
          <span className="ops-doc-type">{d.type}</span>
          <span>
            <span className="cz-cell-main">{d.name}</span>
            {d.note || d.updated ? (
              <span className="cz-cell-sub">{d.note || tx("ops_doc_updatedOn", { d: fmtOpsDate(d.updated, locale) })}</span>
            ) : null}
          </span>
        </span>
      ),
    },
    { title: tx("ops_col_container"), key: "box", render: (_, d) => <span className="cz-mono ops-soft">{d.boxId || "—"}</span> },
    {
      title: tx("ops_col_status"),
      key: "status",
      render: (_, d) => <StatusTag status={d.status} label={tx(`ops_doc_${d.status}`)} tone={DOC_TONE[d.status]} />,
    },
    {
      title: <span className="sr-only">{tx("ops_actions")}</span>,
      key: "act",
      align: "right",
      render: (_, d) => (
        <span className="ops-row-actions">
          {uploadButton(d)}
          {markReceived(d)}
          {statusMenu(d)}
        </span>
      ),
    },
  ];

  /** Short, readable name of a document type (B/L, Invoice, C/O…). */
  function docKind(type: string) {
    const key = `ops_dk_${type.toUpperCase()}`;
    const v = tx(key);
    return v === key ? type : v;
  }

  function groupTitle(g: Group, withCustomer = true) {
    const jobNo = jobNumberOf(g.jobId);
    return (
      <span className="ops-doc-group-title">
        {g.jobId ? (
          <Link to={`/jobs/${g.jobId}`} className="cz-mono">
            {jobNo ?? tx("ops_openJob")}
          </Link>
        ) : g.boxId ? (
          <span className="cz-mono">{g.boxId}</span>
        ) : (
          <span>{tx("ops_doc_noJob")}</span>
        )}
        {withCustomer && g.customerId ? <span className="cz-muted">{customerNameOf(g.customerId)}</span> : null}
      </span>
    );
  }

  function groupExtra(g: Group) {
    return (
      <span className={`ops-doc-progress${g.missing ? " is-missing" : ""}`}>
        {g.missing ? tx("ops_doc_missingN", { n: g.missing }) : tx("ops_doc_complete")}
        <StepMeter done={g.ok} total={g.rows.length} />
      </span>
    );
  }

  const jobNo = jobIdFilter ? jobNumberOf(jobIdFilter) : undefined;
  const donePct = scoped.length ? Math.round((counts.ok / scoped.length) * 100) : 0;

  return (
    <div className="ops-page">
      <PageHeader
        title={tx("ops_doc_title")}
        subtitle={jobIdFilter ? tx("ops_doc_subJob", { job: jobNo ?? "—" }) : tx("ops_doc_sub", { n: scoped.length, m: counts.missing })}
        back={jobIdFilter ? { to: `/jobs/${jobIdFilter}`, label: jobNo ?? tx("ops_col_job") } : undefined}
        extra={
          <>
            <ViewSwitch value={view} onChange={setView} labels={{ cards: tx("viewCards"), list: tx("viewList") }} />
            <Link to="/docs/templates">
              <Button icon={<FileText size={16} />}>{tx("ops_tpl_short")}</Button>
            </Link>
            {shell ? (
              <Button type="primary" icon={<Plus size={16} />} onClick={() => setOpen(true)}>
                {tx("ops_doc_add")}
              </Button>
            ) : null}
          </>
        }
      >
        <TileRow>
          <Tile icon={FileDashed} tone={counts.missing ? "warning" : "success"} value={counts.missing} label={tx("ops_doc_missing")} to="/docs?tab=missing" />
          <Tile icon={WarningCircle} tone={counts.late ? "danger" : "success"} value={counts.late} label={tx("ops_doc_late")} to="/docs?tab=late" />
          <Tile icon={CheckCircle} tone="success" value={counts.ok} label={tx("ops_doc_ok")} to="/docs?tab=ok" />
          <Tile
            icon={Files}
            tone="primary"
            value={`${donePct}%`}
            label={tx("ops_doc_completion")}
            visual={
              <SegmentBar
                parts={[
                  { value: counts.ok, tone: "success", label: tx("ops_doc_ok") },
                  { value: counts.missing - counts.late, tone: "warning", label: tx("ops_doc_wait") },
                  { value: counts.late, tone: "danger", label: tx("ops_doc_late") },
                ]}
              />
            }
          />
        </TileRow>
        <FilterBar
          tabs={{
            value: tab,
            onChange: setTab,
            options: TABS.map((t) => ({ value: t, label: tx(t === "all" ? "ops_tab_all" : t === "missing" ? "ops_doc_missing" : `ops_doc_${t}`), count: counts[t] })),
          }}
          search={{ value: search, onChange: setSearch, placeholder: tx("ops_doc_search") }}
          selects={[
            {
              key: "type",
              placeholder: tx("ops_doc_type"),
              value: docType,
              onChange: setDocType,
              options: [...new Set(scoped.map((d) => d.type))].sort().map((t) => ({ value: t, label: t })),
              width: 130,
            },
          ]}
          onClear={() => {
            setSearch("");
            setDocType(undefined);
            setTab("all");
          }}
          count={rows.length}
        />
      </PageHeader>

      {groups.length === 0 ? (
        <Panel>
          <OpsMobileList
            items={[]}
            emptyText={scoped.length ? tx("noResults") : tx("ops_doc_empty")}
            emptyAction={
              !scoped.length && shell ? (
                <Button type="primary" onClick={() => setOpen(true)}>
                  {tx("ops_doc_add")}
                </Button>
              ) : undefined
            }
          />
        </Panel>
      ) : view === "cards" ? (
        <CardGrid min={360}>
          {groups.map((g) => {
            const tone = g.late ? "danger" : g.missing ? "warning" : "success";
            return (
              <EntityCard
                key={g.key}
                tone={g.late ? "danger" : "default"}
                media={<IconBadge icon={g.late ? Warning : g.missing ? Clock : CheckCircle} tone={tone} />}
                title={<span className="ops-doc-card-title">{groupTitle(g, false)}</span>}
                subtitle={g.customerId ? customerNameOf(g.customerId) : undefined}
                badge={<StepMeter done={g.ok} total={g.rows.length} />}
                footer={
                  <span className={`ops-doc-foot-state is-${g.late ? "late" : g.missing ? "missing" : "ok"}`}>
                    {g.missing ? tx("ops_doc_missingN", { n: g.missing }) : tx("ops_doc_complete")}
                  </span>
                }
              >
                <ul className="ops-doc-flow">
                  {g.rows.map((d) => {
                    const DocIcon = DOC_ICON[d.type.toUpperCase()] ?? FileText;
                    const StateIcon = d.status === "ok" ? CheckCircle : d.status === "late" ? WarningCircle : Clock;
                    const kind = docKind(d.type);
                    return (
                      <li key={d.id} className={`ops-doc-node is-${d.status} is-${DOC_STATE_TONE[d.status]}`}>
                        <Dropdown
                          trigger={["click"]}
                          menu={{
                            selectedKeys: [d.status],
                            items: [
                              { key: "_name", label: <span className="cz-muted">{d.name}{d.boxId ? ` · ${d.boxId}` : ""}</span>, disabled: true },
                              { type: "divider" as const },
                              ...(["ok", "wait", "late"] as const).map((st) => ({ key: st, label: tx(`ops_doc_${st}`) })),
                            ],
                            onClick: ({ key }) => {
                              if (key.startsWith("_")) return;
                              changeStatus(d.id, key as DocStatus);
                              message.success(tx("ops_statusSaved"));
                            },
                          }}
                        >
                          <button type="button" className="ops-doc-icon" aria-label={`${kind} · ${d.name} · ${tx(`ops_doc_${d.status}`)}`} title={d.name}>
                            <DocIcon size={26} weight="duotone" aria-hidden />
                            <span className="ops-doc-state" aria-hidden>
                              <StateIcon size={18} weight="fill" />
                            </span>
                          </button>
                        </Dropdown>
                        <span className="ops-doc-kind">{kind}</span>
                        {d.status !== "ok" ? uploadButton(d, true) ?? markReceived(d, true) : null}
                      </li>
                    );
                  })}
                </ul>
              </EntityCard>
            );
          })}
        </CardGrid>
      ) : (
        <div className="ops-doc-groups">
          {groups.map((g) => (
            <Panel key={g.key} title={groupTitle(g)} extra={groupExtra(g)} flush>
              {narrow ? (
                <OpsMobileList
                  items={g.rows.map((d) => ({
                    key: d.id,
                    title: d.name,
                    status: <StatusTag status={d.status} label={tx(`ops_doc_${d.status}`)} tone={DOC_TONE[d.status]} />,
                    line2: (
                      <>
                        <span className="ops-doc-type">{d.type}</span>
                        {d.boxId ? <span className="cz-mono">{d.boxId}</span> : null}
                        <span className="ops-push">{statusMenu(d)}</span>
                      </>
                    ),
                    line3:
                      d.status !== "ok" ? (
                        <span className="ops-row-actions is-start">
                          {uploadButton(d)}
                          {markReceived(d)}
                        </span>
                      ) : undefined,
                    tone: d.status === "late" ? "danger" : undefined,
                  }))}
                />
              ) : (
                <DataTable<DocRow>
                  rowKey="id"
                  columns={columns}
                  dataSource={g.rows}
                  pageSize={50}
                  showHeader={false}
                />
              )}
            </Panel>
          ))}
        </div>
      )}

      <Drawer
        open={open && shell}
        onClose={() => setOpen(false)}
        width={440}
        title={tx("ops_doc_add")}
        footer={
          <div className="ops-drawer-foot">
            <Button type="text" onClick={() => setOpen(false)}>
              {tx("ops_cancel")}
            </Button>
            <Button type="primary" onClick={() => form.submit()}>
              {tx("ops_save")}
            </Button>
          </div>
        }
      >
        <Form<AddValues> form={form} layout="vertical" initialValues={{ docType: "BL", name: "B/L", jobId: jobIdFilter || undefined }} onFinish={submit}>
          <div className="ops-form-row">
            <Form.Item name="docType" label={tx("ops_doc_type")}>
              <Select options={DOC_TYPES.map((t) => ({ value: t, label: t }))} />
            </Form.Item>
            <Form.Item name="name" label={tx("ops_doc_name")} rules={[{ required: true, message: tx("ops_required") }]}>
              <Input />
            </Form.Item>
          </div>
          <Form.Item name="jobId" label={tx("ops_col_job")}>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder={tx("ops_doc_pickJob")}
              options={jobStore.jobs.map((j) => ({ value: j.id, label: j.jobNumber }))}
            />
          </Form.Item>
          <Form.Item name="boxId" label={tx("ops_col_container")}>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder={tx("ops_doc_pickBox")}
              options={ops.boxes.map((b) => ({ value: b.id, label: b.id }))}
            />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
