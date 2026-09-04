import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = process.env.UPLOAD_DIR?.trim() || join(process.cwd(), "uploads");

export function uploadRoot() {
  return ROOT;
}

export async function saveObject(orgId: string, objectKey: string, data: Buffer): Promise<string> {
  const dir = join(ROOT, orgId);
  await mkdir(dir, { recursive: true });
  const full = join(dir, objectKey);
  await writeFile(full, data);
  return objectKey;
}

export async function readObject(orgId: string, objectKey: string): Promise<Buffer | null> {
  try {
    return await readFile(join(ROOT, orgId, objectKey));
  } catch {
    return null;
  }
}

export function objectKeyForDoc(docId: string, filename: string) {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${docId}-${safe}`;
}
