export const queryKeys = {
  jobs: {
    all: ["jobs"] as const,
    list: (customerId?: string, milestoneFilter?: string) =>
      ["jobs", "list", customerId ?? "", milestoneFilter ?? "all"] as const,
    detail: (id: string) => ["jobs", "detail", id] as const,
    financials: (id: string) => ["jobs", "financials", id] as const,
    charges: (id: string) => ["jobs", "charges", id] as const,
    milestones: (id: string) => ["jobs", "milestones", id] as const,
  },
  containers: {
    all: ["containers"] as const,
    byCustomer: (customerId: string) => ["containers", "customer", customerId] as const,
    byJob: (jobId: string) => ["containers", "job", jobId] as const,
  },
  crm: {
    bundle: ["crm", "bundle"] as const,
  },
  rates: {
    search: (params: Record<string, string>) => ["rates", "search", params] as const,
  },
  quotations: {
    list: (customerId?: string) => ["quotations", "list", customerId ?? ""] as const,
  },
  invoices: {
    list: (customerId?: string) => ["invoices", "list", customerId ?? ""] as const,
  },
  docs: {
    byCustomer: (customerId: string) => ["docs", "customer", customerId] as const,
  },
};
