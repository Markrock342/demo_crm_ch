export type ShellContactRole =
  | "Purchasing"
  | "ImportExport"
  | "Accounting"
  | "Warehouse"
  | "Management"
  | "Other";

export type ShellCustomer = {
  id: string;
  nameZh: string;
  nameTh: string;
  nameEn: string;
  cityZh: string;
  cityTh: string;
  cityEn: string;
  laneZh: string;
  laneTh: string;
  laneEn: string;
  owner: string;
  updated: string;
  taxId?: string;
  billingAddress?: string;
  creditTerm?: string;
  creditLimit?: number;
  portalPin?: string;
};

export type ShellContact = {
  id: string;
  customerId: string;
  name: string;
  title: string;
  email: string;
  phone: string;
  wechat: string;
  primary: boolean;
  role?: ShellContactRole;
};

export type ShellLead = {
  id: string;
  company: string;
  city: string;
  lane: string;
  contact: string;
  source: string;
  stage: string;
  teu: number;
  owner: string;
  updated: string;
};

export type ShellDeal = {
  id: string;
  customerId: string;
  title: string;
  lane: string;
  stage: string;
  value: number;
  teu: number;
  close: string;
  owner: string;
};

export type CrmPort = {
  listCustomers(): Promise<ShellCustomer[]>;
  listContacts(): Promise<ShellContact[]>;
  listLeads(): Promise<ShellLead[]>;
  listDeals(): Promise<ShellDeal[]>;
};
