const mysql = require("mysql2/promise");
const path = require("path");
const dotenv = require("dotenv");

// Run everything in Indian time (server hosts are usually UTC, which showed times 5h30m behind).
process.env.TZ = process.env.APP_TZ || "Asia/Kolkata";
const DB_TZ = process.env.DB_TZ || "+05:30";

// Load environment variables from backend-node/.env
dotenv.config({
  path: path.resolve(__dirname, "../.env"),
  quiet: true,
});

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "cafe_billing",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  decimalNumbers: true,
  dateStrings: true,
  timezone: DB_TZ,
});

// Make NOW(), CURDATE() and TIMESTAMP columns use the same timezone on every connection.
pool.pool.on("connection", (conn) => {
  conn.query("SET time_zone = '" + DB_TZ + "'");
});

module.exports = pool;