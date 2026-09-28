import { Eye, FileText, PencilSimple, Receipt, Scroll, type Icon } from "@phosphor-icons/react";
import { App, Alert, Button, Drawer, Input, Tabs } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useStore } from "../../store";
import { CardGrid, DataTable, EmptyState, ErrorState, LoadingState, PageHeader, readView, StatusTag, ViewSwitch, writeView } from "../components";
import { useAppMode } from "../hooks/useAppMode.ts";
import { OpsMobileList, useIsNarrow } from "./ops/OpsMobileList.tsx";
import "./ops/ops.css";
import "./ops/opsVisual.css";

/** Icon on the paper thumbnail, by template code. */
function templateIcon(code: string): Icon {
  const c = code.toUpperCase();
  if (c.includes("INVOICE") || c.includes("RECEIPT") || c.includes("BILL")) return Receipt;
  if (c.includes("BL") || c.includes("LADING")) return Scroll;
  return FileText;
}

type TemplateRow = {
  id: string;
  code: string;
  name: string;
  templateJson: Record<string, unknown>;
  active: boolean;
};

async function fetchTemplates(): Promise<TemplateRow[]> {
  const res = await fetch("/api/document-templates", { credentials: "include" });
  const data = await res.json();
  if (!res.ok) throw new Error(String(data.error ?? "load_failed"));
  return (data.items as TemplateRow[]) ?? [];
}

export function DocumentTemplatesPageV2() {
  const { tx } = useStore();
  const { live } = useAppMode();
  const { message } = App.useApp();
  const narrow = useIsNarrow();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["document-templates"], queryFn: fetchTemplates, enabled: live });
  const [editId, setEditId] = useState<string | null>(null);
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [studioTab, setStudioTab] = useState("editor");
  const [view, setViewState] = useState(() => readView("doc-templates"));
  const setView = (v: "cards" | "list") => {
    setViewState(v);
    writeView("doc-templates", v);
  };

  function parseJson(text: string): Record<string, unknown> | null {
    if (!text.trim()) return null;
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  const parsedJson = useMemo(() => parseJson(jsonText), [jsonText]);

  function validateBeforeSave() {
    try {
      JSON.parse(jsonText);
      setJsonError(null);
      return true;
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : tx("ops_tpl_invalid"));
      return false;
    }
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!parsedJson) throw new Error(jsonError ?? tx("ops_tpl_invalid"));
      const res = await fetch(`/api/document-templates/${editId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateJson: parsedJson }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(String(data.error ?? "save_failed"));
      return data;
    },
    onSuccess: () => {
      message.success(tx("ops_tpl_saved"));
      setEditId(null);
      void qc.invalidateQueries({ queryKey: ["document-templates"] });
    },
    onError: () => message.error(tx("ops_tpl_saveFailed")),
  });

  function openStudio(row: TemplateRow) {
    setEditId(row.id);
    setJsonText(JSON.stringify(row.templateJson, null, 2));
    setJsonError(null);
    setStudioTab("editor");
  }

  const rows = q.data ?? [];
  const editing = rows.find((r) => r.id === editId);

  const columns: ColumnsType<TemplateRow> = [
    {
      title: tx("ops_tpl_col"),
      key: "name",
      render: (_, r) => (
        <>
          <span className="cz-cell-main">{r.name}</span>
          <span className="cz-cell-sub ops-code">{r.code}</span>
        </>
      ),
    },
    {
      title: tx("ops_col_status"),
      key: "active",
      render: (_, r) => <StatusTag status={r.active ? "ACTIVE" : "INACTIVE"} label={tx(r.active ? "ops_tpl_active" : "ops_tpl_inactive")} tone={r.active ? "success" : "neutral"} />,
    },
    {
      title: <span className="sr-only">{tx("ops_actions")}</span>,
      key: "act",
      align: "right",
      render: (_, r) => (
        <span className="ops-row-actions">
          <Button size="small" type="text" icon={<Eye size={16} />} href={`/api/document-templates/${r.id}/preview`} target="_blank">
            {tx("ops_tpl_preview")}
          </Button>
          <Button size="small" icon={<PencilSimple size={16} />} onClick={() => openStudio(r)}>
            {tx("ops_tpl_edit")}
          </Button>
        </span>
      ),
    },
  ];

  return (
    <div className="ops-page">
      <PageHeader
        title={tx("ops_tpl_title")}
        subtitle={tx("ops_tpl_sub")}
        back={{ to: "/docs", label: tx("ops_doc_title") }}
        extra={live ? <ViewSwitch value={view} onChange={setView} labels={{ cards: tx("viewCards"), list: tx("viewList") }} /> : undefined}
      />

      {!live ? (
        <EmptyState title={tx("ops_notConnected")} description={tx("ops_tpl_needLive")} />
      ) : q.isError ? (
        <ErrorState title={tx("ops_tpl_loadFailed")} action={<Button onClick={() => void q.refetch()}>{tx("ops_retry")}</Button>} />
      ) : view === "cards" ? (
        q.isLoading ? (
          <LoadingState />
        ) : rows.length === 0 ? (
          <EmptyState description={tx("hp_emptyTemplates")} />
        ) : (
          <CardGrid min={260}>
            {rows.map((r) => {
              const TplIcon = templateIcon(r.code);
              return (
                <article key={r.id} className="ops-tpl-card">
                  <button type="button" className="ops-tpl-thumb" onClick={() => openStudio(r)} aria-label={`${tx("ops_tpl_edit")} · ${r.name}`}>
                    <span className="ops-tpl-paper" aria-hidden>
                      <span className="ops-tpl-paper-head">
                        <span />
                        <TplIcon size={22} weight="duotone" />
                      </span>
                      <span className="ops-tpl-line" />
                      <span className="ops-tpl-line is-short" />
                      <span className="ops-tpl-rows">
                        <span />
                        <span />
                        <span />
                        <span />
                      </span>
                    </span>
                  </button>
                  <div className="ops-tpl-body">
                    <div className="ops-tpl-name">
                      <strong>{r.name}</strong>
                      <StatusTag status={r.active ? "ACTIVE" : "INACTIVE"} label={tx(r.active ? "ops_tpl_active" : "ops_tpl_inactive")} tone={r.active ? "success" : "neutral"} />
                    </div>
                    <div className="ops-tpl-actions">
                      <Button size="small" type="text" icon={<Eye size={16} />} href={`/api/document-templates/${r.id}/preview`} target="_blank">
                        {tx("ops_tpl_preview")}
                      </Button>
                      <Button size="small" icon={<PencilSimple size={16} />} onClick={() => openStudio(r)}>
                        {tx("ops_tpl_edit")}
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </CardGrid>
        )
      ) : narrow ? (
        <OpsMobileList
          items={rows.map((r) => ({
            key: r.id,
            title: r.name,
            status: <StatusTag status={r.active ? "ACTIVE" : "INACTIVE"} label={tx(r.active ? "ops_tpl_active" : "ops_tpl_inactive")} tone={r.active ? "success" : "neutral"} />,
            line2: <span className="ops-code">{r.code}</span>,
            onClick: () => openStudio(r),
          }))}
          emptyText={tx("hp_emptyTemplates")}
        />
      ) : (
        <DataTable<TemplateRow>
          rowKey="id"
          loading={q.isLoading}
          dataSource={rows}
          columns={columns}
          onRowClick={openStudio}
          emptyText={tx("hp_emptyTemplates")}
        />
      )}

      <Drawer
        open={Boolean(editId)}
        onClose={() => setEditId(null)}
        width={760}
        title={editing ? editing.name : tx("ops_tpl_edit")}
        extra={editing ? <span className="ops-code cz-muted">{editing.code}</span> : null}
        footer={
          <div className="ops-drawer-foot">
            <Button type="text" onClick={() => setEditId(null)}>
              {tx("ops_close")}
            </Button>
            <Button type="primary" loading={save.isPending} disabled={!parsedJson} onClick={() => validateBeforeSave() && save.mutate()}>
              {tx("ops_tpl_save")}
            </Button>
          </div>
        }
      >
        {editId ? (
          <Tabs
            activeKey={studioTab}
            onChange={setStudioTab}
            items={[
              {
                key: "editor",
                label: tx("ops_tpl_tabEditor"),
                children: (
                  <div className="cz-stack">
                    <p className="cz-muted" style={{ margin: 0 }}>
                      {tx("ops_tpl_editorHint")}
                    </p>
                    <Input.TextArea
                      aria-label={tx("ops_tpl_tabEditor")}
                      rows={20}
                      value={jsonText}
                      onChange={(e) => setJsonText(e.target.value)}
                      className="ops-code"
                      spellCheck={false}
                    />
                    {jsonText && !parsedJson ? <Alert type="error" showIcon message={tx("ops_tpl_invalid")} /> : null}
                    {jsonError ? <Alert type="error" showIcon message={jsonError} /> : null}
                  </div>
                ),
              },
              {
                key: "preview",
                label: tx("ops_tpl_preview"),
                children: <iframe title={tx("ops_tpl_preview")} src={`/api/document-templates/${editId}/preview`} className="ops-preview-frame" />,
              },
            ]}
          />
        ) : null}
      </Drawer>
    </div>
  );
}
