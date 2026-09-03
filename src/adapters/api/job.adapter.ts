import { fetchJob, fetchJobs } from "../../api/commercial.ts";
import type { JobPort } from "../../ports/job.port.ts";
import { mapApiJobDetailToShell, mapJobRowToShell } from "./jobMapper.ts";

export const jobApiAdapter: JobPort = {
  async list() {
    const rows = await fetchJobs();
    return rows.map((r) => mapJobRowToShell(r));
  },
  async get(id: string) {
    try {
      const row = await fetchJob(id);
      return mapApiJobDetailToShell(row);
    } catch {
      return null;
    }
  },
};

export async function connectJobRemote(): Promise<JobPort> {
  return jobApiAdapter;
}
