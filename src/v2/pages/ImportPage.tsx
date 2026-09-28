import {
  AddressBook,
  ArrowCounterClockwise,
  ArrowRight,
  Boat,
  Buildings,
  CheckCircle,
  ClockCounterClockwise,
  Columns,
  Copy,
  DownloadSimple,
  FileXls,
  ListMagnifyingGlass,
  Tag,
  UploadSimple,
  WarningCircle,
  XCircle,
  type Icon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Segmented, Select, Spin, Table, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { fetchCrmBundle } from "../../api/crm.ts";
import { ImportApiError, listImportBatches, sendImport, undoImportBatch, type ImportBatch, type ImportResult, type ImportRowResult } from "../../api/importer.ts";
import book from "../../i18n-pages/importer.ts";
import {
  IMPORT_ENTITIES,
  IMPORT_FIELDS,
  IMPORT_MAX_ROWS,
  autoMap,
  validateRow,
  type FieldDef,
  type ImportEntity,
  type Issue,
} from "../../lib/importer.ts";
import { useStore } from "../../store";
import { EmptyState, IconBadge, PageHeader, Panel, SegmentBar, StatusTag, Tile, TileRow, type GraphicTone } from "../components";
import { useCan } from "../hooks/useCan.ts";
import { fmtDateTime } from "../lib/format.ts";
import "./import.css";

type XLSXModule = typeof import("xlsx");
const loadXlsx = () => import("xlsx") as Promise<XLSXModule>;

/** Same permissions the server checks (server/routes/import.ts). */
const PERMS: Record<ImportEntity, string[]> = {
  customers: ["customer.create"],
  contacts: ["customer.edit", "customer.create"],
  rates: ["rate.create"],
  jobs: ["shipment.edit"],
};
const ENTITY_ICON: Record<ImportEntity, Icon> = { customers: Buildings, contacts: AddressBook, rates: Tag, jobs: Boat };
const ENTITY_TONE: Record<ImportEntity, GraphicTone> = { customers: "primary", contacts: "info", rates: "accent", jobs: "success" };
const ENTITY_ROUTE: Record<ImportEntity, string> = { customers: "/customers", contacts: "/contacts", rates: "/rates", jobs: "/jobs" };

type Step = "file" | "map" | "check" | "done";
const STEPS: { key: Step; icon: Icon; label: string }[] = [
  { key: "file", icon: UploadSimple, label: "im_step_file" },
  { key: "map", icon: Columns, label: "im_step_map" },
  { key: "check", icon: ListMagnifyingGlass, label: "im_step_check" },
  { key: "done", icon: CheckCircle, label: "im_step_done" },
];

type Sheet = { fileName: string; headers: string[]; rows: { row: number; cells: unknown[] }[] };

/** Translated labels (all three languages) per field, so templates in any language map back. */
const LABELS: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = {};
  for (const e of IMPORT_ENTITIES) {
    for (const f of IMPORT_FIELDS[e]) out[f.key] = [book.th[`im_f_${f.key}`], book.en[`im_f_${f.key}`], book.zh[`im_f_${f.key}`]].filter(Boolean) as string[];
  }
  return out;
})();

const NAME_KEYS = ["nameTh", "nameEn", "nameZh"];

/** Required fields not matched to any column (customers need at least one name column). */
function missingRequired(entity: ImportEntity, mapping: (string | null)[]): string[] {
  const used = new Set(mapping.filter(Boolean));
  const out = IMPORT_FIELDS[entity].filter((f) => f.required && !used.has(f.key)).map((f) => f.key);
  if (entity === "customers" && !NAME_KEYS.some((k) => used.has(k))) out.push("nameTh");
  return out;
}

async function readSheet(file: File): Promise<Sheet> {
  const XLSX = await loadXlsx();
  const buf = await file.arrayBuffer();
  let wb;
  if (/\.(csv|txt)$/i.test(file.name)) {
    // Thai CSVs saved by older Excel are Windows-874, newer ones UTF-8 (with BOM).
    let text = new TextDecoder("utf-8").decode(buf);
    if (text.includes("�")) text = new TextDecoder("windows-874").decode(buf);
    wb = XLSX.read(text.replace(/^﻿/, ""), { type: "string", raw: true });
  } else {
    wb = XLSX.read(buf, { type: "array" });
  }
  const ws = wb.Sheets[wb.SheetNames[0]!];
  if (!ws || !ws["!ref"]) return { fileName: file.name, headers: [], rows: [] };
  const start = XLSX.utils.decode_range(ws["!ref"]).s.r;
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: "", blankrows: true });
  const blank = (r: unknown[]) => r.every((c) => c === "" || c === null || c === undefined || String(c).trim() === "");
  const h = aoa.findIndex((r) => !blank(r));
  if (h < 0) return { fileName: file.name, headers: [], rows: [] };
  const width = Math.max(...aoa.map((r) => r.length));
  const headers = Array.from({ length: width }, (_, i) => String(aoa[h]![i] ?? "").trim() || `(${XLSX.utils.encode_col(i)})`);
  const rows = aoa
    .map((cells, i) => ({ row: start + i + 1, cells }))
    .slice(h + 1)
    .filter((r) => !blank(r.cells));
  return { fileName: file.name, headers, rows };
}

function rowData(sheet: Sheet, mapping: (string | null)[], cells: unknown[]) {
  const data: Record<string, string | number | boolean | null> = {};
  mapping.forEach((key, i) => {
    if (!key) return;
    const v = cells[i];
    data[key] = v === undefined || v === "" ? null : (v as string | number | boolean);
  });
  void sheet;
  return data;
}

export function ImportPage() {
  const { tx, locale, hydrateCrm } = useStore();
  const can = useCan();
  const { message, modal } = App.useApp();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const allowed = IMPORT_ENTITIES.filter((e) => PERMS[e].some(can));
  // Local state (not only the URL): a file picked right after switching must use the new entity.
  const [picked, setPicked] = useState<ImportEntity | null>(() => params.get("entity") as ImportEntity | null);
  const entity: ImportEntity | undefined = picked && allowed.includes(picked) ? picked : allowed[0];

  const [step, setStep] = useState<Step>("file");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [mapping, setMapping] = useState<(string | null)[]>([]);
  const [busy, setBusy] = useState<"read" | "check" | "import" | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [check, setCheck] = useState<ImportResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [filter, setFilter] = useState<"all" | "error" | "duplicate" | "ready">("all");
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const history = useQuery({ queryKey: ["import", "batches"], queryFn: listImportBatches, enabled: allowed.length > 0 });

  const reset = useCallback(() => {
    setStep("file");
    setSheet(null);
    setMapping([]);
    setCheck(null);
    setResult(null);
    setFileError(null);
    setFilter("all");
  }, []);

  const pickEntity = (e: ImportEntity) => {
    reset();
    setPicked(e);
    setParams({ entity: e }, { replace: true });
  };

  const fieldLabel = (key: string) => tx(`im_f_${key}`);
  const issueText = (i: Issue, field?: FieldDef) => {
    const k = `im_e_${i.code}`;
    const w = `im_w_${i.code}`;
    const values = field?.values?.join(", ") ?? "";
    const txt = tx(k, { values });
    if (txt !== k) return txt;
    const wt = tx(w);
    return wt !== w ? wt : i.code;
  };

  /* ── Dry run ── */
  const runCheck = async (s: Sheet, map: (string | null)[]) => {
    if (!entity) return;
    setBusy("check");
    setStep("check");
    setCheck(null);
    try {
      const out = await sendImport(entity, { fileName: s.fileName, dryRun: true, rows: s.rows.map((r) => ({ row: r.row, data: rowData(s, map, r.cells) })) });
      setCheck(out);
      setFilter(out.summary.error ? "error" : "all");
    } catch {
      message.error(tx("im_errServer"));
      setStep(map.some(Boolean) ? "map" : "file");
    } finally {
      setBusy(null);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file || !entity) return;
    reset();
    setBusy("read");
    try {
      const s = await readSheet(file);
      if (!s.rows.length) {
        setFileError(tx("im_errEmpty"));
        return;
      }
      if (s.rows.length > IMPORT_MAX_ROWS) {
        setFileError(tx("im_errTooMany", { n: s.rows.length, max: IMPORT_MAX_ROWS }));
        return;
      }
      const map = autoMap(entity, s.headers, LABELS);
      setSheet(s);
      setMapping(map);
      const unmatched = map.some((m, i) => !m && !/^\(.+\)$/.test(s.headers[i] ?? ""));
      if (unmatched || missingRequired(entity, map).length) setStep("map");
      else await runCheck(s, map);
    } catch {
      setFileError(tx("im_errRead"));
    } finally {
      setBusy((b) => (b === "read" ? null : b));
    }
  };

  /* ── Commit ── */
  const commit = async () => {
    if (!entity || !sheet) return;
    setBusy("import");
    try {
      const out = await sendImport(entity, { fileName: sheet.fileName, dryRun: false, rows: sheet.rows.map((r) => ({ row: r.row, data: rowData(sheet, mapping, r.cells) })) });
      setResult(out);
      setStep("done");
      await refreshData();
    } catch {
      message.error(tx("im_errServer"));
    } finally {
      setBusy(null);
    }
  };

  const refreshData = async () => {
    void qc.invalidateQueries();
    if (entity === "customers" || entity === "contacts" || !entity) {
      try {
        hydrateCrm(await fetchCrmBundle());
      } catch {
        /* the list reloads on next visit */
      }
    }
  };

  const undo = useMutation({
    mutationFn: (id: string) => undoImportBatch(id),
    onSuccess: async () => {
      message.success(tx("im_undoOk"));
      await refreshData();
      void qc.invalidateQueries({ queryKey: ["import", "batches"] });
    },
    onError: (e) => {
      const code = e instanceof ImportApiError ? e.message : "";
      message.error(code === "in_use" ? tx("im_undoInUse") : code === "expired" ? tx("im_undoExpired") : tx("im_undoFailed"));
    },
  });

  const askUndo = (id: string, n: number) =>
    modal.confirm({
      title: tx("im_undo"),
      content: tx("im_undoConfirm", { n }),
      okText: tx("im_undo"),
      okButtonProps: { danger: true },
      cancelText: tx("cancel"),
      onOk: () => undo.mutateAsync(id).catch(() => undefined),
    });

  /* ── Templates & error file ── */
  const downloadTemplate = async (lang: "th" | "en") => {
    if (!entity) return;
    const XLSX = await loadXlsx();
    const b = book[lang];
    const fields = IMPORT_FIELDS[entity];
    const header = (f: FieldDef) => `${b[`im_f_${f.key}`]}${f.required ? " *" : ""}`;
    const ws = XLSX.utils.aoa_to_sheet([fields.map(header)]);
    ws["!cols"] = fields.map((f) => ({ wch: Math.max(14, header(f).length + 4) }));
    const fmt = (f: FieldDef) => {
      if (f.key === "customer") return b.im_fmt_customer;
      if (f.key === "vendor") return b.im_fmt_vendor;
      if (NAME_KEYS.includes(f.key)) return b.im_fmt_nameAny;
      if (f.values && (f.type === "enum" || f.type === "list")) return `${f.values.join(", ")}${f.type === "list" ? ` (${b.im_fmt_list})` : ""}`;
      return b[`im_fmt_${f.type}`] ?? b.im_fmt_text;
    };
    const guide = XLSX.utils.aoa_to_sheet([
      [b.im_guideCol, b.im_required, b.im_guideFormat, b.im_guideExample],
      ...fields.map((f) => [b[`im_f_${f.key}`], f.required ? "✓" : "", fmt(f), f.example ?? ""]),
    ]);
    guide["!cols"] = [{ wch: 28 }, { wch: 10 }, { wch: 48 }, { wch: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, b.im_dataSheet);
    XLSX.utils.book_append_sheet(wb, guide, b.im_guideSheet);
    XLSX.writeFile(wb, `import-${entity}-${lang}.xlsx`);
  };

  const downloadErrors = async (res: ImportResult) => {
    if (!sheet || !entity) return;
    const XLSX = await loadXlsx();
    const byRow = new Map(res.results.map((r) => [r.row, r]));
    const defs = new Map(IMPORT_FIELDS[entity].map((f) => [f.key, f]));
    const lines = sheet.rows
      .filter((r) => byRow.get(r.row)?.status === "error")
      .map((r) => {
        const issues = byRow.get(r.row)!.errors.map((i) => `${i.field ? `${fieldLabel(i.field)}: ` : ""}${issueText(i, defs.get(i.field))}`);
        return [r.row, ...sheet.headers.map((_, i) => r.cells[i] ?? ""), issues.join("; ")];
      });
    const ws = XLSX.utils.aoa_to_sheet([[tx("im_row"), ...sheet.headers, tx("im_error")], ...lines]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, tx("im_error").slice(0, 31));
    XLSX.writeFile(wb, `${sheet.fileName.replace(/\.[^.]+$/, "")}-errors.xlsx`);
  };

  /* ── Render ── */
  if (!entity) {
    return (
      <div className="cz-stack">
        <PageHeader title={tx("im_title")} />
        <EmptyState title={tx("im_noPermission")} />
      </div>
    );
  }

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  return (
    <div className="cz-stack im-page">
      <PageHeader title={tx("im_title")} subtitle={tx("im_sub")} />

      <div className="im-entities" role="tablist" aria-label={tx("im_title")}>
        {allowed.map((e) => {
          const I = ENTITY_ICON[e];
          return (
            <button key={e} type="button" role="tab" aria-selected={e === entity} className={`im-entity${e === entity ? " is-active" : ""}`} onClick={() => pickEntity(e)}>
              <IconBadge icon={I} tone={ENTITY_TONE[e]} size={36} />
              <span>{tx(`im_ent_${e}`)}</span>
            </button>
          );
        })}
      </div>

      <ol className="im-steps" aria-label={tx("im_title")}>
        {STEPS.map((s, i) => {
          const I = s.icon;
          const state = i < stepIndex ? "done" : i === stepIndex ? "current" : "todo";
          return (
            <li key={s.key} className={`im-step is-${state}`} aria-current={state === "current" ? "step" : undefined}>
              <span className="im-step-dot">{state === "done" ? <CheckCircle size={18} weight="fill" /> : <I size={18} weight="duotone" />}</span>
              <span className="im-step-label">{tx(s.label)}</span>
            </li>
          );
        })}
      </ol>

      {step === "file" ? (
        <div className="im-file-grid">
          <Panel title={<PanelTitle icon={FileXls} tone="success" text={tx("im_template")} />}>
            <div className="im-template">
              <Button icon={<DownloadSimple size={16} />} onClick={() => void downloadTemplate("th")}>
                {tx("im_templateTh")}
              </Button>
              <Button icon={<DownloadSimple size={16} />} onClick={() => void downloadTemplate("en")}>
                {tx("im_templateEn")}
              </Button>
            </div>
          </Panel>
          <label
            className={`im-drop${drag ? " is-drag" : ""}${fileError ? " is-error" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              void onFile(e.dataTransfer.files?.[0]);
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
              className="im-file-input"
              onChange={(e) => {
                void onFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            {busy === "read" ? (
              <Spin />
            ) : (
              <IconBadge icon={fileError ? WarningCircle : UploadSimple} tone={fileError ? "danger" : "primary"} size={56} />
            )}
            <span className="im-drop-title">{busy === "read" ? tx("im_reading") : tx("im_drop")}</span>
            {fileError ? <span className="im-drop-error">{fileError}</span> : <span className="im-drop-hint">{tx("im_dropHint", { max: IMPORT_MAX_ROWS })}</span>}
          </label>
        </div>
      ) : null}

      {step === "map" && sheet ? (
        <MapStep
          entity={entity}
          sheet={sheet}
          mapping={mapping}
          setMapping={setMapping}
          fieldLabel={fieldLabel}
          onBack={reset}
          onNext={() => void runCheck(sheet, mapping)}
        />
      ) : null}

      {step === "check" ? (
        busy === "check" || !check || !sheet ? (
          <Panel>
            <div className="im-wait">
              <Spin />
              <span>{tx("im_checking")}</span>
            </div>
          </Panel>
        ) : (
          <CheckStep
            entity={entity}
            sheet={sheet}
            mapping={mapping}
            check={check}
            filter={filter}
            setFilter={setFilter}
            fieldLabel={fieldLabel}
            issueText={issueText}
            busy={busy === "import"}
            onBack={() => setStep("map")}
            onReset={reset}
            onImport={() => void commit()}
          />
        )
      ) : null}

      {step === "done" && result ? (
        <Panel>
          <div className="im-done">
            <IconBadge icon={result.summary.created ? CheckCircle : WarningCircle} tone={result.summary.created ? "success" : "warning"} size={64} />
            <h2 className="im-done-title">{tx("im_doneTitle")}</h2>
            <TileRow>
              <Tile icon={CheckCircle} tone="success" value={result.summary.created} label={tx("im_created")} />
              <Tile icon={Copy} tone="warning" value={result.summary.duplicate} label={tx("im_duplicate")} />
              <Tile icon={XCircle} tone="danger" value={result.summary.error} label={tx("im_error")} />
            </TileRow>
            <div className="im-actions">
              {result.summary.error ? (
                <Button icon={<DownloadSimple size={16} />} onClick={() => void downloadErrors(result)}>
                  {tx("im_downloadErrors")}
                </Button>
              ) : null}
              {result.batchId ? (
                <Button danger icon={<ArrowCounterClockwise size={16} />} onClick={() => askUndo(result.batchId!, result.summary.created)}>
                  {tx("im_undo")}
                </Button>
              ) : null}
              <Button onClick={reset} icon={<UploadSimple size={16} />}>
                {tx("im_newFile")}
              </Button>
              <Link to={ENTITY_ROUTE[entity]}>
                <Button type="primary" icon={<ArrowRight size={16} />}>
                  {tx("im_openList")}
                </Button>
              </Link>
            </div>
          </div>
        </Panel>
      ) : null}

      <History items={history.data} loading={history.isLoading} locale={locale} onUndo={askUndo} undoing={undo.isPending ? undo.variables : undefined} />
    </div>
  );
}

function PanelTitle({ icon, tone, text }: { icon: Icon; tone: GraphicTone; text: ReactNode }) {
  return (
    <span className="im-panel-title">
      <IconBadge icon={icon} tone={tone} size={28} />
      {text}
    </span>
  );
}

/* ── Step: match columns ── */

function MapStep({
  entity,
  sheet,
  mapping,
  setMapping,
  fieldLabel,
  onBack,
  onNext,
}: {
  entity: ImportEntity;
  sheet: Sheet;
  mapping: (string | null)[];
  setMapping: (m: (string | null)[]) => void;
  fieldLabel: (k: string) => string;
  onBack: () => void;
  onNext: () => void;
}) {
  const { tx } = useStore();
  const fields = IMPORT_FIELDS[entity];
  const missing = missingRequired(entity, mapping);
  const used = new Set(mapping.filter(Boolean));
  const sample = (i: number) => {
    const v = sheet.rows.find((r) => r.cells[i] !== "" && r.cells[i] !== undefined)?.cells[i];
    return v === undefined ? "" : String(v);
  };
  const requiredKeys = [...fields.filter((f) => f.required).map((f) => f.key), ...(entity === "customers" ? ["nameTh"] : [])];

  return (
    <Panel title={<PanelTitle icon={Columns} tone="info" text={tx("im_step_map")} />} extra={<span className="im-file-name">{sheet.fileName}</span>}>
      <div className="im-required">
        {[...new Set(requiredKeys)].map((k) => {
          const ok = !missing.includes(k);
          return (
            <span key={k} className={`im-chip ${ok ? "is-ok" : "is-missing"}`}>
              {ok ? <CheckCircle size={14} weight="fill" /> : <WarningCircle size={14} weight="fill" />}
              {entity === "customers" && k === "nameTh" ? tx("im_fmt_nameAny") : fieldLabel(k)}
            </span>
          );
        })}
      </div>
      <div className="im-map">
        <div className="im-map-head">
          <span>{tx("im_colFile")}</span>
          <span />
          <span>{tx("im_colField")}</span>
        </div>
        {sheet.headers.map((h, i) => (
          <div key={i} className={`im-map-row${mapping[i] ? " is-mapped" : ""}`}>
            <span className="im-map-src">
              <strong>{h}</strong>
              <small title={sample(i)}>{sample(i) || "—"}</small>
            </span>
            <ArrowRight size={16} className="im-map-arrow" aria-hidden />
            <Select
              aria-label={h}
              value={mapping[i] ?? ""}
              onChange={(v) => {
                const next = [...mapping];
                next[i] = v || null;
                setMapping(next);
              }}
              options={[
                { value: "", label: <span className="im-skip">{tx("im_skip")}</span> },
                ...fields.map((f) => ({
                  value: f.key,
                  label: `${fieldLabel(f.key)}${f.required ? " *" : ""}`,
                  disabled: used.has(f.key) && mapping[i] !== f.key,
                })),
              ]}
              popupMatchSelectWidth={false}
              className="im-map-select"
            />
          </div>
        ))}
      </div>
      <div className="im-actions">
        <Button onClick={onBack}>{tx("im_back")}</Button>
        <Tooltip title={missing.length ? tx("im_missingRequired") : undefined}>
          <Button type="primary" disabled={missing.length > 0} onClick={onNext} icon={<ArrowRight size={16} />}>
            {tx("im_next")}
          </Button>
        </Tooltip>
      </div>
    </Panel>
  );
}

/* ── Step: preview & check ── */

type PreviewRow = { key: number; row: number; cells: unknown[]; res: ImportRowResult | undefined; parsed: Record<string, unknown> };

function CheckStep({
  entity,
  sheet,
  mapping,
  check,
  filter,
  setFilter,
  fieldLabel,
  issueText,
  busy,
  onBack,
  onReset,
  onImport,
}: {
  entity: ImportEntity;
  sheet: Sheet;
  mapping: (string | null)[];
  check: ImportResult;
  filter: "all" | "error" | "duplicate" | "ready";
  setFilter: (f: "all" | "error" | "duplicate" | "ready") => void;
  fieldLabel: (k: string) => string;
  issueText: (i: Issue, f?: FieldDef) => string;
  busy: boolean;
  onBack: () => void;
  onReset: () => void;
  onImport: () => void;
}) {
  const { tx } = useStore();
  const defs = useMemo(() => new Map(IMPORT_FIELDS[entity].map((f) => [f.key, f])), [entity]);
  const byRow = useMemo(() => new Map(check.results.map((r) => [r.row, r])), [check]);
  const rows: PreviewRow[] = useMemo(
    () =>
      sheet.rows.map((r) => {
        const data: Record<string, unknown> = {};
        mapping.forEach((k, i) => k && (data[k] = r.cells[i]));
        return { key: r.row, row: r.row, cells: r.cells, res: byRow.get(r.row), parsed: validateRow(entity, data).values };
      }),
    [sheet, mapping, byRow, entity],
  );
  const s = check.summary;
  const warnCount = check.results.filter((r) => r.status !== "error" && r.warnings.length).length;
  const shown = filter === "all" ? rows : rows.filter((r) => r.res?.status === filter);

  const mappedCols = mapping.map((k, i) => ({ k, i })).filter((c): c is { k: string; i: number } => Boolean(c.k));
  const columns: ColumnsType<PreviewRow> = [
    {
      title: "#",
      dataIndex: "row",
      width: 56,
      fixed: "left",
      render: (_, r) => <span className="im-rownum">{r.row}</span>,
    },
    {
      title: tx("im_status"),
      width: 64,
      fixed: "left",
      render: (_, r) => <RowStatus res={r.res} issueText={issueText} />,
    },
    ...mappedCols.map(({ k, i }) => ({
      title: fieldLabel(k),
      key: k,
      onCell: (r: PreviewRow) => {
        const err = r.res?.errors.find((e) => e.field === k || (k === "nameTh" && e.field === "name"));
        const warn = r.res?.warnings.find((e) => e.field === k);
        return { className: err ? "im-cell-error" : warn ? "im-cell-warn" : undefined };
      },
      render: (_: unknown, r: PreviewRow) => {
        const raw = r.cells[i];
        const err = r.res?.errors.find((e) => e.field === k || (k === "nameTh" && e.field === "name"));
        const warn = r.res?.warnings.find((e) => e.field === k);
        const parsed = r.parsed[k];
        const def = defs.get(k);
        const text = raw === undefined || raw === null || raw === "" ? "" : String(raw);
        const shownParsed = def?.type === "date" && typeof parsed === "string" && parsed !== text ? parsed : null;
        const body = (
          <span className="im-cell">
            {text || <span className="im-empty">—</span>}
            {shownParsed ? <small className="im-parsed">{shownParsed}</small> : null}
          </span>
        );
        const tip = err ? issueText(err, def) : warn ? issueText(warn, def) : null;
        return tip ? <Tooltip title={tip}>{body}</Tooltip> : body;
      },
    })),
  ];

  const importable = s.ready;

  return (
    <div className="cz-stack">
      <TileRow>
        <Tile icon={CheckCircle} tone="success" value={s.ready} label={tx("im_ready")} />
        <Tile icon={Copy} tone="warning" value={s.duplicate} label={tx("im_duplicate")} />
        <Tile icon={XCircle} tone="danger" value={s.error} label={tx("im_error")} />
        <Tile icon={WarningCircle} tone="accent" value={warnCount} label={tx("im_warning")} />
      </TileRow>
      <Panel
        title={<PanelTitle icon={ListMagnifyingGlass} tone="info" text={tx("im_step_check")} />}
        extra={<span className="im-file-name">{sheet.fileName}</span>}
      >
        <SegmentBar
          parts={[
            { value: s.ready, tone: "success", label: tx("im_ready") },
            { value: s.duplicate, tone: "warning", label: tx("im_duplicate") },
            { value: s.error, tone: "danger", label: tx("im_error") },
          ]}
        />
        <div className="im-filter">
          <Segmented
            value={filter}
            onChange={(v) => setFilter(v as typeof filter)}
            options={[
              { value: "all", label: `${tx("im_all")} ${s.total}` },
              { value: "ready", label: `${tx("im_ready")} ${s.ready}` },
              { value: "duplicate", label: `${tx("im_duplicate")} ${s.duplicate}` },
              { value: "error", label: `${tx("im_error")} ${s.error}` },
            ]}
          />
        </div>
        <div className="cz-table im-table">
          <Table<PreviewRow>
            size="small"
            rowKey="key"
            dataSource={shown}
            columns={columns}
            scroll={{ x: "max-content" }}
            pagination={shown.length > 50 ? { pageSize: 50, showSizeChanger: false } : false}
            rowClassName={(r) => (r.res?.status === "error" ? "im-row-error" : r.res?.status === "duplicate" ? "im-row-dup" : "")}
          />
        </div>
        <div className="im-actions">
          <Button onClick={onReset} icon={<UploadSimple size={16} />}>
            {tx("im_newFile")}
          </Button>
          <Button onClick={onBack} icon={<Columns size={16} />}>
            {tx("im_editMap")}
          </Button>
          <Button type="primary" loading={busy} disabled={!importable} onClick={onImport} icon={<ArrowRight size={16} />}>
            {importable ? tx("im_importN", { n: importable }) : tx("im_nothing")}
          </Button>
        </div>
      </Panel>
    </div>
  );
}

function RowStatus({ res, issueText }: { res: ImportRowResult | undefined; issueText: (i: Issue) => string }) {
  const { tx } = useStore();
  if (!res) return null;
  if (res.status === "error") {
    const tip = res.errors.map((e) => issueText(e)).join(" · ");
    return (
      <Tooltip title={tip}>
        <XCircle size={20} weight="fill" className="im-ic is-danger" aria-label={`${tx("im_error")}: ${tip}`} />
      </Tooltip>
    );
  }
  if (res.status === "duplicate") {
    return (
      <Tooltip title={`${tx("im_duplicate")}${res.label ? ` → ${res.label}` : ""}`}>
        <Copy size={20} weight="fill" className="im-ic is-warning" aria-label={tx("im_duplicate")} />
      </Tooltip>
    );
  }
  if (res.warnings.length) {
    const tip = res.warnings.map((w) => issueText(w)).join(" · ");
    return (
      <Tooltip title={tip}>
        <WarningCircle size={20} weight="fill" className="im-ic is-accent" aria-label={`${tx("im_warning")}: ${tip}`} />
      </Tooltip>
    );
  }
  return <CheckCircle size={20} weight="fill" className="im-ic is-success" aria-label={tx("im_ready")} />;
}

/* ── History ── */

function History({
  items,
  loading,
  locale,
  onUndo,
  undoing,
}: {
  items: ImportBatch[] | undefined;
  loading: boolean;
  locale: ReturnType<typeof useStore>["locale"];
  onUndo: (id: string, n: number) => void;
  undoing?: string;
}) {
  const { tx } = useStore();
  return (
    <Panel title={<PanelTitle icon={ClockCounterClockwise} tone="neutral" text={tx("im_history")} />} flush>
      {loading ? (
        <div className="im-wait">
          <Spin />
        </div>
      ) : !items?.length ? (
        <p className="im-history-empty">{tx("im_historyEmpty")}</p>
      ) : (
        <ul className="im-history">
          {items.map((b) => {
            const I = ENTITY_ICON[b.entity] ?? FileXls;
            const hoursLeft = Math.max(0, Math.ceil((new Date(b.createdAt).getTime() + 24 * 3600000 - Date.now()) / 3600000));
            return (
              <li key={b.id} className={`im-history-row${b.undoneAt ? " is-undone" : ""}`}>
                <IconBadge icon={I} tone={b.undoneAt ? "neutral" : ENTITY_TONE[b.entity] ?? "primary"} size={36} />
                <span className="im-history-main">
                  <strong title={b.fileName}>{b.fileName || tx(`im_ent_${b.entity}`)}</strong>
                  <small>
                    {tx(`im_ent_${b.entity}`)} · {fmtDateTime(b.createdAt, locale)}
                    {b.createdByName ? ` · ${b.createdByName}` : ""}
                  </small>
                </span>
                <span className="im-history-counts">
                  <span className="im-count is-success" title={tx("im_created")}>
                    <CheckCircle size={14} weight="fill" /> {b.createdCount}
                  </span>
                  {b.duplicateCount ? (
                    <span className="im-count is-warning" title={tx("im_duplicate")}>
                      <Copy size={14} weight="fill" /> {b.duplicateCount}
                    </span>
                  ) : null}
                  {b.errorCount ? (
                    <span className="im-count is-danger" title={tx("im_error")}>
                      <XCircle size={14} weight="fill" /> {b.errorCount}
                    </span>
                  ) : null}
                </span>
                <span className="im-history-act">
                  {b.undoneAt ? (
                    <StatusTag status="CANCELLED" label={tx("im_undone")} tone="neutral" />
                  ) : b.undoable ? (
                    <Tooltip title={tx("im_hoursLeft", { h: hoursLeft })}>
                      <Button size="small" danger loading={undoing === b.id} icon={<ArrowCounterClockwise size={14} />} onClick={() => onUndo(b.id, b.createdCount)}>
                        {tx("im_undo")}
                      </Button>
                    </Tooltip>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
