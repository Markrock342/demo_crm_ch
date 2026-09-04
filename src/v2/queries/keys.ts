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
    byCustomer: (customerId: string) => ["containers", "customer", customerId] as const,
  },
};
