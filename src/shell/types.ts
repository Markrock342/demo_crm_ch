export type Department = "sales" | "finance" | "admin" | "ops";

export type ShellUser = {
  id: string;
  email: string;
  name: string;
  nameZh: string;
  department: Department;
  roles: string[];
};

export const DEPARTMENTS: Department[] = ["sales", "ops", "finance", "admin"];
