"use strict";
const bcrypt = require("bcryptjs");
const { api, q, one, fail, audit, signToken, PERMISSIONS, str, bool, getSettings, maskSettings, saveUpload, removeUpload, isYmd } = require("../lib/core");

const attempts = new Map(); // simple brute-force protection: 6 failures / 15 min per email+ip
function tooMany(key) { const a = attempts.get(key); return a && a.n >= 6 && Date.now() - a.t < 15 * 60 * 1000; }
function failed(key) { const a = attempts.get(key); attempts.set(key, a && Date.now() - a.t < 15 * 60 * 1000 ? { n: a.n + 1, t: a.t } : { n: 1, t: Date.now() }); }

api.post("/api/auth/login", null, async (ctx) => {
  const email = str(ctx.body.email, 150).toLowerCase();
  const password = String(ctx.body.password || "");
  if (!email || !password) throw fail(400, "Email and password are required.");
  const key = `${email}|${ctx.ip}`;
  if (tooMany(key)) throw fail(429, "Too many failed attempts. Please try again in 15 minutes.");
  const u = await one("SELECT u.*, r.permissions FROM bb_users u LEFT JOIN bb_roles r ON r.name = u.role WHERE u.email = ?", [email]);
  const ok = u && u.is_active && (await bcrypt.compare(password, u.password_hash));
  if (!ok) {
    failed(key);
    await audit({ ip: ctx.ip, req: ctx.req }, { action: "Failed", module: "System", details: `Failed login attempt for ${email}`, level: "warning", user_name: email });
    throw fail(401, "Invalid email or password.");
  }
  attempts.delete(key);
  await q("UPDATE bb_users SET last_login = NOW() WHERE id = ?", [u.id]);
  const user = { id: u.id, name: u.name, email: u.email, role: u.role };
  await audit({ user, ip: ctx.ip, req: ctx.req }, { action: "Login", module: "System", details: "User login successful" });
  return { token: signToken(user), user: { ...user, permissions: u.role === "admin" ? ["*"] : JSON.parse(u.permissions || "[]") } };
});

api.post("/api/auth/logout", "auth", async (ctx) => {
  await audit(ctx, { action: "Logout", module: "System", details: "User logout" });
  return {};
});

api.get("/api/auth/me", "auth", async (ctx) => ({ user: { ...ctx.user, permissions: ctx.user.perms }, settings: maskSettings(await getSettings()) }));

/* ---------- users ---------- */
api.get("/api/users", "staff", async () => ({
  users: await q("SELECT id, name, email, phone, role, is_active, last_login, created_at, aadhaar_no, aadhaar_image, bank_name, bank_account_no, ifsc_code, branch_name, passbook_image, joining_date, photo_image FROM bb_users ORDER BY id"),
}));

function validUser(b, creating) {
  const name = str(b.name, 100), email = str(b.email, 150).toLowerCase(), phone = str(b.phone, 30);
  if (!name) throw fail(400, "Name is required.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw fail(400, "Enter a valid email address.");
  if (creating && String(b.password || "").length < 8) throw fail(400, "Password must be at least 8 characters.");
  if (!creating && b.password && String(b.password).length < 8) throw fail(400, "Password must be at least 8 characters.");
  return { name, email, phone: phone || null };
}
function staffExtra(b, old = {}) {
  const aad = String(b.aadhaar_no || "").replace(/[\s-]/g, "");
  if (aad && !/^\d{12}$/.test(aad)) throw fail(400, "Aadhaar number must be 12 digits.");
  const acc = String(b.bank_account_no || "").replace(/\s/g, "");
  if (acc && !/^\d{9,18}$/.test(acc)) throw fail(400, "Bank account number must be 9 to 18 digits.");
  const ifsc = String(b.ifsc_code || "").trim().toUpperCase();
  if (ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) throw fail(400, "Enter a valid IFSC code (for example SBIN0001234).");
  const jd = String(b.joining_date || "").slice(0, 10);
  if (jd && !isYmd(jd)) throw fail(400, "Enter a valid joining date.");
  const out = { aadhaar_no: aad || null, bank_name: str(b.bank_name, 100) || null, bank_account_no: acc || null, ifsc_code: ifsc || null, branch_name: str(b.branch_name, 100) || null, joining_date: jd || null, aadhaar_image: old.aadhaar_image || null, passbook_image: old.passbook_image || null, photo_image: old.photo_image || null };
  for (const [data, rm, col] of [["aadhaar_image_data", "remove_aadhaar_image", "aadhaar_image"], ["passbook_image_data", "remove_passbook_image", "passbook_image"], ["photo_image_data", "remove_photo_image", "photo_image"]]) {
    if (b[data]) { out[col] = saveUpload(b[data]); removeUpload(old[col]); } else if (b[rm]) { removeUpload(old[col]); out[col] = null; }
  }
  return out;
}
const EXTRA_SQL = "UPDATE bb_users SET aadhaar_no=?, aadhaar_image=?, bank_name=?, bank_account_no=?, ifsc_code=?, branch_name=?, passbook_image=?, joining_date=?, photo_image=? WHERE id=?";
const extraVals = (x, id) => [x.aadhaar_no, x.aadhaar_image, x.bank_name, x.bank_account_no, x.ifsc_code, x.branch_name, x.passbook_image, x.joining_date, x.photo_image, id];
const waiterPhone = (p) => { const d = String(p || "").replace(/\D/g, "").slice(-10); if (d.length !== 10) throw fail(400, "A waiter needs a valid 10-digit mobile number (it is the login ID)."); return d; };
async function waiterCheck(v, id) {
  v.phone = waiterPhone(v.phone);
  if (await one("SELECT id FROM bb_users WHERE role = 'waiter' AND phone = ? AND id <> ?", [v.phone, id])) throw fail(409, "A waiter with this mobile number already exists.");
}
async function roleExists(role) { if (!(await one("SELECT name FROM bb_roles WHERE name = ?", [role]))) throw fail(400, "Unknown role."); }

api.post("/api/users", "staff", async (ctx) => {
  const b = ctx.body, v = validUser(b, true), extra = staffExtra(b);
  const role = str(b.role, 50) || "cashier"; await roleExists(role);
  if (role === "waiter") await waiterCheck(v, 0);
  if (await one("SELECT id FROM bb_users WHERE email = ?", [v.email])) throw fail(409, "A user with this email already exists.");
  const hash = await bcrypt.hash(String(b.password), 10);
  const r = (await q("INSERT INTO bb_users (name, email, phone, password_hash, role, is_active) VALUES (?,?,?,?,?,?)", [v.name, v.email, v.phone, hash, role, bool(b.is_active, 1)]))[0] || {};
  const id = (await one("SELECT id FROM bb_users WHERE email = ?", [v.email])).id;
  await q(EXTRA_SQL, extraVals(extra, id));
  await audit(ctx, { action: "Created", module: "Users", details: `Created ${role} account "${v.name}"`, record_id: id, level: "warning" });
  return { __status: 201, id, message: "User created." };
});

api.put("/api/users/:id", "staff", async (ctx) => {
  const id = Number(ctx.params.id), b = ctx.body, v = validUser(b, false);
  const old = await one("SELECT id, name, email, role, is_active FROM bb_users WHERE id = ?", [id]);
  if (!old) throw fail(404, "User not found.");
  const role = str(b.role, 50) || old.role; await roleExists(role);
  if (role === "waiter") await waiterCheck(v, id);
  const active = bool(b.is_active, old.is_active);
  if (id === ctx.user.id && (!active || role !== old.role)) throw fail(400, "You cannot disable or change the role of your own account.");
  const dup = await one("SELECT id FROM bb_users WHERE email = ? AND id <> ?", [v.email, id]);
  if (dup) throw fail(409, "A user with this email already exists.");
  const oldExtra = (await one("SELECT aadhaar_image, passbook_image, photo_image FROM bb_users WHERE id = ?", [id])) || {};
  const extra = staffExtra(b, oldExtra);
  await q("UPDATE bb_users SET name=?, email=?, phone=?, role=?, is_active=? WHERE id=?", [v.name, v.email, v.phone, role, active, id]);
  await q(EXTRA_SQL, extraVals(extra, id));
  if (b.password) await q("UPDATE bb_users SET password_hash = ? WHERE id = ?", [await bcrypt.hash(String(b.password), 10), id]);
  await audit(ctx, { action: "Updated", module: "Users", details: `Updated user "${v.name}"${b.password ? " (password changed)" : ""}`, record_id: id, old, neu: { name: v.name, email: v.email, role, is_active: active }, level: "warning" });
  return { message: "User updated." };
});

api.delete("/api/users/:id", "staff", async (ctx) => {
  const id = Number(ctx.params.id);
  const u = await one("SELECT id, name, email, role, aadhaar_image, passbook_image, photo_image FROM bb_users WHERE id = ?", [id]);
  if (!u) throw fail(404, "User not found.");
  if (id === ctx.user.id) throw fail(400, "You cannot delete your own account.");
  if (u.role === "admin") {
    const other = await one("SELECT COUNT(*) AS n FROM bb_users WHERE role = 'admin' AND id <> ?", [id]);
    if (!other || Number(other.n) < 1) throw fail(400, "You cannot delete the last admin account.");
  }
  await q("DELETE FROM bb_users WHERE id = ?", [id]);
  removeUpload(u.aadhaar_image); removeUpload(u.passbook_image); removeUpload(u.photo_image);
  await audit(ctx, { action: "Deleted", module: "Users", details: `Deleted ${u.role} account "${u.name}" (${u.email})`, record_id: id, old: { name: u.name, email: u.email, role: u.role }, level: "critical" });
  return { message: "User deleted." };
});
/* ---------- roles & permissions ---------- */
api.get("/api/roles", "staff", async () => {
  const rows = await q("SELECT name, permissions, is_system FROM bb_roles ORDER BY is_system DESC, name");
  return { roles: rows.map((r) => ({ name: r.name, is_system: !!r.is_system, permissions: r.name === "admin" ? PERMISSIONS.map((p) => p[0]) : JSON.parse(r.permissions || "[]") })),
    permissions: PERMISSIONS.map(([key, label]) => ({ key, label })) };
});
api.post("/api/roles", "staff", async (ctx) => {
  const name = str(ctx.body.name, 50).toLowerCase().replace(/[^a-z0-9_-]/g, "");
  if (!name) throw fail(400, "Role name is required.");
  if (await one("SELECT name FROM bb_roles WHERE name = ?", [name])) throw fail(409, "Role already exists.");
  await q("INSERT INTO bb_roles (name, permissions) VALUES (?, '[]')", [name]);
  await audit(ctx, { action: "Created", module: "Users", details: `Created role "${name}"`, level: "warning" });
  return { __status: 201, message: "Role created." };
});
api.put("/api/roles/:name", "staff", async (ctx) => {
  const name = ctx.params.name;
  if (name === "admin") throw fail(400, "The admin role always has full access.");
  const valid = new Set(PERMISSIONS.map((p) => p[0]));
  const perms = (Array.isArray(ctx.body.permissions) ? ctx.body.permissions : []).filter((p) => valid.has(p));
  const old = await one("SELECT permissions FROM bb_roles WHERE name = ?", [name]);
  if (!old) throw fail(404, "Role not found.");
  await q("UPDATE bb_roles SET permissions = ? WHERE name = ?", [JSON.stringify(perms), name]);
  await audit(ctx, { action: "Updated", module: "Users", details: `Changed permissions of role "${name}"`, old: JSON.parse(old.permissions), neu: perms, level: "critical" });
  return { message: "Permissions saved." };
});
