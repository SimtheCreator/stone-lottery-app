# Stone Lottery App Progress

เอกสารนี้คือบันทึกสถานะล่าสุดของโปรเจกต์ ใช้เป็น memory กลางก่อนพัฒนารอบถัดไป

## สถานะระบบปัจจุบัน

- Frontend เป็น React + Vite
- Backend หลักใช้ Firebase Cloud Firestore แบบ realtime
- Production deploy ผ่าน Vercel จาก GitHub
- Admin Dashboard ใช้รหัส Admin ก่อนเข้าใช้งาน
- ข้อมูลหลักใน Firestore:
  - `selections`: หมายเลขที่ถูกผนึกแล้ว
  - `participants`: จอมเวท/รหัสพนักงานที่เลือกแล้ว
  - `logs`: พงศาวดารกิจกรรมล่าสุด
  - `round_archives`: ประวัติงวดเก่าสำหรับสถิติและคำทำนายปลายซีซั่น

## สิ่งที่ทำแล้ว

- ผู้ใช้เข้ามาพร้อมกันและแย่งผนึกหมายเลขได้ผ่าน Firestore transaction
- กันการเลือกเลขซ้ำจากคนเดิมในรอบเดียวกัน
- กันหมายเลขเดียวกันถูกผนึกโดยหลายคนพร้อมกัน
- มี UI ธีมเวทมนตร์และศิลา 00-99
- มีเอฟเฟกต์ศิลาแตก ค่อยๆ crack และสลักชื่อจอมเวทลงบนแผ่นศิลา
- มีเสียง crack แบบค่อยๆ แตก แทนเสียงทุบหนัก
- มี notice เตือนทันทีเมื่อจองซ้ำ เลขถูกครอบครอง หรือระบบผิดพลาด
- มี Admin Dashboard สำหรับดูสถานะปัจจุบัน ประวัติงวด และ Oracle pattern เบื้องต้น
- ปุ่ม `ล้างกระดานสำหรับงวดถัดไป` จะ archive งวดปัจจุบันก่อนล้าง
- ปุ่ม `ล้างข้อมูลทดสอบทั้งหมด` จะล้างข้อมูล test ทั้งกระดาน พงศาวดาร และ archive โดยไม่สร้าง archive ใหม่
- มี local preview fallback สำหรับ Admin Dashboard เพราะ local Vite ไม่มี Vercel API route จริง

## สถานะ Git และ Deploy

- Commit ล่าสุดที่ต้องตรวจว่าถูก push แล้ว: `f578113 Add test data purge and slow crack audio`
- ถ้า GitHub ยังอยู่ที่ commit เก่ากว่า แปลว่ายังต้อง push ใหม่ด้วย GitHub token
- Vercel จะ deploy อัตโนมัติเมื่อ GitHub `main` ได้รับ commit ล่าสุด
- ก่อนบอกว่า production พร้อม ต้องตรวจ Vercel Deployments ว่า build จาก commit ล่าสุดสำเร็จแล้ว

## Checklist ก่อนใช้งานจริง

- ตรวจ Vercel environment variables:
  - `VITE_FIREBASE_API_KEY`
  - `VITE_FIREBASE_AUTH_DOMAIN`
  - `VITE_FIREBASE_PROJECT_ID`
  - `VITE_FIREBASE_STORAGE_BUCKET`
  - `VITE_FIREBASE_MESSAGING_SENDER_ID`
  - `VITE_FIREBASE_APP_ID`
  - `RESET_PASSWORD`
  - `FIREBASE_ADMIN_CONFIG`
- Smoke test production ด้วย 2 เครื่องหรือ 2 browser:
  - คนละรหัสพนักงานเลือกเลขต่างกันได้
  - สองคนแย่งเลขเดียวกันแล้วมีผู้ชนะคนเดียว
  - คนเดิมเลือกซ้ำไม่ได้
  - เลขที่ถูกผนึกแล้วกดซ้ำแล้วขึ้นเตือน
- Admin smoke test:
  - ต้องถามรหัสก่อนเข้า Dashboard
  - Reset งวดแล้วเกิด archive ใน `round_archives`
  - Purge test data แล้วล้าง `selections`, `participants`, `logs`, `round_archives`
  - หลัง purge กระดานกลับมาว่างพร้อมเริ่มข้อมูลจริง
- UX smoke test:
  - หน้าแรกบอกให้ใส่รหัสพนักงานชัดเจน
  - Scroll ได้ทั้ง desktop และ mobile
  - Board ไม่กระตุกจนกระทบการเลือก
  - เสียง crack เล่นหลัง user interaction เท่านั้น

## สิ่งที่ต้องอัปเดตหลังทุก milestone

- อัปเดต commit/deploy status
- เพิ่มปัญหาที่เจอจริงเข้า `Mistakes-and-Limitations.md`
- เพิ่มไอเดียหรือ decision ใหม่เข้า `Plan.md`
- ถ้ารอบจริงเริ่มแล้ว ห้าม purge test data โดยไม่ยืนยันอีกชั้น
