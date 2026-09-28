export type AuthUser = {
  id: string;
  email: string;
  name: string;
  nameZh: string | null;
  roles: string[];
  permissions: string[];
  organizationId?: string | null;
  organizationName?: string | null;
};

export type AppMode = "demo" | "production" | "loading";
