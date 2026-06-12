# Mistakes and Limitations

เอกสารนี้คือบันทึกสิ่งที่พลาด ข้อจำกัด และกติกาการทำงาน เพื่อไม่ให้ทำผิดซ้ำ

## Git, OneDrive และ Token

- โฟลเดอร์โปรเจกต์อยู่ใน OneDrive และ `.git` ปกติอาจติด permission หรือ lock
- ทางแก้ที่ใช้คือ Git database แยกใน `%LOCALAPPDATA%\CodexGit\stone-lottery-app.git`
- เวลาใช้ Git ต้องระบุทั้ง `--git-dir` และ `--work-tree`
- ห้ามวาง GitHub token ใน chat
- ถ้า push ไม่ผ่านด้วย `could not read Username` แปลว่า credential ยังไม่ถูกส่งเข้า Git process
- ก่อนบอกว่า push สำเร็จ ต้องเทียบ `HEAD` กับ remote/FETCH_HEAD จริง

## Local API vs Vercel API

- Local Vite dev server ไม่ได้ serve `/api/admin-check` และ `/api/reset` แบบ Vercel serverless
- Local preview จึงเปิด Admin Dashboard ได้ด้วย fallback เฉพาะ `localhost` หรือ `127.0.0.1`
- การ reset หรือ purge ที่ลบข้อมูลจริงต้องทำผ่าน deployed Vercel API
- อย่าทดสอบปุ่มล้างข้อมูลจริงใน production ถ้ายังไม่ตั้งใจลบข้อมูล

## Firebase และ Firestore Rules

- Client อ่านข้อมูลได้ แต่ห้าม update/delete selections/logs โดยตรง
- การล้างกระดานต้องผ่าน Firebase Admin SDK ใน serverless API
- Transaction สำคัญสำหรับกันหลายคนแย่งเลขเดียวกัน
- ถ้า `permission-denied` ให้เช็ก rules, project id และ transaction write path ก่อนแก้ UI
- `round_archives` คือฐานของฟีเจอร์คำทำนายปลายซีซั่น ห้ามลบ archive จริงหลังเริ่มกิจกรรมแล้ว เว้นแต่เป็นข้อมูล test

## Performance Constraints

- Animation ที่รันตลอดเวลาทำให้หน้า board กระตุกได้ โดยเฉพาะ mobile
- หลีกเลี่ยง `backdrop-filter`, blur ใหญ่, drop-shadow ซ้อนหลายชั้น และ particle จำนวนมาก
- ใช้ `transform` และ `opacity` เป็นหลักสำหรับ motion
- เอฟเฟกต์ศิลาแตกควรเกิดเฉพาะตอนเลือก ไม่ควรรันบนทุก tile
- เสียงควรสร้างจาก user interaction เท่านั้น เพราะ browser อาจ block autoplay
- ต้องรองรับ `prefers-reduced-motion`

## UI/UX Mistakes To Avoid

- อย่าเพิ่มฟีเจอร์จนกิจกรรมกลายเป็น dashboard หนักๆ
- อย่าใช้ภาษาแห้งแบบระบบจองทั่วไป ให้คงธีมจอมเวท ศิลา ผนึก พงศาวดาร
- อย่าให้ปุ่ม Admin หรือ reset เด่นเกิน experience หลักของผู้เล่น
- อย่าให้ notice เงียบเกินไป เพราะผู้ใช้ต้องรู้ทันทีว่ากดสำเร็จหรือผิดพลาด
- อย่าใช้เอฟเฟกต์มืดจนอ่านเลขและชื่อไม่ชัด
- อย่าทำ animation สวยแต่ทำให้การแย่งกดเสียเปรียบ

## AI Prediction Constraints

- คำทำนายปลายซีซั่นต้องเป็น entertainment ไม่ใช่ HR analytics
- ห้ามใช้ถ้อยคำที่ตัดสินนิสัยจริงแบบแข็ง เช่น ขี้ลังเล ไม่กล้าเสี่ยง ไม่มีวินัย
- ใช้ archetype เชิงบวกหรือสนุก เช่น นักสำรวจวงเวท ผู้คุมสมดุล นักย้ำชะตา
- ต้องบอกโดยนัยว่าเป็นคำทำนายจาก pattern การเลือกเลขในกิจกรรมเท่านั้น
- ถ้าข้อมูลน้อย ต้องทำนายแบบเบาๆ ไม่แกล้งทำเป็นแม่น
- ห้ามโยงกับ performance งาน เงินเดือน การประเมิน หรือความสามารถจริงของพนักงาน

## Operating Rules For Future Codex Work

- ก่อนแก้ code ให้เช็กสถานะ Git ก่อนเสมอ
- ถ้าไฟล์มีภาษาไทย ให้ใช้ UTF-8 ตอนอ่าน
- หลังแก้ UI ต้อง build และตรวจ browser local ถ้าเป็นไปได้
- หลังแก้ API ต้องแยก local fallback กับ production behavior ให้ชัด
- หลังจบ milestone ให้อัปเดต `Progress.md`, `Plan.md`, และไฟล์นี้
- ถ้าเจอข้อผิดพลาดใหม่ ให้บันทึกไว้ทันที ไม่ปล่อยให้จำจากแชต
