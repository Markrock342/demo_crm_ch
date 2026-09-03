# Handoff — สรุปงาน CANGZHAN (สำหรับทำงานต่อ)

> อัปเดต: 4 กันยายน 2569 (Phase A **Closed** · Phase B **Closed**)  
> Repo: `Markrock342/demo_crm_ch` · Local: `c:\my_job\crm` · Deploy: `democrmch.vercel.app`  
> Audience: เพื่อนร่วมทีมที่ต้องศึกษาและต่อยอดได้ทันที  
> Local UI: `http://localhost:5173/` (`npm run dev`)

เอกสารนี้สรุป **สิ่งที่ทำแล้ว / ยังไม่ทำ / ไม่ยุ่ง** จากรอบ DB/API เดิม → P0 + full shell → **LCS Phase A + B (Closed)**

---

## 1. ใจความสำคัญ (อ่านก่อน)

1. **เป้าหมายปัจจุบันของ UI walkthrough:** ใช้งานได้จริงบน **shell client** (in-memory + `localStorage`) — **ยังไม่เชื่อม API / PostgreSQL / Vercel DB**
2. **สถาปัตยกรรมที่ล็อก:** `UI → ports → adapters/stub` + `src/shell/*` · **ห้ามแก้** `server/**` และ `src/api/**` ในรอบ shell
3. **โดเมน:** CRM 货代 จีน–ไทย · FCL ทะเล · Job เป็นแกน · ลานตู้ + portal ลูกค้า
4. **แผนก Login:** Sales | **Ops** | Finance | Admin
5. **ข้อมูล:** seed LCS · persist keys **`*-v4`**
6. **Phase A:** Closed — Job 360 + exceptions — [`lcs-phase-a.md`](./lcs-phase-a.md)
7. **Phase B:** Closed — tracking §5 · vendors · rates→quote · notifications · `/portal` — [`lcs-phase-b.md`](./lcs-phase-b.md)
8. **ถัดไป:** Phase C ตาม `LCS_LogisticsOS_PLAN.md`

---

## 2. เราทำอะไรไปแล้วบ้าง

### 2.1 รอบ backlog เดิม (ก่อน shell) — ฝั่ง server/DB

| งาน | สถานะ | หมายเหตุ |
|-----|--------|----------|
| Foundation migrate (txn + ledger) | ✅ | `server/db/migrate.ts` |
| PgBouncer ใน `docker-compose.yml` | ✅ | local |
| Drop `customers.boxes` (derive จาก containers) | ✅ | migration `0004` |
| Vendor Bills from-job + approve (API) | ✅ | ยังไม่ AP payment |
| Mail/docs persistence ใน PG | ✅ | migration `0005` |
| Docs foundation / finance-ap / mail-docs | ✅ | |

**Commit อ้างอิง (ก่อนหน้า):** `d87e017` — Close demo backlog…

### 2.2 รอบ P0 — Basics UI shell

| งาน | สถานะ |
|-----|--------|
| Login เลือกแผนก (เลิกข้าม demo เข้าแอปทันที) | ✅ |
| Shell session (`enterAs` / `leave`) | ✅ |
| CRM empty walkthrough (Customers/Contacts/Leads/Pipeline) | ✅ |
| Quote draft → approval → sent + preview shell | ✅ |
| Billing ร่าง → ออกใบ → วางบิล → รับชำระ (memory) | ✅ |
| ซ่อน Boxes/Yard/Shipments จาก nav (ตอน P0) | ✅ (ภายหลังเปิดตามมติใหม่) |
| Docs `docs/basics-ui-p0.md` | ✅ |

**Commit อ้างอิง:** `d0aec17` — Add P0 basics UI shell…

### 2.3 รอบ Client full shell

| Phase | งาน | สถานะ |
|-------|-----|--------|
| 1 | UI density (บีบ chrome / toolbar / `.is-dense` / table height) | ✅ |
| 2a | แผนก **Ops** + nav ตามมติข้อ 7 | ✅ |
| 2b | `opsStore` + ports + seed + `persist.ts` + localStorage | ✅ |
| 2c | Boxes / Shipments / Yard โหมด shell | ✅ |
| 3 | Quote หลาย charges + รับ/ปฏิเสธ · Job · Shipment/Invoice จาก job | ✅ |
| 4 | Rates / Tasks / Docs checklist / Vendor bills stub | ✅ |
| Docs | `docs/client-full-shell.md` + อัปเดต index/plan | ✅ |

### 2.4 รอบ LCS Phase A (Closed)

| งาน | สถานะ |
|-----|--------|
| Job domain + seed LCS แกน + Job Detail 360 | ✅ |
| A3 closeout | ✅ |
| Docs Closed + Deferred | ✅ |

### 2.5 รอบ LCS Phase B (Closed)

| งาน | สถานะ |
|-----|--------|
| Container tracking §5 + flags + history | ✅ |
| Vendors master + bills/costs vendorId | ✅ |
| Rates buy/sell + quote from rate | ✅ |
| Notifications + กระดิ่ง | ✅ |
| Customer portal `/portal` | ✅ |
| Persist `*-v4` + docs Closed | ✅ |
---

## 3. อะไรที่เราไม่ได้ทำ (ยังค้าง / รอรอบถัดไป)

| รายการ | เหตุผล / สถานะ |
|--------|----------------|
| เชื่อม stub → API จริง | ตั้งใจเลื่อน — ยังห้ามยุ่ง `src/api` ในรอบ shell |
| Vercel `DATABASE_URL` + migrate/seed prod | รอ ops; health อาจยัง `mode: demo` |
| Inbox เต็ม (mail-ops จริง) | นอกสcope รอบนี้ |
| Reports เต็ม (aggregate จาก DB) | นอกสcope |
| AP payment / allocation / credit notes | นอกสcope |
| LCL / ขนบก / บิน | ล็อกแล้วว่าไม่ทำในรอบนี้ (FCL ทะเลเท่านั้น) |
| Phase B/C (portal, tracking API, อีเมลจริง) | นอกสcope Phase A |
| Architecture replan (ข้อ 8) | เลื่อน |
| รีแบรนด์ UI ใหญ่ | ทำแค่ densify ภายใต้ ledger-house |
| Persist ข้ามเครื่อง / sync ระหว่าง user | มีแค่ localStorage ต่อเบราว์เซอร์ |
| Calendar โหมด shell เต็ม | ยังอยู่ใน nav แต่ไม่ใช่โฟกัสรอบนี้ |

---

## 4. อะไรที่เราไม่ยุ่ง (กฎแดง — อย่าพังของเดิม)

ในรอบ **P0 + Client full shell** ทีมตั้งใจ **ไม่เปิดอ่าน/ไม่แก้**:

| พื้นที่ | หมายเหตุ |
|---------|----------|
| `server/**` | ไม่แก้ schema / routes / services ในรอบ shell |
| `src/api/**` | ไม่เรียก/ไม่ refactor ใน path shell ที่ทำใหม่ |
| Credentials / `.env` secrets | ไม่ commit; ไม่ตั้ง Vercel จากรอบนี้ |
| Vercel / `DATABASE_URL` | ไม่ยุ่งในรอบ shell |
| LCL / บก / บิน | นอกโดเมนที่ล็อก |

**หมายเหตุ:** หน้า Boxes/Yard/Shipments **ถูกแก้** ในรอบ full shell เพื่อรองรับโหมด shell — แต่ logic remote เดิมใต้ `useContainers` / store ยังอยู่เมื่อไม่ใช่ shell mode  
หน้า Jobs / Rates / Quotations / Invoices / VendorBills ในโหมด shell **เลิกพึ่ง import API** สำหรับ walkthrough — ไม่ได้ลบไฟล์ `src/api/*`

---

## 5. ระบบและฟีเจอร์ที่ใช้งานได้ตอนนี้ (shell)

### 5.1 Login + แผนก

- ไฟล์: [`src/pages/Login.tsx`](../src/pages/Login.tsx), [`src/shell/session.tsx`](../src/shell/session.tsx), [`src/shell/types.ts`](../src/shell/types.ts), [`src/adapters/stub/auth.stub.ts`](../src/adapters/stub/auth.stub.ts)
- เข้าแอปด้วย **เลือกแผนก** (ไม่ข้ามเมื่อ demo)
- Remote email/password: **disabled** + ข้อความ TODO (`not_configured`)
- Session แผนกเก็บใน `sessionStorage` (`cangzhan-shell-dept`)

| แผนก | Home | เมนูหลัก |
|------|------|----------|
| Sales | `/` | CRM, Rates, Quotations, Boxes/Shipments (อ่าน), Tasks, Calendar, Settings |
| Ops | `/jobs` | Jobs, Yard, Boxes, Shipments, Docs, Tasks, Calendar, Settings |
| Finance | `/invoices` | Invoices, Vendor bills, Reports, Settings |
| Admin | `/` | เกือบทั้งหมดรวม Yard + Inbox + Reports |

กฎ logistics:

- **Ops + Admin:** แก้ Boxes/Shipments/Yard ได้ (`canEditLogistics`)
- **Sales:** Boxes/Shipments อ่านอย่างเดียว · **ไม่มี Yard**
- **Finance:** ไม่มี logistics ใน nav

โค้ด nav: [`src/shell/nav.ts`](../src/shell/nav.ts)

### 5.2 CRM

- Store: [`src/shell/crmStore.tsx`](../src/shell/crmStore.tsx) · key `cangzhan-shell-crm-v2`
- Seed: [`seedLcs.ts`](../src/shell/seedLcs.ts) (~6 ลูกค้า + contacts)
- หน้า: Customers, Contacts, Leads, Pipeline — สร้าง/เลื่อนสถานะในหน่วยความจำได้
- **Account 360 (shell):** [`Account.tsx`](../src/pages/Account.tsx) — quotes/jobs/invoices/docs ลิงก์เข้าหน้าจริง

### 5.3 Logistics (FCL จีน–ไทย + Yard)

- Store: [`src/shell/opsStore.tsx`](../src/shell/opsStore.tsx) · key `cangzhan-shell-ops-v2`
- Seed: ~8 shipments, ~12 boxes (LCB ↔ Yantian/Ningbo/Shanghai ฯลฯ)
- สถานะ Box: `yard | sail | clear | hold | empty`
- สถานะ Shipment: `booking → gate_in → sail → arrived → delivered`
- Yard slots: A1–C4 (Laem Chabang) — เลือกตู้แล้วย้ายช่องว่างได้
- หน้า: [`Boxes.tsx`](../src/pages/Boxes.tsx) (`?jobId=`), [`Shipments.tsx`](../src/pages/Shipments.tsx) (`?jobId=`), [`Yard.tsx`](../src/pages/Yard.tsx)

### 5.4 เสนอราคา (Quote)

- Store: [`src/shell/quoteStore.tsx`](../src/shell/quoteStore.tsx) · key `cangzhan-shell-quotes-v2`
- สถานะ: `DRAFT | PENDING_APPROVAL | SENT | ACCEPTED | REJECTED`
- Wizard หลาย charges: `/quotations/new`
- Preview สาธารณะ shell: `/q/shell/:id` (รับ/ปฏิเสธ)
- หลัง `ACCEPTED` → สร้าง Job → navigate `/jobs/:id`

### 5.5 Jobs (แกน Phase A)

- Store: [`src/shell/jobStore.tsx`](../src/shell/jobStore.tsx) · key `cangzhan-shell-jobs-v2`
- Domain: owners, ETD/ETA, costs, notes, billingStatus, delayed + helpers GP%
- List: [`Jobs.tsx`](../src/pages/Jobs.tsx) — filter + `?selected=` → Detail
- Detail: [`JobDetail.tsx`](../src/pages/JobDetail.tsx) ที่ `/jobs/:id` — 360 panels
- สร้างจาก quote · milestones · ตู้/docs/cost · invoice จาก job

### 5.6 Billing

- Store: [`src/shell/billingStore.tsx`](../src/shell/billingStore.tsx) · key `cangzhan-shell-billing-v2`
- Invoice มี `jobId` · ออกใบ → วางบิล → รับชำระ · sync `billingStatus` บน job
- หน้า: [`Invoices.tsx`](../src/pages/Invoices.tsx) (`?jobId=`)

### 5.7 โมดูลรอง

- Store รวม: [`src/shell/supportStore.tsx`](../src/shell/supportStore.tsx) · key `cangzhan-shell-support-v2`
- **Rates:** seed FCL + เพิ่มเรทได้
- **Tasks:** ผูก customer / job ได้
- **Docs:** checklist มี `docType` + `jobId` (`ok|wait|late`) — filter `?jobId=`
- **Vendor bills:** สร้างร่าง + อนุมัติใน memory (Finance)
- **Overview:** KPI + exceptions จาก shell stores → `/jobs/:id`

### 5.8 UI density

- [`src/index.css`](../src/index.css), [`src/ui/kit.css`](../src/ui/kit.css)
- บีบ padding `.content` / toolbar · hint บรรทัดเดียว · table `max-height` ต่ำลง · `.app.is-dense` กิน toolbar/content
- ทิศทางแบรนด์ยังเป็น **ledger-house** (ดู `.impeccable.md`) — ไม่รีดีไซน์ใหญ่

### 5.9 Persist ร่วม

- Helper: [`src/shell/persist.ts`](../src/shell/persist.ts) — envelope `{ v, savedAt, data }`
- Providers ห่อใน [`src/main.tsx`](../src/main.tsx): Session → CRM → Ops → Quote → Job → Billing → Support → Store

---

## 6. แผนที่โค้ด (จุดเริ่มศึกษา)

```
src/
  shell/          # session, nav, stores, persist  ← หัวใจรอบนี้
  ports/          # auth, crm, quote, billing, ops, job
  adapters/stub/  # คืน [] หรือ NotConfiguredError
  pages/          # Login, CRM, Quote*, Jobs, JobDetail, Boxes, Yard, Shipments, Invoices, Overview, Account, ...
  App.tsx         # routes + กรอง nav ตามแผนก (+ `/jobs/:id`)
  main.tsx        # provider tree
docs/
  index.md
  lcs-phase-a.md
  basics-ui-p0.md
  client-full-shell.md
  handoff-client-shell.md   ← ไฟล์นี้
  foundation.md / finance-ap.md / mail-docs.md
plan.md
```

Ports มีไว้ให้รอบถัดไป **เสียบ adapter จริง** โดยไม่รื้อ UI — ตอนนี้ stub ว่าง/`not_configured`

---

## 7. Flow ที่ควรลอง walkthrough (QA มือ) — DoD Phase A

1. Login → **Ops** → land ที่ `/jobs` · Overview มี KPI/exceptions  
2. เปิด Job Detail จาก list → แก้ตู้/docs/cost → เห็น GP  
3. Boxes / Shipments / Docs ด้วย `?jobId=` จาก Job Detail  
4. Logout → Login **Sales** → Customers → Quotations → Accept → Create job → ไป `/jobs/:id`  
5. Job → Invoice from job → Invoices ออกใบ/รับชำระ → billingStatus บน Job อัปเดต  
6. Account ของลูกค้า → แท็บ jobs/invoices/docs ลิงก์ได้  
7. Refresh หน้า → ข้อมูลยังอยู่ (localStorage `*-v2`)  

---

## 8. สิ่งที่ควรทำต่อ (แนะนำลำดับ)

1. **เสียบ API:** เขียน adapter จริงใต้ `adapters/` ที่เรียก `src/api` / server — สลับเมื่อมี auth production  
2. **Vercel DB:** ตั้ง pooled `DATABASE_URL` + `DB_POOL_MAX=1` → migrate/seed → ตรวจ `/api/health` = production  
3. **Phase C** ตาม `LCS_LogisticsOS_PLAN.md` (อีเมลจริง · tracking API · accounting · AI ลึก · automation)  
4. **อย่า commit** `.env` / secrets  

---

## 9. เอกสารที่เกี่ยวข้อง

| ไฟล์ | เนื้อหา |
|------|---------|
| [plan.md](../plan.md) | สรุปสถานะโปรเจกต์ฉบับสั้น |
| [docs/index.md](./index.md) | Architecture map |
| [docs/lcs-phase-a.md](./lcs-phase-a.md) | LCS Phase A Job-centric |
| [docs/client-full-shell.md](./client-full-shell.md) | สถานะรอบ full shell (protocol) |
| [docs/basics-ui-p0.md](./basics-ui-p0.md) | สถานะ P0 |
| [docs/foundation.md](./foundation.md) | DB/migrate/pool |
| [docs/finance-ap.md](./finance-ap.md) | Vendor bills API |
| [docs/mail-docs.md](./mail-docs.md) | Mail/docs PG |
| `.impeccable.md` | Design principles |

---

## 10. คำศัพท์สั้น ๆ

| คำ | ความหมายในโปรเจกต์นี้ |
|----|----------------------|
| Shell | ชั้น UI+state บน client ไม่ต่อ DB |
| Port | TypeScript interface ของ use-case |
| Stub adapter | Implementation ว่าง / `not_configured` |
| Seed LCS | ข้อมูลตัวอย่างสมจริง Phase A (`seedLcs.ts`) |
| Job Detail 360 | หน้า `/jobs/:id` เป็นแกน ops |
| Yard | แผนที่ลานตู้ (อยู่ในเมนู Ops) |
| FCL | Full Container Load ทะเลจีน–ไทย |

---

*จบเอกสาร handoff — อัปเดตไฟล์นี้เมื่อปิดรอบถัดไป (โดยเฉพาะเมื่อเริ่มเชื่อม API)*
