# สรุปงาน CANGZHAN / demo_crm_ch

> อัปเดต: 4 กันยายน 2569 (Phase A Closed — A3 closeout)  
> Repo: `demo_crm_ch` · Deploy: `democrmch.vercel.app`

---

## ภาพรวม

โปรเจกต์ CRM โลจิสติกส์จีน–ไทย (货代) — Vite + React + Hono + PostgreSQL  
รอบล่าสุด: **LCS Phase A Closed** บน shell (Job 360 + A3 closeout + seed §12 + `/exceptions`) — **ยังไม่ต่อ API/DB**

ดูแผนที่: [`docs/index.md`](docs/index.md) · **Handoff:** [`docs/handoff-client-shell.md`](docs/handoff-client-shell.md) · [`docs/lcs-phase-a.md`](docs/lcs-phase-a.md)

---

## สถานะรอบนี้

| รายการ | สถานะ |
|---|---|
| Phase A Must Have + A3 closeout | ✅ Closed (shell) |
| Seed §12 (~15/30/40/20/20) · keys `*-v3` | ✅ |
| `/exceptions` + Overview widgets | ✅ |
| Stub → API จริง | ⏳ Deferred |
| Phase B / C | ⏸ ถัดไป |
| Vercel `DATABASE_URL` | ⏳ รอ ops |

---

## แผนก (shell)

Sales · **Ops** · Finance · Admin  
Ops home = **Jobs** · Exceptions ในเมนู Ops/Admin/Overview

---

## นอกสcope

LCL/บก/บิน · เชื่อม API จริง · Vercel DB · Inbox/Reports เต็ม · architecture replan · รีแบรนด์ UI

---

## Design Principles (จาก `.impeccable.md`)

1. ภาษาจีนมาก่อน · ไทย/EN สวิตช์  
2. ตัวเลข TEU/ตู้ — tabular-nums  
3. การ์ดเฉพาะเมื่อจำเป็น · densify chrome  
4. Seal accent ใช้น้อย  
5. AI อยู่ในกล่องจดหมาย
