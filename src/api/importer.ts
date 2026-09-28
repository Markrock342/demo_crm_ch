import type { ImportEntity, Issue } from "../lib/importer";

export type ImportRowStatus = "ready" | "created" | "duplicate" | "error";
export type ImportRowResult = { row: number; status: ImportRowStatus; id?: string; label?: string; errors: Issue[]; warnings: Issue[] };
export type ImportResult = {
  batchId: string | null;
  dryRun: boolean;
  results: ImportRowResult[];
  summary: { total: number; created: number; ready: number; duplicate: number; error: number };
};
export type ImportBatch = {
  id: string;
  entity: ImportEntity;
  fileName: string;
  createdBy: string | null;
  createdByName: string | null;
  rowCount: number;
  createdCount: number;
  duplicateCount: number;
  errorCount: number;
  createdAt: string;
  undoneAt: string | null;
  undoable: boolean;
};

export class ImportApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: "include", ...init });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ImportApiError(String(data.error ?? `api_${res.status}`), res.status);
  return data as T;
}

/** Send mapped rows. `dryRun` checks everything (duplicates, customer matches) and saves nothing. */
export function sendImport(entity: ImportEntity, body: { fileName: string; dryRun: boolean; rows: { row: number; data: Record<string, unknown> }[] }) {
  return call<ImportResult>(`/api/import/${entity}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function listImportBatches() {
  return (await call<{ items: ImportBatch[] }>("/api/import/batches")).items;
}

export function undoImportBatch(id: string) {
  return call<{ ok: true; removed: number }>(`/api/import/batches/${encodeURIComponent(id)}/undo`, { method: "POST" });
}
