## สถานะปัจจุบันของฟีเจอร์นี้ (Current Status)

Foundation โค้ดพร้อม: migrate ledger ใน transaction, `.env` load, local PgBouncer, pool docs — production `democrmch.vercel.app/api/health` ยัง `database: false` / `mode: demo` จนกว่าจะตั้ง `DATABASE_URL` บน Vercel

## งานที่เพิ่งทำเสร็จ (Recently Completed)

- `schema_migrations` ledger + skip applied ใน `server/db/migrate.ts`
- Atomic `doc_sequences` via `ON CONFLICT … last_seq + 1`
- `DB_POOL_MAX` default 3 ใน `server/db/index.ts`
- Migrate ห่อ apply + INSERT ใน transaction เดียว และโหลด `.env`
- `docker-compose.yml` เพิ่ม service `pgbouncer` (port 6432, transaction mode)
- `.env.example` อธิบาย pooled URL + `DB_POOL_MAX=1` บน Vercel
- `server/db/migrate.test.ts` — ตรวจ runner มี ledger + `sql.begin`
- Smoke prod health (2026-09-03): `{ ok, database: false, mode: "demo" }`

## บันทึกการแก้บัค (Bug & Troubleshooting Log)

- [ปัญหา]: Audit ระบุ pool max:10 / ไม่มี ledger / sequence ไม่ล็อก
- [วิธีที่ลองแก้ไปแล้ว]: โค้ดแก้แล้วก่อน audit นี้ — อัปเดตเอกสารให้สะท้อนสถานะจริง
- [ปัญหา]: ไม่มี `.env` local / Docker daemon ปิด / Vercel project ยังไม่ link ใน workspace นี้
- [วิธีที่ลองแก้ไปแล้ว]: verify ผ่าน public `/api/health`; บันทึกขั้นตอนตั้ง env ด้านล่าง

## สิ่งที่ยังค้างอยู่และปัญหาที่ทราบ (Pending & Known Issues)

- Vercel ยังไม่มี `DATABASE_URL` — ต้องใส่ pooled URL + `DB_POOL_MAX=1` + `JWT_SECRET` แล้วรัน migrate/seed จากเครื่องที่มี URL

## Checklist งานต่อไป (Next Steps)

- [x] Harden migrate + PgBouncer compose + docs
- [ ] ตั้ง Vercel env แล้ว `npm run db:migrate` / `db:seed` กับ prod URL
- [ ] Confirm `/api/health` → `mode: "production"`
