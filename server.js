"use strict";

// ===== CONFIG =====
// #region CONFIG
const express = require("express");
const mysql = require("mysql2/promise");
const pino = require("pino");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const sanitizeHtml = require("sanitize-html");
const multer = require("multer");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { createHash, randomUUID, timingSafeEqual } = require("node:crypto");
const path = require("node:path");
const envPath = path.join(__dirname, ".env");
if (require("node:fs").existsSync(envPath)) process.loadEnvFile(envPath);
const CONFIG = Object.freeze({
  mode: process.env.NODE_ENV || "development",
  fakeNow: process.env.FAKE_NOW || null,
  clockOffsetMinutes: process.env.CLOCK_OFFSET_MINUTES === undefined ? 0 : Number(process.env.CLOCK_OFFSET_MINUTES),
  devToken: process.env.DEV_TOKEN || null,
  port: process.env.PORT,
  database: Object.freeze({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset: "utf8mb4", timezone: "Z", dateStrings: true,
    connectionLimit: 5, maxIdle: 5, idleTimeout: 60000,
    waitForConnections: true, queueLimit: 20, connectTimeout: 10000,
    multipleStatements: false
  })
});
// #endregion

// ===== RULES =====
// #region RULES
const RULES = Object.freeze({
  TRUST_INITIAL: 70, TRUST_MIN: 0, TRUST_MAX: 100,
  TRUST_WEEKLY_GAIN_CAP: 15, SNITCH_WEEKLY_LOSS_CAP: -10,
  TRUST: Object.freeze({
    TASK_ON_TIME: 2, TASK_EARLY: 3, TASK_LATE_PER_DAY: -3, TASK_LATE_CAP: -10,
    TASK_ABANDONED: -12, LOAN_ON_TIME: 1, LOAN_LATE_PER_DAY: -2, LOAN_LATE_CAP: -10,
    ASSET_DAMAGED: -15, ASSET_LOST: -25,
    BOOKING_CHECKED_IN: 1, BOOKING_NO_SHOW: -5,
    SNITCH_GUILTY: -5, SNITCH_REMOVED: -5,
    DARE_COMPLETED: 5, DARE_DODGED: -15, VOUCH_SUCCESS_MAX_WEEKLY: 5,
    VOUCH_SUCCESS: Object.freeze([1, 2, 3]), VOUCH_FAILED: Object.freeze([-3, -5, -10]),
    VOUCH_STAKES: Object.freeze([3, 5, 10]), VOUCH_WITHDRAW_HOURS_BEFORE_DEADLINE: 48,
    VOUCH_ACTIVE_REQUIREMENT_HOURS: 24, VOUCHED_SUCCESS: 1, RECOVERY: 2
  }),
  VOUCH: Object.freeze({
    MIN_TRUST: 60, MIN_MEMBERSHIP_DAYS: 7, MAX_ACTIVE: 2, MAX_PER_GUARANTOR: 1,
    MIN_MEMBER_TRUST_TO_BORROW: 70, PAIR_LIMIT_30_DAYS: 2
  }),
  ALIBI: Object.freeze({
    MIN_HOURS_BEFORE_DEADLINE: 3, EMERGENCY_HOURS_AFTER_DEADLINE: 24,
    MAX_PER_WEEK_PER_SQUAD: 2, VOTE_HOURS: 12, MIN_APPROVAL_PERCENT: 40,
    MAX_EXTENSION_DAYS: 7, DESCRIPTION_MAX_LENGTH: 300
  }),
  BOOKING_DEFAULTS: Object.freeze({
    room: Object.freeze({
      slot_minutes: 30, min_booking_minutes: 30, max_booking_minutes: 240,
      max_advance_days: 30, max_active_per_user: 3, max_recurring: 8,
      require_checkin: true, checkin_early_minutes: 10, checkin_grace_minutes: 15,
      late_cancel_hours: 2, open_time: "08:00", close_time: "22:00"
    }),
    desk: Object.freeze({
      slot_minutes: 30, min_booking_minutes: 30, max_booking_minutes: 480,
      max_advance_days: 14, max_active_per_user: 2, max_recurring: 1,
      require_checkin: true, checkin_early_minutes: 10, checkin_grace_minutes: 15,
      late_cancel_hours: 2, open_time: "08:00", close_time: "22:00"
    })
  }),
  BOOKING_LIMITS: Object.freeze({
    slot_minutes: Object.freeze([15, 30, 60]),
    max_booking_minutes: Object.freeze([15, 1440]),
    max_advance_days: Object.freeze([1, 90]),
    max_active_per_user: Object.freeze([1, 20]), max_recurring: Object.freeze([1, 12]),
    checkin_early_minutes: Object.freeze([0, 60]), checkin_grace_minutes: Object.freeze([5, 120]),
    late_cancel_hours: Object.freeze([0, 48])
  }),
  DESK_LIMITS: Object.freeze({
    GRID_MAX: 40, SEATS_PER_DESK_MAX: 50, DESKS_PER_AREA_MAX: 200, AREAS_PER_SQUAD_MAX: 20
  }),
  BOOKING_REMINDER_MINUTES: 30
});
// #endregion

// ===== UTILS =====
// #region UTILS
const logger = pino({ level: "info", base: undefined });
class AppError extends Error {
  constructor(code, status = 500) {
    super(code);
    this.code = code;
    this.status = status;
  }
}
function createClock(mode, fakeNow, offsetMinutes = 0) {
  if (!["development", "production"].includes(mode)) throw new AppError("INVALID_MODE");
  if (!Number.isSafeInteger(offsetMinutes) || Math.abs(offsetMinutes) > 5256000) {
    throw new AppError("INVALID_CLOCK_OFFSET");
  }
  let instant = null;
  if (mode === "development" && fakeNow !== null) {
    if (typeof fakeNow !== "string" || fakeNow.length !== 24 ||
        !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/.test(fakeNow) ||
        fakeNow.startsWith("0000")) throw new AppError("INVALID_FAKE_NOW");
    instant = Date.parse(fakeNow);
    if (!Number.isFinite(instant) || new Date(instant).toISOString() !== fakeNow) {
      throw new AppError("INVALID_FAKE_NOW");
    }
  }
  let runtimeInstant = mode === "development" ? instant : null;
  let runtimeOffset = mode === "development" ? offsetMinutes : 0;
  const offsetMilliseconds = () => runtimeOffset * 60000;
  const state = {
    now: () => new Date((runtimeInstant === null ? Date.now() : runtimeInstant) + offsetMilliseconds()),
    set: (value) => {
      if (mode !== "development") throw new AppError("CLOCK_CONTROL_DISABLED");
      if (value === undefined || value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new AppError("INVALID_CLOCK_CONTROL");
      }
      const keys = Object.keys(value);
      if (keys.length !== 1 || !(keys[0] === "fakeNow" || keys[0] === "offsetMinutes")) {
        throw new AppError("INVALID_CLOCK_CONTROL");
      }
      if (keys[0] === "fakeNow") {
        if (typeof value.fakeNow !== "string" || value.fakeNow.length !== 24 ||
            !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/.test(value.fakeNow) ||
            value.fakeNow.startsWith("0000")) throw new AppError("INVALID_FAKE_NOW");
        const nextInstant = Date.parse(value.fakeNow);
        if (!Number.isFinite(nextInstant) || new Date(nextInstant).toISOString() !== value.fakeNow) {
          throw new AppError("INVALID_FAKE_NOW");
        }
        runtimeInstant = nextInstant;
        runtimeOffset = 0;
      } else {
        if (!Number.isSafeInteger(value.offsetMinutes) || Math.abs(value.offsetMinutes) > 5256000) {
          throw new AppError("INVALID_CLOCK_OFFSET");
        }
        runtimeInstant = null;
        runtimeOffset = value.offsetMinutes;
      }
      return state;
    },
    reset: () => {
      if (mode !== "development") throw new AppError("CLOCK_CONTROL_DISABLED");
      runtimeInstant = null;
      runtimeOffset = 0;
    },
    snapshot: () => ({ fakeNow: runtimeInstant === null ? null : new Date(runtimeInstant).toISOString(),
      offsetMinutes: runtimeOffset })
  };
  return state;
}
const clock = createClock(CONFIG.mode, CONFIG.fakeNow, CONFIG.clockOffsetMinutes);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 16 * 1024 * 1024, files: 1 } });
function parseMode(args) {
  if (!Array.isArray(args)) throw new AppError("INVALID_ARGUMENTS");
  if (args.length === 0) return "api";
  if (args.length === 1 && args[0] === "--selftest") return "selftest";
  if (args.length === 1 && args[0] === "--check-db") return "check-db";
  if (args.length === 1 && args[0] === "--check-job-lock") return "check-job-lock";
  if (args.length === 1 && args[0] === "--worker") return "worker";
  if (args.length === 1 && args[0] === "--seed") return "seed";
  if (args.length === 1 && args[0] === "--trust-rebuild") return "trust-rebuild";
  throw new AppError("INVALID_ARGUMENTS");
}
async function withJobLock(name, runKey, fn, source = pool, scope = CONFIG.database.database) {
  if (typeof name !== "string" || !/^[A-Za-z][A-Za-z0-9_-]{0,49}$/.test(name) ||
      typeof runKey !== "string" || runKey.length > 120 ||
      !/^[A-Za-z0-9:_.-]+$/.test(runKey) || !runKey.startsWith(`${name}:`) ||
      runKey.length <= name.length + 1 || typeof fn !== "function" ||
      typeof scope !== "string" || scope.length === 0 || scope.length > 64) {
    throw new AppError("INVALID_JOB_ARGUMENTS");
  }
  const lockName = `job:${createHash("sha256").update(JSON.stringify([scope, name]))
    .digest("hex").slice(0, 60)}`;
  const conn = await source.getConnection();
  let locked = false;
  let transaction = false;
  let reusable = true;
  let claimed = false;
  let committing = false;
  const timestamp = () => clock.now().toISOString().slice(0, 23).replace("T", " ");
  try {
    // A transport failure here can still mean the server acquired the lock.
    reusable = false;
    const [[lock]] = await conn.query("SELECT GET_LOCK(?, 0) AS ok", [lockName]);
    if (lock.ok !== 0 && lock.ok !== 1) throw new AppError("JOB_LOCK_FAILED");
    reusable = true;
    if (lock.ok === 0) return { skipped: true, reason: "busy" };
    locked = true;
    reusable = false;
    await conn.beginTransaction();
    transaction = true;
    reusable = true;
    const [[run]] = await conn.execute(
      "SELECT job_name, status FROM job_runs WHERE run_key = ? FOR UPDATE", [runKey]);
    if (run && run.job_name !== name) throw new AppError("JOB_KEY_CONFLICT");
    if (run && !["running", "success", "failed"].includes(run.status)) {
      throw new AppError("JOB_STATE_INVALID");
    }
    if (run?.status === "success") {
      await conn.rollback();
      transaction = false;
      return { skipped: true, reason: "already_ran" };
    }
    if (run) {
      await conn.execute(
        "UPDATE job_runs SET status='running', started_at=?, finished_at=NULL, " +
        "affected_rows=NULL, message=NULL WHERE run_key=?", [timestamp(), runKey]);
    } else {
      await conn.execute(
        "INSERT INTO job_runs (job_name, run_key, status, started_at) VALUES (?, ?, 'running', ?)",
        [name, runKey, timestamp()]);
    }
    committing = true;
    await conn.commit();
    committing = false;
    transaction = false;
    claimed = true;
    logger.info({ job: name, code: "JOB_STARTED" }, "Job started.");
    reusable = false;
    await conn.beginTransaction();
    transaction = true;
    reusable = true;
    const result = await fn(conn);
    const affected = result?.affected === undefined ? 0 : result.affected;
    if (!Number.isInteger(affected) || affected < 0 || affected > 2147483647) {
      throw new AppError("INVALID_JOB_RESULT");
    }
    const [updated] = await conn.execute(
      "UPDATE job_runs SET status='success', finished_at=?, affected_rows=?, message=NULL " +
      "WHERE run_key=? AND job_name=? AND status='running'",
      [timestamp(), affected, runKey, name]);
    if (updated.affectedRows !== 1) throw new AppError("JOB_STATE_INVALID");
    // Effects and success become durable together; an unknown commit must not be retried here.
    committing = true;
    await conn.commit();
    committing = false;
    transaction = false;
    logger.info({ job: name, code: "JOB_SUCCEEDED", affected }, "Job completed.");
    return result;
  } catch (error) {
    logger.error({ job: name, code: committing ? "JOB_OUTCOME_UNKNOWN" : "JOB_FAILED" },
      "Job failed.");
    if (committing) reusable = false;
    if (transaction && reusable) {
      try { await conn.rollback(); transaction = false; }
      catch { reusable = false; }
    }
    if (claimed && reusable) {
      try {
        await conn.execute(
          "UPDATE job_runs SET status='failed', finished_at=?, affected_rows=0, message=? " +
          "WHERE run_key=? AND job_name=? AND status='running'",
          [timestamp(), "JOB_EXECUTION_FAILED", runKey, name]);
      } catch { reusable = false; }
    }
    throw error;
  } finally {
    if (locked && reusable) {
      try {
        const [[released]] = await conn.query("SELECT RELEASE_LOCK(?) AS ok", [lockName]);
        if (released.ok !== 1) reusable = false;
      } catch { reusable = false; }
    }
    if (reusable) conn.release();
    else conn.destroy();
  }
}
// #endregion

// ===== DB =====
// #region DB
const pool = mysql.createPool(CONFIG.database);
async function withTx(fn, source = pool) {
  if (typeof fn !== "function") throw new TypeError("Transaction callback must be a function.");
  const conn = await source.getConnection();
  let started = false;
  let reusable = true;
  let committing = false;
  try {
    await conn.beginTransaction();
    started = true;
    const result = await fn(conn);
    committing = true;
    await conn.commit();
    committing = false;
    return result;
  } catch (error) {
    // A lost COMMIT acknowledgement cannot be resolved by issuing ROLLBACK.
    if (committing) reusable = false;
    else if (started) {
      try { await conn.rollback(); }
      catch { reusable = false; }
    } else {
      reusable = false;
    }
    throw error;
  } finally {
    // Never reuse a connection whose transaction state is uncertain.
    if (reusable) conn.release();
    else conn.destroy();
  }
}
async function inspectDatabase(source = pool, expectedDatabase = CONFIG.database.database) {
  const conn = await source.getConnection();
  try {
    const [identity] = await conn.query("SELECT DATABASE() AS selected");
    if (identity.length !== 1 || !expectedDatabase || identity[0].selected !== expectedDatabase) {
      throw new AppError("DB_IDENTITY_MISMATCH");
    }
    const [tables] = await conn.execute(
      "SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'job_runs'");
    const [columns] = await conn.execute(
      "SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, EXTRA FROM information_schema.COLUMNS " +
      "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'job_runs'");
    const [indexes] = await conn.execute(
      "SELECT INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME, SUB_PART " +
      "FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'job_runs'");
    const fields = new Map(columns.map((column) => [column.COLUMN_NAME, column]));
    const matches = (name, type) => type.test(fields.get(name)?.COLUMN_TYPE || "");
    const fullUniqueKey = [...new Set(indexes.map((index) => index.INDEX_NAME))].some((name) => {
      const parts = indexes.filter((index) => index.INDEX_NAME === name);
      return parts.length === 1 && parts[0].NON_UNIQUE === 0 &&
        parts[0].SEQ_IN_INDEX === 1 && parts[0].COLUMN_NAME === "run_key" &&
        parts[0].SUB_PART === null;
    });
    // Validate only the job foundation; this is not an audit of all application tables.
    if (tables.length !== 1 || tables[0].ENGINE !== "InnoDB" ||
        !matches("id", /^bigint(?:\(\d+\))? unsigned$/) ||
        fields.get("id")?.IS_NULLABLE !== "NO" ||
        !/\bauto_increment\b/.test(fields.get("id")?.EXTRA || "") ||
        !matches("job_name", /^varchar\(50\)$/) || fields.get("job_name")?.IS_NULLABLE !== "NO" ||
        !matches("run_key", /^varchar\(120\)$/) || fields.get("run_key")?.IS_NULLABLE !== "NO" ||
        !matches("status", /^enum\('running','success','failed'\)$/) ||
        !matches("started_at", /^datetime(?:\([0-6]\))?$/) ||
        !matches("finished_at", /^datetime(?:\([0-6]\))?$/) ||
        !matches("affected_rows", /^int(?:\(\d+\))?$/) ||
        !matches("message", /^varchar\(500\)$/) ||
        ["finished_at", "affected_rows", "message"].some((name) => fields.get(name)?.IS_NULLABLE !== "YES") ||
        !fullUniqueKey) throw new AppError("DB_JOB_SCHEMA_INVALID");
  } finally {
    conn.release();
  }
}
async function checkDatabase() {
  await inspectDatabase();
  logger.info({ code: "DB_CONNECTED" }, "Assigned database and job foundation schema verified.");
}
async function inspectNamedLocks(source = pool, expectedDatabase = CONFIG.database.database) {
  const lockName = `probe:${createHash("sha256").update(JSON.stringify([expectedDatabase, randomUUID()]))
    .digest("hex").slice(0, 58)}`;
  let owner;
  let contender;
  const query = (conn, sql, values = []) => conn.query({ sql, timeout: 10000 }, values);
  try {
    owner = await source.getConnection();
    contender = await source.getConnection();
    const identities = [];
    for (const conn of [owner, contender]) {
      const [rows] = await query(conn, "SELECT DATABASE() AS selected, CONNECTION_ID() AS session_id");
      if (rows.length !== 1 || !expectedDatabase || rows[0].selected !== expectedDatabase) {
        throw new AppError("DB_IDENTITY_MISMATCH");
      }
      identities.push(rows[0].session_id);
    }
    if (!identities.every((id) => Number.isSafeInteger(id) && id > 0) ||
        identities[0] === identities[1]) throw new AppError("DB_LOCK_CHECK_FAILED");
    const expect = async (conn, sql, wanted) => {
      const [rows] = await query(conn, sql, [lockName]);
      if (rows.length !== 1 || rows[0].ok !== wanted) throw new AppError("DB_LOCK_CHECK_FAILED");
    };
    await expect(owner, "SELECT GET_LOCK(?, 0) AS ok", 1);
    await expect(contender, "SELECT GET_LOCK(?, 0) AS ok", 0);
    await expect(owner, "SELECT RELEASE_LOCK(?) AS ok", 1);
    await expect(contender, "SELECT GET_LOCK(?, 0) AS ok", 1);
    await expect(owner, "SELECT GET_LOCK(?, 0) AS ok", 0);
    await expect(contender, "SELECT RELEASE_LOCK(?) AS ok", 1);
    const [[state]] = await query(owner, "SELECT IS_FREE_LOCK(?) AS ok", [lockName]);
    if (state?.ok !== 1) throw new AppError("DB_LOCK_CHECK_FAILED");
  } finally {
    // Never return probe sessions to the pool: even a lost acknowledgement may hold a lock.
    try { contender?.destroy(); }
    finally { owner?.destroy(); }
  }
}
// #endregion

// ===== REPOSITORIES =====
// #region REPOSITORIES
const squadRepo = Object.freeze({
  async listForUser(userId, conn = pool) {
    const [rows] = await conn.execute(
      "SELECT s.id, s.name, s.description, s.timezone, s.owner_id, m.role, m.status, m.rules_accepted_at " +
      "FROM squads s JOIN squad_members m ON m.squad_id=s.id WHERE m.user_id=? AND m.status IN ('pending','active') ORDER BY s.id DESC LIMIT 100",
      [userId]);
    return rows;
  }
});
const authRepo = Object.freeze({
  async findByLogin(login, conn = pool) {
    const [rows] = await conn.execute(
      "SELECT id, username, email, password_hash, display_name, email_verified_at, deleted_at " +
      "FROM users WHERE (username = ? OR email = ?) AND deleted_at IS NULL LIMIT 1", [login, login]);
    return rows[0] || null;
  },
  async findById(id, conn = pool) {
    const [rows] = await conn.execute(
      "SELECT id, username, email, display_name, email_verified_at, birth_year, deleted_at " +
      "FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1", [id]);
    return rows[0] || null;
  }
});
const squadMemberRepo = Object.freeze({
  async membership(squadId, userId, conn = pool) {
    const [rows] = await conn.execute(
      "SELECT squad_id, user_id, role, status, trust_score, rules_accepted_at FROM squad_members WHERE squad_id=? AND user_id=? LIMIT 1",
      [squadId, userId]);
    return rows[0] || null;
  },
  async loadAdmin(squadId, conn = pool) {
    const [rows] = await conn.execute(
      "SELECT id, name, description, timezone, require_join_approval, settings FROM squads WHERE id=? LIMIT 1", [squadId]);
    return rows[0] || null;
  }
});
// #endregion

// ===== SERVICES =====
// #region SERVICES
const authService = Object.freeze({
  validateRegistration(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new AppError("INVALID_REQUEST", 400);
    const username = typeof input.username === "string" ? input.username.trim() : "";
    const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
    const password = typeof input.password === "string" ? input.password : "";
    const displayName = typeof input.display_name === "string" ? input.display_name.trim() : "";
    if (!/^[A-Za-z0-9_]{3,30}$/.test(username)) throw new AppError("AUTH_USERNAME_INVALID", 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError("AUTH_EMAIL_INVALID", 400);
    if (!displayName || displayName.length > 50) throw new AppError("AUTH_DISPLAY_NAME_INVALID", 400);
    if (!/^.{8,128}$/.test(password) || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      throw new AppError("AUTH_PASSWORD_INVALID", 400);
    }
    let birthYear = input.birth_year;
    if (birthYear >= 2400 && birthYear <= 2600) birthYear -= 543;
    const currentYear = clock.now().getUTCFullYear();
    if (!Number.isInteger(birthYear) || birthYear < 1900 || birthYear > currentYear - 13) {
      throw new AppError("AUTH_BIRTH_YEAR_INVALID", 400);
    }
    return { username, email, password, display_name: displayName, birth_year: birthYear };
  },
  tokenHash(token) { return createHash("sha256").update(token).digest("hex"); },
  createJwt(user) {
    if (typeof process.env.JWT_SECRET !== "string" || Buffer.byteLength(process.env.JWT_SECRET) < 32) {
      throw new AppError("SECRET_CONFIG_REQUIRED");
    }
    return jwt.sign({ sub: String(user.id), username: user.username }, process.env.JWT_SECRET, {
      expiresIn: "7d", issuer: "zero-trust", audience: "zero-trust-api"
    });
  }
});
// #endregion

// ===== MIDDLEWARES =====
// #region MIDDLEWARES
const app = express();
app.disable("x-powered-by");
app.use(cookieParser());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: "draft-8", legacyHeaders: false }));
app.use("/api/v1/auth", rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false }));
app.use(helmet({
  strictTransportSecurity: CONFIG.mode === "production" ? undefined : false,
  contentSecurityPolicy: {
    directives: { upgradeInsecureRequests: CONFIG.mode === "production" ? [] : null }
  }
}));
function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500
    ? error.status : 500;
  if (status === 500) logger.error({ code: "REQUEST_FAILED" }, "Request failed.");
  res.status(status).json({ error: {
    code: status === 500 ? "INTERNAL_ERROR" : (typeof error.code === "string" ? error.code : "INVALID_REQUEST"),
    message: status === 500 ? "An unexpected error occurred." : "Invalid request."
  } });
}
// #endregion

// ===== ROUTES =====
// #region ROUTES
app.use(express.json({ limit: "16kb" }));
app.get("/api/v1/time", (req, res) => {
  res.json({ serverTime: clock.now().toISOString() });
});
function requireDevClockToken(req, res, next) {
  if (!CONFIG.devToken || typeof req.get("x-dev-token") !== "string") {
    return res.status(401).json({ error: { code: "DEV_TOKEN_REQUIRED", message: "Invalid development token." } });
  }
  const supplied = createHash("sha256").update(req.get("x-dev-token")).digest();
  const expected = createHash("sha256").update(CONFIG.devToken).digest();
  if (!timingSafeEqual(supplied, expected)) {
    return res.status(401).json({ error: { code: "DEV_TOKEN_REQUIRED", message: "Invalid development token." } });
  }
  return next();
}
function requireAuth(req, res, next) {
  try {
    if (typeof req.cookies.session !== "string") throw new jwt.JsonWebTokenError("missing");
    const payload = jwt.verify(req.cookies.session, process.env.JWT_SECRET, {
      issuer: "zero-trust", audience: "zero-trust-api"
    });
    req.auth = { userId: Number(payload.sub) };
    if (!Number.isSafeInteger(req.auth.userId) || req.auth.userId <= 0) throw new jwt.JsonWebTokenError("invalid subject");
    return next();
  } catch {
    res.clearCookie("session", authCookieOptions());
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } });
  }
}
function authCookieOptions() {
  return { httpOnly: true, secure: CONFIG.mode === "production", sameSite: "lax", path: "/" };
}
app.post("/api/v1/auth/register", async (req, res, next) => {
  try {
    const input = authService.validateRegistration(req.body);
    const passwordHash = await bcrypt.hash(input.password, 12);
    const [result] = await pool.execute(
      "INSERT INTO users (username, email, password_hash, display_name, birth_year, email_verified_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())",
      [input.username, input.email, passwordHash, input.display_name, input.birth_year]);
    const user = { id: result.insertId, username: input.username, display_name: input.display_name };
    const token = authService.createJwt(user);
    res.cookie("session", token, { ...authCookieOptions(), maxAge: 7 * 24 * 60 * 60 * 1000 });
    return res.status(201).json({ user, message: "Registration successful." });
  } catch (error) {
    if (error && error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: { code: "AUTH_ALREADY_EXISTS", message: "Account already exists." } });
    }
    return next(error);
  }
});
app.post("/api/v1/auth/login", async (req, res, next) => {
  try {
    const login = typeof req.body?.login === "string" ? req.body.login.trim().toLowerCase() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!login || !password) throw new AppError("INVALID_CREDENTIALS", 401);
    const user = await authRepo.findByLogin(login);
    if (!user || !(await bcrypt.compare(password, user.password_hash))) throw new AppError("INVALID_CREDENTIALS", 401);
    const token = authService.createJwt(user);
    res.cookie("session", token, { ...authCookieOptions(), maxAge: 7 * 24 * 60 * 60 * 1000 });
    return res.json({ user: { id: user.id, username: user.username, display_name: user.display_name, email_verified: Boolean(user.email_verified_at) } });
  } catch (error) { return next(error); }
});
app.post("/api/v1/auth/forgot-password", async (req, res, next) => {
  try {
    const login = typeof req.body?.login === "string" ? req.body.login.trim().toLowerCase() : "";
    const user = login ? await authRepo.findByLogin(login) : null;
    if (user) {
      const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
      await pool.execute(
        "INSERT INTO auth_tokens (user_id, token_hash, type, expires_at) VALUES (?, ?, 'password_reset', DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 MINUTE))",
        [user.id, authService.tokenHash(token.slice(0, 64))]);
      return res.json({ message: "If the account exists, reset instructions were prepared.", resetToken: CONFIG.mode === "development" ? token.slice(0, 64) : undefined });
    }
    res.json({ message: "If the account exists, reset instructions were prepared." });
  } catch (error) { return next(error); }
});
app.post("/api/v1/auth/reset-password", async (req, res, next) => {
  try {
    const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!/^[a-f0-9]{64}$/i.test(token) || !/^.{8,128}$/.test(password) || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      throw new AppError("AUTH_PASSWORD_RESET_INVALID", 400);
    }
    await withTx(async (conn) => {
      const hash = authService.tokenHash(token.toLowerCase());
      const [[record]] = await conn.execute(
        "SELECT id,user_id FROM auth_tokens WHERE token_hash=? AND type='password_reset' AND used_at IS NULL AND expires_at > UTC_TIMESTAMP() LIMIT 1 FOR UPDATE",
        [hash]);
      if (!record) throw new AppError("AUTH_RESET_TOKEN_INVALID", 400);
      const passwordHash = await bcrypt.hash(password, 12);
      await conn.execute("UPDATE users SET password_hash=? WHERE id=?", [passwordHash, record.user_id]);
      await conn.execute("UPDATE auth_tokens SET used_at=UTC_TIMESTAMP() WHERE id=?", [record.id]);
    });
    res.json({ reset: true });
  } catch (error) { return next(error); }
});
app.post("/api/v1/auth/logout", requireAuth, (req, res) => {
  res.clearCookie("session", authCookieOptions());
  res.status(204).end();
});
app.get("/api/v1/auth/me", requireAuth, async (req, res, next) => {
  try {
    const user = await authRepo.findById(req.auth.userId);
    if (!user) throw new AppError("UNAUTHORIZED", 401);
    res.json({ user });
  } catch (error) { return next(error); }
});
app.get("/api/v1/squads", requireAuth, async (req, res, next) => {
  try { res.json({ squads: await squadRepo.listForUser(req.auth.userId) }); }
  catch (error) { return next(error); }
});
app.get("/api/v1/wall-alerts", requireAuth, async (req, res, next) => {
  try {
    const [posts] = await pool.execute(
      "SELECT w.id,w.squad_id,w.category,w.content,w.created_at,s.name AS squad_name,u.display_name AS target_name " +
      "FROM wall_posts w JOIN squads s ON s.id=w.squad_id " +
      "JOIN squad_members m ON m.squad_id=w.squad_id AND m.user_id=? " +
      "JOIN users u ON u.id=w.target_user_id " +
      "JOIN squad_members target ON target.squad_id=w.squad_id AND target.user_id=w.target_user_id " +
      "WHERE m.status='active' AND m.rules_accepted_at IS NOT NULL AND s.wall_mode='snitch' " +
      "AND target.status='active' AND target.snitch_opt_out=FALSE AND w.kind='snitch' AND w.status='open' " +
      "ORDER BY w.created_at DESC,w.id DESC LIMIT 20", [req.auth.userId]);
    res.set("Cache-Control", "no-store");
    res.json({ posts });
  } catch (error) { return next(error); }
});
app.get("/api/v1/squads/public", requireAuth, async (req, res, next) => {
  try {
    const search = typeof req.query?.q === "string" ? req.query.q.trim().slice(0,60) : "";
    const [rows] = await pool.execute(
      "SELECT s.id,s.name,s.description,s.require_join_approval, " +
      "EXISTS(SELECT 1 FROM squad_members m WHERE m.squad_id=s.id AND m.user_id=? AND m.status IN ('pending','active')) AS joined " +
      "FROM squads s WHERE s.require_join_approval=TRUE " +
      "AND (JSON_UNQUOTE(JSON_EXTRACT(COALESCE(s.settings, JSON_OBJECT()), '$.lifecycle')) IS NULL OR JSON_UNQUOTE(JSON_EXTRACT(s.settings, '$.lifecycle'))='active') " +
      "AND (?='' OR s.name LIKE CONCAT('%', ?, '%')) ORDER BY s.id DESC LIMIT 50",
      [req.auth.userId, search, search]);
    res.json({ squads: rows });
  } catch (error) { return next(error); }
});
app.post("/api/v1/squads/:squadId/join-public", requireAuth, async (req, res, next) => {
  try {
    const squadId = Number(req.params.squadId);
    await withTx(async (conn) => {
      const [[squad]] = await conn.execute("SELECT id,require_join_approval FROM squads WHERE id=? LIMIT 1 FOR UPDATE", [squadId]);
      if (!squad || !squad.require_join_approval) throw new AppError("PUBLIC_SQUAD_NOT_FOUND", 404);
      const [[existing]] = await conn.execute("SELECT status FROM squad_members WHERE squad_id=? AND user_id=? LIMIT 1", [squadId, req.auth.userId]);
      if (existing) throw new AppError("ALREADY_MEMBER", 409);
      await conn.execute("INSERT INTO squad_members (squad_id,user_id,role,status,joined_at) VALUES (?,?,'member','pending',UTC_TIMESTAMP())", [squadId, req.auth.userId]);
    });
    res.status(201).json({ status: "pending" });
  } catch (error) { return next(error); }
});
app.post("/api/v1/squads", requireAuth, async (req, res, next) => {
  try {
    if (!req.body || typeof req.body.name !== "string" || !req.body.name.trim() || req.body.name.trim().length > 60) {
      throw new AppError("INVALID_REQUEST", 400);
    }
    const description = typeof req.body.description === "string" ? req.body.description.trim().slice(0, 255) : null;
    const timezone = typeof req.body.timezone === "string" ? req.body.timezone.trim().slice(0, 40) : "Asia/Bangkok";
    if (!timezone) throw new AppError("INVALID_REQUEST", 400);
    const visibility = req.body?.visibility === "private" ? "private" : "public";
    const requireApproval = visibility === "public";
    const name = req.body.name.trim();
    let squadId;
    await withTx(async (conn) => {
      let inviteCode;
      for (let attempt = 0; attempt < 5; attempt++) {
        inviteCode = randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
        try {
          const [result] = await conn.execute(
            "INSERT INTO squads (name, description, timezone, invite_code, owner_id, require_join_approval) VALUES (?, ?, ?, ?, ?, ?)",
            [name, description, timezone, inviteCode, req.auth.userId, requireApproval]);
          squadId = result.insertId;
          break;
        } catch (error) { if (error.code !== "ER_DUP_ENTRY" || attempt === 4) throw error; }
      }
      await conn.execute(
        "INSERT INTO squad_members (squad_id, user_id, role, status, rules_accepted_at, joined_at) VALUES (?, ?, 'owner', 'active', UTC_TIMESTAMP(), UTC_TIMESTAMP())",
        [squadId, req.auth.userId]);
    });
    res.status(201).json({ squad: { id: squadId, name, description, timezone, visibility } });
  } catch (error) { return next(error); }
});
app.post("/api/v1/squads/:squadId/invites", requireAuth, async (req, res, next) => {
  try {
    const squadId = Number(req.params.squadId);
    if (!Number.isSafeInteger(squadId) || squadId <= 0) throw new AppError("INVALID_REQUEST", 400);
    const [members] = await pool.execute("SELECT role FROM squad_members WHERE squad_id=? AND user_id=? AND status='active' LIMIT 1", [squadId, req.auth.userId]);
    if (!members[0] || !["owner", "admin"].includes(members[0].role)) throw new AppError("FORBIDDEN", 403);
    const maxUses = req.body?.max_uses === undefined ? null : Number(req.body.max_uses);
    if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 1000)) throw new AppError("INVALID_REQUEST", 400);
    const expiresAt = typeof req.body?.expires_at === "string" ? req.body.expires_at : null;
    let token;
    await withTx(async (conn) => {
      token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
      await conn.execute(
        "INSERT INTO squad_invites (squad_id, token, created_by, max_uses, expires_at) VALUES (?, ?, ?, ?, ?)",
        [squadId, token.slice(0, 32), req.auth.userId, maxUses, expiresAt]);
    });
    res.status(201).json({ invite: { token: token.slice(0, 32) } });
  } catch (error) { return next(error); }
});
app.get("/api/v1/squads/:squadId/membership", requireAuth, async (req, res, next) => {
  try {
    const squadId = Number(req.params.squadId);
    const squad = await squadMemberRepo.loadAdmin(squadId);
    const member = await squadMemberRepo.membership(squadId, req.auth.userId);
    if (!squad || !member) throw new AppError("NOT_MEMBER", 404);
    res.json({ squad, member });
  } catch (error) { return next(error); }
});
app.post("/api/v1/squads/:squadId/accept-rules", requireAuth, async (req, res, next) => {
  try {
    if (req.body?.accepted !== true) throw new AppError("RULES_CONSENT_REQUIRED", 400);
    const squadId = Number(req.params.squadId);
    await withTx(async (conn) => {
      const squad = await squadMemberRepo.loadAdmin(squadId, conn);
      const member = await squadMemberRepo.membership(squadId, req.auth.userId, conn);
      if (!squad || !member) throw new AppError("NOT_MEMBER", 404);
      if (member.status === "left" || member.status === "kicked") throw new AppError("MEMBERSHIP_CLOSED", 409);
      const status = member.role === "owner" || !squad.require_join_approval ? "active" : "pending";
      await conn.execute(
        "UPDATE squad_members SET rules_accepted_at=UTC_TIMESTAMP(), status=? WHERE squad_id=? AND user_id=?",
        [status, squadId, req.auth.userId]);
      member.rules_accepted_at = clock.now().toISOString().slice(0, 19).replace("T", " ");
      member.status = status;
    });
    res.json({ member: await squadMemberRepo.membership(squadId, req.auth.userId) });
  } catch (error) { return next(error); }
});
app.patch("/api/v1/squads/:squadId", requireAuth, async (req, res, next) => {
  try {
    const squadId = Number(req.params.squadId);
    const member = await requireActiveSquadMember(squadId, req.auth.userId);
    if (!["owner", "admin"].includes(member.role)) throw new AppError("FORBIDDEN", 403);
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!name || name.length > 60) throw new AppError("SQUAD_NAME_INVALID", 400);
    const description = typeof req.body?.description === "string" ? req.body.description.trim().slice(0,255) : null;
    const visibility = req.body?.visibility === "private" ? "private" : "public";
    const timezone = typeof req.body?.timezone === "string" ? req.body.timezone.trim().slice(0,40) : "Asia/Bangkok";
    await pool.execute(
      "UPDATE squads SET name=?, description=?, timezone=?, require_join_approval=? WHERE id=?",
      [name, description, timezone || "Asia/Bangkok", visibility === "public", squadId]);
    res.json({ squad: { id: squadId, name, description, timezone: timezone || "Asia/Bangkok", visibility } });
  } catch (error) { return next(error); }
});
app.post("/api/v1/squads/:squadId/close", requireAuth, async (req, res, next) => {
  try {
    const squadId = Number(req.params.squadId);
    const member = await requireActiveSquadMember(squadId, req.auth.userId);
    if (member.role !== "owner") throw new AppError("FORBIDDEN", 403);
    await withTx(async (conn) => {
      await conn.execute("UPDATE squads SET settings=JSON_SET(COALESCE(settings, JSON_OBJECT()), '$.lifecycle', ?), require_join_approval=TRUE WHERE id=?", [req.body?.cancelled === true ? "cancelled" : "closed", squadId]);
      if (req.body?.cancelled === true) await conn.execute("UPDATE squad_invites SET revoked_at=COALESCE(revoked_at,UTC_TIMESTAMP()) WHERE squad_id=? AND revoked_at IS NULL", [squadId]);
    });
    res.json({ lifecycle: req.body?.cancelled === true ? "cancelled" : "closed" });
  } catch (error) { return next(error); }
});
app.post("/api/v1/squads/:squadId/reopen", requireAuth, async (req, res, next) => {
  try {
    const squadId = Number(req.params.squadId);
    const member = await requireActiveSquadMember(squadId, req.auth.userId);
    if (member.role !== "owner") throw new AppError("FORBIDDEN", 403);
    await pool.execute("UPDATE squads SET settings=JSON_SET(COALESCE(settings, JSON_OBJECT()), '$.lifecycle', 'active') WHERE id=?", [squadId]);
    res.json({ lifecycle: "active" });
  } catch (error) { return next(error); }
});
app.patch("/api/v1/squads/:squadId/settings", requireAuth, async (req, res, next) => {
  try {
    const squadId = Number(req.params.squadId);
    const member = await requireActiveSquadMember(squadId, req.auth.userId);
    if (!["owner", "admin"].includes(member.role)) throw new AppError("FORBIDDEN", 403);
    if (typeof req.body?.require_join_approval !== "boolean") throw new AppError("SQUAD_SETTING_INVALID", 400);
    const [result] = await pool.execute("UPDATE squads SET require_join_approval=? WHERE id=?", [req.body.require_join_approval, squadId]);
    if (result.affectedRows !== 1) throw new AppError("SQUAD_NOT_FOUND", 404);
    res.json({ require_join_approval: req.body.require_join_approval });
  } catch (error) { return next(error); }
});
app.get("/api/v1/squads/:squadId/members", requireAuth, async (req, res, next) => {
  try {
    const squadId = Number(req.params.squadId);
    const member = await squadMemberRepo.membership(squadId, req.auth.userId);
    if (!member || member.status !== "active" || !member.rules_accepted_at) throw new AppError("FORBIDDEN", 403);
    const [members] = await pool.execute(
      "SELECT m.user_id, m.role, m.status, m.trust_score, m.rules_accepted_at, u.username, u.display_name " +
      "FROM squad_members m JOIN users u ON u.id=m.user_id WHERE m.squad_id=? ORDER BY m.status='active' DESC, m.role='owner' DESC, u.display_name LIMIT 200",
      [squadId]);
    res.json({ members });
  } catch (error) { return next(error); }
});
app.patch("/api/v1/squads/:squadId/members/:userId", requireAuth, async (req, res, next) => {
  try {
    const squadId = Number(req.params.squadId);
    const userId = Number(req.params.userId);
    const actor = await squadMemberRepo.membership(squadId, req.auth.userId);
    if (!actor || actor.status !== "active" || !actor.rules_accepted_at || !["owner", "admin"].includes(actor.role)) throw new AppError("FORBIDDEN", 403);
    const target = await squadMemberRepo.membership(squadId, userId);
    if (!target) throw new AppError("NOT_MEMBER", 404);
    if (target.role === "owner") throw new AppError("OWNER_ROLE_IMMUTABLE", 409);
    if (req.body?.role !== undefined) {
      if (!["admin", "member"].includes(req.body.role)) throw new AppError("INVALID_ROLE", 400);
      if (actor.role !== "owner") throw new AppError("FORBIDDEN", 403);
      await pool.execute("UPDATE squad_members SET role=? WHERE squad_id=? AND user_id=?", [req.body.role, squadId, userId]);
    }
    if (req.body?.status === "active") {
      if (!target.rules_accepted_at) throw new AppError("MEMBER_CONSENT_REQUIRED", 409);
      await pool.execute("UPDATE squad_members SET status='active' WHERE squad_id=? AND user_id=?", [squadId, userId]);
    }
    res.json({ member: await squadMemberRepo.membership(squadId, userId) });
  } catch (error) { return next(error); }
});
app.delete("/api/v1/squads/:squadId/members/:userId", requireAuth, async (req, res, next) => {
  try {
    const squadId = Number(req.params.squadId);
    const userId = Number(req.params.userId);
    const actor = await squadMemberRepo.membership(squadId, req.auth.userId);
    const target = await squadMemberRepo.membership(squadId, userId);
    if (!actor || !target) throw new AppError("NOT_MEMBER", 404);
    const selfLeave = req.auth.userId === userId;
    if (target.role === "owner") throw new AppError("OWNER_CANNOT_LEAVE", 409);
    if (!selfLeave && (!actor.rules_accepted_at || actor.status !== "active" || !["owner", "admin"].includes(actor.role))) throw new AppError("FORBIDDEN", 403);
    const [[pendingTask]] = await pool.execute(
      "SELECT ta.task_id FROM task_assignees ta JOIN tasks t ON t.id=ta.task_id WHERE t.squad_id=? AND ta.user_id=? AND ta.result='pending' AND t.status IN ('todo','in_progress','review') LIMIT 1",
      [squadId, userId]);
    if (pendingTask) throw new AppError("MEMBER_HAS_PENDING_ITEMS", 409);
    await pool.execute(
      "UPDATE squad_members SET status=?, left_at=UTC_TIMESTAMP() WHERE squad_id=? AND user_id=?",
      [selfLeave ? "left" : "kicked", squadId, userId]);
    res.status(204).end();
  } catch (error) { return next(error); }
});
async function requireActiveSquadMember(squadId, userId, conn = pool) {
  const member = await squadMemberRepo.membership(squadId, userId, conn);
  if (!member || member.status !== "active" || !member.rules_accepted_at) throw new AppError("FORBIDDEN", 403);
  return member;
}
function taskDate(value, field) {
  if (typeof value !== "string") throw new AppError(field, 400);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new AppError(field, 400);
  return date.toISOString().slice(0, 19).replace("T", " ");
}
app.get("/api/v1/squads/:squadId/tasks", requireAuth, async (req, res, next) => {
  try {
    const squadId = Number(req.params.squadId);
    await requireActiveSquadMember(squadId, req.auth.userId);
    const [tasks] = await pool.execute(
      "SELECT id, title, description, subject, priority, status, due_at, max_due_at, allow_alibi, is_personal, created_by FROM tasks WHERE squad_id=? AND status!='cancelled' ORDER BY due_at, id DESC LIMIT 200", [squadId]);
    if (!tasks.length) return res.json({ tasks: [] });
    const placeholders = tasks.map(() => "?").join(",");
    const [assignees] = await pool.execute(
      `SELECT ta.task_id, ta.user_id, ta.due_override_at, ta.submitted_at, ta.result, u.display_name, u.username FROM task_assignees ta JOIN users u ON u.id=ta.user_id WHERE ta.task_id IN (${placeholders}) ORDER BY ta.task_id`,
      tasks.map((task) => task.id));
    for (const task of tasks) task.assignees = assignees.filter((assignee) => assignee.task_id === task.id);
    res.json({ tasks });
  } catch (error) { return next(error); }
});
app.post("/api/v1/squads/:squadId/tasks", requireAuth, async (req, res, next) => {
  try {
    const squadId = Number(req.params.squadId);
    await requireActiveSquadMember(squadId, req.auth.userId);
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    if (!title || title.length > 150) throw new AppError("TASK_TITLE_INVALID", 400);
    const description = typeof req.body?.description === "string" ? req.body.description.trim().slice(0, 5000) : null;
    const subject = typeof req.body?.subject === "string" ? req.body.subject.trim().slice(0, 80) : null;
    const priority = ["low", "medium", "high", "critical"].includes(req.body?.priority) ? req.body.priority : "medium";
    const dueAt = taskDate(req.body?.due_at, "TASK_DUE_INVALID");
    const maxDueAt = req.body?.max_due_at ? taskDate(req.body.max_due_at, "TASK_MAX_DUE_INVALID") : null;
    const assigneeIds = Array.isArray(req.body?.assignee_ids) ? [...new Set(req.body.assignee_ids.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))] : [];
    if (!assigneeIds.length) assigneeIds.push(req.auth.userId);
    let taskId;
    await withTx(async (conn) => {
      for (const userId of assigneeIds) await requireActiveSquadMember(squadId, userId, conn);
      const [result] = await conn.execute(
        "INSERT INTO tasks (squad_id,title,description,subject,priority,due_at,max_due_at,allow_alibi,is_personal,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)",
        [squadId, title, description, subject, priority, dueAt, maxDueAt, req.body?.allow_alibi !== false, assigneeIds.length === 1 && assigneeIds[0] === req.auth.userId, req.auth.userId]);
      taskId = result.insertId;
      for (const userId of assigneeIds) await conn.execute("INSERT INTO task_assignees (task_id,user_id) VALUES (?,?)", [taskId, userId]);
    });
    res.status(201).json({ taskId });
  } catch (error) { return next(error); }
});
app.patch("/api/v1/squads/:squadId/tasks/:taskId", requireAuth, async (req, res, next) => {
  try {
    const squadId = Number(req.params.squadId);
    const taskId = Number(req.params.taskId);
    const member = await requireActiveSquadMember(squadId, req.auth.userId);
    const [[task]] = await pool.execute("SELECT created_by FROM tasks WHERE id=? AND squad_id=? AND status IN ('todo','in_progress') LIMIT 1", [taskId, squadId]);
    if (!task) throw new AppError("TASK_NOT_FOUND", 404);
    if (!["owner", "admin"].includes(member.role) && task.created_by !== req.auth.userId) throw new AppError("FORBIDDEN", 403);
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    if (!title || title.length > 150) throw new AppError("TASK_TITLE_INVALID", 400);
    const dueAt = taskDate(req.body?.due_at, "TASK_DUE_INVALID");
    const maxDueAt = req.body?.max_due_at ? taskDate(req.body.max_due_at, "TASK_MAX_DUE_INVALID") : null;
    const assigneeIds = Array.isArray(req.body?.assignee_ids) ? [...new Set(req.body.assignee_ids.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))] : [];
    if (!assigneeIds.length) throw new AppError("TASK_ASSIGNEE_INVALID", 400);
    await withTx(async (conn) => {
      for (const userId of assigneeIds) await requireActiveSquadMember(squadId, userId, conn);
      await conn.execute(
        "UPDATE tasks SET title=?, description=?, subject=?, priority=?, due_at=?, max_due_at=?, allow_alibi=? WHERE id=?",
        [title, typeof req.body.description === "string" ? req.body.description.trim().slice(0, 5000) : null,
          typeof req.body.subject === "string" ? req.body.subject.trim().slice(0, 80) : null,
          ["low", "medium", "high", "critical"].includes(req.body.priority) ? req.body.priority : "medium",
          dueAt, maxDueAt, req.body.allow_alibi !== false, taskId]);
      await conn.execute("DELETE FROM task_assignees WHERE task_id=?", [taskId]);
      for (const userId of assigneeIds) await conn.execute("INSERT INTO task_assignees (task_id,user_id) VALUES (?,?)", [taskId, userId]);
    });
    res.json({ taskId });
  } catch (error) { return next(error); }
});
app.patch("/api/v1/squads/:squadId/tasks/:taskId/status", requireAuth, async (req, res, next) => {
  try {
    const squadId = Number(req.params.squadId);
    const taskId = Number(req.params.taskId);
    const member = await requireActiveSquadMember(squadId, req.auth.userId);
    const [[task]] = await pool.execute("SELECT created_by FROM tasks WHERE id=? AND squad_id=? AND status IN ('todo','in_progress') LIMIT 1", [taskId, squadId]);
    if (!task) throw new AppError("TASK_NOT_FOUND", 404);
    const [[assigned]] = await pool.execute("SELECT 1 FROM task_assignees WHERE task_id=? AND user_id=? LIMIT 1", [taskId, req.auth.userId]);
    if (!assigned && !["owner", "admin"].includes(member.role) && task.created_by !== req.auth.userId) throw new AppError("FORBIDDEN", 403);
    if (!["todo", "in_progress"].includes(req.body?.status)) throw new AppError("TASK_STATUS_INVALID", 400);
    await pool.execute("UPDATE tasks SET status=? WHERE id=?", [req.body.status, taskId]);
    res.json({ status: req.body.status });
  } catch (error) { return next(error); }
});
app.post("/api/v1/squads/:squadId/tasks/:taskId/submit", requireAuth, async (req, res, next) => {
  try {
    const squadId = Number(req.params.squadId);
    const taskId = Number(req.params.taskId);
    await requireActiveSquadMember(squadId, req.auth.userId);
    await withTx(async (conn) => {
      const [[task]] = await conn.execute("SELECT id,status FROM tasks WHERE id=? AND squad_id=? LIMIT 1 FOR UPDATE", [taskId, squadId]);
      if (!task || !["todo", "in_progress"].includes(task.status)) throw new AppError("TASK_NOT_SUBMITTABLE", 409);
      const [[assignment]] = await conn.execute("SELECT 1 FROM task_assignees WHERE task_id=? AND user_id=? AND submitted_at IS NULL LIMIT 1", [taskId, req.auth.userId]);
      if (!assignment) throw new AppError("TASK_ASSIGNMENT_INVALID", 409);
      await conn.execute("UPDATE task_assignees SET submitted_at=UTC_TIMESTAMP() WHERE task_id=? AND user_id=?", [taskId, req.auth.userId]);
      const [[remaining]] = await conn.execute("SELECT COUNT(*) AS count FROM task_assignees WHERE task_id=? AND submitted_at IS NULL", [taskId]);
      if (Number(remaining.count) === 0) await conn.execute("UPDATE tasks SET status='review', review_started_at=UTC_TIMESTAMP() WHERE id=?", [taskId]);
    });
    res.status(201).json({ submitted: true });
  } catch (error) { return next(error); }
});
app.post("/api/v1/squads/:squadId/tasks/:taskId/verify", requireAuth, async (req, res, next) => {
  try {
    const squadId = Number(req.params.squadId);
    const taskId = Number(req.params.taskId);
    await requireActiveSquadMember(squadId, req.auth.userId);
    const decision = req.body?.decision;
    if (!["approve", "reject"].includes(decision)) throw new AppError("TASK_VERDICT_INVALID", 400);
    if (decision === "reject" && (typeof req.body?.comment !== "string" || !req.body.comment.trim())) throw new AppError("TASK_REJECT_COMMENT_REQUIRED", 400);
    await withTx(async (conn) => {
      const [[task]] = await conn.execute("SELECT id,status FROM tasks WHERE id=? AND squad_id=? LIMIT 1 FOR UPDATE", [taskId, squadId]);
      if (!task || task.status !== "review") throw new AppError("TASK_NOT_IN_REVIEW", 409);
      const [[assigned]] = await conn.execute("SELECT 1 FROM task_assignees WHERE task_id=? AND user_id=? LIMIT 1", [taskId, req.auth.userId]);
      if (assigned) throw new AppError("TASK_CONFLICT_OF_INTEREST", 403);
      const comment = typeof req.body.comment === "string" ? req.body.comment.trim().slice(0, 300) : null;
      await conn.execute("INSERT INTO task_verifications (task_id,verifier_id,decision,comment) VALUES (?,?,?,?)", [taskId, req.auth.userId, decision, comment]);
      if (decision === "approve") {
        await conn.execute("UPDATE tasks SET status='done',verified_by=?,verified_at=UTC_TIMESTAMP(),completed_at=UTC_TIMESTAMP() WHERE id=?", [req.auth.userId, taskId]);
      } else {
        await conn.execute("UPDATE tasks SET status='in_progress' WHERE id=?", [taskId]);
        await conn.execute("UPDATE task_assignees SET submitted_at=NULL WHERE task_id=?", [taskId]);
      }
    });
    res.json({ decision });
  } catch (error) { return next(error); }
});
app.post("/api/v1/squads/:squadId/tasks/:taskId/reopen", requireAuth, async (req, res, next) => {
  try {
    const squadId = Number(req.params.squadId);
    const taskId = Number(req.params.taskId);
    const member = await requireActiveSquadMember(squadId, req.auth.userId);
    if (!["owner", "admin"].includes(member.role)) throw new AppError("FORBIDDEN", 403);
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (!reason || reason.length > 300) throw new AppError("TASK_REOPEN_REASON_INVALID", 400);
    await withTx(async (conn) => {
      const [[task]] = await conn.execute("SELECT id FROM tasks WHERE id=? AND squad_id=? AND status='done' LIMIT 1 FOR UPDATE", [taskId, squadId]);
      if (!task) throw new AppError("TASK_NOT_REOPENABLE", 409);
      await conn.execute("UPDATE tasks SET status='in_progress', verified_by=NULL, verified_at=NULL, auto_verified=FALSE, completed_at=NULL WHERE id=?", [taskId]);
      await conn.execute("UPDATE task_assignees SET submitted_at=NULL, settled_at=NULL WHERE task_id=?", [taskId]);
      await conn.execute("INSERT INTO task_comments (task_id,user_id,content) VALUES (?,?,?)", [taskId, req.auth.userId, `[ADMIN REOPEN] ${reason}`]);
    });
    res.json({ reopened: true });
  } catch (error) { return next(error); }
});
app.post("/api/v1/squads/:squadId/tasks/:taskId/poke", requireAuth, async (req, res, next) => {
  try {
    const squadId = Number(req.params.squadId);
    const taskId = Number(req.params.taskId);
    const toUserId = Number(req.body?.to_user_id);
    await requireActiveSquadMember(squadId, req.auth.userId);
    const [[assigned]] = await pool.execute("SELECT 1 FROM task_assignees ta JOIN tasks t ON t.id=ta.task_id WHERE ta.task_id=? AND ta.user_id=? AND t.squad_id=? LIMIT 1", [taskId, toUserId, squadId]);
    if (!assigned) throw new AppError("POKE_TARGET_INVALID", 400);
    const [recent] = await pool.execute(
      "SELECT id FROM task_pokes WHERE task_id=? AND from_user_id=? AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 6 HOUR) LIMIT 1",
      [taskId, req.auth.userId]);
    if (recent[0]) throw new AppError("POKE_COOLDOWN", 429);
    const [[daily]] = await pool.execute("SELECT COUNT(*) AS count FROM task_pokes WHERE from_user_id=? AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 24 HOUR)", [req.auth.userId]);
    if (Number(daily.count) >= 10) throw new AppError("POKE_DAILY_LIMIT", 429);
    await pool.execute("INSERT INTO task_pokes (task_id,from_user_id,to_user_id) VALUES (?,?,?)", [taskId, req.auth.userId, toUserId]);
    res.status(201).json({ poked: true });
  } catch (error) { return next(error); }
});
app.delete("/api/v1/squads/:squadId/tasks/:taskId", requireAuth, async (req, res, next) => {
  try {
    const squadId = Number(req.params.squadId);
    const taskId = Number(req.params.taskId);
    const member = await requireActiveSquadMember(squadId, req.auth.userId);
    const [[task]] = await pool.execute("SELECT created_by FROM tasks WHERE id=? AND squad_id=? AND status!='done' LIMIT 1", [taskId, squadId]);
    if (!task) throw new AppError("TASK_NOT_FOUND", 404);
    if (!["owner", "admin"].includes(member.role) && task.created_by !== req.auth.userId) throw new AppError("FORBIDDEN", 403);
    await pool.execute("UPDATE tasks SET status='cancelled' WHERE id=?", [taskId]);
    res.status(204).end();
  } catch (error) { return next(error); }
});
app.get("/api/v1/squads/:squadId/storage-locations", requireAuth, async (req, res, next) => {
  try { const squadId = Number(req.params.squadId); await requireActiveSquadMember(squadId, req.auth.userId); const [rows] = await pool.execute("SELECT id,name,lat,lng,radius_m FROM storage_locations WHERE squad_id=? ORDER BY name LIMIT 200", [squadId]); res.json({ locations: rows }); }
  catch (error) { return next(error); }
});
app.post("/api/v1/squads/:squadId/storage-locations", requireAuth, async (req, res, next) => {
  try { const squadId=Number(req.params.squadId); const member=await requireActiveSquadMember(squadId,req.auth.userId); if(!["owner","admin"].includes(member.role)) throw new AppError("FORBIDDEN",403); const name=typeof req.body?.name === "string" ? req.body.name.trim().slice(0,80) : ""; if(!name) throw new AppError("RESOURCE_NAME_INVALID",400); const [result]=await pool.execute("INSERT INTO storage_locations (squad_id,name,static_qr_token,kiosk_secret,lat,lng,radius_m) VALUES (?,?,?,?,?,?,?)",[squadId,name,randomUUID().replace(/-/g,""),randomUUID().replace(/-/g,""),req.body.lat||null,req.body.lng||null,req.body.radius_m||100]); res.status(201).json({ id:result.insertId,name }); }
  catch(error){return next(error);}
});
app.get("/api/v1/squads/:squadId/assets", requireAuth, async (req,res,next)=>{try{const squadId=Number(req.params.squadId);await requireActiveSquadMember(squadId,req.auth.userId);const [rows]=await pool.execute("SELECT id,name,category,location_id,`condition`,status,max_loan_hours,note FROM assets WHERE squad_id=? ORDER BY name LIMIT 300",[squadId]);res.json({assets:rows});}catch(error){return next(error)}});
app.post("/api/v1/squads/:squadId/assets", requireAuth, async(req,res,next)=>{try{const squadId=Number(req.params.squadId);const member=await requireActiveSquadMember(squadId,req.auth.userId);if(!["owner","admin"].includes(member.role))throw new AppError("FORBIDDEN",403);const name=typeof req.body?.name=== "string"?req.body.name.trim().slice(0,100):"";if(!name)throw new AppError("RESOURCE_NAME_INVALID",400);const [result]=await pool.execute("INSERT INTO assets (squad_id,location_id,name,category,qr_token,max_loan_hours,note) VALUES (?,?,?,?,?,?,?)",[squadId,req.body.location_id||null,name,typeof req.body.category=== "string"?req.body.category.slice(0,50):null,randomUUID().replace(/-/g,""),Number(req.body.max_loan_hours||72),typeof req.body.note=== "string"?req.body.note.slice(0,255):null]);res.status(201).json({id:result.insertId,name});}catch(error){return next(error)}});
app.patch("/api/v1/squads/:squadId/assets/:assetId", requireAuth, async(req,res,next)=>{try{const squadId=Number(req.params.squadId),assetId=Number(req.params.assetId);const member=await requireActiveSquadMember(squadId,req.auth.userId);if(!["owner","admin"].includes(member.role))throw new AppError("FORBIDDEN",403);const status=["available","borrowed","maintenance","suspected_lost"].includes(req.body?.status)?req.body.status:null;if(!status)throw new AppError("ASSET_STATUS_INVALID",400);const [result]=await pool.execute("UPDATE assets SET status=? WHERE id=? AND squad_id=?",[status,assetId,squadId]);if(result.affectedRows!==1)throw new AppError("ASSET_NOT_FOUND",404);res.json({status});}catch(error){return next(error)}});
app.delete("/api/v1/squads/:squadId/storage-locations/:locationId", requireAuth, async(req,res,next)=>{try{const squadId=Number(req.params.squadId),locationId=Number(req.params.locationId);const member=await requireActiveSquadMember(squadId,req.auth.userId);if(!["owner","admin"].includes(member.role))throw new AppError("FORBIDDEN",403);const [active]=await pool.execute("SELECT id FROM assets WHERE location_id=? AND squad_id=? LIMIT 1",[locationId,squadId]);if(active[0])throw new AppError("LOCATION_HAS_ASSETS",409);const [result]=await pool.execute("DELETE FROM storage_locations WHERE id=? AND squad_id=?",[locationId,squadId]);if(result.affectedRows!==1)throw new AppError("LOCATION_NOT_FOUND",404);res.status(204).end();}catch(error){return next(error)}});
app.get("/api/v1/squads/:squadId/rooms", requireAuth, async(req,res,next)=>{try{const squadId=Number(req.params.squadId);await requireActiveSquadMember(squadId,req.auth.userId);const [rows]=await pool.execute("SELECT id,name,location_note,capacity,open_time,close_time,slot_minutes,min_booking_minutes,max_booking_minutes,is_active FROM rooms WHERE squad_id=? ORDER BY name LIMIT 200",[squadId]);res.json({rooms:rows});}catch(error){return next(error)}});
app.patch("/api/v1/squads/:squadId/rooms/:roomId", requireAuth, async(req,res,next)=>{try{const squadId=Number(req.params.squadId),roomId=Number(req.params.roomId);const member=await requireActiveSquadMember(squadId,req.auth.userId);if(!["owner","admin"].includes(member.role))throw new AppError("FORBIDDEN",403);if(typeof req.body?.is_active!=="boolean")throw new AppError("ROOM_STATE_INVALID",400);const [result]=await pool.execute("UPDATE rooms SET is_active=? WHERE id=? AND squad_id=?",[req.body.is_active,roomId,squadId]);if(result.affectedRows!==1)throw new AppError("ROOM_NOT_FOUND",404);res.json({is_active:req.body.is_active});}catch(error){return next(error)}});
app.post("/api/v1/squads/:squadId/rooms", requireAuth, async(req,res,next)=>{try{const squadId=Number(req.params.squadId);const member=await requireActiveSquadMember(squadId,req.auth.userId);if(!["owner","admin"].includes(member.role))throw new AppError("FORBIDDEN",403);const name=typeof req.body?.name=== "string"?req.body.name.trim().slice(0,80):"";if(!name)throw new AppError("RESOURCE_NAME_INVALID",400);const values=[name,typeof req.body.location_note=== "string"?req.body.location_note.slice(0,150):null,Number(req.body.capacity||0),req.body.open_time||RULES.BOOKING_DEFAULTS.room.open_time+":00",req.body.close_time||RULES.BOOKING_DEFAULTS.room.close_time+":00",Number(req.body.slot_minutes||30),Number(req.body.min_booking_minutes||30),Number(req.body.max_booking_minutes||240),Number(req.body.max_advance_days||30),Number(req.body.max_active_per_user||3),Number(req.body.max_recurring||8),req.body.require_checkin!==false?1:0,Number(req.body.checkin_early_minutes||10),Number(req.body.checkin_grace_minutes||15),Number(req.body.late_cancel_hours||2)];if(!values.every((value,index)=>index===1||index===10||typeof value!== "number"||Number.isSafeInteger(value)))throw new AppError("ROOM_RULE_INVALID",400);const [result]=await pool.execute("INSERT INTO rooms (squad_id,name,location_note,capacity,open_time,close_time,slot_minutes,min_booking_minutes,max_booking_minutes,max_advance_days,max_active_per_user,max_recurring,require_checkin,checkin_early_minutes,checkin_grace_minutes,late_cancel_hours,checkin_qr_token,kiosk_secret) VALUES (?, ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",[squadId,...values,randomUUID().replace(/-/g,""),randomUUID().replace(/-/g,"")]);res.status(201).json({id:result.insertId,name});}catch(error){return next(error)}});
app.get("/api/v1/users/:userId/profile", requireAuth, async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    if (!Number.isSafeInteger(userId) || userId < 1) throw new AppError("USER_NOT_FOUND", 404);
    const [[viewer]] = await pool.execute("SELECT id FROM users WHERE id=? AND deleted_at IS NULL LIMIT 1", [req.auth.userId]);
    if (!viewer) throw new AppError("UNAUTHORIZED", 401);
    const [memberships] = await pool.execute(
      "SELECT m.squad_id,s.name AS squad_name,m.role,m.trust_score " +
      "FROM squad_members m JOIN squads s ON s.id=m.squad_id " +
      "JOIN squad_members viewer ON viewer.squad_id=m.squad_id AND viewer.user_id=? " +
      "WHERE m.user_id=? AND m.status='active' AND m.rules_accepted_at IS NOT NULL " +
      "AND viewer.status='active' AND viewer.rules_accepted_at IS NOT NULL ORDER BY s.name,s.id LIMIT 50",
      [req.auth.userId, userId]);
    if (String(userId) !== String(req.auth.userId) && !memberships.length) throw new AppError("USER_NOT_FOUND", 404);
    const [[profile]] = await pool.execute("SELECT id,username,display_name,bio FROM users WHERE id=? AND deleted_at IS NULL LIMIT 1", [userId]);
    if (!profile) throw new AppError("USER_NOT_FOUND", 404);
    let events = [], badges = [];
    if (memberships.length) {
      const ids = memberships.map(member => member.squad_id);
      const placeholders = ids.map(() => "?").join(",");
      [events] = await pool.execute(`SELECT squad_id,event_type,delta,score_after,created_at FROM trust_events WHERE user_id=? AND squad_id IN (${placeholders}) ORDER BY created_at DESC,id DESC LIMIT 30`, [userId, ...ids]);
      [badges] = await pool.execute(`SELECT squad_id,badge_key,awarded_at FROM user_badges WHERE user_id=? AND squad_id IN (${placeholders}) ORDER BY awarded_at DESC LIMIT 30`, [userId, ...ids]);
    }
    res.set("Cache-Control", "no-store");
    res.json({ profile: { ...profile, is_self: String(userId) === String(req.auth.userId), memberships, events, badges } });
  } catch (error) { return next(error); }
});
app.get("/api/v1/squads/:squadId/wall", requireAuth, async(req,res,next)=>{try{const squadId=Number(req.params.squadId);await requireActiveSquadMember(squadId,req.auth.userId);const [rows]=await pool.execute("SELECT id,kind,author_id,target_user_id,category,content,status,created_at FROM wall_posts WHERE squad_id=? AND status!='removed' ORDER BY created_at DESC LIMIT 100",[squadId]);res.json({posts:rows});}catch(error){return next(error)}});
app.post("/api/v1/squads/:squadId/wall", requireAuth, async(req,res,next)=>{try{const squadId=Number(req.params.squadId);await requireActiveSquadMember(squadId,req.auth.userId);const kind=["snitch","kudos"].includes(req.body?.kind)?req.body.kind:null;const targetId=Number(req.body?.target_user_id);const category=typeof req.body?.category=== "string"?req.body.category.trim().slice(0,30):"";const content=typeof req.body?.content=== "string"?req.body.content.trim().slice(0,500):"";if(!kind||!Number.isSafeInteger(targetId)||targetId===req.auth.userId||!category||!content)throw new AppError("WALL_POST_INVALID",400);const [[target]]=await pool.execute("SELECT 1 FROM squad_members WHERE squad_id=? AND user_id=? AND status='active' LIMIT 1",[squadId,targetId]);if(!target)throw new AppError("WALL_TARGET_INVALID",400);const [result]=await pool.execute("INSERT INTO wall_posts (squad_id,kind,author_id,target_user_id,category,content,status) VALUES (?, ?, ?, ?, ?, ?, 'open')",[squadId,kind,req.auth.userId,targetId,category,content]);res.status(201).json({id:result.insertId});}catch(error){return next(error)}});
app.patch("/api/v1/squads/:squadId/wall/:postId", requireAuth, async(req,res,next)=>{try{const squadId=Number(req.params.squadId),postId=Number(req.params.postId);const member=await requireActiveSquadMember(squadId,req.auth.userId);const [[post]]=await pool.execute("SELECT author_id FROM wall_posts WHERE id=? AND squad_id=? LIMIT 1",[postId,squadId]);if(!post)throw new AppError("WALL_POST_NOT_FOUND",404);if(post.author_id!==req.auth.userId&&!["owner","admin"].includes(member.role))throw new AppError("FORBIDDEN",403);if(req.body?.status!=="removed")throw new AppError("WALL_STATUS_INVALID",400);await pool.execute("UPDATE wall_posts SET status='removed' WHERE id=? AND squad_id=?",[postId,squadId]);res.json({status:"removed"});}catch(error){return next(error)}});
app.patch("/api/v1/squads/:squadId/invites/:inviteId/revoke", requireAuth, async(req,res,next)=>{try{const squadId=Number(req.params.squadId),inviteId=Number(req.params.inviteId);const member=await requireActiveSquadMember(squadId,req.auth.userId);if(!["owner","admin"].includes(member.role))throw new AppError("FORBIDDEN",403);const [result]=await pool.execute("UPDATE squad_invites SET revoked_at=COALESCE(revoked_at,UTC_TIMESTAMP()) WHERE id=? AND squad_id=? AND revoked_at IS NULL",[inviteId,squadId]);if(result.affectedRows!==1)throw new AppError("INVITE_NOT_FOUND",404);res.json({revoked:true});}catch(error){return next(error)}});
const trustService = Object.freeze({
  async applyEvent(conn, squadId, userId, eventType, requestedDelta, refType, refId, note) {
    const [[member]] = await conn.execute("SELECT trust_score FROM squad_members WHERE squad_id=? AND user_id=? LIMIT 1 FOR UPDATE", [squadId, userId]);
    if (!member) throw new AppError("MEMBER_NOT_FOUND", 404);
    let delta = Math.max(-Number(member.trust_score), Math.min(requestedDelta, 100 - Number(member.trust_score)));
    const scoreAfter = Number(member.trust_score) + delta;
    await conn.execute("UPDATE squad_members SET trust_score=? WHERE squad_id=? AND user_id=?", [scoreAfter, squadId, userId]);
    await conn.execute("INSERT INTO trust_events (squad_id,user_id,event_type,requested_delta,delta,score_after,ref_type,ref_id,note) VALUES (?,?,?,?,?,?,?,?,?)", [squadId, userId, eventType, requestedDelta, delta, scoreAfter, refType || null, refId || null, note ? sanitizeHtml(note, { allowedTags: [], allowedAttributes: {} }).slice(0,200) : null]);
    return { scoreAfter, delta };
  }
});
app.get("/api/v1/squads/:squadId/dares", requireAuth, async(req,res,next)=>{try{const squadId=Number(req.params.squadId);await requireActiveSquadMember(squadId,req.auth.userId);const [rows]=await pool.execute("SELECT id,title,punishment,metric,period,start_at,end_at,status,proposal_closes_at,created_by,approved_by FROM dares WHERE squad_id=? ORDER BY created_at DESC LIMIT 200",[squadId]);res.json({dares:rows});}catch(error){return next(error)}});
app.post("/api/v1/squads/:squadId/dares", requireAuth, async(req,res,next)=>{try{const squadId=Number(req.params.squadId);await requireActiveSquadMember(squadId,req.auth.userId);const title=typeof req.body?.title=== "string"?req.body.title.trim().slice(0,100):"",punishment=typeof req.body?.punishment=== "string"?req.body.punishment.trim().slice(0,300):"",metric=["most_late_tasks","most_late_days","lowest_trust_delta","most_auto_snitch","most_no_show"].includes(req.body?.metric)?req.body.metric:null;if(!title||!punishment||!metric)throw new AppError("DARE_INVALID",400);const [result]=await pool.execute("INSERT INTO dares (squad_id,title,punishment,metric,period,status,proposal_closes_at,created_by) VALUES (?, ?, ?, ?, ?, 'proposed', DATE_ADD(UTC_TIMESTAMP(), INTERVAL 24 HOUR), ?)",[squadId,title,punishment,metric,req.body.period=== "custom"?"custom":"weekly",req.auth.userId]);res.status(201).json({id:result.insertId,status:"proposed"});}catch(error){return next(error)}});
app.post("/api/v1/squads/:squadId/dares/:dareId/vote", requireAuth, async(req,res,next)=>{try{const squadId=Number(req.params.squadId),dareId=Number(req.params.dareId);await requireActiveSquadMember(squadId,req.auth.userId);if(typeof req.body?.approve!=="boolean")throw new AppError("DARE_VOTE_INVALID",400);await pool.execute("INSERT INTO dare_proposal_votes (dare_id,user_id,approve) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE approve=?",[dareId,req.auth.userId,req.body.approve,req.body.approve]);res.json({voted:true});}catch(error){return next(error)}});
app.post("/api/v1/squads/:squadId/alibis/:alibiId/vote", requireAuth, async(req,res,next)=>{try{const squadId=Number(req.params.squadId),alibiId=Number(req.params.alibiId);await requireActiveSquadMember(squadId,req.auth.userId);if(typeof req.body?.approve!=="boolean")throw new AppError("ALIBI_VOTE_INVALID",400);await withTx(async(conn)=>{const [[alibi]]=await conn.execute("SELECT status,vote_closes_at FROM alibis WHERE id=? AND squad_id=? LIMIT 1 FOR UPDATE",[alibiId,squadId]);if(!alibi||alibi.status!=="voting"||new Date(alibi.vote_closes_at)<=new Date(clock.now()))throw new AppError("ALIBI_NOT_VOTABLE",409);await conn.execute("INSERT INTO alibi_votes (alibi_id,user_id,approve) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE approve=?",[alibiId,req.auth.userId,req.body.approve,req.body.approve]);});res.json({voted:true});}catch(error){return next(error)}});
app.patch("/api/v1/squads/:squadId/vouches/:vouchId", requireAuth, async(req,res,next)=>{try{const squadId=Number(req.params.squadId),vouchId=Number(req.params.vouchId);const member=await requireActiveSquadMember(squadId,req.auth.userId);const status=req.body?.status;if(!["active","declined","withdrawn"].includes(status))throw new AppError("VOUCH_STATUS_INVALID",400);const [[vouch]]=await pool.execute("SELECT guarantor_id,vouchee_id,status FROM vouches WHERE id=? AND squad_id=? LIMIT 1",[vouchId,squadId]);if(!vouch)throw new AppError("VOUCH_NOT_FOUND",404);if(req.auth.userId!==vouch.guarantor_id&&req.auth.userId!==vouch.vouchee_id&&!["owner","admin"].includes(member.role))throw new AppError("FORBIDDEN",403);await pool.execute("UPDATE vouches SET status=?, activated_at=IF(?='active',UTC_TIMESTAMP(),activated_at), resolved_at=IF(? IN ('declined','withdrawn'),UTC_TIMESTAMP(),resolved_at) WHERE id=?",[status,status,status,vouchId]);res.json({status});}catch(error){return next(error)}});

app.get("/api/v1/squads/:squadId/trust-events", requireAuth, async(req,res,next)=>{try{const squadId=Number(req.params.squadId);await requireActiveSquadMember(squadId,req.auth.userId);const [rows]=await pool.execute("SELECT id,user_id,event_type,requested_delta,delta,score_after,ref_type,ref_id,note,created_at FROM trust_events WHERE squad_id=? ORDER BY created_at DESC,id DESC LIMIT 300",[squadId]);res.json({events:rows});}catch(error){return next(error)}});
app.get("/api/v1/squads/:squadId/vouches", requireAuth, async(req,res,next)=>{try{const squadId=Number(req.params.squadId);await requireActiveSquadMember(squadId,req.auth.userId);const [rows]=await pool.execute("SELECT id,guarantor_id,vouchee_id,ref_type,ref_id,stake,initiated_by,status,created_at FROM vouches WHERE squad_id=? ORDER BY created_at DESC LIMIT 200",[squadId]);res.json({vouches:rows});}catch(error){return next(error)}});
app.post("/api/v1/squads/:squadId/vouches", requireAuth, async(req,res,next)=>{try{const squadId=Number(req.params.squadId);await requireActiveSquadMember(squadId,req.auth.userId);const voucheeId=Number(req.body?.vouchee_id),stake=Number(req.body?.stake),refId=Number(req.body?.ref_id);const refType=["task","asset_loan","asset_borrow_request"].includes(req.body?.ref_type)?req.body.ref_type:null;if(!Number.isSafeInteger(voucheeId)||voucheeId===req.auth.userId||![3,5,10].includes(stake)||!refType||!Number.isSafeInteger(refId))throw new AppError("VOUCH_INVALID",400);const [result]=await pool.execute("INSERT INTO vouches (squad_id,guarantor_id,vouchee_id,ref_type,ref_id,stake,initiated_by,status) VALUES (?,?,?,?,?,?, 'guarantor', 'pending')",[squadId,req.auth.userId,voucheeId,refType,refId,stake]);res.status(201).json({id:result.insertId,status:"pending"});}catch(error){return next(error)}});
app.get("/api/v1/squads/:squadId/alibis", requireAuth, async(req,res,next)=>{try{const squadId=Number(req.params.squadId);await requireActiveSquadMember(squadId,req.auth.userId);const [rows]=await pool.execute("SELECT id,user_id,ref_type,ref_id,reason_category,reason_text,original_due_at,requested_due_at,granted_due_at,status,vote_closes_at FROM alibis WHERE squad_id=? ORDER BY created_at DESC LIMIT 200",[squadId]);res.json({alibis:rows});}catch(error){return next(error)}});
app.post("/api/v1/squads/:squadId/alibis", requireAuth, async(req,res,next)=>{try{const squadId=Number(req.params.squadId);await requireActiveSquadMember(squadId,req.auth.userId);const refType=["task","asset_loan"].includes(req.body?.ref_type)?req.body.ref_type:null;const refId=Number(req.body?.ref_id),category=["sick","family","schedule_conflict","force_majeure","other"].includes(req.body?.reason_category)?req.body.reason_category:null;const reason=typeof req.body?.reason_text=== "string"?sanitizeHtml(req.body.reason_text,{allowedTags:[],allowedAttributes:{}}).trim():"";const original=new Date(req.body?.original_due_at),requested=new Date(req.body?.requested_due_at);if(!refType||!Number.isSafeInteger(refId)||!category||!reason||reason.length>300||!Number.isFinite(original.getTime())||!Number.isFinite(requested.getTime())||requested<=original)throw new AppError("ALIBI_INVALID",400);const [[members]]=await pool.execute("SELECT COUNT(*) count FROM squad_members WHERE squad_id=? AND status='active'",[squadId]);const closes=new Date(clock.now().getTime()+12*3600000);const [result]=await pool.execute("INSERT INTO alibis (squad_id,user_id,ref_type,ref_id,reason_category,reason_text,original_due_at,requested_due_at,eligible_voter_count,status,vote_closes_at) VALUES (?,?,?,?,?,?,?,?,?,'voting',?)",[squadId,req.auth.userId,refType,refId,category,reason,original.toISOString().slice(0,19).replace("T"," "),requested.toISOString().slice(0,19).replace("T"," "),members.count,closes.toISOString().slice(0,19).replace("T"," ")]);res.status(201).json({id:result.insertId,status:"voting"});}catch(error){return next(error)}});
app.get("/api/v1/squads/:squadId/bookings", requireAuth, async(req,res,next)=>{try{const squadId=Number(req.params.squadId);await requireActiveSquadMember(squadId,req.auth.userId);const [rows]=await pool.execute("SELECT b.*, r.name AS room_name FROM bookings b JOIN rooms r ON r.id=b.room_id WHERE r.squad_id=? AND b.status IN ('confirmed','checked_in') ORDER BY b.start_at LIMIT 300",[squadId]);res.json({bookings:rows});}catch(error){return next(error)}});
app.post("/api/v1/squads/:squadId/bookings", requireAuth, async(req,res,next)=>{try{const squadId=Number(req.params.squadId);await requireActiveSquadMember(squadId,req.auth.userId);let roomId=Number(req.body?.room_id);const roomName=typeof req.body?.room_name==="string"?req.body.room_name.trim():"";if(req.body?.room_name!==undefined&&(!roomName||roomName.length>80))throw new AppError("RESOURCE_NAME_INVALID",400);const start=new Date(req.body?.start_at),end=new Date(req.body?.end_at);if((!roomName&&(!Number.isSafeInteger(roomId)||roomId<=0))||!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start)throw new AppError("BOOKING_TIME_INVALID",400);await withTx(async(conn)=>{
  if(roomName){
    // Serialize name resolution per squad so concurrent first bookings share one room.
    await conn.execute("SELECT id FROM squads WHERE id=? FOR UPDATE",[squadId]);
    await requireActiveSquadMember(squadId,req.auth.userId,conn);
    const [[existing]]=await conn.execute("SELECT id FROM rooms WHERE squad_id=? AND name=? ORDER BY id LIMIT 1 FOR UPDATE",[squadId,roomName]);
    if(existing){roomId=existing.id;}else{
      const rules=RULES.BOOKING_DEFAULTS.room;
      const [created]=await conn.execute(
        "INSERT INTO rooms (squad_id,name,slot_minutes,min_booking_minutes,max_booking_minutes,max_advance_days,max_active_per_user,max_recurring,require_checkin,checkin_early_minutes,checkin_grace_minutes,late_cancel_hours,checkin_qr_token,kiosk_secret) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [squadId,roomName,rules.slot_minutes,rules.min_booking_minutes,rules.max_booking_minutes,rules.max_advance_days,rules.max_active_per_user,rules.max_recurring,rules.require_checkin,rules.checkin_early_minutes,rules.checkin_grace_minutes,rules.late_cancel_hours,randomUUID().replace(/-/g,""),randomUUID().replace(/-/g,"")]);
      roomId=created.insertId;
    }
  }
  const [[room]]=await conn.execute("SELECT id,slot_minutes,min_booking_minutes,max_booking_minutes,max_active_per_user,require_checkin,checkin_early_minutes,checkin_grace_minutes,is_active FROM rooms WHERE id=? AND squad_id=? LIMIT 1 FOR UPDATE",[roomId,squadId]);if(!room||!room.is_active)throw new AppError("ROOM_NOT_AVAILABLE",409);const duration=(end-start)/60000;if(duration<room.min_booking_minutes||duration>room.max_booking_minutes||duration%room.slot_minutes!==0)throw new AppError("BOOKING_DURATION_INVALID",400);const [[overlap]]=await conn.execute("SELECT id FROM bookings WHERE room_id=? AND status IN ('confirmed','checked_in') AND start_at<? AND end_at>? LIMIT 1 FOR UPDATE",[roomId,end.toISOString().slice(0,19).replace("T"," "),start.toISOString().slice(0,19).replace("T"," ")]);if(overlap)throw new AppError("BOOKING_OVERLAP",409);const [[active]]=await conn.execute("SELECT COUNT(*) count FROM bookings WHERE room_id=? AND user_id=? AND status IN ('confirmed','checked_in')",[roomId,req.auth.userId]);if(Number(active.count)>=room.max_active_per_user)throw new AppError("BOOKING_LIMIT_EXCEEDED",409);const title=typeof req.body.title=== "string"?req.body.title.trim().slice(0,100):null;const checkinOpens=room.require_checkin?new Date(start.getTime()-room.checkin_early_minutes*60000):null;const checkinDeadline=room.require_checkin?new Date(end.getTime()+room.checkin_grace_minutes*60000):null;const [result]=await conn.execute("INSERT INTO bookings (room_id,user_id,title,start_at,end_at,checkin_opens_at,checkin_deadline_at,status) VALUES (?,?,?,?,?,?,?, 'confirmed')",[roomId,req.auth.userId,title,start.toISOString().slice(0,19).replace("T"," "),end.toISOString().slice(0,19).replace("T"," "),checkinOpens?.toISOString().slice(0,19).replace("T"," ")||null,checkinDeadline?.toISOString().slice(0,19).replace("T"," ")||null]);req.bookingId=result.insertId;});res.status(201).json({bookingId:req.bookingId});}catch(error){return next(error)}});
app.delete("/api/v1/squads/:squadId/bookings/:bookingId", requireAuth, async(req,res,next)=>{try{const squadId=Number(req.params.squadId),bookingId=Number(req.params.bookingId);const member=await requireActiveSquadMember(squadId,req.auth.userId);const [result]=await pool.execute("UPDATE bookings b JOIN rooms r ON r.id=b.room_id SET b.status='cancelled' WHERE b.id=? AND r.squad_id=? AND b.user_id=? AND b.status IN ('confirmed','checked_in')",[bookingId,squadId,req.auth.userId]);if(!["owner","admin"].includes(member.role)&&result.affectedRows!==1)throw new AppError("FORBIDDEN",403);if(["owner","admin"].includes(member.role))await pool.execute("UPDATE bookings b JOIN rooms r ON r.id=b.room_id SET b.status='cancelled' WHERE b.id=? AND r.squad_id=? AND b.status IN ('confirmed','checked_in')",[bookingId,squadId]);res.json({cancelled:true});}catch(error){return next(error)}});
app.get("/api/v1/squads/:squadId/desks/areas", requireAuth, async(req,res,next)=>{try{const squadId=Number(req.params.squadId);await requireActiveSquadMember(squadId,req.auth.userId);const [rows]=await pool.execute("SELECT id,name,description,location_note,grid_cols,grid_rows,open_time,close_time,is_active FROM desk_areas WHERE squad_id=? ORDER BY name LIMIT 200",[squadId]);res.json({areas:rows});}catch(error){return next(error)}});
app.get("/api/v1/squads/:squadId/desks", requireAuth, async(req,res,next)=>{try{const squadId=Number(req.params.squadId);await requireActiveSquadMember(squadId,req.auth.userId);const [rows]=await pool.execute("SELECT id,area_id,label,seat_count,booking_mode,pos_x,pos_y,span_x,span_y,shape,amenities,note,is_active FROM desks WHERE squad_id=? ORDER BY label LIMIT 300",[squadId]);res.json({desks:rows});}catch(error){return next(error)}});
app.post("/api/v1/squads/:squadId/desk-bookings", requireAuth, async(req,res,next)=>{try{const squadId=Number(req.params.squadId);await requireActiveSquadMember(squadId,req.auth.userId);const deskId=Number(req.body?.desk_id),seats=Number(req.body?.seats||1),start=new Date(req.body?.start_at),end=new Date(req.body?.end_at);if(!Number.isSafeInteger(deskId)||!Number.isSafeInteger(seats)||seats<1||!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start)throw new AppError("DESK_BOOKING_INVALID",400);await withTx(async(conn)=>{const [[desk]]=await conn.execute("SELECT id,seat_count,booking_mode FROM desks WHERE id=? AND squad_id=? AND is_active=TRUE LIMIT 1 FOR UPDATE",[deskId,squadId]);if(!desk)throw new AppError("DESK_NOT_AVAILABLE",409);const capacity=desk.booking_mode=== "whole"?desk.seat_count:desk.seat_count;const occupied=await conn.execute("SELECT COALESCE(SUM(seats),0) occupied FROM desk_bookings WHERE desk_id=? AND status IN ('confirmed','checked_in') AND start_at<? AND end_at>?",[deskId,end.toISOString().slice(0,19).replace("T"," "),start.toISOString().slice(0,19).replace("T"," ")]);if(Number(occupied[0]?.[0]?.occupied||0)+seats>capacity)throw new AppError("DESK_OCCUPANCY_FULL",409);const [result]=await conn.execute("INSERT INTO desk_bookings (desk_id,user_id,seats,title,start_at,end_at,status) VALUES (?,?,?,?,?,?, 'confirmed')",[deskId,req.auth.userId,seats,typeof req.body.title=== "string"?req.body.title.slice(0,100):null,start.toISOString().slice(0,19).replace("T"," "),end.toISOString().slice(0,19).replace("T"," ")]);req.bookingId=result.insertId;});res.status(201).json({bookingId:req.bookingId});}catch(error){return next(error)}});
app.get("/api/v1/squads/:squadId/health", requireAuth, async (req, res, next) => {
  try {
    const squadId = Number(req.params.squadId);
    await requireActiveSquadMember(squadId, req.auth.userId);
    const now = clock.now();
    const nowSql = now.toISOString().slice(0, 19).replace("T", " ");
    const [rows] = await pool.execute(
      "SELECT ta.user_id, u.display_name, t.priority, t.due_at, COALESCE(ta.due_override_at,t.due_at) effective_due, ta.submitted_at " +
      "FROM tasks t JOIN task_assignees ta ON ta.task_id=t.id JOIN users u ON u.id=ta.user_id " +
      "WHERE t.squad_id=? AND t.status IN ('todo','in_progress') AND ta.submitted_at IS NULL", [squadId]);
    const weights = { low: 0.5, medium: 1, high: 1.5, critical: 2 };
    const contributors = new Map();
    let loss = 0;
    for (const row of rows) {
      const remainingHours = (new Date(row.effective_due).getTime() - now.getTime()) / 3600000;
      let penalty = remainingHours < 0 ? Math.min(10 + 2 * Math.ceil(-remainingHours / 24), 30) * (weights[row.priority] || 1) :
        remainingHours < 24 ? 3 * (weights[row.priority] || 1) : 0;
      if (!penalty) continue;
      loss += penalty;
      const member = contributors.get(row.user_id) || { user_id: row.user_id, display_name: row.display_name, penalty: 0 };
      member.penalty += penalty;
      contributors.set(row.user_id, member);
    }
    const hp = Math.max(0, Math.min(100, Math.round(100 - loss)));
    const status = hp >= 80 ? "healthy" : hp >= 50 ? "wounded" : hp >= 20 ? "critical" : "dead";
    res.json({ hp, status, contributors: [...contributors.values()].sort((a, b) => b.penalty - a.penalty).slice(0, 10), now: nowSql });
  } catch (error) { return next(error); }
});
app.post("/api/v1/squads/join/:token", requireAuth, async (req, res, next) => {
  try {
    const token = req.params.token;
    if (!/^[a-f0-9]{32}$/i.test(token)) throw new AppError("INVALID_REQUEST", 400);
    await withTx(async (conn) => {
      const [invites] = await conn.execute(
        "SELECT i.id, i.squad_id, i.max_uses, i.used_count, i.expires_at, i.revoked_at, s.require_join_approval " +
        "FROM squad_invites i JOIN squads s ON s.id=i.squad_id WHERE i.token=? LIMIT 1 FOR UPDATE",
        [token.toLowerCase()]);
      const invite = invites[0];
      if (!invite || invite.revoked_at || (invite.expires_at && new Date(invite.expires_at).getTime() <= Date.now()) ||
          (invite.max_uses !== null && invite.used_count >= invite.max_uses)) throw new AppError("INVITE_INVALID", 400);
      const [existing] = await conn.execute("SELECT status FROM squad_members WHERE squad_id=? AND user_id=? LIMIT 1", [invite.squad_id, req.auth.userId]);
      if (existing[0]?.status === "active" || existing[0]?.status === "pending") throw new AppError("ALREADY_MEMBER", 409);
      await conn.execute(
        "INSERT INTO squad_members (squad_id, user_id, role, status, joined_at) VALUES (?, ?, 'member', 'pending', UTC_TIMESTAMP()) " +
        "ON DUPLICATE KEY UPDATE status='pending', rules_accepted_at=NULL, left_at=NULL, joined_at=UTC_TIMESTAMP()",
        [invite.squad_id, req.auth.userId]);
      await conn.execute("UPDATE squad_invites SET used_count=used_count+1 WHERE id=?", [invite.id]);
    });
    res.status(201).json({ message: "Join request received." });
  } catch (error) { return next(error); }
});
if (CONFIG.mode === "development") {
  app.post("/dev/clock", requireDevClockToken, (req, res) => {
    try {
      clock.set(req.body);
      res.json({ serverTime: clock.now().toISOString(), clock: clock.snapshot() });
    } catch (error) {
      res.status(400).json({ error: { code: error.code || "INVALID_CLOCK_CONTROL", message: "Invalid clock control." } });
    }
  });
  app.delete("/dev/clock", requireDevClockToken, (req, res) => {
    clock.reset();
    res.json({ serverTime: clock.now().toISOString(), clock: clock.snapshot() });
  });
}
app.get("/api/v1/stream", requireAuth, async (req, res, next) => {
  try {
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    let lastId = Number(req.query?.after) || 0;
    const send = async () => {
      const [rows] = await pool.execute(
        "SELECT id,squad_id,type,title,body,link,sfx_key,is_read,created_at FROM notifications WHERE user_id=? AND id>? ORDER BY id LIMIT 20",
        [req.auth.userId, lastId]);
      for (const row of rows) {
        lastId = Math.max(lastId, Number(row.id));
        res.write(`id: ${row.id}\ndata: ${JSON.stringify(row)}\n\n`);
      }
    };
    await send();
    const timer = setInterval(send, 15000);
    req.on("close", () => clearInterval(timer));
  } catch (error) { return next(error); }
});
app.get("/api/v1/notifications", requireAuth, async (req, res, next) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
    const [notifications] = await pool.execute(
      "SELECT id,squad_id,type,title,body,link,sfx_key,is_read,created_at FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT ?",
      [req.auth.userId, limit]);
    res.json({ notifications });
  } catch (error) { return next(error); }
});
app.post("/api/v1/squads/:squadId/files", requireAuth, upload.single("file"), async (req, res, next) => {
  try {
    const squadId = Number(req.params.squadId);
    await requireActiveSquadMember(squadId, req.auth.userId);
    if (!req.file) throw new AppError("FILE_REQUIRED", 400);
    const isPdf = req.file.buffer.subarray(0,5).toString("ascii") === "%PDF-";
    const isPng = req.file.buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const jpeg = req.file.buffer.subarray(0,3);
    const isJpeg = jpeg[0] === 255 && jpeg[1] === 216 && jpeg[2] === 255;
    const isWebp = req.file.buffer.subarray(0,4).toString("ascii") === "RIFF" && req.file.buffer.subarray(8,12).toString("ascii") === "WEBP";
    if (!(isPdf || isPng || isJpeg || isWebp)) throw new AppError("FILE_TYPE_NOT_ALLOWED", 415);
    const purpose = ["avatar","squad_image","asset_image","loan_photo","task_attachment","wall_evidence","alibi_evidence","dare_proof","pdf"].includes(req.body?.purpose) ? req.body.purpose : "task_attachment";
    const visibility = ["authenticated","squad","admin","private"].includes(req.body?.visibility) ? req.body.visibility : "squad";
    const sha256 = createHash("sha256").update(req.file.buffer).digest("hex");
    const mime = isPdf ? "application/pdf" : isPng ? "image/png" : isJpeg ? "image/jpeg" : "image/webp";
    const [result] = await pool.execute("INSERT INTO files (squad_id,uploaded_by,purpose,visibility,original_name,mime_type,size_bytes,sha256,data,expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 DAY))", [squadId, req.auth.userId, purpose, visibility, req.file.originalname.slice(0,255), mime, req.file.size, sha256, req.file.buffer]);
    res.status(201).json({ fileId: result.insertId, mimeType: mime, sizeBytes: req.file.size });
  } catch (error) { return next(error); }
});
app.get("/api/v1/files/:fileId", requireAuth, async (req, res, next) => {
  try {
    const fileId = Number(req.params.fileId);
    const [[file]] = await pool.execute("SELECT id,squad_id,uploaded_by,purpose,visibility,mime_type,original_name,data,deleted_at FROM files WHERE id=? LIMIT 1", [fileId]);
    if (!file || !file.data || file.deleted_at) throw new AppError("FILE_NOT_FOUND", 404);
    let allowed = file.visibility === "authenticated";
    if (file.squad_id) {
      const member = await squadMemberRepo.membership(file.squad_id, req.auth.userId);
      allowed = allowed || (file.visibility === "squad" && member?.status === "active") || ((file.visibility === "admin") && member?.status === "active" && ["owner","admin"].includes(member.role)) || (file.visibility === "private" && file.uploaded_by === req.auth.userId);
    }
    if (!allowed) throw new AppError("FORBIDDEN", 403);
    res.setHeader("Content-Type", file.mime_type);
    res.setHeader("Content-Disposition", "inline; filename*=UTF-8''" + encodeURIComponent(file.original_name || "attachment"));
    res.send(file.data);
  } catch (error) { return next(error); }
});
app.post("/api/v1/files/cleanup-expired", requireAuth, async (req, res, next) => {
  try {
    const [result] = await pool.execute("UPDATE files SET data=NULL, deleted_at=UTC_TIMESTAMP() WHERE expires_at IS NOT NULL AND expires_at <= UTC_TIMESTAMP() AND deleted_at IS NULL");
    res.json({ cleaned: result.affectedRows });
  } catch (error) { return next(error); }
});
app.use(express.static(path.join(__dirname, "public")));
app.use((req, res) => {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Resource not found." } });
});
app.use(errorHandler);
// #endregion

// ===== JOBS =====
// #region JOBS
async function taskAutoVerifyJob() {
  await withJobLock("task-auto-verify", clock.isoDate(), async () => {
    const [tasks] = await pool.execute("SELECT id,squad_id FROM tasks WHERE status='review' AND review_started_at IS NOT NULL AND review_started_at <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 48 HOUR)");
    for (const task of tasks) {
      await pool.execute("UPDATE tasks SET status='done', auto_verified=TRUE, verified_at=UTC_TIMESTAMP(), completed_at=UTC_TIMESTAMP() WHERE id=? AND status='review'", [task.id]);
    }
    return { verified: tasks.length };
  }, "worker", String(CONFIG.mode));
}
async function overdueTaskJob() {
  await withJobLock("task-overdue", clock.isoDate(), async () => {
    const [result] = await pool.execute("UPDATE tasks SET status='abandoned' WHERE status IN ('todo','in_progress','review') AND due_at < UTC_TIMESTAMP() AND status != 'abandoned'");
    return { updated: result.affectedRows };
  }, "worker", String(CONFIG.mode));
}
async function fileCleanupJob() {
  await withJobLock("file-cleanup", clock.isoDate(), async () => {
    const [result] = await pool.execute("UPDATE files SET data=NULL, deleted_at=UTC_TIMESTAMP() WHERE expires_at IS NOT NULL AND expires_at <= UTC_TIMESTAMP() AND deleted_at IS NULL");
    return { cleaned: result.affectedRows };
  }, "worker", String(CONFIG.mode));
}
async function runScheduledJobs() {
  await Promise.allSettled([taskAutoVerifyJob(), overdueTaskJob(), fileCleanupJob()]);
}
// #endregion

// ===== BOOT =====
// #region BOOT
async function runSelfTests() {
  if (CONFIG.mode === "production") throw new AppError("SELFTEST_DISABLED");
  const { test } = require("node:test");
  const assert = require("node:assert/strict");
  await test("CLI accepts only one supported mode", () => {
    assert.equal(parseMode([]), "api");
    assert.equal(parseMode(["--selftest"]), "selftest");
    assert.equal(parseMode(["--check-db"]), "check-db");
    assert.equal(parseMode(["--check-job-lock"]), "check-job-lock");
    assert.equal(parseMode(["--worker"]), "worker");
    assert.equal(parseMode(["--seed"]), "seed");
    assert.equal(parseMode(["--trust-rebuild"]), "trust-rebuild");
    for (const args of [null, [null], [" --selftest"], ["--SELFTEST"],
      ["--check-job-lock", "--check-db"], ["--check-job-lock", "--check-job-lock"],
      ["--selftest", "--selftest"], ["--check-db", "--selftest"], ["x".repeat(10000)]]) {
      assert.throws(() => parseMode(args), /INVALID_ARGUMENTS/);
    }
  });
  await test("clock validates calendar values and returns independent dates", () => {
    const value = "2024-02-29T12:30:00.000Z";
    const fake = createClock("development", value);
    assert.equal(fake.now().toISOString(), value);
    fake.now().setFullYear(2000);
    assert.equal(fake.now().toISOString(), value);
    for (const invalid of [undefined, "", 0, {}, "2023-02-29T12:30:00.000Z",
      "2024-04-31T00:00:00.000Z", "0000-01-01T00:00:00.000Z", "2024-02-29",
      "2024-02-29T24:00:00.000Z", "2024-02-29T12:30:00.000Z ", "x".repeat(10000)]) {
      assert.throws(() => createClock("development", invalid), /INVALID_FAKE_NOW/);
    }
    assert.throws(() => createClock("invalid", null), /INVALID_MODE/);
    const before = Date.now();
    const actual = createClock("production", "invalid").now().getTime();
    assert.ok(actual >= before && actual <= Date.now());
    assert.ok(Number.isFinite(clock.now().getTime()));
  });
  await test("clock supports environment and runtime development offsets", () => {
    const offsetClock = createClock("development", null, 180);
    const before = Date.now() + 180 * 60000;
    const actual = offsetClock.now().getTime();
    assert.ok(actual >= before && actual <= Date.now() + 180 * 60000);
    offsetClock.set({ offsetMinutes: -60 });
    assert.ok(offsetClock.snapshot().offsetMinutes === -60);
    offsetClock.set({ fakeNow: "2026-11-01T12:00:00.000Z" });
    assert.equal(offsetClock.now().toISOString(), "2026-11-01T12:00:00.000Z");
    offsetClock.reset();
    assert.deepEqual(offsetClock.snapshot(), { fakeNow: null, offsetMinutes: 0 });
    for (const invalid of [undefined, null, {}, [], { fakeNow: null }, { fakeNow: "bad" },
      { offsetMinutes: 1.5 }, { offsetMinutes: Number.MAX_SAFE_INTEGER }, { other: 1 },
      { fakeNow: "2026-11-01T12:00:00.000Z", offsetMinutes: 1 }]) {
      assert.throws(() => offsetClock.set(invalid), /INVALID_CLOCK_CONTROL|INVALID_FAKE_NOW|INVALID_CLOCK_OFFSET/);
    }
    assert.throws(() => createClock("development", null, 5256001), /INVALID_CLOCK_OFFSET/);
    assert.throws(() => createClock("production", "bad", 60).set({ offsetMinutes: 1 }),
      /CLOCK_CONTROL_DISABLED/);
    assert.equal(createClock("production", "bad", 60).snapshot().offsetMinutes, 0);
  });
  await test("resource defaults and trust rules remain immutable suggestions", () => {
    assert.equal(RULES.BOOKING_DEFAULTS.room.max_booking_minutes, 240);
    assert.equal(RULES.DESK_LIMITS.GRID_MAX, 40);
    assert.equal(RULES.TRUST.TASK_LATE_PER_DAY, -3);
    assert.equal(RULES.VOUCH.MIN_TRUST, 60);
    assert.deepEqual(RULES.TRUST.VOUCH_STAKES, [3, 5, 10]);
    assert.equal(RULES.ALIBI.MAX_PER_WEEK_PER_SQUAD, 2);
    assert.equal(RULES.ALIBI.MIN_APPROVAL_PERCENT, 40);
    assert.throws(() => { RULES.BOOKING_LIMITS.slot_minutes.push(120); }, TypeError);
    assert.throws(() => { RULES.TRUST.VOUCH_STAKES.push(20); }, TypeError);
    assert.throws(() => { RULES.ALIBI.MAX_PER_WEEK_PER_SQUAD = 3; }, TypeError);
  });
  for (const failure of [null, "begin", "callback", "commit", "rollback"]) {
    await test(`transaction cleanup: ${failure || "success"}`, async () => {
      const calls = [];
      const original = new Error("test failure");
      const conn = {
        async beginTransaction() { calls.push("begin"); if (failure === "begin") throw original; },
        async commit() { calls.push("commit"); if (failure === "commit") throw original; },
        async rollback() { calls.push("rollback"); if (failure === "rollback") throw new Error("cleanup"); },
        release() { calls.push("release"); },
        destroy() { calls.push("destroy"); }
      };
      const source = { async getConnection() { return conn; } };
      const result = withTx(async (leased) => {
        assert.equal(leased, conn);
        calls.push("callback");
        if (["callback", "rollback"].includes(failure)) throw original;
        return 42;
      }, source);
      if (failure) await assert.rejects(result, (error) => error === original);
      else assert.equal(await result, 42);
      const expected = {
        begin: ["begin", "destroy"],
        callback: ["begin", "callback", "rollback", "release"],
        commit: ["begin", "callback", "commit", "destroy"],
        rollback: ["begin", "callback", "rollback", "destroy"]
      };
      assert.deepEqual(calls, expected[failure] || ["begin", "callback", "commit", "release"]);
    });
  }
  await test("transaction preserves an acknowledged-lost commit without retrying effects", async () => {
    const original = new Error("commit acknowledgement lost");
    const calls = [];
    let durable = 0;
    let pending = 0;
    const conn = {
      async beginTransaction() { calls.push("begin"); },
      async commit() { calls.push("commit"); durable += pending; pending = 0; throw original; },
      async rollback() { calls.push("rollback"); pending = 0; },
      release() { calls.push("release"); },
      destroy() { calls.push("destroy"); }
    };
    await assert.rejects(withTx(async () => {
      calls.push("effect");
      pending++;
    }, { async getConnection() { calls.push("acquire"); return conn; } }),
    (error) => error === original);
    assert.equal(durable, 1);
    assert.deepEqual(calls, ["acquire", "begin", "effect", "commit", "destroy"]);
  });
  await test("transaction rejects bad callbacks and preserves acquisition errors", async () => {
    await assert.rejects(withTx(null), TypeError);
    const error = new Error("acquisition failed");
    await assert.rejects(withTx(() => {}, {
      async getConnection() { throw error; }
    }), (actual) => actual === error);
  });
  for (const scenario of ["valid", "identity", "no-table", "engine", "missing-column",
    "id-generation", "nullable-key", "status", "timestamp", "affected-type", "required-message",
    "nonunique", "prefix-index", "composite-index", "query-error", "acquisition-error"]) {
    await test(`read-only database inspection: ${scenario}`, async () => {
      const original = new Error("private database error");
      const calls = [];
      const definitions = [
        ["id", "bigint(20) unsigned", "NO", "auto_increment"],
        ["job_name", "varchar(50)", "NO"], ["run_key", "varchar(120)", "NO"],
        ["status", "enum('running','success','failed')", "YES"],
        ["started_at", "datetime", "YES"], ["finished_at", "datetime", "YES"],
        ["affected_rows", "int(11)", "YES"], ["message", "varchar(500)", "YES"]
      ];
      const columns = definitions.map(([COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, EXTRA = ""]) =>
        ({ COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, EXTRA }));
      const field = (name) => columns.find((column) => column.COLUMN_NAME === name);
      if (scenario === "missing-column") columns.pop();
      if (scenario === "id-generation") field("id").EXTRA = "";
      if (scenario === "nullable-key") field("run_key").IS_NULLABLE = "YES";
      if (scenario === "status") field("status").COLUMN_TYPE = "varchar(20)";
      if (scenario === "timestamp") field("finished_at").COLUMN_TYPE = "varchar(50)";
      if (scenario === "affected-type") field("affected_rows").COLUMN_TYPE = "smallint(6)";
      if (scenario === "required-message") field("message").IS_NULLABLE = "NO";
      const indexes = [{ INDEX_NAME: "run_key", NON_UNIQUE: scenario === "nonunique" ? 1 : 0,
        SEQ_IN_INDEX: 1, COLUMN_NAME: "run_key", SUB_PART: scenario === "prefix-index" ? 10 : null }];
      if (scenario === "composite-index") indexes.push({ ...indexes[0],
        SEQ_IN_INDEX: 2, COLUMN_NAME: "job_name" });
      const conn = {
        async query(sql) {
          calls.push("identity");
          assert.equal(sql, "SELECT DATABASE() AS selected");
          if (scenario === "query-error") throw original;
          return [[{ selected: scenario === "identity" ? "other_project" : "test_only" }]];
        },
        async execute(sql) {
          assert.match(sql, /^SELECT /);
          assert.ok(sql.includes("TABLE_SCHEMA = DATABASE()"));
          if (sql.includes("information_schema.TABLES")) return [scenario === "no-table" ? []
            : [{ ENGINE: scenario === "engine" ? "MyISAM" : "InnoDB" }]];
          if (sql.includes("information_schema.COLUMNS")) return [columns];
          assert.ok(sql.includes("information_schema.STATISTICS"));
          return [indexes];
        },
        release() { calls.push("release"); }
      };
      const result = inspectDatabase({ async getConnection() {
        if (scenario === "acquisition-error") throw original;
        return conn;
      } }, "test_only");
      if (scenario === "valid") await result;
      else await assert.rejects(result, (error) => {
        if (["query-error", "acquisition-error"].includes(scenario)) return error === original;
        return error.code === (scenario === "identity" ? "DB_IDENTITY_MISMATCH" : "DB_JOB_SCHEMA_INVALID");
      });
      assert.deepEqual(calls, scenario === "acquisition-error" ? [] : ["identity", "release"]);
    });
  }
  const probeCases = ["success", "acquire-first", "acquire-second", "owner-database",
    "contender-database", "same-session", ...Array.from({ length: 9 }, (_, i) => `query-${i + 1}`),
    ...Array.from({ length: 7 }, (_, i) => `result-${i + 3}`)];
  const probeNames = new Set();
  for (const scenario of probeCases) {
    await test(`named-lock probe cleanup: ${scenario}`, async () => {
      const original = new Error("private probe error");
      const acquired = [];
      const destroyed = [];
      let lockOwner = null;
      let lockName;
      let step = 0;
      const connections = [0, 1].map((index) => ({
        async query(options, values) {
          step++;
          assert.equal(options.timeout, 10000);
          const { sql } = options;
          let rows;
          if (sql === "SELECT DATABASE() AS selected, CONNECTION_ID() AS session_id") {
            rows = [{ selected: scenario === (index === 0 ? "owner-database" : "contender-database")
              ? "other_project" : "test_only", session_id: scenario === "same-session" ? 1 : index + 1 }];
          } else {
            assert.equal(values.length, 1);
            assert.match(values[0], /^probe:[a-f0-9]{58}$/);
            if (!lockName) {
              lockName = values[0];
              assert.ok(!probeNames.has(lockName));
              probeNames.add(lockName);
            }
            assert.equal(values[0], lockName);
            if (sql === "SELECT GET_LOCK(?, 0) AS ok") {
              const ok = lockOwner === null ? 1 : 0;
              if (ok === 1) lockOwner = index;
              rows = [{ ok }];
            } else if (sql === "SELECT RELEASE_LOCK(?) AS ok") {
              assert.equal(lockOwner, index);
              lockOwner = null;
              rows = [{ ok: 1 }];
            } else {
              assert.equal(sql, "SELECT IS_FREE_LOCK(?) AS ok");
              rows = [{ ok: lockOwner === null ? 1 : 0 }];
            }
          }
          // Inject after the operation to include acquired-lock/lost-ack cleanup.
          if (scenario === `query-${step}`) throw original;
          if (scenario === `result-${step}`) rows = [{ ok: null }];
          return [rows];
        },
        destroy() {
          destroyed.push(index);
          if (lockOwner === index) lockOwner = null;
        }
      }));
      const source = { async getConnection() {
        const index = acquired.length;
        if (scenario === (index === 0 ? "acquire-first" : "acquire-second")) throw original;
        acquired.push(index);
        return connections[index];
      } };
      const result = inspectNamedLocks(source, "test_only");
      if (scenario === "success") {
        await result;
        assert.equal(step, 9);
      } else await assert.rejects(result, (error) => {
        if (scenario.startsWith("query-") || scenario.startsWith("acquire-")) return error === original;
        return error.code === (scenario.endsWith("database") ? "DB_IDENTITY_MISMATCH" : "DB_LOCK_CHECK_FAILED");
      });
      assert.deepEqual(destroyed, [...acquired].reverse());
      assert.equal(lockOwner, null);
    });
  }
  await test("job inputs reject before acquiring a connection", async () => {
    const source = { async getConnection() { assert.fail("must not acquire"); } };
    for (const [name, key, callback, scope] of [
      ["", "x:1", () => {}, "db"], ["x".repeat(51), "x:1", () => {}, "db"],
      ["x ", "x:1", () => {}, "db"], ["x", "y:1", () => {}, "db"],
      ["x", "x:", () => {}, "db"], ["x", "x:1 ", () => {}, "db"],
      ["x", "x:" + "a".repeat(119), () => {}, "db"],
      ["x", "x:1", null, "db"], ["x", "x:1", () => {}, ""]]) {
      await assert.rejects(withJobLock(name, key, callback, source, scope), /INVALID_JOB_ARGUMENTS/);
    }
  });
  const jobCases = ["success", "busy", "null-lock", "lock-error", "acquisition", "duplicate",
    "retry-failed", "retry-running", "conflict", "invalid-state", "claim-failure",
    "claim-commit", "begin-claim", "begin-effects", "callback", "invalid-result", "zero-update",
    "success-update", "effect-commit", "rollback", "failure-record", "release-error", "release-null"];
  for (const scenario of jobCases) {
    await test(`job lifecycle: ${scenario}`, async () => {
      const calls = [];
      const original = new Error("private test error");
      let begins = 0;
      let commits = 0;
      let lockName;
      const conn = {
        async query(sql, params) {
          if (sql.includes("GET_LOCK")) {
            calls.push("lock");
            lockName = params[0];
            assert.match(lockName, /^job:[a-f0-9]{60}$/);
            if (scenario === "lock-error") throw original;
            return [[{ ok: scenario === "busy" ? 0 : scenario === "null-lock" ? null : 1 }]];
          }
          calls.push("unlock");
          assert.equal(params[0], lockName);
          if (scenario === "release-error") throw original;
          return [[{ ok: scenario === "release-null" ? null : 1 }]];
        },
        async execute(sql, params) {
          if (sql.startsWith("SELECT")) {
            calls.push("select");
            const states = { duplicate: "success", "retry-failed": "failed",
              "retry-running": "running", conflict: "success", "invalid-state": "unknown" };
            return [states[scenario] ? [{ job_name: scenario === "conflict" ? "other" : "settle",
              status: states[scenario] }] : []];
          }
          if (sql.includes("status='success'")) {
            calls.push("success");
            assert.equal(params[1], 7);
            if (scenario === "success-update") throw original;
            return [{ affectedRows: scenario === "zero-update" ? 0 : 1 }];
          }
          if (sql.includes("status='failed'")) {
            calls.push("failed");
            assert.equal(params[1], "JOB_EXECUTION_FAILED");
            if (scenario === "failure-record") throw original;
            return [{ affectedRows: 1 }];
          }
          calls.push("claim");
          if (scenario === "claim-failure") throw original;
          return [{ affectedRows: 1 }];
        },
        async beginTransaction() {
          calls.push("begin"); begins++;
          if ((scenario === "begin-claim" && begins === 1) ||
              (scenario === "begin-effects" && begins === 2)) throw original;
        },
        async commit() {
          calls.push("commit"); commits++;
          if ((scenario === "claim-commit" && commits === 1) ||
              (scenario === "effect-commit" && commits === 2)) throw original;
        },
        async rollback() { calls.push("rollback"); if (scenario === "rollback") throw original; },
        release() { calls.push("release"); },
        destroy() { calls.push("destroy"); }
      };
      const source = { async getConnection() {
        calls.push("acquire");
        if (scenario === "acquisition") throw original;
        return conn;
      } };
      const expectedResult = { affected: 7 };
      const task = withJobLock("settle", "settle:2026-01", async (leased) => {
        assert.equal(leased, conn); calls.push("callback");
        if (["callback", "rollback", "failure-record"].includes(scenario)) throw original;
        if (scenario === "invalid-result") return { affected: -1 };
        return expectedResult;
      }, source, "test_only");
      const successful = ["success", "retry-failed", "retry-running", "release-error", "release-null"];
      if (["busy", "duplicate"].includes(scenario)) {
        assert.deepEqual(await task, { skipped: true,
          reason: scenario === "busy" ? "busy" : "already_ran" });
        assert.ok(!calls.includes("callback"));
        if (scenario === "busy") assert.deepEqual(calls, ["acquire", "lock", "release"]);
      } else if (successful.includes(scenario)) {
        assert.equal(await task, expectedResult);
        assert.deepEqual(calls.slice(0, -2), ["acquire", "lock", "begin", "select", "claim",
          "commit", "begin", "callback", "success", "commit"]);
      } else {
        const codes = { "null-lock": "JOB_LOCK_FAILED", conflict: "JOB_KEY_CONFLICT",
          "invalid-state": "JOB_STATE_INVALID", "invalid-result": "INVALID_JOB_RESULT",
          "zero-update": "JOB_STATE_INVALID" };
        await assert.rejects(task, (error) => codes[scenario] ? error.code === codes[scenario]
          : error === original);
      }
      const unsafe = ["null-lock", "lock-error", "claim-commit", "effect-commit", "begin-claim",
        "begin-effects", "rollback", "failure-record", "release-error", "release-null"];
      assert.equal(calls.at(-1), scenario === "acquisition" ? "acquire"
        : unsafe.includes(scenario) ? "destroy" : "release");
      if (["claim-commit", "effect-commit", "rollback", "begin-effects"].includes(scenario)) {
        assert.ok(!calls.includes("failed"));
        assert.ok(!calls.includes("unlock"));
      }
      if (["callback", "invalid-result", "zero-update", "success-update", "failure-record"].includes(scenario)) {
        assert.ok(calls.indexOf("rollback") > calls.indexOf("callback"));
        assert.ok(calls.indexOf("failed") > calls.indexOf("rollback"));
      }
    });
  }
}
function validateRuntimeConfig(api = false) {
  const db = CONFIG.database;
  if (![db.host, db.user, db.password, db.database].every(
    (value) => typeof value === "string" && value.trim().length > 0) ||
      !Number.isInteger(db.port) || db.port < 1 || db.port > 65535) {
    throw new AppError("DB_CONFIG_REQUIRED");
  }
  if (api && (typeof CONFIG.port !== "string" || !/^[0-9]{1,5}$/.test(CONFIG.port) ||
      Number(CONFIG.port) < 1 || Number(CONFIG.port) > 65535)) {
    throw new AppError("PORT_CONFIG_REQUIRED");
  }
  if ((api || !process.env.NODE_ENV || CONFIG.mode !== "production") && (!process.env.JWT_SECRET ||
      Buffer.byteLength(process.env.JWT_SECRET) < 32)) throw new AppError("SECRET_CONFIG_REQUIRED");
}
function startServer() {
  const port = Number(CONFIG.port);
  const server = app.listen(port, "0.0.0.0", () => {
    logger.info({ port }, "Zero Trust listening.");
  });
  server.on("error", async (error) => {
    logger.error({ code: error.code === "EADDRINUSE" ? "EADDRINUSE" : "LISTEN_FAILED" },
      "Server startup failed.");
    process.exitCode = 1;
    await pool.end();
  });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      server.close(async () => { await pool.end(); });
      server.closeIdleConnections();
    });
  }
}
async function boot() {
  try {
    const mode = parseMode(process.argv.slice(2));
    if (mode !== "selftest") validateRuntimeConfig(mode === "api");
    if (mode === "api") { startServer(); return; }
    try {
      if (mode === "selftest") await runSelfTests();
      else if (mode === "check-job-lock") {
        await inspectDatabase();
        await inspectNamedLocks();
        logger.info({ code: "DB_LOCK_VERIFIED" }, "Two-session named-lock exclusion and handoff verified.");
      } else if (mode === "worker") {
        if (CONFIG.mode === "production" && !process.env.WORKER_ENABLED) throw new AppError("WORKER_DISABLED");
        await runScheduledJobs();
        const interval = setInterval(() => { runScheduledJobs().catch((error) => logger.error({ err: error }, "Scheduled job batch failed.")); }, 60_000);
        logger.info({ code: "WORKER_STARTED" }, "Scheduled worker mode is running.");
        process.once("SIGINT", () => clearInterval(interval));
        process.once("SIGTERM", () => clearInterval(interval));
      } else if (mode === "seed") {
        if (CONFIG.mode === "production") throw new AppError("SEED_DISABLED");
        throw new AppError("SEED_REQUIRES_CONFIGURED_STORY");
      } else if (mode === "trust-rebuild") {
        await withTx(async (conn) => {
          const [members] = await conn.execute("SELECT squad_id,user_id FROM squad_members FOR UPDATE");
          for (const member of members) {
            const [events] = await conn.execute("SELECT delta FROM trust_events WHERE squad_id=? AND user_id=? ORDER BY created_at,id", [member.squad_id, member.user_id]);
            const score = Math.max(0, Math.min(100, 70 + events.reduce((sum, event) => sum + Number(event.delta), 0)));
            await conn.execute("UPDATE squad_members SET trust_score=? WHERE squad_id=? AND user_id=?", [score, member.squad_id, member.user_id]);
          }
        });
        logger.info({ code: "TRUST_REBUILD_COMPLETE" }, "Trust scores rebuilt from events.");
      } else await checkDatabase();
    } finally { await pool.end(); }
  } catch (error) {
    const safeCodes = new Set(["INVALID_ARGUMENTS", "SELFTEST_DISABLED",
      "DB_IDENTITY_MISMATCH", "DB_JOB_SCHEMA_INVALID", "DB_LOCK_CHECK_FAILED",
      "DB_CONFIG_REQUIRED", "PORT_CONFIG_REQUIRED", "SECRET_CONFIG_REQUIRED",
      "ECONNREFUSED", "ETIMEDOUT", "EHOSTUNREACH", "ER_ACCESS_DENIED_ERROR", "ER_BAD_DB_ERROR"]);
    logger.error({ code: safeCodes.has(error.code) ? error.code : "STARTUP_FAILED" },
      "Command failed; no schema changes were made.");
    process.exitCode = 1;
    await pool.end();
  }
}
if (require.main === module) boot();
// #endregion
