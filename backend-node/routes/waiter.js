"use strict";
// Waiter mobile app: own login (mobile number + password), table list, menu and KOT sending.
const bcrypt = require("bcryptjs");
const { api, q, one, fail, audit, notify, signToken, getSettings, str, pool } = require("../lib/core");
const { saveOrder, OPEN_SQL } = require("./orders");

const attempts = new Map();
const tooMany = (k) => { const a = attempts.get(k); return a && a.n >= 6 && Date.now() - a.t < 15 * 60 * 1000; };
const failed = (k) => { const a = attempts.get(k); attempts.set(k, a && Date.now() - a.t < 15 * 60 * 1000 ? { n: a.n + 1, t: a.t } : { n: 1, t: Date.now() }); };

api.post("/api/waiter/login", null, async (ctx) => {
  const phone = String(ctx.body.phone || "").replace(/\D/g, "").slice(-10), password = String(ctx.body.password || "");
  if (phone.length !== 10 || !password) throw fail(400, "Enter your 10-digit mobile number and password.");
  const key = `w:${phone}|${ctx.ip}`;
  if (tooMany(key)) throw fail(429, "Too many failed attempts. Please try again in 15 minutes.");
  const u = await one("SELECT u.*, r.permissions FROM bb_users u LEFT JOIN bb_roles r ON r.name = u.role WHERE u.role = 'waiter' AND RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(u.phone, ' ', ''), '-', ''), '+', ''), '(', ''), ')', ''), 10) = ?", [phone]);
  if (!u) console.warn(`[waiter login] No user with role 'waiter' and phone ${phone}. Create it from Admin > Waiters.`);
  if (!u || !u.is_active || !(await bcrypt.compare(password, u.password_hash))) {
    failed(key);
    await audit({ ip: ctx.ip, req: ctx.req }, { action: "Failed", module: "System", details: `Failed waiter login for ${phone}`, level: "warning", user_name: phone });
    throw fail(401, u && !u.is_active ? "This account is disabled. Please contact the manager." : "Wrong mobile number or password.");
  }
  attempts.delete(key);
  await q("UPDATE bb_users SET last_login = NOW() WHERE id = ?", [u.id]);
  const user = { id: u.id, name: u.name, email: u.email, role: u.role };
  await audit({ user, ip: ctx.ip, req: ctx.req }, { action: "Login", module: "System", details: "Waiter login successful" });
  return { token: signToken(user), user: { ...user, permissions: JSON.parse(u.permissions || "[]") } };
});

api.get("/api/waiter/home", "waiter", async (ctx) => {
  const S = await getSettings();
  const tables = await q(`SELECT t.id, t.name, t.capacity, t.status,
    (SELECT id FROM bb_orders WHERE table_id = t.id AND ${OPEN_SQL} ORDER BY id DESC LIMIT 1) AS order_id,
    (SELECT bill_no FROM bb_orders WHERE table_id = t.id AND ${OPEN_SQL} ORDER BY id DESC LIMIT 1) AS bill_no,
    (SELECT total FROM bb_orders WHERE table_id = t.id AND ${OPEN_SQL} ORDER BY id DESC LIMIT 1) AS order_total
    FROM bb_tables t WHERE t.is_active = 1 ORDER BY t.id`);
  const cats = await q("SELECT id, name FROM categories WHERE is_archived = 0 AND is_active = 1 AND show_in_pos = 1 ORDER BY display_order, name");
  const items = await q(`SELECT p.id, p.category_id, p.name, p.mrp AS price, p.description, p.item_type, p.track_stock, p.stock_qty
    FROM products p JOIN categories c ON c.id = p.category_id
    WHERE p.is_archived = 0 AND p.is_active = 1 AND p.show_in_pos = 1 AND c.is_archived = 0 AND c.is_active = 1 AND c.show_in_pos = 1 ORDER BY c.display_order, p.name`);
  const [today] = await q("SELECT COUNT(*) n FROM bb_kots WHERE waiter_id = ? AND DATE(created_at) = CURDATE()", [ctx.user.id]);
  return {
    company: S.company_name, shop: S.restaurant_name, logo_url: S.logo_url, support_phone: S.support_phone || S.phone || "", support_whatsapp: S.support_whatsapp || S.support_phone || S.phone || "",
    tables: tables.map((t) => ({ ...t, order_total: t.order_total == null ? null : Number(t.order_total) })), categories: cats,
    items: items.map((i) => ({ ...i, price: Number(i.price), out: !!i.track_stock && i.stock_qty <= 0 })), kots_today: today ? today.n : 0,
  };
});

api.post("/api/waiter/kot", "waiter", async (ctx) => {
  const b = ctx.body, tableId = Number(b.table_id);
  const want = new Map();
  for (const i of Array.isArray(b.items) ? b.items : []) { const id = Number(i.product_id), qty = Math.floor(Number(i.qty)); if (id > 0 && qty > 0) want.set(id, Math.min((want.get(id) || 0) + qty, 99)); }
  if (!want.size) throw fail(400, "Add at least one item.");
  const table = await one("SELECT id, name, status FROM bb_tables WHERE id = ? AND is_active = 1", [tableId]);
  if (!table) throw fail(400, "Please select a valid table.");
  if (table.status === "out_of_service") throw fail(400, `${table.name} is out of service.`);
  const instructions = str(b.instructions, 400), now = new Date().toTimeString().slice(0, 5);
  const open = await one(`SELECT * FROM bb_orders WHERE table_id = ? AND ${OPEN_SQL} ORDER BY id DESC LIMIT 1`, [tableId]);
  const merged = new Map(want);
  const body = { action: "hold", order_type: "dine_in", table_id: tableId, source: "direct", customer_name: str(b.customer_name, 100), customer_phone: str(b.customer_phone, 30), guests: Number(b.guests) || 1 };
  if (open) {
    for (const r of await q("SELECT product_id, qty FROM bb_order_items WHERE order_id = ?", [open.id])) merged.set(r.product_id, Math.min((merged.get(r.product_id) || 0) + r.qty, 99));
    body.customer_id = open.customer_id || undefined;
    if (!body.customer_name) { body.customer_name = open.customer_name === "Walk-in" ? "" : open.customer_name; body.customer_phone = body.customer_phone || open.customer_phone || ""; }
    body.guests = Number(b.guests) || open.guests || 1;
    if (open.discount_amount > 0) body.discount = { type: open.discount_type, value: Number(open.discount_value) };
  } else body.idempotency_key = str(b.idem, 60) || undefined;
  const note = `[KOT ${now} · ${ctx.user.name}] ${instructions || "-"}`;
  body.notes = ((open && open.notes ? open.notes + "\n" : "") + note).slice(-900);
  body.items = [...merged].map(([product_id, qty]) => ({ product_id, qty }));
  const names = await q("SELECT id, name FROM products WHERE id IN (?)", [[...want.keys()]]);
  const kotItems = [...want].map(([id, qty]) => ({ name: (names.find((n) => n.id === id) || {}).name || "Item", qty }));
  const r = await saveOrder({ ...ctx, user: { ...ctx.user, perms: [...(ctx.user.perms || []), "discount"] }, body }, open ? open.id : null);
  const order = r.order;
  if (r.duplicate) { const k = await one("SELECT kot_no FROM bb_kots WHERE order_id = ? ORDER BY id DESC LIMIT 1", [order.id]); return { kot_no: k ? k.kot_no : "KOT", bill_no: order.bill_no, table: table.name, items: kotItems, message: "This KOT was already sent." }; }
  const [ins] = await pool.query("INSERT INTO bb_kots (order_id, table_id, table_name, waiter_id, waiter_name, items, instructions) VALUES (?,?,?,?,?,?,?)",
    [order.id, table.id, table.name, ctx.user.id, ctx.user.name, JSON.stringify(kotItems), instructions || null]);
  const kotNo = `KOT-${String(ins.insertId).padStart(4, "0")}`;
  await q("UPDATE bb_kots SET kot_no = ? WHERE id = ?", [kotNo, ins.insertId]);
  await notify({ type: "order", title: `${kotNo} · Table ${table.name}`, message: `${ctx.user.name} sent ${kotItems.reduce((s, i) => s + i.qty, 0)} item(s)${instructions ? ` · ${instructions.slice(0, 60)}` : ""}`, priority: "high", link_type: "order", link_id: order.id, dedupe: `kot-${ins.insertId}` });
  await audit(ctx, { action: "Created", module: "Orders", details: `${kotNo} sent for table ${table.name} by ${ctx.user.name}`, record_id: order.id });
  return { __status: 201, kot_no: kotNo, bill_no: order.bill_no, table: table.name, items: kotItems, message: `${kotNo} sent to the kitchen.` };
});

// latest KOTs for the cashier / POS pop-up
api.get("/api/kots/latest", "pos", async () => ({
  kots: (await q("SELECT id, kot_no, table_name, waiter_name, items, instructions, created_at FROM bb_kots ORDER BY id DESC LIMIT 5")).map((k) => ({ ...k, items: (() => { try { return JSON.parse(k.items); } catch { return []; } })() })),
}));

// waiter list with performance (for the admin "Waiters" page)
api.get("/api/waiters/stats", "staff", async () => ({
  stats: await q("SELECT waiter_id, COUNT(*) kots, SUM(DATE(created_at) = CURDATE()) today, MAX(created_at) last_kot FROM bb_kots GROUP BY waiter_id"),
}));