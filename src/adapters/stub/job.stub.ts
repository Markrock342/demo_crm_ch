import type { JobPort } from "../../ports/job.port.ts";
import { NotConfiguredError } from "../../ports/auth.port.ts";

export const jobStub: JobPort = {
  async list() {
    return [];
  },
  async get() {
    return null;
  },
};

export async function connectJobRemote(): Promise<never> {
  throw new NotConfiguredError();
}
