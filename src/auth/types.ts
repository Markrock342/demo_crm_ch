export type AuthUser = {
  id: string;
  email: string;
  name: string;
  nameZh: string | null;
  roles: string[];
  permissions: string[];
};

export type AppMode = "demo" | "production" | "loading";
