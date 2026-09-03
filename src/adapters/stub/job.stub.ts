import type { JobPort } from "../../ports/job.port.ts";

export const jobStub: JobPort = {
  async list() {
    return [];
  },
  async get() {
    return null;
  },
};

export async function connectJobRemote(): Promise<JobPort> {
  const { jobApiAdapter } = await import("../api/job.adapter.ts");
  return jobApiAdapter;
}
