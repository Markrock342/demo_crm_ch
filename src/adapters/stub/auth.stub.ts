import type { AuthPort } from "../../ports/auth.port.ts";
import { NotConfiguredError } from "../../ports/auth.port.ts";
import type { Department, ShellUser } from "../../shell/types.ts";

const profiles: Record<Department, ShellUser> = {
  sales: {
    id: "shell-sales",
    email: "sales@shell.local",
    name: "Sales Desk",
    nameZh: "销售席",
    department: "sales",
    roles: ["SALES"],
  },
  finance: {
    id: "shell-finance",
    email: "finance@shell.local",
    name: "Finance Desk",
    nameZh: "财务席",
    department: "finance",
    roles: ["ACCOUNTING"],
  },
  admin: {
    id: "shell-admin",
    email: "admin@shell.local",
    name: "Admin Desk",
    nameZh: "管理席",
    department: "admin",
    roles: ["SUPER_ADMIN"],
  },
};

export const authStub: AuthPort = {
  async enterAsDepartment(department: Department): Promise<ShellUser> {
    return { ...profiles[department] };
  },
  async loginRemote(): Promise<ShellUser> {
    throw new NotConfiguredError();
  },
};
