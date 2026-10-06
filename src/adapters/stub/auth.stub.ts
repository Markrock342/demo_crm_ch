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
  marketing: {
    id: "shell-marketing",
    email: "marketing@shell.local",
    name: "Marketing Desk",
    nameZh: "市场席",
    department: "marketing",
    roles: ["MARKETING"],
  },
  cs: {
    id: "shell-cs",
    email: "cs@shell.local",
    name: "Service Desk",
    nameZh: "客服席",
    department: "cs",
    roles: ["CUSTOMER_SERVICE"],
  },
  ops: {
    id: "shell-ops",
    email: "ops@shell.local",
    name: "Ops Desk",
    nameZh: "操作席",
    department: "ops",
    roles: ["OPS"],
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
