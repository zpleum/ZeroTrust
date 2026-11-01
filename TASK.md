# TASK.md — Zero Trust Development Tasks

> รายการงานและแผนการพัฒนาโปรเจกต์ Zero Trust ตาม SPEC.md เวอร์ชัน 1.0.0
> วิธีใช้: ทำเครื่องหมาย [x] เมื่อทำเสร็จแต่ละ Task

> **ห้าม Hardcode ทรัพยากร:** ห้องส่วนกลาง โซนโต๊ะ โต๊ะ อุปกรณ์ และจุดเก็บของต้องไม่มีรายการสำเร็จรูปในโค้ดหรือ `schema.sql` — ผู้ใช้ (Owner/Admin) สร้างและตั้งค่าเองผ่านหน้าจอ (จำนวนที่นั่ง ตำแหน่ง เวลาเปิด-ปิด กติกาการจอง) ส่วน `RULES` เก็บแค่ค่าเริ่มต้นและขอบเขตที่ Server ตรวจ

> **โครงสร้างไฟล์ที่อนุญาตเท่านั้น:** `server.js` และ `public/` (`index.html`, `index.js`, `style.css`, `images/`) — ทุก Task ต้องไม่สร้างไฟล์หรือโฟลเดอร์อื่นนอกเหนือจากนี้ (`SPEC.md`, `TASK.md`, `schema.sql` เป็นเอกสารคู่โปรเจกต์ ไม่นับเป็นโค้ด)

---

## Phase 0: Project Setup & Foundation

> **อัปเดตงานต่อ 2026-11-01 (ยืนยัน p01):** Auth รองรับสมัครและเข้าใช้งานทันที ไม่มีบังคับยืนยันอีเมล; Squad มี consent, รายชื่อ/บทบาท, soft leave-kick, task workspace และ health อย่างน้อยใน backend/frontend และตรวจ syntax ผ่าน; งาน Proof, attachment, trust settlement และ deployment ยังต้องทำต่อตาม task

- [x] **SETUP-01:** สร้างโครงสร้างโปรเจกต์ตาม SPEC.md หัวข้อ 3 เท่านั้น (`server.js`, `public/index.html`, `public/index.js`, `public/style.css`, `public/images/`) และวาง Banner แบ่งส่วนใน `server.js` ตามลำดับ: CONFIG → RULES → UTILS → DB → REPOSITORIES → SERVICES → MIDDLEWARES → ROUTES → JOBS → BOOT
- [ ] **SETUP-02:** รัน `npm install` ติดตั้ง Dependencies หลัก (express, mysql2, zod, bcrypt, jsonwebtoken, cookie-parser, multer, pdf-parse, pino, helmet, cors, express-rate-limit, sanitize-html, node-cron, qrcode) — `package.json` ให้ npm สร้างเอง และเขียน `server.js` แบบ CommonJS (`require`)
- [x] **SETUP-03:** เขียนส่วน `CONFIG` (อ่าน Environment Variables, production ต้องมี DB secret และ JWT secret), ส่วน `RULES` (Trust/Vouch/Alibi foundation, booking limits และ resource defaults เป็น immutable suggestions) และส่วน `DB` (mysql2 Pool + `withTx`, ambiguous-COMMIT cleanup) ใน `server.js`; กฎเฉพาะ workflow จะขยายเมื่อ feature ของแต่ละ Phase ถูกทำ
- [ ] **SETUP-04:** ตรวจ schema ของฐานข้อมูล p01 ที่ระบบจัดให้บน MariaDB; หากต้องปรับ schema ให้ดาวน์โหลด migration เดิมและต่อท้ายแบบ append-only ส่งผ่านหน้าฐานข้อมูลเท่านั้น ห้ามรัน `schema.sql` จาก terminal/npm/server/Git; การปรับ global settings เป็นหน้าที่ผู้ดูแล (ปัจจุบันตรวจพบ 42 ตาราง InnoDB และตรวจโครงสร้าง `job_runs` แล้ว แต่ยังไม่ใช่การตรวจ schema ทั้งระบบหรือยืนยัน migration history)
- [x] **SETUP-05:** สร้างระบบจัดการเวลากลางส่วน `clock` ใน UTILS รองรับ Time Travel ผ่าน `FAKE_NOW` และ `CLOCK_OFFSET_MINUTES`; เพิ่ม `/api/v1/time`, frontend offset sync และ development-only `/dev/clock` ปกป้องด้วย `X-Dev-Token`; production ไม่ mount dev clock controls
- [ ] **SETUP-06:** สร้างระบบ Job Lock กลางส่วน `withJobLock` ใน UTILS ใช้ `GET_LOCK` และตาราง `job_runs`
- [ ] **SETUP-07:** เขียนส่วน `BOOT` ให้ `server.js` เลือกโหมดจากอาร์กิวเมนต์ CLI (API / `--worker` / `--seed` / `--trust-rebuild` / `--selftest`) และทดสอบรันด้วย PM2 ผ่านคำสั่ง (ไม่มีไฟล์ `ecosystem.config.cjs`)
- [ ] **SETUP-08:** ทำระบบไฟล์ในฐานข้อมูล: `fileService` + Middleware `upload` (multer `memoryStorage`), ตรวจ Allow-list MIME / Magic Bytes / ขนาด, เสิร์ฟผ่าน `GET /api/v1/files/:fileId` ตาม `files.visibility` และ `fileCleanupJob` ล้าง `files.data` ที่หมดอายุ

---

## Phase 1: Authentication & Squad Management
- [x] **AUTH-01:** ทำระบบ Register (Hash รหัสด้วย bcrypt, ตรวจ birth_year และบันทึก user โดยอนุญาตใช้งานทันที ไม่บังคับยืนยันอีเมล; สมัครสำเร็จออก session แล้วเข้าสู่ Dashboard อัตโนมัติ)
- [x] **AUTH-02:** ทำระบบ Login / Logout (ออก JWT เก็บใน httpOnly Cookie) และ Middleware ตรวจสอบสิทธิ์ (`requireAuth`) พร้อม live smoke ตรวจ login และ auto-login หลังสมัคร
- [x] **AUTH-03:** ทำระบบลืมรหัสผ่านและรีเซ็ตรหัสผ่าน (Hash Token ด้วย SHA-256)
- [x] **SQUAD-01:** ทำระบบสร้างก๊วน Public หรือ Private, สร้าง Invite Token (`/#/join/<token>`), คัดลอกลิงก์เชิญ และระบบเข้าร่วมก๊วน; Public ต้องยอมรับกติกาแล้วรอ Owner/Admin อนุมัติ ส่วน Private เข้าร่วมทันทีหลังยอมรับกติกา; token ผูก expiration/use limit
- [x] **SQUAD-02:** ทำหน้าและระบบ **ยอมรับกติกา (Rules Consent)** บันทึก `rules_accepted_at` และ Middleware บังคับตรวจ; Owner/Admin ไม่สามารถอนุมัติสมาชิกก่อนยอมรับกติกา
- [x] **SQUAD-03:** ทำระบบจัดการสมาชิก (เปลี่ยน Role, เตะออก, ออกจากก๊วนด้วย Soft Delete และตรวจเช็กงานค้าง)
- [x] **UI-01:** สร้าง SPA Shell: `index.html` (ทุกหน้าเป็น `<section data-page>` ไม่มี inline script), `style.css` (Design Tokens + Light/Dark), Router แบบ Hash และส่วน `api` / `auth` ใน `index.js` พร้อม Font Awesome CDN และหน้า Login / Register / Squad Switcher

---

## Phase 2: Core Task Squad & Health Bar
- [ ] **TASK-01:** ทำระบบ CRUD Task, ไฟล์แนบ (`task_attachments`) และกำหนดผู้รับผิดชอบรายคน (สร้างตารางแยก Deadline รายบุคคล `task_assignees`)
- [ ] **TASK-02:** ทำระบบ **Proof of Done** (ส่งงาน, สมาชิกคนอื่นกดตรวจ ผ่าน/ตีกลับ, ระบบ Auto-verify ใน 48 ชม.)
- [ ] **TASK-03:** ทำระบบ Reopen งานโดย Admin พร้อมสร้าง Trust Event ย้อนคะแนนอัตโนมัติ
- [ ] **TASK-04:** ทำระบบปุ่มจิกเพื่อน (`Poke`) พร้อม Cooldown 6 ชม. และเพดานรายวัน
- [x] **HP-01:** เขียน Service คำนวณ **Team Health Bar** ตามสูตรใน SPEC และรายชื่อ "ผู้ทำให้ทีมเสียเลือด"
- [ ] **NOTIF-01:** ทำระบบแจ้งเตือนในแอปผ่าน **SSE** (`/api/v1/stream`) พร้อม Outbox Table (`notifications`) และ Fallback Polling
- [ ] **UI-02:** ทำหน้า Dashboard (`#/dashboard`) และ Tasks (`#/tasks`) รองรับ List / Kanban และ Team Health Bar พร้อมแอนิเมชัน

---

## Phase 3: Resources — Assets & Rooms
- [ ] **ASSET-01:** ทำระบบจัดการ Storage Locations และ Assets (หมวดหมู่เป็นข้อความที่ Admin กำหนดเอง, สร้าง QR Token แบบสุ่ม 32 ตัว และรองรับการ Rotate Token)
- [ ] **ASSET-02:** ทำหน้า **Kiosk** (`#/kiosk`) แสดง QR ที่เปลี่ยนทุก 30 วินาที (TOTP-style HMAC-SHA256)
- [ ] **ASSET-03:** ทำระบบยืมอุปกรณ์ พร้อมตรวจ Trust Gate ว่าต้องมีผู้ค้ำประกันหรือไม่
- [ ] **ASSET-04:** ทำระบบคืนอุปกรณ์ผ่าน 3 วิธี (สแกน Station QR / เพื่อนยืนยันรับคืน / Admin บันทึก) และคิวรอยืม (`Waitlist`)
- [ ] **ROOM-01:** ทำระบบจัดการห้องส่วนกลาง (Admin สร้างเอง ตั้งค่ากติกาการจองและ Check-in รายห้องได้ ไม่ Hardcode), ตารางปฏิทิน Visual Calendar (Day/Week/Month) ที่ใช้ `slot_minutes` ของห้อง
- [x] **ROOM-02:** ทำระบบจองห้อง พร้อมตรวจ **การจองทับซ้อนด้วย Transaction + Row Lock (`FOR UPDATE`)**
- [ ] **ROOM-03:** ทำระบบ Check-in ห้องด้วย QR ประจำห้อง (Static + Kiosk + รัศมี GPS ทางเลือก) ตามค่า `checkin_*` ของห้อง บันทึก Snapshot `checkin_deadline_at` ตอนจอง และระบบยกเลิก No-show อัตโนมัติ
- [ ] **DESK-01:** ทำระบบสร้าง/แก้ไข/ปิดใช้งาน **โซนโต๊ะ (Desk Area)** พร้อมขนาดผัง ตำแหน่งที่ตั้ง เวลาเปิด-ปิด และกติกาการจองรายโซน (`deskService` + `deskRepo`, Zod ตรวจขอบเขตด้วย `BOOKING_LIMITS` / `DESK_LIMITS`, สร้าง QR Check-in ประจำโซน) — ไม่มีโซนสำเร็จรูปในโค้ด
- [ ] **DESK-02:** ทำระบบสร้าง/แก้ไข **โต๊ะ** (`label`, `seat_count`, `booking_mode`, ตำแหน่ง/ขนาดบนผัง, `shape`, `amenities`, `unavailable_until`), สร้างเป็นชุด, บันทึกผังหลายโต๊ะพร้อมกัน (`PATCH .../desks/layout`), ตรวจตำแหน่งซ้อน (`DESK_LAYOUT_CONFLICT`) และห้ามลด `seat_count` / เปลี่ยน `booking_mode` เมื่อมีการจองค้าง (`DESK_HAS_FUTURE_BOOKINGS`)
- [x] **DESK-03:** ทำระบบจองโต๊ะ พร้อมตรวจความจุแบบ **Peak Occupancy** ใน Transaction + `FOR UPDATE` (ลำดับ Lock สมาชิก → โต๊ะ), ห้ามจองทับเวลาตัวเอง, จองซ้ำรายสัปดาห์ตาม `max_recurring` และ Endpoint `availability` ที่ใช้ `peakOccupancy()` ตัวเดียวกัน
- [ ] **DESK-04:** ทำระบบ Check-in โซนโต๊ะด้วย QR ประจำโซน (Static + Kiosk + GPS ทางเลือก), ต่อ `bookingNoShowJob` / `bookingReminderJob` ให้ครอบคลุมการจองโต๊ะ และใช้ `ref_type = 'desk_booking'` ใน Trust Event
- [ ] **UI-03:** ทำหน้า Booking (`#/booking`) แท็บ ห้อง / โต๊ะ และหน้า **Resource Setup** (`#/booking/setup`): ตัวแก้ผังโต๊ะแบบลากวาง + ช่องกรอก X/Y, สร้างโต๊ะเป็นชุด, Empty State "สร้างโซนโต๊ะแรก", Desk Map วาดจากข้อมูล API ตาม DESIGN.md (ห้ามมีรายการห้อง/โต๊ะในโค้ด)

---

## Phase 4: Social & Accountability — Wall, Vouch, Alibi
- [ ] **WALL-01:** ทำระบบ Wall Posts (รองรับ 3 โหมด: `snitch`, `kudos`, `off`) และระบบคัดกรองคำต้องห้าม (ส่วน `filter` ใน UTILS)
- [ ] **WALL-02:** ทำระบบ Shame Vote / Clap Vote, สิทธิ์ผู้มีสิทธิ์โหวต (เข้าก๊วน ≥ 24 ชม.), การแก้ต่าง 1 ครั้ง และระบบ Verdict อัตโนมัติ (เพดาน −10/สัปดาห์)
- [ ] **VOUCH-01:** ทำระบบค้ำประกัน (Vouch) ขอค้ำ/เสนอค้ำ กำหนด Stake (3/5/10), เงื่อนไขการค้ำ และการห้ามค้ำไขว้
- [ ] **VOUCH-02:** เชื่อมระบบ Vouch กับการปลดล็อก Trust Gate และการตัดแต้มผู้ค้ำเมื่อเพื่อนเทงาน/ทำของพัง
- [ ] **ALIBI-01:** ทำระบบยื่นข้อแก้ตัว (Alibi) แนบหลักฐานที่เป็นส่วนตัว (`files.visibility = 'admin'` เห็นเฉพาะ Admin) และโควตารายสัปดาห์
- [ ] **ALIBI-02:** ทำระบบเพื่อนโหวต Alibi แบบลับ ภายใน 12 ชม. เกณฑ์ผ่าน 40% และผลลัพธ์การเลื่อน Deadline หรือคิดโทษย้อนหลังถ้าไม่ผ่าน

---

## Phase 5: Gamification — Profile, Trust, Dares & SFX
- [ ] **TRUST-01:** ทำ `trustService` จัดการ Trust Events ทั้งหมด, ควบคุมเพดานบวกรายสัปดาห์ (+15) และ Clamp ค่าให้อยู่ที่ 0–100
- [ ] **TRUST-02:** ทำคำสั่ง Rebuild Trust Score จาก Log (`node server.js --trust-rebuild`) และ Job ตรวจสอบความถูกต้องรายสัปดาห์
- [ ] **PROFILE-01:** ทำหน้าโปรไฟล์ผู้ใช้ (`#/profile/<userId>`), กราฟ Trust ย้อนหลัง 30 วัน, ประวัติ Event และระบบคำนวณ Behavior Badges อัตโนมัติ
- [ ] **DARE-01:** ทำระบบตั้งเงื่อนไข Dare, เสนอ Dare ให้ก๊วนโหวต และเลือก Metric (เช่น `most_auto_snitch`, `most_late_tasks`)
- [ ] **DARE-02:** ทำระบบสรุปผลรายสัปดาห์ (`dareWeeklyJob`), การสุ่มผู้แพ้ด้วย Seed ที่ Server และอัปโหลดหลักฐานรับโทษ
- [ ] **SFX-01:** สร้าง Sound Manager (ส่วน `sfx` ใน `public/index.js`) สังเคราะห์เสียงด้วย Web Audio API (ไม่มีไฟล์เสียง) รองรับการเปิด/ปิด, ปรับความดัง และเงื่อนไข Quiet Hours

---

## Phase 6: Testing, Security & Deployment
- [ ] **TEST-01:** เขียน Unit Test สำหรับสูตร HP, Trust Rules, Overlap Check, Alibi Decision, Vouch Rules, Peak Occupancy ของโต๊ะ, ตรวจตำแหน่งโต๊ะซ้อน และขอบเขต `BOOKING_LIMITS` ด้วย `node:test` (รันด้วย `node server.js --selftest`)
- [ ] **TEST-02:** เขียน Anti-Cheat Test พิสูจน์ช่องโหว่ตามหัวข้อ 5 ใน SPEC.md ว่าระบบป้องกันได้จริง
- [ ] **TEST-03:** เขียน Concurrency Test ยิง Request พร้อมกันเพื่อทดสอบ Race Condition ของการจองห้อง การจองโต๊ะ `per_seat` และการโหวต
- [ ] **SEC-01:** ตรวจสอบ Security รอบสุดท้าย (Rate Limit, Helmet, CSP ไม่มี inline script, Sanitizer, IDOR Check รวมถึงสิทธิ์ดูไฟล์, ห้ามเปิด `/dev/*` และโหมด `--seed` / `--selftest` ใน Production)
- [ ] **OPS-01:** เตรียม Seed Story (โหมด `node server.js --seed`, สร้างห้อง/โซนโต๊ะ/โต๊ะผ่าน Service เดียวกับที่ผู้ใช้ใช้ ไม่ฝังค่าคงที่) สำหรับพรีเซนต์ และคู่มือการใช้งาน Time Travel สำหรับ Demo
- [ ] **OPS-02:** ตั้งค่า Nginx, PM2 (Cluster + Worker ผ่านคำสั่ง), SSL (Let's Encrypt) และทดสอบระบบ Backup อัตโนมัติ

---

## Phase 7: AI PDF Sorter — Deferred / ยังไม่ทำตอนนี้

> **สถานะ: พักไว้ (Deferred)** — ระบบใช้ AI แยกวิชา/งานจาก PDF เป็นงานลำดับสุดท้าย ไม่อยู่ในขอบเขตการพัฒนารอบปัจจุบัน และไม่เป็นเงื่อนไขก่อน Deploy ระบบหลัก เริ่มได้เมื่อผู้ใช้ยืนยันให้กลับมาทำเท่านั้น เมื่อทำภายหลังต้องทดสอบและตรวจ Security/backend อีกครั้งก่อน Deploy การพักนี้ไม่รวม Worker/Cron สำหรับงานทั่วไปของระบบหลัก

- [ ] **AI-01:** ทำระบบอัปโหลด PDF เก็บลงตาราง `files`, บันทึกลงตารางคิว `pdf_uploads` และตอบ `202 Accepted` ทันที
- [ ] **AI-02:** เขียน Worker ดึงงาน PDF ด้วย `SKIP LOCKED`, ใช้ `pdf-parse` ดึงข้อความจาก `files.data` และเรียก LLM API พร้อม System Prompt ป้องกัน Prompt Injection
- [ ] **AI-03:** ทำระบบ Validate ผลลัพธ์ด้วย Zod, บันทึกเป็น Draft และทำโหมด Mock สำหรับ Dev/Demo (`AI_PROVIDER=mock`)
- [ ] **AI-04:** ทำหน้า Review Draft (`#/ai-sorter`) และกดนำเข้าเป็น Task จริงในก๊วน