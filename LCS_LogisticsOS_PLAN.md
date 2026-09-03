# LCS LogisticsOS — Product / Development Plan

> Existing repository: `Markrock342/demo_crm_ch`  
> Current product name in repo: **CANGZHAN (沧栈)**  
> Goal: evolve the current Thailand–China logistics CRM demo into a realistic, production-like logistics operations system and LCS flagship demo.

## Current system already exists

The repository already has a working demo with Dashboard/TEU overview, Thailand→China routes, customers, container status/filtering, container yard movement, Gemini email drafting, AI summaries, department reports, CSV export, Thai/Chinese/English UI, demo reset, and server-side Gemini API key handling.

**Do not rebuild these features from zero. Extend the current codebase and data model.**

## Core product flow

```text
Lead → Customer → Rate/Quotation → Booking → Shipment/Job
→ Container → Documents → Operations → Cost/Revenue
→ Invoice → Payment → Report
```

The most important screen is **Shipment / Job Detail**. Staff should open one job and understand the entire situation without switching between Excel, LINE, email, and several systems.

## 1. Shipment / Job Management — highest priority

Shipment list must contain:

- Job number
- Customer / Shipper / Consignee
- Origin / Destination / POL / POD
- Service type: FCL / LCL / Air / Truck
- Incoterm
- Carrier / shipping line
- Vessel / Flight / Voyage
- ETD / ETA
- Container quantity
- Sales owner / Operation owner
- Current status
- Billing status

Filters: customer, route, carrier, owner, status, ETD/ETA, delayed, unbilled, unpaid.

## 2. Shipment Detail — heart of the system

One page should contain:

### General
- Job number
- Customer and contacts
- Sales/operation owner
- Route and service type
- Incoterm
- Carrier
- Vessel/flight
- ETD / ETA

### Containers
- Container number
- Size/type
- Seal number
- Gate-in / loading / departure / arrival / return
- Current status
- Free time / last free day
- Demurrage / detention risk

### Documents
Support:
- Booking Confirmation
- BL / Draft BL
- Commercial Invoice
- Packing List
- C/O
- Customs documents
- Delivery Order
- POD
- Other attachments

Each document should track type, version, uploader, date, approval status, and note.

### Financial
- Selling amount
- Freight cost
- Truck cost
- Customs cost
- Vendor/other cost
- Gross profit
- Margin %

### Communication
- Email history
- Internal notes
- Customer notes
- AI summary
- AI draft email

### Timeline

```text
Quotation accepted
→ Booking created
→ Container assigned
→ Empty pickup
→ Gate-in
→ Customs cleared
→ Loaded
→ Departed
→ Arrived
→ DO issued
→ Delivered
→ POD received
→ Invoice issued
→ Payment received
```

## 3. Customer CRM

Customer profile:
- Company / Tax ID / Billing address
- Multiple contacts
- Sales owner
- Credit term / credit limit
- Preferred route / carrier
- Rate agreements
- Active / completed jobs
- Outstanding invoices
- Revenue and gross profit
- Full communication timeline

Allow contacts by role: Purchasing, Import/Export, Accounting, Warehouse, Management.

## 4. Quotation / Rate Management

Add rate sheets and quotations with:
- Version control
- Valid from / until
- Origin / destination / POL / POD
- Carrier
- Container type
- Freight / local charges / customs / trucking / other charges
- Markup / selling price / estimated profit

Statuses:
`Draft → Sent → Revision → Accepted / Rejected / Expired`

Accepted quotation should convert into a Shipment/Job.

## 5. Container Management

Extend current container module with:
- Container No.
- Size/type
- Seal
- Shipment
- Customer
- Carrier
- Yard location
- Free time / last free day
- Current status

Statuses:
`Waiting Booking, Empty Pickup, Stuffing, Gate In, Loaded, In Transit, Arrived, Customs, DO Ready, Delivered, Empty Returned, Closed`

Exception flags:
- ETA changed
- C/O pending
- Missing document
- Free time near expiry
- Customs pending
- Container not returned

## 6. Billing / Finance

### Invoice
- Invoice number
- Customer
- Related job
- Issue / due date
- Credit term
- Amount / VAT / withholding tax
- Payment status

Statuses: `Draft, Issued, Partially Paid, Paid, Overdue, Cancelled`

### Cost
Track shipping line, trucking, customs broker, depot, warehouse, and other vendor costs.

### Profitability
- Revenue
- Cost
- Gross profit
- Margin %
- Profit by customer / route / salesperson / job

## 7. Document Center

Global searchable document center by job, customer, container, document type, date, and missing status.

Add **Missing Documents** dashboard.

Example:

```text
JOB-26090123
BL Draft      Complete
Packing List  Complete
Invoice       Complete
C/O           Missing
POD           Waiting
```

## 8. AI Features

### AI Email
- Summarize incoming email
- Extract shipment details
- Detect requested action
- Draft reply
- Translate Thai / English / Chinese

### AI Job Summary
Example:

```text
JOB-26090123 is in transit.
ETA Ningbo: 7 Sep.
C/O is pending.
Customer requested final BL before 16:00.
No payment issue.
```

### AI Management Report
- Daily operation summary
- Delayed shipments
- At-risk containers
- Missing documents
- Outstanding invoices
- Job volume / container count

AI must **never send email automatically without user confirmation**.

## 9. Dashboard

Widgets:
- Active shipments
- Departing today / arriving today
- Delayed shipments
- Containers in transit
- Waiting customs
- Missing documents
- Outstanding invoices
- Revenue / gross profit this month
- TEU this month

Charts:
- Shipment volume by month
- TEU by route
- Revenue vs cost
- Top customers
- Job status distribution

## 10. Exception Center

Central problem inbox:
- ETA delayed
- C/O missing
- BL awaiting approval
- Free time expires soon
- Invoice overdue
- Shipment has no operation owner
- POD not received

Prioritize exceptions, not just normal events.

## 11. Roles & Permissions

Recommended roles:
`Admin, Management, Sales, Operations, Documentation, Accounting, Viewer`

Add audit logs for important status, financial, document, and assignment changes.

## 12. Demo Data

Use realistic Thailand–China examples:
- Laem Chabang → Yantian
- Laem Chabang → Ningbo
- Bangkok → Shanghai
- Bangkok → Shenzhen
- Rayong → Guangzhou

Target demo data:
- 15 customers
- 30 active/completed jobs
- 40+ containers
- 20 quotations
- 20 invoices
- Several delayed / exception cases

## Definition of Done

Core flow must work end-to-end:

```text
Create customer
→ Create quotation
→ Accept quotation
→ Create shipment
→ Assign containers
→ Upload documents
→ Update shipment
→ Add cost
→ Issue invoice
→ Receive payment
→ View profit
```

No dead buttons in the main demo flow.

## Development Priority

### Phase A — Must Have
Shipment/Job, Shipment Detail, Customer Detail, Quotation, Documents, Billing, Cost+Profit, Dashboard Exceptions.

### Phase B
Notifications, advanced container tracking, vendors, rates, customer portal.

### Phase C
Real email integration, external tracking APIs, accounting integration, advanced AI extraction, workflow automation.

## Positioning

**LCS LogisticsOS**  
Custom logistics operations software for freight forwarders, transport operators and logistics SMEs.

Do not position it as only a CRM. It should feel like:

**CRM + Shipment Operations + Container + Documents + Finance + AI**
