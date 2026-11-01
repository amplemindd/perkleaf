
"use strict";

// Brew & Bite - Native Node.js HTTP Server
// Supports Localhost + Mobile/LAN access
// No Express.js required

require("dotenv").config({ quiet: true });

const http = require("http");
const fs = require("fs");
const path = require("path");

const { migrate } = require("./lib/migrate");
const core = require("./lib/core");

// Existing API Routes
require("./routes/auth");
require("./routes/catalog");
require("./routes/tables");
require("./routes/customers");
require("./routes/orders");
require("./routes/expenses");
require("./routes/online");
require("./routes/waiter");
require("./routes/qr");
require("./routes/reports");

const { startAutoBackup } = require("./routes/system");

// Server Configuration
const PORT = Number(process.env.PORT) || 5000;
const HOST = "0.0.0.0";

// Allowed Frontend Origins
// Multiple origins can be separated by commas in .env
const ALLOWED_ORIGINS = (
  process.env.CLIENT_ORIGIN || "http://localhost:3000"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// Supported File Types
const MIME = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

// CORS Configuration
function cors(req, res) {
  const origin = req.headers.origin;

  const isConfiguredOrigin =
    origin && ALLOWED_ORIGINS.includes(origin);

  const isLocalhost =
    origin &&
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

  const allowed = isConfiguredOrigin || isLocalhost;

  if (allowed) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Vary", "Origin");

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  res.setHeader("X-Content-Type-Options", "nosniff");
}

// Create HTTP Server
const server = http.createServer(async (req, res) => {
  cors(req, res);

  // Handle Preflight Requests
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url, "http://localhost");

  try {
    // File Upload Access
    if (
      req.method === "GET" &&
      url.pathname.startsWith("/uploads/")
    ) {
      const file = path.join(
        core.UPLOAD_DIR,
        path.basename(url.pathname)
      );

      if (
        !file.startsWith(core.UPLOAD_DIR) ||
        !fs.existsSync(file)
      ) {
        res.writeHead(404);
        return res.end();
      }

      res.writeHead(200, {
        "Content-Type":
          MIME[path.extname(file).toLowerCase()] ||
          "application/octet-stream",

        "Cache-Control": "public, max-age=86400",

        "Cross-Origin-Resource-Policy": "cross-origin",
      });

      return fs.createReadStream(file).pipe(res);
    }

    // Backend Health Check
    if (
      req.method === "GET" &&
      url.pathname === "/api/health"
    ) {
      return core.send(res, 200, {
        success: true,
        status: "ok",
        message: "Brew & Bite API is running",
      });
    }

    // Existing API Routes
    if (url.pathname.startsWith("/api/")) {
      const handled = await core.dispatch(req, res, url);

      if (!handled) {
        core.send(res, 404, {
          success: false,
          message: "API route not found.",
        });
      }

      return;
    }

    // Invalid Route
    core.send(res, 404, {
      success: false,
      message: "Not found.",
    });

  } catch (e) {
    if (e instanceof core.HttpError) {
      return core.send(res, e.status, {
        success: false,
        message: e.message,
      });
    }

    console.error(
      `${req.method} ${url.pathname} failed:`,
      e.code || "",
      e.message
    );

    const db = /ECONNREFUSED|ER_ACCESS_DENIED|ER_BAD_DB|ENOTFOUND|ER_NO_SUCH_TABLE/.test(
      `${e.code} ${e.message}`
    );

    core.send(res, 500, {
      success: false,
      message: db
        ? "Database is not reachable. Check backend-node/.env and that MySQL is running."
        : "Something went wrong on the server.",
    });
  }
});

// Start Server
(async () => {
  if (!process.env.JWT_SECRET) {
    console.warn(
      "JWT_SECRET is missing in backend-node/.env"
    );
  }

  // Database Migration
  try {
    await migrate();
    console.log("Database ready.");
  } catch (e) {
    console.error(
      "Database setup failed:",
      e.code || "",
      e.message,
      "\nCheck DB_* values in backend-node/.env and that MySQL is running."
    );
  }

  // Existing Automatic Backup
  startAutoBackup();

  // Listen on all network interfaces
  server.listen(PORT, HOST, () => {
    console.log("------------------------------------");
    console.log("Brew & Bite API Started Successfully");
    console.log("------------------------------------");
    console.log(`Local API: http://localhost:${PORT}`);
    console.log(`Network API: http://10.193.102.214:${PORT}`);
    console.log(`Health Check: http://10.193.102.214:${PORT}/api/health`);
    console.log("------------------------------------");
  });

  server.on("error", (err) => {
    console.error("Server Error:", err.message);
  });

})();
