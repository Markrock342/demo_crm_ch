# Handoff — สรุปงาน CANGZHAN (สำหรับทำงานต่อ)

> อัปเดต: 3 กันยายน 2569  
> Repo: `Markrock342/demo_crm_ch` · Local: `c:\my_job\crm` · Deploy: `democrmch.vercel.app`  
> Audience: เพื่อนร่วมทีมที่ต้องศึกษาและต่อยอดได้ทันที  
> Local UI: `http://localhost:5173/` (`npm run dev`)

เอกสารนี้สรุป **สิ่งที่ทำแล้ว / ยังไม่ทำ / ไม่ยุ่ง** จากสองรอบใหญ่ในแชท: (1) ปิด backlog DB/API เดิม (2) P0 + Client full shell บน client โดยยังไม่ต่อ API/DB

---

## 1. ใจความสำคัญ (อ่านก่อน)

1. **เป้าหมายปัจจุบันของ UI walkthrough:** ใช้งานได้จริงบน **shell client** (in-memory + `localStorage`) ไม่ใช่แค่ปุ่มเผื่อ — แต่ **ยังไม่เชื่อม API / PostgreSQL / Vercel DB**
2. **สถาปัตยกรรมที่ล็อก:** `UI → ports → adapters/stub` + `src/shell/*` stores · ขนานกับ auth/API เดิม · **ห้ามแก้** `server/**` และ `src/api/**` ในรอบ shell
3. **โดเมน:** CRM 货代 จีน–ไทย · FCL ทะเลเป็นหลัก · มีลานตู้เอง (Yard เป็นงานหลักของ Ops)
4. **แผนก Login:** Sales | **Ops** | Finance | Admin — เมนูต่างกัน · ซ่อน/จำกัด logistics ตามมติ
5. **ข้อมูล:** seed เล็ก + สร้างเพิ่มได้ · persist ใน `localStorage` · UI ติดป้าย shell data
6. **รอบก่อนหน้า (โค้ด server):** migrate/pool/Vendor Bills/mail-docs ทำไว้แล้ว — แต่ prod Vercel ยังไม่มี `DATABASE_URL`

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

### 2.3 รอบ Client full shell (ล่าสุด)

| Phase | งาน | สถานะ |
|-------|-----|--------|
| 1 | UI density (บีบ chrome / toolbar / `.is-dense` / table height) | ✅ |
| 2a | แผนก **Ops** + nav ตามมติข้อ 7 | ✅ |
| 2b | `opsStore` + ports + seed + `persist.ts` + localStorage | ✅ |
| 2c | Boxes / Shipments / Yard โหมด shell | ✅ |
| 3 | Quote หลาย charges + รับ/ปฏิเสธ · Job · Shipment/Invoice จาก job | ✅ |
| 4 | Rates / Tasks / Docs checklist / Vendor bills stub | ✅ |
| Docs | `docs/client-full-shell.md` + อัปเดต index/plan | ✅ |

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
| Architecture replan (ข้อ 8) | เลื่อน |
| รีแบรนด์ UI ใหญ่ | ทำแค่ densify ภายใต้ ledger-house |
| Persist ข้ามเครื่อง / sync ระหว่าง user | มีแค่ localStorage ต่อเบราว์เซอร์ |
| Calendar โหมด shell เต็ม | ยังอยู่ใน nav แต่ไม่ใช่โฟกัสรอบนี้ |
| Account 360 ผูก shell CRM เต็ม | หน้าเดิมอาจยังอิง demo/API path |

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
| Ops | `/yard` | Yard, Boxes, Shipments, Jobs, Docs, Tasks, Calendar, Settings |
| Finance | `/invoices` | Invoices, Vendor bills, Reports, Settings |
| Admin | `/` | เกือบทั้งหมดรวม Yard + Inbox + Reports |

กฎ logistics:

- **Ops + Admin:** แก้ Boxes/Shipments/Yard ได้ (`canEditLogistics`)
- **Sales:** Boxes/Shipments อ่านอย่างเดียว · **ไม่มี Yard**
- **Finance:** ไม่มี logistics ใน nav

โค้ด nav: [`src/shell/nav.ts`](../src/shell/nav.ts)

### 5.2 CRM

- Store: [`src/shell/crmStore.tsx`](../src/shell/crmStore.tsx) · key `cangzhan-shell-crm-v1`
- Seed: ลูกค้า `sc-seed-1` (粤泰贸易), `sc-seed-2` (东海供应链) + contact ตัวอย่าง
- หน้า: Customers, Contacts, Leads, Pipeline — สร้าง/เลื่อนสถานะในหน่วยความจำได้

### 5.3 Logistics (FCL จีน–ไทย + Yard)

- Store: [`src/shell/opsStore.tsx`](../src/shell/opsStore.tsx) · key `cangzhan-shell-ops-v1`
- Seed: 2 shipments, 3 boxes วางช่องลาน (เช่น B2/B3/A1)
- สถานะ Box: `yard | sail | clear | hold | empty`
- สถานะ Shipment: `booking → gate_in → sail → arrived → delivered`
- Yard slots: A1–C4 (Laem Chabang) — เลือกตู้แล้วย้ายช่องว่างได้
- หน้า: [`Boxes.tsx`](../src/pages/Boxes.tsx), [`Shipments.tsx`](../src/pages/Shipments.tsx), [`Yard.tsx`](../src/pages/Yard.tsx)

### 5.4 เสนอราคา (Quote)

- Store: [`src/shell/quoteStore.tsx`](../src/shell/quoteStore.tsx) · key `cangzhan-shell-quotes-v1`
- สถานะ: `DRAFT | PENDING_APPROVAL | SENT | ACCEPTED | REJECTED`
- Wizard หลาย charges: `/quotations/new`
- Preview สาธารณะ shell: `/q/shell/:id` (รับ/ปฏิเสธ)
- หลัง `ACCEPTED` → ปุ่มสร้าง Job

### 5.5 Jobs

- Store: [`src/shell/jobStore.tsx`](../src/shell/jobStore.tsx) · key `cangzhan-shell-jobs-v1`
- สร้างจาก quote ที่รับแล้ว · milestones ติ๊กได้ · สร้าง/ผูก Shipment · ออก Invoice จาก job
- หน้า: [`Jobs.tsx`](../src/pages/Jobs.tsx) (โหมด shell ไม่เรียก API)

### 5.6 Billing

- Store: [`src/shell/billingStore.tsx`](../src/shell/billingStore.tsx) · key `cangzhan-shell-billing-v1`
- Invoice มี `jobId` ได้ · ออกใบ → วางบิล → รับชำระ
- หน้า: [`Invoices.tsx`](../src/pages/Invoices.tsx)

### 5.7 โมดูลรอง

- Store รวม: [`src/shell/supportStore.tsx`](../src/shell/supportStore.tsx) · key `cangzhan-shell-support-v1`
- **Rates:** seed FCL + เพิ่มเรทได้
- **Tasks:** ผูก customer / job ได้
- **Docs:** checklist ผูก box/shipment (`ok|wait|late`)
- **Vendor bills:** สร้างร่าง + อนุมัติใน memory (Finance)

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
  pages/          # Login, CRM, Quote*, Jobs, Boxes, Yard, Shipments, Invoices, ...
  App.tsx         # routes + กรอง nav ตามแผนก
  main.tsx        # provider tree
docs/
  index.md
  basics-ui-p0.md
  client-full-shell.md
  handoff-client-shell.md   ← ไฟล์นี้
  foundation.md / finance-ap.md / mail-docs.md
plan.md
```

Ports มีไว้ให้รอบถัดไป **เสียบ adapter จริง** โดยไม่รื้อ UI — ตอนนี้ stub ว่าง/`not_configured`

---

## 7. Flow ที่ควรลอง walkthrough (QA มือ)

1. Login → **Ops** → เห็น Yard มีตู้ seed · ย้ายช่องได้  
2. Boxes / Shipments → เปลี่ยนสถานะได้  
3. Logout → Login **Sales** → มี Boxes/Shipments อ่านอย่างเดียว · ไม่มี Yard  
4. Login **Admin** หรือ Sales → Customers (มี seed) → Quotations → New (หลายค่าใช้จ่าย) → ส่งอนุมัติ → Mark sent → เปิด `/q/shell/:id` → Accept  
5. Create job → Jobs → tick milestones → สร้าง shipment → Invoice from job → Invoices ออกใบ/วางบิล/รับชำระ  
6. Refresh หน้า → ข้อมูลยังอยู่ (localStorage)  
7. Finance → Vendor bills สร้าง/อนุมัติ stub  

---

## 8. สิ่งที่ควรทำต่อ (แนะนำลำดับ)

1. **เสียบ API:** เขียน adapter จริงใต้ `adapters/` ที่เรียก `src/api` / server — สลับเมื่อมี auth production (ต้องยกเลิกกฎห้ามเปิด API อย่างเป็นทางการ)
2. **Vercel DB:** ตั้ง pooled `DATABASE_URL` + `DB_POOL_MAX=1` → migrate/seed → ตรวจ `/api/health` = production  
3. **Inbox / Reports** ให้ครบระดับเดียวกับ shell modules  
4. **Account 360** ให้ดึงจาก shell stores เมื่อ `useIsShellMode()`  
5. **อย่า commit** `.env` / secrets  

---

## 9. เอกสารที่เกี่ยวข้อง

| ไฟล์ | เนื้อหา |
|------|---------|
| [plan.md](../plan.md) | สรุปสถานะโปรเจกต์ฉบับสั้น |
| [docs/index.md](./index.md) | Architecture map |
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
| Seed | ข้อมูลตัวอย่างเริ่มต้นเล็กน้อย |
| Yard | แผนที่ลานตู้ (core ของ Ops) |
| FCL | Full Container Load ทะเลจีน–ไทย |

---

*จบเอกสาร handoff — อัปเดตไฟล์นี้เมื่อปิดรอบถัดไป (โดยเฉพาะเมื่อเริ่มเชื่อม API)*
