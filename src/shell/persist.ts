/** Shared localStorage helpers for shell walkthrough data. */

export type PersistEnvelope<T> = {
  v: number;
  savedAt: string;
  data: T;
};

export function loadPersisted<T>(key: string, version: number): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistEnvelope<T>;
    if (!parsed || parsed.v !== version || parsed.data == null) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function savePersisted<T>(key: string, version: number, data: T): void {
  try {
    const envelope: PersistEnvelope<T> = {
      v: version,
      savedAt: new Date().toISOString(),
      data,
    };
    localStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    /* quota / private mode — ignore */
  }
}
