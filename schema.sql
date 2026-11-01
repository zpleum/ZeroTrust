-- =========================================================================
-- Zero Trust Database Schema (MySQL 8.0+)   |   SPEC v1.0
-- Charset: utf8mb4_unicode_ci
--
-- วิธีใช้ (รันครั้งเดียวด้วย mysql CLI — ไม่มีโฟลเดอร์ migrations ในโปรเจกต์):
--   mysql -u root -p < schema.sql
--
-- ⚠ สคริปต์นี้ DROP ตารางเดิมทั้งหมดก่อนสร้างใหม่ ใช้กับ DB ว่าง / Dev เท่านั้น
--   ห้ามรันบน Production ที่มีข้อมูลจริง
--
-- ไฟล์นี้เป็นเอกสารคู่โปรเจกต์ (ไม่อยู่ในโครงสร้างโค้ด: server.js + public/) ไม่ต้องย้ายเข้าโปรเจกต์
-- ข้อมูลตัวอย่างใช้ `node server.js --seed` (ไม่มี seed.sql)
--
-- ไฟล์อัปโหลดทุกชนิด (avatar, รูปหลักฐาน, ไฟล์แนบงาน, PDF) เก็บในตาราง `files` (MEDIUMBLOB)
-- เพราะโครงสร้างโปรเจกต์ไม่มีโฟลเดอร์ uploads/
-- =========================================================================

CREATE DATABASE IF NOT EXISTS zero_trust CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE zero_trust;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- Drop tables if exists (for clean re-run)
DROP TABLE IF EXISTS job_runs;
DROP TABLE IF EXISTS activity_logs;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS ai_task_drafts;
DROP TABLE IF EXISTS pdf_uploads;
DROP TABLE IF EXISTS dare_proof_votes;
DROP TABLE IF EXISTS dare_results;
DROP TABLE IF EXISTS dare_proposal_votes;
DROP TABLE IF EXISTS dares;
DROP TABLE IF EXISTS alibi_votes;
DROP TABLE IF EXISTS alibis;
DROP TABLE IF EXISTS vouches;
DROP TABLE IF EXISTS user_badges;
DROP TABLE IF EXISTS trust_events;
DROP TABLE IF EXISTS moderation_actions;
DROP TABLE IF EXISTS wall_reports;
DROP TABLE IF EXISTS wall_replies;
DROP TABLE IF EXISTS wall_votes;
DROP TABLE IF EXISTS wall_posts;
DROP TABLE IF EXISTS desk_bookings;
DROP TABLE IF EXISTS desks;
DROP TABLE IF EXISTS desk_areas;
DROP TABLE IF EXISTS bookings;
DROP TABLE IF EXISTS rooms;
DROP TABLE IF EXISTS asset_waitlist;
DROP TABLE IF EXISTS asset_loans;
DROP TABLE IF EXISTS assets;
DROP TABLE IF EXISTS storage_locations;
DROP TABLE IF EXISTS task_attachments;
DROP TABLE IF EXISTS task_pokes;
DROP TABLE IF EXISTS task_comments;
DROP TABLE IF EXISTS task_checklist_items;
DROP TABLE IF EXISTS task_verifications;
DROP TABLE IF EXISTS task_assignees;
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS files;
DROP TABLE IF EXISTS squad_invites;
DROP TABLE IF EXISTS squad_members;
DROP TABLE IF EXISTS squads;
DROP TABLE IF EXISTS user_preferences;
DROP TABLE IF EXISTS auth_tokens;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

-- ========== USERS & AUTH ==========
CREATE TABLE users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(30) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  email_verified_at DATETIME,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(50) NOT NULL,
  avatar_file_id BIGINT UNSIGNED,            -- อ้าง files.id (FK เพิ่มด้วย ALTER ในหมวด FILES)
  bio VARCHAR(200),
  birth_year SMALLINT UNSIGNED NOT NULL,
  is_system_admin BOOLEAN DEFAULT FALSE,
  deleted_at DATETIME,                       -- ลบบัญชีแบบ anonymize
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE auth_tokens (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  type ENUM('email_verify','password_reset') NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,      -- SHA-256 ของ token
  expires_at DATETIME NOT NULL,
  used_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_tokens_user (user_id, type)
);

CREATE TABLE user_preferences (
  user_id BIGINT UNSIGNED PRIMARY KEY,
  notify_types JSON,                         -- {"TASK_DUE":true, ...}
  notify_channels JSON,                      -- {"email":false,"line":true}
  quiet_start TIME DEFAULT '23:00:00',
  quiet_end TIME DEFAULT '07:00:00',
  sound_enabled BOOLEAN DEFAULT TRUE,
  sound_volume TINYINT UNSIGNED DEFAULT 50,
  sound_categories JSON,                     -- {"task":true,"dare":false,...}
  theme ENUM('dark','light','system') DEFAULT 'dark',
  default_squad_id BIGINT UNSIGNED,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ========== SQUADS ==========
CREATE TABLE squads (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(60) NOT NULL,
  description VARCHAR(255),
  image_file_id BIGINT UNSIGNED,             -- อ้าง files.id (FK เพิ่มด้วย ALTER ในหมวด FILES)
  invite_code CHAR(8) NOT NULL UNIQUE,
  timezone VARCHAR(40) DEFAULT 'Asia/Bangkok',
  wall_mode ENUM('snitch','kudos','off') DEFAULT 'snitch',
  require_join_approval BOOLEAN DEFAULT FALSE,
  geofence_enabled BOOLEAN DEFAULT FALSE,
  settings JSON,                             -- notify channels, booking rules
  owner_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE squad_members (
  squad_id BIGINT UNSIGNED,
  user_id BIGINT UNSIGNED,
  role ENUM('owner','admin','member') DEFAULT 'member',
  status ENUM('pending','active','left','kicked') DEFAULT 'pending',
  trust_score TINYINT UNSIGNED DEFAULT 70,
  snitch_opt_out BOOLEAN DEFAULT FALSE,
  dare_opt_out BOOLEAN DEFAULT FALSE,
  dare_opt_out_effective_at DATETIME,        -- มีผลรอบถัดไป
  rules_accepted_at DATETIME,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  left_at DATETIME,
  PRIMARY KEY (squad_id, user_id),
  FOREIGN KEY (squad_id) REFERENCES squads(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK (trust_score <= 100),
  INDEX idx_members_user (user_id, status)
);

CREATE TABLE squad_invites (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  squad_id BIGINT UNSIGNED NOT NULL,
  token CHAR(32) NOT NULL UNIQUE,
  created_by BIGINT UNSIGNED NOT NULL,
  max_uses INT UNSIGNED,                     -- NULL = ไม่จำกัด
  used_count INT UNSIGNED DEFAULT 0,
  expires_at DATETIME,
  revoked_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (squad_id) REFERENCES squads(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

-- ========== FILES (ไฟล์อัปโหลดทั้งหมดเก็บใน DB — ไม่เขียนลงดิสก์) ==========
CREATE TABLE files (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  squad_id BIGINT UNSIGNED,                  -- ใช้ตรวจสิทธิ์ดูไฟล์ (NULL = ไม่ผูกก๊วน เช่น avatar)
  uploaded_by BIGINT UNSIGNED,
  purpose ENUM('avatar','squad_image','asset_image','loan_photo','task_attachment','wall_evidence',
               'alibi_evidence','dare_proof','pdf') NOT NULL,
  visibility ENUM('authenticated','squad','admin','private') NOT NULL DEFAULT 'squad',
                                             -- authenticated = ผู้ที่ Login | squad = สมาชิก Active ของก๊วน
                                             -- admin = owner/admin ของก๊วน (หลักฐาน Alibi) | private = ผู้อัปโหลดเท่านั้น (PDF)
  original_name VARCHAR(255),
  mime_type VARCHAR(100) NOT NULL,           -- allow-list: image/jpeg, image/png, image/webp, application/pdf
  size_bytes INT UNSIGNED NOT NULL,
  sha256 CHAR(64),                           -- ตรวจความถูกต้อง / กันอัปโหลดซ้ำ
  data MEDIUMBLOB,                           -- สูงสุด 16 MB; NULL เมื่อถูกล้างหลังหมดอายุ
  expires_at DATETIME,                       -- PDF = เสร็จ + 7 วัน, หลักฐาน Alibi = ตัดสิน + 30 วัน
  deleted_at DATETIME,                       -- เวลาที่ล้าง data (เก็บแถว metadata ไว้ไม่ให้ FK พัง)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (squad_id) REFERENCES squads(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_files_squad (squad_id, purpose),
  INDEX idx_files_expiry (expires_at, deleted_at)
);
-- หมายเหตุ: ห้าม SELECT * จาก files ในรายการ/ลิสต์ ให้ดึงคอลัมน์ data เฉพาะตอนเสิร์ฟไฟล์ (GET /files/:id)
-- ต้องตั้ง MySQL max_allowed_packet >= 32M

ALTER TABLE users  ADD CONSTRAINT fk_users_avatar  FOREIGN KEY (avatar_file_id) REFERENCES files(id) ON DELETE SET NULL;
ALTER TABLE squads ADD CONSTRAINT fk_squads_image  FOREIGN KEY (image_file_id)  REFERENCES files(id) ON DELETE SET NULL;

-- ========== TASKS ==========
CREATE TABLE tasks (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  squad_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(150) NOT NULL,
  description TEXT,
  subject VARCHAR(80),
  priority ENUM('low','medium','high','critical') DEFAULT 'medium',
  status ENUM('todo','in_progress','review','done','cancelled') DEFAULT 'todo',
  due_at DATETIME NOT NULL,
  max_due_at DATETIME,                       -- เพดาน Alibi
  allow_alibi BOOLEAN DEFAULT TRUE,
  is_personal BOOLEAN DEFAULT FALSE,         -- ผู้สร้าง = ผู้รับผิดชอบคนเดียว
  review_started_at DATETIME,
  verified_by BIGINT UNSIGNED,
  verified_at DATETIME,
  auto_verified BOOLEAN DEFAULT FALSE,
  completed_at DATETIME,
  created_by BIGINT UNSIGNED NOT NULL,
  source ENUM('manual','ai_pdf') DEFAULT 'manual',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (squad_id) REFERENCES squads(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_tasks_squad_due (squad_id, status, due_at)
);

CREATE TABLE task_assignees (
  task_id BIGINT UNSIGNED,
  user_id BIGINT UNSIGNED,
  due_override_at DATETIME,                  -- จาก Alibi ที่ผ่าน
  submitted_at DATETIME,
  result ENUM('pending','early','on_time','late','abandoned','cancelled') DEFAULT 'pending',
  late_days SMALLINT UNSIGNED DEFAULT 0,
  settled_at DATETIME,                       -- คิดคะแนนแล้ว (กันคิดซ้ำ)
  PRIMARY KEY (task_id, user_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE task_verifications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  task_id BIGINT UNSIGNED NOT NULL,
  verifier_id BIGINT UNSIGNED NOT NULL,
  decision ENUM('approve','reject') NOT NULL,
  comment VARCHAR(300),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (verifier_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE task_checklist_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  task_id BIGINT UNSIGNED NOT NULL,
  content VARCHAR(200) NOT NULL,
  is_done BOOLEAN DEFAULT FALSE,
  sort_order INT DEFAULT 0,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE TABLE task_comments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  task_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  content VARCHAR(1000) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE task_pokes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  task_id BIGINT UNSIGNED NOT NULL,
  from_user_id BIGINT UNSIGNED NOT NULL,
  to_user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_poke_cooldown (task_id, from_user_id, created_at)
);

CREATE TABLE task_attachments (
  task_id BIGINT UNSIGNED NOT NULL,
  file_id BIGINT UNSIGNED NOT NULL,          -- files.purpose = 'task_attachment', visibility = 'squad'
  added_by BIGINT UNSIGNED,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (task_id, file_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
  FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ========== LOCATIONS & ASSETS ==========
CREATE TABLE storage_locations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  squad_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(80) NOT NULL,
  static_qr_token CHAR(32) NOT NULL UNIQUE,
  kiosk_secret CHAR(64) NOT NULL,            -- ใช้สร้าง QR หมุนเวียน
  kiosk_device_token_hash CHAR(64),          -- อุปกรณ์ Kiosk ที่ลงทะเบียน
  lat DECIMAL(9,6),
  lng DECIMAL(9,6),
  radius_m SMALLINT UNSIGNED DEFAULT 100,
  FOREIGN KEY (squad_id) REFERENCES squads(id) ON DELETE CASCADE
);

CREATE TABLE assets (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  squad_id BIGINT UNSIGNED NOT NULL,
  location_id BIGINT UNSIGNED,
  name VARCHAR(100) NOT NULL,
  category VARCHAR(50),
  image_file_id BIGINT UNSIGNED,
  qr_token CHAR(32) NOT NULL UNIQUE,
  `condition` ENUM('good','fair','damaged','lost') DEFAULT 'good',
  status ENUM('available','borrowed','maintenance','suspected_lost') DEFAULT 'available',
  max_loan_hours INT UNSIGNED DEFAULT 72,
  min_trust_to_borrow TINYINT UNSIGNED DEFAULT 0,
  note VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (squad_id) REFERENCES squads(id) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES storage_locations(id) ON DELETE SET NULL,
  FOREIGN KEY (image_file_id) REFERENCES files(id) ON DELETE SET NULL
);

CREATE TABLE asset_loans (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  asset_id BIGINT UNSIGNED NOT NULL,
  borrower_id BIGINT UNSIGNED NOT NULL,
  status ENUM('active','return_pending','returned','lost') DEFAULT 'active',
  borrowed_at DATETIME NOT NULL,
  due_at DATETIME NOT NULL,
  due_override_at DATETIME,                  -- จาก Alibi
  return_requested_at DATETIME,
  return_method ENUM('station','member_confirm','admin'),
  return_confirmed_by BIGINT UNSIGNED,
  returned_at DATETIME,
  condition_before ENUM('good','fair','damaged'),
  condition_after ENUM('good','fair','damaged','lost'),
  photo_before_file_id BIGINT UNSIGNED,
  photo_after_file_id BIGINT UNSIGNED,
  extended BOOLEAN DEFAULT FALSE,
  overdue_level TINYINT UNSIGNED DEFAULT 0,  -- 0,1,3,7 กันแจ้งซ้ำ
  damage_verified BOOLEAN,
  settled_at DATETIME,
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
  FOREIGN KEY (borrower_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (return_confirmed_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (photo_before_file_id) REFERENCES files(id) ON DELETE SET NULL,
  FOREIGN KEY (photo_after_file_id) REFERENCES files(id) ON DELETE SET NULL,
  INDEX idx_loans_active (asset_id, status),
  INDEX idx_loans_due (status, due_at)
);

CREATE TABLE asset_waitlist (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  asset_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  notified_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wait (asset_id, user_id),
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ========== ROOMS & BOOKINGS ==========
CREATE TABLE rooms (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  squad_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(80) NOT NULL,
  location_note VARCHAR(150),                -- ตำแหน่งที่ตั้ง (ข้อความอิสระ)
  capacity INT UNSIGNED,
  facilities JSON,
  color CHAR(7) DEFAULT '#6C5CE7',
  open_time TIME DEFAULT '08:00:00',
  close_time TIME DEFAULT '22:00:00',
  -- กติกาการจอง: ตั้งโดย Admin ต่อห้อง (ไม่มี DEFAULT โดยตั้งใจ — ค่าเริ่มต้นอยู่ที่ RULES.BOOKING_DEFAULTS ใน server.js ที่เดียว)
  slot_minutes SMALLINT UNSIGNED NOT NULL,
  min_booking_minutes SMALLINT UNSIGNED NOT NULL,
  max_booking_minutes SMALLINT UNSIGNED NOT NULL,
  max_advance_days SMALLINT UNSIGNED NOT NULL,
  max_active_per_user TINYINT UNSIGNED NOT NULL,
  max_recurring TINYINT UNSIGNED NOT NULL,
  require_checkin BOOLEAN NOT NULL,
  checkin_early_minutes SMALLINT UNSIGNED NOT NULL,
  checkin_grace_minutes SMALLINT UNSIGNED NOT NULL,
  late_cancel_hours SMALLINT UNSIGNED NOT NULL,
  checkin_qr_token CHAR(32) NOT NULL UNIQUE,
  kiosk_secret CHAR(64) NOT NULL,
  kiosk_device_token_hash CHAR(64),
  lat DECIMAL(9,6),
  lng DECIMAL(9,6),
  radius_m SMALLINT UNSIGNED DEFAULT 100,
  is_active BOOLEAN DEFAULT TRUE,
  FOREIGN KEY (squad_id) REFERENCES squads(id) ON DELETE CASCADE
);

CREATE TABLE bookings (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  room_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(100),
  start_at DATETIME NOT NULL,
  end_at DATETIME NOT NULL,
  status ENUM('confirmed','checked_in','completed','cancelled','late_cancel','no_show') DEFAULT 'confirmed',
  recurring_group_id CHAR(36),
  checkin_opens_at DATETIME,                 -- Snapshot ตอนจอง (NULL = ไม่ต้อง Check-in)
  checkin_deadline_at DATETIME,              -- เลยเวลานี้โดยไม่ Check-in → no_show
  checked_in_at DATETIME,
  checkin_method ENUM('static_qr','kiosk_qr','admin'),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK (end_at > start_at),
  INDEX idx_booking_overlap (room_id, status, start_at, end_at),
  INDEX idx_booking_user (user_id, status, start_at),
  INDEX idx_booking_noshow (status, checkin_deadline_at)
);

-- ========== DESKS (โซนโต๊ะ / โต๊ะ / การจองโต๊ะ) ==========
-- ไม่มี INSERT ข้อมูลตัวอย่าง: โซนและโต๊ะทั้งหมด Admin เป็นผู้สร้างผ่านแอป (หรือ `node server.js --seed` ใน Dev)
-- ขอบเขตของค่า (เช่น จำนวนที่นั่งสูงสุด ขนาดผังสูงสุด) ตรวจที่ Server ด้วย RULES.BOOKING_LIMITS / DESK_LIMITS
CREATE TABLE desk_areas (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  squad_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(80) NOT NULL,
  description VARCHAR(255),
  location_note VARCHAR(150),                -- ตำแหน่งที่ตั้ง (ข้อความอิสระ เช่น ตึก/ชั้น/จุดสังเกต)
  grid_cols TINYINT UNSIGNED NOT NULL,       -- ขนาดผังโต๊ะ (จำนวนช่อง)
  grid_rows TINYINT UNSIGNED NOT NULL,
  open_time TIME NOT NULL,
  close_time TIME NOT NULL,
  -- กติกาการจอง: ตั้งโดย Admin ต่อโซน (ไม่มี DEFAULT โดยตั้งใจ — ค่าเริ่มต้นอยู่ที่ RULES.BOOKING_DEFAULTS ใน server.js ที่เดียว)
  slot_minutes SMALLINT UNSIGNED NOT NULL,
  min_booking_minutes SMALLINT UNSIGNED NOT NULL,
  max_booking_minutes SMALLINT UNSIGNED NOT NULL,
  max_advance_days SMALLINT UNSIGNED NOT NULL,
  max_active_per_user TINYINT UNSIGNED NOT NULL,
  max_recurring TINYINT UNSIGNED NOT NULL,
  require_checkin BOOLEAN NOT NULL,
  checkin_early_minutes SMALLINT UNSIGNED NOT NULL,
  checkin_grace_minutes SMALLINT UNSIGNED NOT NULL,
  late_cancel_hours SMALLINT UNSIGNED NOT NULL,
  checkin_qr_token CHAR(32) NOT NULL UNIQUE,
  kiosk_secret CHAR(64) NOT NULL,
  kiosk_device_token_hash CHAR(64),
  lat DECIMAL(9,6),
  lng DECIMAL(9,6),
  radius_m SMALLINT UNSIGNED DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT UNSIGNED,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (squad_id) REFERENCES squads(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CHECK (grid_cols >= 1 AND grid_rows >= 1),
  CHECK (close_time > open_time),
  INDEX idx_desk_areas_squad (squad_id, is_active)
);

CREATE TABLE desks (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  squad_id BIGINT UNSIGNED NOT NULL,         -- เก็บซ้ำเพื่อตรวจ IDOR ได้โดยไม่ต้อง JOIN
  area_id BIGINT UNSIGNED NOT NULL,
  label VARCHAR(30) NOT NULL,                -- ชื่อ/รหัสโต๊ะ ไม่ซ้ำในโซนเดียวกัน
  seat_count SMALLINT UNSIGNED NOT NULL,     -- จำนวนที่นั่ง (Admin กำหนด)
  booking_mode ENUM('whole','per_seat') NOT NULL DEFAULT 'whole',  -- จองทั้งโต๊ะ / จองเป็นที่นั่ง
  pos_x TINYINT UNSIGNED NOT NULL DEFAULT 0, -- ตำแหน่งบนผัง (ช่อง เริ่มที่ 0)
  pos_y TINYINT UNSIGNED NOT NULL DEFAULT 0,
  span_x TINYINT UNSIGNED NOT NULL DEFAULT 1,-- ขนาดบนผัง (กินกี่ช่อง)
  span_y TINYINT UNSIGNED NOT NULL DEFAULT 1,
  shape ENUM('square','round','rect') NOT NULL DEFAULT 'square',
  amenities JSON,                            -- แท็กข้อความอิสระ เช่น ["ปลั๊กไฟ","จอเสริม"]
  note VARCHAR(255),
  unavailable_until DATETIME,                -- พักใช้งานชั่วคราว (เช่น ซ่อม)
  is_active BOOLEAN NOT NULL DEFAULT TRUE,   -- Soft Delete (เก็บประวัติการจอง)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (squad_id) REFERENCES squads(id) ON DELETE CASCADE,
  FOREIGN KEY (area_id) REFERENCES desk_areas(id) ON DELETE CASCADE,
  CHECK (seat_count >= 1),
  CHECK (span_x >= 1 AND span_y >= 1),
  UNIQUE KEY uq_desk_label (area_id, label),
  INDEX idx_desks_area (area_id, is_active)
);

CREATE TABLE desk_bookings (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  desk_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  seats SMALLINT UNSIGNED NOT NULL,          -- จำนวนที่นั่งที่จอง (โต๊ะโหมด whole ใช้ seat_count ปัจจุบันตอนคำนวณความจุ)
  title VARCHAR(100),
  start_at DATETIME NOT NULL,
  end_at DATETIME NOT NULL,
  status ENUM('confirmed','checked_in','completed','cancelled','late_cancel','no_show') DEFAULT 'confirmed',
  recurring_group_id CHAR(36),
  checkin_opens_at DATETIME,                 -- Snapshot ตอนจอง (NULL = ไม่ต้อง Check-in)
  checkin_deadline_at DATETIME,
  checked_in_at DATETIME,
  checkin_method ENUM('static_qr','kiosk_qr','admin'),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (desk_id) REFERENCES desks(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK (end_at > start_at),
  CHECK (seats >= 1),
  INDEX idx_desk_booking_overlap (desk_id, status, start_at, end_at),
  INDEX idx_desk_booking_user (user_id, status, start_at),
  INDEX idx_desk_booking_noshow (status, checkin_deadline_at)
);

-- ========== WALL (SNITCH / KUDOS) ==========
CREATE TABLE wall_posts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  squad_id BIGINT UNSIGNED NOT NULL,
  kind ENUM('snitch','kudos') NOT NULL DEFAULT 'snitch',
  author_id BIGINT UNSIGNED,                 -- NULL = ระบบโพสต์อัตโนมัติ
  target_user_id BIGINT UNSIGNED NOT NULL,
  category VARCHAR(30) NOT NULL,             -- validate ด้วย zod ตาม kind
  content VARCHAR(500) NOT NULL,
  evidence_file_id BIGINT UNSIGNED,
  ref_type ENUM('task','asset_loan','booking','desk_booking'),
  ref_id BIGINT UNSIGNED,
  is_anonymous BOOLEAN DEFAULT FALSE,
  is_system BOOLEAN DEFAULT FALSE,
  eligible_voter_count SMALLINT UNSIGNED,    -- snapshot ตอนสร้างโพสต์
  status ENUM('open','guilty','acquitted','hidden','removed','archived') DEFAULT 'open',
  trust_applied BOOLEAN DEFAULT FALSE,
  verdict_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (squad_id) REFERENCES squads(id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (evidence_file_id) REFERENCES files(id) ON DELETE SET NULL,
  INDEX idx_wall_squad (squad_id, status, created_at),
  INDEX idx_wall_target (target_user_id, created_at)
);

CREATE TABLE wall_votes (
  post_id BIGINT UNSIGNED,
  user_id BIGINT UNSIGNED,
  vote ENUM('shame','defend','clap') NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, user_id),
  FOREIGN KEY (post_id) REFERENCES wall_posts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE wall_replies (
  post_id BIGINT UNSIGNED PRIMARY KEY,       -- แก้ต่างได้ 1 ครั้ง
  user_id BIGINT UNSIGNED NOT NULL,
  content VARCHAR(500) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES wall_posts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE wall_reports (
  post_id BIGINT UNSIGNED,
  user_id BIGINT UNSIGNED,
  reason VARCHAR(200),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, user_id),
  FOREIGN KEY (post_id) REFERENCES wall_posts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE moderation_actions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  squad_id BIGINT UNSIGNED NOT NULL,
  moderator_id BIGINT UNSIGNED NOT NULL,
  target_type VARCHAR(30) NOT NULL,          -- wall_post, alibi, dare ...
  target_id BIGINT UNSIGNED NOT NULL,
  action VARCHAR(30) NOT NULL,               -- hide, remove, restore, reopen ...
  reason VARCHAR(300) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (squad_id) REFERENCES squads(id) ON DELETE CASCADE,
  FOREIGN KEY (moderator_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ========== TRUST & BADGES ==========
CREATE TABLE trust_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  squad_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  event_type VARCHAR(40) NOT NULL,
  requested_delta SMALLINT NOT NULL,         -- ตามกติกา
  delta SMALLINT NOT NULL,                   -- ที่ใช้จริง (หลังเพดาน/clamp)
  score_after TINYINT UNSIGNED NOT NULL,
  ref_type VARCHAR(30),
  ref_id BIGINT UNSIGNED,
  reverses_event_id BIGINT UNSIGNED,         -- ใช้กับ TASK_REOPEN_REVERSAL
  note VARCHAR(200),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (squad_id) REFERENCES squads(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reverses_event_id) REFERENCES trust_events(id) ON DELETE SET NULL,
  UNIQUE KEY uq_trust_once (squad_id, user_id, event_type, ref_type, ref_id),  -- กันคิดซ้ำ
  INDEX idx_trust_user (squad_id, user_id, created_at)
);
-- หมายเหตุ: Event ที่เกิดซ้ำได้ตามรอบ (RECOVERY) ให้ใช้ ref_type='week', ref_id=YYYYWW

CREATE TABLE user_badges (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  squad_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  badge_key VARCHAR(40) NOT NULL,
  awarded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,
  UNIQUE KEY uq_badge (squad_id, user_id, badge_key),
  FOREIGN KEY (squad_id) REFERENCES squads(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ========== VOUCH ==========
CREATE TABLE vouches (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  squad_id BIGINT UNSIGNED NOT NULL,
  guarantor_id BIGINT UNSIGNED NOT NULL,
  vouchee_id BIGINT UNSIGNED NOT NULL,
  ref_type ENUM('task','asset_loan','asset_borrow_request') NOT NULL,
  ref_id BIGINT UNSIGNED NOT NULL,
  stake TINYINT UNSIGNED NOT NULL,           -- 3, 5, 10
  initiated_by ENUM('guarantor','vouchee') NOT NULL,
  status ENUM('pending','active','success','failed','withdrawn','declined','voided') DEFAULT 'pending',
  activated_at DATETIME,
  resolved_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (squad_id) REFERENCES squads(id) ON DELETE CASCADE,
  FOREIGN KEY (guarantor_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (vouchee_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK (guarantor_id <> vouchee_id),
  CHECK (stake IN (3,5,10)),
  INDEX idx_vouch_guarantor (guarantor_id, status),
  INDEX idx_vouch_ref (ref_type, ref_id, vouchee_id)
);

-- ========== ALIBI ==========
CREATE TABLE alibis (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  squad_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  ref_type ENUM('task','asset_loan') NOT NULL,
  ref_id BIGINT UNSIGNED NOT NULL,
  reason_category ENUM('sick','family','schedule_conflict','force_majeure','other') NOT NULL,
  reason_text VARCHAR(300) NOT NULL,
  evidence_file_id BIGINT UNSIGNED,          -- เห็นเฉพาะ Admin (files.visibility = 'admin')
  original_due_at DATETIME NOT NULL,
  requested_due_at DATETIME NOT NULL,
  granted_due_at DATETIME,
  is_emergency BOOLEAN DEFAULT FALSE,
  eligible_voter_count SMALLINT UNSIGNED NOT NULL,
  approve_count SMALLINT UNSIGNED DEFAULT 0,
  reject_count SMALLINT UNSIGNED DEFAULT 0,
  status ENUM('voting','approved','rejected','partial','withdrawn','admin_pending') DEFAULT 'voting',
  vote_closes_at DATETIME NOT NULL,
  decided_by BIGINT UNSIGNED,                -- กรณี Admin ตัดสิน
  decided_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (squad_id) REFERENCES squads(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (decided_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (evidence_file_id) REFERENCES files(id) ON DELETE SET NULL,
  UNIQUE KEY uq_alibi_once (user_id, ref_type, ref_id),
  INDEX idx_alibi_open (status, vote_closes_at)
);

CREATE TABLE alibi_votes (
  alibi_id BIGINT UNSIGNED,
  user_id BIGINT UNSIGNED,
  vote ENUM('approve','reject') NOT NULL,
  comment VARCHAR(200),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (alibi_id, user_id),
  FOREIGN KEY (alibi_id) REFERENCES alibis(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ========== DARES ==========
CREATE TABLE dares (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  squad_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(100) NOT NULL,
  punishment VARCHAR(300) NOT NULL,
  metric ENUM('most_late_tasks','most_late_days','lowest_trust_delta','most_auto_snitch','most_no_show') NOT NULL,
  period ENUM('weekly','custom') DEFAULT 'weekly',
  start_at DATETIME,
  end_at DATETIME,
  status ENUM('proposed','active','paused','ended','rejected') DEFAULT 'proposed',
  proposal_closes_at DATETIME,
  created_by BIGINT UNSIGNED NOT NULL,
  approved_by BIGINT UNSIGNED,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (squad_id) REFERENCES squads(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE dare_proposal_votes (
  dare_id BIGINT UNSIGNED,
  user_id BIGINT UNSIGNED,
  approve BOOLEAN NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (dare_id, user_id),
  FOREIGN KEY (dare_id) REFERENCES dares(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE dare_results (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  dare_id BIGINT UNSIGNED NOT NULL,
  period_start DATETIME NOT NULL,
  period_end DATETIME NOT NULL,
  loser_id BIGINT UNSIGNED,                  -- NULL = ไม่มีผู้แพ้
  ranking JSON,                              -- [{user_id, value, trust}, ...]
  tie_break_seed VARCHAR(64),
  proof_file_id BIGINT UNSIGNED,
  status ENUM('no_loser','pending','proof_submitted','completed','dodged') DEFAULT 'pending',
  deadline_at DATETIME NOT NULL,
  FOREIGN KEY (dare_id) REFERENCES dares(id) ON DELETE CASCADE,
  FOREIGN KEY (loser_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (proof_file_id) REFERENCES files(id) ON DELETE SET NULL,
  UNIQUE KEY uq_dare_period (dare_id, period_start)
);

CREATE TABLE dare_proof_votes (
  result_id BIGINT UNSIGNED,
  user_id BIGINT UNSIGNED,
  approve BOOLEAN NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (result_id, user_id),
  FOREIGN KEY (result_id) REFERENCES dare_results(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ========== AI PDF ==========
CREATE TABLE pdf_uploads (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  squad_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  original_name VARCHAR(255),
  file_id BIGINT UNSIGNED,                   -- ไฟล์ PDF ในตาราง files
  page_count INT,
  status ENUM('queued','processing','done','failed') DEFAULT 'queued',
  attempts TINYINT UNSIGNED DEFAULT 0,
  locked_at DATETIME,
  next_run_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  error_message VARCHAR(255),
  ai_model VARCHAR(50),
  tokens_used INT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (squad_id) REFERENCES squads(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE SET NULL,
  INDEX idx_pdf_queue (status, next_run_at)
);

CREATE TABLE ai_task_drafts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  upload_id BIGINT UNSIGNED NOT NULL,
  subject VARCHAR(80),
  title VARCHAR(150),
  description TEXT,
  due_at DATETIME,
  due_confidence ENUM('high','medium','low','none'),
  priority ENUM('low','medium','high','critical'),
  source_page INT,
  imported_task_id BIGINT UNSIGNED,
  FOREIGN KEY (upload_id) REFERENCES pdf_uploads(id) ON DELETE CASCADE,
  FOREIGN KEY (imported_task_id) REFERENCES tasks(id) ON DELETE SET NULL
);

-- ========== NOTIFICATIONS, LOGS, JOBS ==========
CREATE TABLE notifications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  squad_id BIGINT UNSIGNED,
  type VARCHAR(30) NOT NULL,
  title VARCHAR(120) NOT NULL,
  body VARCHAR(300),
  link VARCHAR(255),
  sfx_key VARCHAR(30),                       -- เสียงที่ Client ควรเล่น
  dedupe_key VARCHAR(100),                   -- กันแจ้งซ้ำ
  is_read BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (squad_id) REFERENCES squads(id) ON DELETE CASCADE,
  UNIQUE KEY uq_notif_dedupe (user_id, dedupe_key),
  INDEX idx_notif_user (user_id, is_read, created_at),
  INDEX idx_notif_stream (user_id, id)
);

CREATE TABLE activity_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  squad_id BIGINT UNSIGNED NOT NULL,
  actor_id BIGINT UNSIGNED,
  action VARCHAR(50) NOT NULL,
  meta JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (squad_id) REFERENCES squads(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_activity_squad (squad_id, created_at)
);

CREATE TABLE job_runs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  job_name VARCHAR(50) NOT NULL,
  run_key VARCHAR(120) NOT NULL UNIQUE,      -- เช่น dareWeekly:squad5:2025-W11
  status ENUM('running','success','failed') DEFAULT 'running',
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME,
  affected_rows INT,
  message VARCHAR(500),
  INDEX idx_job_name (job_name, started_at)
);