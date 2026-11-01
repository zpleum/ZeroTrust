"use strict";

// ===== CONFIG =====
const express = require("express");
const mysql = require("mysql2/promise");

// ===== RULES =====
// Business rules will be added with the corresponding features.

// ===== UTILS =====

// ===== DB =====
const pool = mysql.createPool({
  host: "10.200.210.117",
  port: 3306,
  user: "std09",
  password: "std09",
  database: "db_std09",
  charset: "utf8mb4",
  connectionLimit: 5,
  connectTimeout: 10000,
  multipleStatements: false
});

// ===== REPOSITORIES =====

// ===== SERVICES =====

// ===== MIDDLEWARES =====
const app = express();
app.disable("x-powered-by");

// ===== ROUTES =====
app.use(express.static("public"));
app.use((req, res) => {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Resource not found." } });
});
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500
    ? error.status
    : 500;
  res.status(status).json({
    error: {
      code: status === 500 ? "INTERNAL_ERROR" : "INVALID_REQUEST",
      message: status === 500 ? "An unexpected error occurred." : "Invalid request."
    }
  });
});

// ===== JOBS =====

// ===== BOOT =====
const server = app.listen(3109, "0.0.0.0", () => {
  console.log("Zero Trust listening on port 3109");
});
server.on("error", (error) => {
  console.error("Server startup failed:", error.code || "UNKNOWN_ERROR");
  pool.end().finally(() => { process.exitCode = 1; });
});
