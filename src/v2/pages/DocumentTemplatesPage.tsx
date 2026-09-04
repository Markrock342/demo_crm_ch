import { Alert, Button, Card, Col, Input, Row, Space, Table, Tabs, Typography, message } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { PageHeader } from "../components/PageHeader.tsx";
import { useAppMode } from "../hooks/useAppMode.ts";

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
  const { live } = useAppMode();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["document-templates"], queryFn: fetchTemplates, enabled: live });
  const [editId, setEditId] = useState<string | null>(null);
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  function parseJson(text: string): Record<string, unknown> | null {
    if (!text.trim()) return null;
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch (e) {
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
      setJsonError(e instanceof Error ? e.message : "Invalid JSON");
      return false;
    }
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!parsedJson) throw new Error(jsonError ?? "invalid_json");
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
      message.success("Template saved");
      setEditId(null);
      void qc.invalidateQueries({ queryKey: ["document-templates"] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  if (!live) {
    return <Alert type="info" message="Document templates require production mode + database." />;
  }

  return (
    <div style={{ padding: "0 8px 24px" }}>
      <PageHeader
        title="Document template studio"
        subtitle="Edit pdfme template JSON and preview generated PDFs per template."
      />
      {q.isLoading ? (
        <span>Loading…</span>
      ) : (
        <Table
          size="small"
          rowKey="id"
          dataSource={q.data ?? []}
          columns={[
            { title: "Code", dataIndex: "code", width: 140 },
            { title: "Name", dataIndex: "name" },
            {
              title: "Active",
              dataIndex: "active",
              width: 80,
              render: (v: boolean) => (v ? "Yes" : "No"),
            },
            {
              title: "",
              width: 200,
              render: (_, row) => (
                <Space>
                  <Button
                    size="small"
                    type="primary"
                    onClick={() => {
                      setEditId(row.id);
                      setJsonText(JSON.stringify(row.templateJson, null, 2));
                      setJsonError(null);
                    }}
                  >
                    Open studio
                  </Button>
                  <Button size="small" href={`/api/document-templates/${row.id}/preview`} target="_blank">
                    Preview PDF
                  </Button>
                </Space>
              ),
            },
          ]}
        />
      )}
      {editId ? (
        <Card size="small" title="Template studio" style={{ marginTop: 16 }}>
          <Tabs
            items={[
              {
                key: "editor",
                label: "JSON schema",
                children: (
                  <>
                    <Typography.Paragraph type="secondary">
                      pdfme template: set <code>schemas</code>, <code>basePdf</code>, and field bindings. Save validates JSON before PATCH.
                    </Typography.Paragraph>
                    <Input.TextArea
                      rows={18}
                      value={jsonText}
                      onChange={(e) => setJsonText(e.target.value)}
                      style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}
                    />
                    {jsonText && !parsedJson ? <Alert type="error" message="Invalid JSON — fix before saving" style={{ marginTop: 8 }} /> : null}
                    {jsonError ? <Alert type="error" message={jsonError} style={{ marginTop: 8 }} /> : null}
                    <Space style={{ marginTop: 12 }}>
                      <Button type="primary" loading={save.isPending} disabled={!parsedJson} onClick={() => validateBeforeSave() && save.mutate()}>
                        Save template
                      </Button>
                      <Button onClick={() => setEditId(null)}>Close</Button>
                    </Space>
                  </>
                ),
              },
              {
                key: "preview",
                label: "Live preview",
                children: (
                  <Row gutter={16}>
                    <Col span={24}>
                      <iframe
                        title="PDF preview"
                        src={`/api/document-templates/${editId}/preview`}
                        style={{ width: "100%", height: 640, border: "1px solid #d9d9d9", borderRadius: 8 }}
                      />
                    </Col>
                  </Row>
                ),
              },
            ]}
          />
        </Card>
      ) : null}
    </div>
  );
}
