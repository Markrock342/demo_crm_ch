# สรุปงาน CANGZHAN / demo_crm_ch

> อัปเดต: 4 กันยายน 2569 (Phase B Closed)  
> Repo: `demo_crm_ch` · Deploy: `democrmch.vercel.app`

---

## ภาพรวม

โปรเจกต์ CRM โลจิสติกส์จีน–ไทย (货代) — Vite + React + Hono + PostgreSQL  
รอบล่าสุด: **LCS Phase B Closed** บน shell (tracking §5 · vendors · rates→quote · notifications · portal) — **ยังไม่ต่อ API/DB**

ดูแผนที่: [`docs/index.md`](docs/index.md) · **Handoff:** [`docs/handoff-client-shell.md`](docs/handoff-client-shell.md) · [`docs/lcs-phase-b.md`](docs/lcs-phase-b.md) · [`docs/lcs-phase-a.md`](docs/lcs-phase-a.md)

---

## สถานะรอบนี้

| รายการ | สถานะ |
|---|---|
| Phase A Must Have + A3 | ✅ Closed |
| Phase B (B0–B6) | ✅ Closed (shell) |
| Persist keys `*-v4` | ✅ |
| Stub → API จริง | ⏳ Deferred |
| Phase C | ⏸ ถัดไป |
| Vercel `DATABASE_URL` | ⏳ รอ ops |

---

## แผนก (shell)

Sales · **Ops** · Finance · Admin  
Ops home = **Jobs** · Portal ที่ `/portal` (เลือกลูกค้า + PIN)

---

## นอกสcope
