# Zigma Clean Mini App

ระบบจองคิวร้านคาร์แคร์แบบ LINE Mini App แยกหน้าลูกค้าและหลังบ้านชัดเจน โดยเก็บข้อมูลด้วย Google Sheet + Google Apps Script

## Route หลัก

- `/booking` สำหรับลูกค้า
- `/admin` สำหรับแอดมิน

## สิ่งที่ระบบทำได้ตอนนี้

- เลือกบริการ
- เลือกช่วงเวลาที่ยังไม่เลยเวลาปัจจุบัน
- 1 ช่วงเวลา จองได้ 1 คิว
- กรอกชื่อ เบอร์โทร รุ่นรถ และทะเบียนรถใน popup
- ถ้าเปิดผ่าน LINE จะใช้ชื่อ LINE เป็นค่าเริ่มต้น
- ไปหน้าชำระเงินและออกตั๋วจองพร้อม QR code
- เก็บประวัติการจองของลูกค้าจาก `customerKey`
- หลังบ้านจัดการบริการ ปิดช่วงเวลา และจัดการสถานะคิวได้
- `bookings`, `services`, และ `blocked slots` ถูกเก็บใน Google Sheet ผ่าน Apps Script Web App

## การตั้งค่าโปรเจกต์

1. ติดตั้ง dependency

```bash
npm install
```

2. ตั้งค่าไฟล์ `.env`

```env
NEXT_PUBLIC_LIFF_ID=2009832515-GVcVkh5W

GOOGLE_APPS_SCRIPT_URL=
GOOGLE_APPS_SCRIPT_TOKEN=zigma-booking-56317617929e42869686b2c624884241
```

## การตั้งค่า Google Sheet + Apps Script

1. สร้าง Google Sheet 1 ไฟล์
2. เปิดเมนู `Extensions > Apps Script`
3. ลบโค้ดเดิม แล้ววางไฟล์ `apps-script/Code.gs`
4. ตั้งค่า manifest ให้ตรงกับ `apps-script/appsscript.json`
5. ไปที่ `Project Settings > Script Properties`
6. เพิ่มค่าเหล่านี้

```text
SPREADSHEET_ID=<Spreadsheet ID ของชีต>
APP_TOKEN=<ค่าเดียวกับ GOOGLE_APPS_SCRIPT_TOKEN ในไฟล์ .env>
BOOKINGS_SHEET_NAME=Bookings
SERVICES_SHEET_NAME=Services
BLOCKED_SLOTS_SHEET_NAME=BlockedSlots
```

7. กด `Deploy > New deployment`
8. เลือกชนิด `Web app`
9. ตั้งค่า
   - Execute as: `Me`
   - Who has access: `Anyone`
10. กด Deploy แล้วคัดลอก Web App URL
11. เอา URL ไปใส่ใน `GOOGLE_APPS_SCRIPT_URL` ในไฟล์ `.env`

## Spreadsheet ID หาได้จากไหน

เปิด Google Sheet แล้วคัดค่าระหว่าง `/d/` กับ `/edit`

ตัวอย่าง:

```text
https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890/edit#gid=0
```

ค่า `SPREADSHEET_ID` คือ

```text
1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890
```

## การตั้งค่า LINE Mini App

1. ใช้ LIFF ID ของ environment ที่กำลังทดสอบ
2. ตั้ง Endpoint URL ให้ตรงกับ URL ที่เปิดจริง เช่น `https://your-ngrok-url/booking`
3. ถ้าทดสอบผ่าน ngrok ให้ restart dev server หลังแก้ `next.config.ts`

## การรัน

```bash
npm run dev
```

เปิด:

- `http://localhost:3000/booking`
- `http://localhost:3000/admin`

## อ้างอิงทางการ

- Apps Script Web Apps:
  https://developers.google.com/apps-script/guides/web
- Apps Script Content Service:
  https://developers.google.com/apps-script/guides/content
- Apps Script Properties Service:
  https://developers.google.com/apps-script/guides/properties

## หมายเหตุ

- ถ้าไม่ได้ใส่ `GOOGLE_APPS_SCRIPT_URL` ระบบจะเปิดหน้าได้ แต่จะยังไม่บันทึกข้อมูลจริง
- payment ตอนนี้ยังเป็น flow ยืนยันการชำระเงินในแอป ยังไม่ได้ต่อ payment gateway จริง
