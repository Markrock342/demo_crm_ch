export type ShipmentStatus = "booking" | "gate_in" | "sail" | "arrived" | "delivered";

export type Shipment = {
  id: string;
  customerId: string;
  bookingNo: string;
  bl: string;
  vessel: string;
  voyage: string;
  carrier: string;
  pol: string;
  pod: string;
  etd: string;
  eta: string;
  teu: number;
  status: ShipmentStatus;
};

export type InvoiceStatus = "open" | "paid" | "overdue";

export type Invoice = {
  id: string;
  customerId: string;
  invoiceNo: string;
  amount: number;
  currency: "CNY" | "THB" | "USD";
  due: string;
  status: InvoiceStatus;
  note: string;
};

export const shipments: Shipment[] = [
  {
    id: "s1",
    customerId: "c4",
    bookingNo: "NSA25082911",
    bl: "NSA25082911",
    vessel: "COSCO SHIPPING ARIES",
    voyage: "042E",
    carrier: "COSCO",
    pol: "CNNSA",
    pod: "THLCH",
    etd: "09-04",
    eta: "09-11",
    teu: 3,
    status: "gate_in",
  },
  {
    id: "s2",
    customerId: "c9",
    bookingNo: "LCB25090201",
    bl: "LCB25090201",
    vessel: "ONE COMMITMENT",
    voyage: "018W",
    carrier: "ONE",
    pol: "THLCH",
    pod: "CNYTN",
    etd: "09-05",
    eta: "09-12",
    teu: 4,
    status: "booking",
  },
  {
    id: "s3",
    customerId: "c1",
    bookingNo: "SHZ25090281",
    bl: "SHZ25090281",
    vessel: "MSC LONDON",
    voyage: "331N",
    carrier: "MSC",
    pol: "CNYTN",
    pod: "THLCH",
    etd: "09-06",
    eta: "09-14",
    teu: 4,
    status: "sail",
  },
  {
    id: "s5",
    customerId: "c5",
    bookingNo: "YIW25090102",
    bl: "YIW25090102",
    vessel: "CMA CGM THALASSA",
    voyage: "0FM01W",
    carrier: "CMA CGM",
    pol: "CNNGB",
    pod: "THBKK",
    etd: "09-08",
    eta: "09-16",
    teu: 6,
    status: "gate_in",
  },
  {
    id: "s6",
    customerId: "c3",
    bookingNo: "TAO25080177",
    bl: "TAO25080177",
    vessel: "PIL BANGKOK",
    voyage: "221S",
    carrier: "PIL",
    pol: "CNTAO",
    pod: "THLCH",
    etd: "08-29",
    eta: "09-06",
    teu: 2,
    status: "arrived",
  },
];

export const invoices: Invoice[] = [
  { id: "inv1", customerId: "c3", invoiceNo: "CZ-2025-0812", amount: 86400, currency: "CNY", due: "08-22", status: "overdue", note: "August ocean + THC" },
  { id: "inv2", customerId: "c4", invoiceNo: "CZ-2025-0901", amount: 128000, currency: "CNY", due: "09-15", status: "open", note: "Nansha C/O hold job" },
  { id: "inv3", customerId: "c1", invoiceNo: "CZ-2025-0903", amount: 45200, currency: "CNY", due: "09-20", status: "open", note: "Yantian furniture backhaul" },
  { id: "inv4", customerId: "c5", invoiceNo: "CZ-2025-0828", amount: 31800, currency: "CNY", due: "09-10", status: "paid", note: "Yiwu LCL week 34" },
  { id: "inv5", customerId: "c10", invoiceNo: "CZ-2025-0902", amount: 28600, currency: "CNY", due: "09-18", status: "open", note: "Latex 20GP quote" },
];

export const shipmentStatusI18n: Record<ShipmentStatus, string> = {
  booking: "shBooking",
  gate_in: "shGateIn",
  sail: "shSail",
  arrived: "shArrived",
  delivered: "shDelivered",
};

export function openInvoiceTotal(invoices: Invoice[]) {
  return invoices.filter((i) => i.status === "open" || i.status === "overdue").reduce((n, i) => n + i.amount, 0);
}

export function overdueInvoices(invoices: Invoice[]) {
  return invoices.filter((i) => i.status === "overdue");
}
