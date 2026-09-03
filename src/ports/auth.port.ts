import type { Department, ShellUser } from "../shell/types.ts";

export type AuthPort = {
  enterAsDepartment(department: Department): Promise<ShellUser>;
  /** Remote credential login — stub returns not_configured until wired. */
  loginRemote(_email: string, _password: string): Promise<ShellUser>;
};

export class NotConfiguredError extends Error {
  readonly code = "not_configured" as const;
  constructor(message = "not_configured") {
    super(message);
    this.name = "NotConfiguredError";
  }
}
