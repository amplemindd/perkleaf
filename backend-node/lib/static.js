"use strict";

// Serves the built React app (frontend/build) from this same Node server,
// so the website and the API live on one domain (API stays at /api).

const fs = require("fs");
const path = require("path");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".webmanifest": "application/manifest+json",
};

function createStatic(root) {
  const base = path.resolve(root);

  function send(req, res, file) {
    const ext = path.extname(file).toLowerCase();
    // CRA puts hashed (never-changing) files in /static/, so they can be cached for a year
    const hashed = file.includes(path.sep + "static" + path.sep);
    res.writeHead(200, {
      "Content-Type": TYPES[ext] || "application/octet-stream",
      "Content-Length": fs.statSync(file).size,
      "Cache-Control": hashed
        ? "public, max-age=31536000, immutable"
        : ext === ".html"
          ? "no-cache"
          : "public, max-age=3600",
    });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file).pipe(res);
  }

  // returns true when it answered the request
  return function serve(req, res, url) {
    if (req.method !== "GET" && req.method !== "HEAD") return false;

    const index = path.join(base, "index.html");
    if (!fs.existsSync(index)) return false; // frontend not built yet

    let rel;
    try {
      rel = decodeURIComponent(url.pathname);
    } catch {
      return false;
    }

    const file = path.resolve(base, "." + path.sep + rel.replace(/^\/+/, ""));
    if (file !== base && !file.startsWith(base + path.sep)) return false; // path traversal

    if (rel !== "/" && fs.existsSync(file) && fs.statSync(file).isFile()) {
      send(req, res, file);
      return true;
    }

    // A missing file with an extension (e.g. /static/old.js) is a real 404.
    if (path.extname(rel)) return false;

    // Any other path is a page of the React app (/admin-login, /waiter, ...)
    send(req, res, index);
    return true;
  };
}

module.exports = { createStatic };