export type Department = "sales" | "finance" | "admin";

export type ShellUser = {
  id: string;
  email: string;
  name: string;
  nameZh: string;
  department: Department;
  roles: string[];
};

export const DEPARTMENTS: Department[] = ["sales", "finance", "admin"];
