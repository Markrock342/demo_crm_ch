## สถานะปัจจุบันของฟีเจอร์นี้ (Current Status)

Vendor Bills (AP) มี schema + API from-job/approve + หน้า `/vendor-bills` แล้ว — ยังไม่รองรับการจ่ายเงิน

## งานที่เพิ่งทำเสร็จ (Recently Completed)

- Migration `0004_vendor_bills_and_boxes.sql`: `shipment_charges.billed`, unique `bill_number`, `approved_by`/`approved_at`, drop `customers.boxes`
- `createVendorBillFromJob` / `approveVendorBill` / list+get ใน `finance.service.ts`
- Routes: `GET/POST /api/vendor-bills`, `POST .../approve`
- UI: `VendorBills.tsx`, nav, ลิงก์จาก Jobs
- Test: `finance.vendor-bills.test.ts` (charge selection)

## บันทึกการแก้บัค (Bug & Troubleshooting Log)

- [ปัญหา]: ACCOUNTING ไม่มี `rate.view_sell` จึงเรียก `/api/vendors` ไม่ได้
- [วิธีที่ลองแก้ไปแล้ว]: เปิด `requirePermission("rate.view_sell", "vendor_bill.view")`

## สิ่งที่ยังค้างอยู่และปัญหาที่ทราบ (Pending & Known Issues)

- ยังไม่มี AP payment / allocation
- Demo mode ไม่มี seed vendor bills (แสดง empty + banner)

## Checklist งานต่อไป (Next Steps)

- [ ] AP payment เมื่อสcope ถัดไปอนุญาต
- [ ] Seed demo vendor bills (ถ้าต้องการ preview โดยไม่มี DB)
