export type Department = "sales" | "marketing" | "cs" | "finance" | "admin" | "ops";

export type ShellUser = {
  id: string;
  email: string;
  name: string;
  nameZh: string;
  department: Department;
  roles: string[];
};

export const DEPARTMENTS: Department[] = ["sales", "marketing", "cs", "ops", "finance", "admin"];
