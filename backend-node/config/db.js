const mysql = require("mysql2/promise");
const path = require("path");
const dotenv = require("dotenv");

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
});

module.exports = pool;