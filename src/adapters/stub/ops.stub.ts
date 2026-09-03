import type { OpsPort } from "../../ports/ops.port.ts";
import { NotConfiguredError } from "../../ports/auth.port.ts";

export const opsStub: OpsPort = {
  async listBoxes() {
    return [];
  },
  async listShipments() {
    return [];
  },
};

export async function connectOpsRemote(): Promise<never> {
  throw new NotConfiguredError();
}
