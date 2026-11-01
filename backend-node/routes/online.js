"use strict";
const crypto = require("crypto");
const { pool, api, q, one, fail, audit, notify, getSettings, str } = require("../lib/core");
const { PLATFORMS, normalize, pushStatus } = require("../lib/aggregators");

const FLOW = { new: ["accepted", "rejected"], accepted: ["preparing", "rejected"], preparing: ["ready"], ready: ["dispatched"], dispatched: ["delivered"], delivered: [], rejected: [] };
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const parse = (o) => ({ ...o, total: Number(o.total), items: (() => { try { return JSON.parse(o.items || "[]"); } catch { return []; } })() });
const noRaw = ({ raw, ...o }) => o;

async function createOrder(platform, d, S) {
  const ext = d.external_id || `M-${Date.now().toString(36).toUpperCase()}`;
  const dup = await one("SELECT id FROM bb_online_orders WHERE platform = ? AND external_id = ?", [platform, ext]);
  if (dup) return { id: dup.id, duplicate: true };
  if (!d.items.length) throw fail(400, "The order has no items.");
  const [r] = await pool.query(
    "INSERT INTO bb_online_orders (platform, external_id, customer_name, customer_phone, address, items, total, payment_mode, status, raw) VALUES (?,?,?,?,?,?,?,?,?,?)",
    [platform, ext, d.customer_name, d.customer_phone || null, d.address || null, JSON.stringify(d.items), d.total, d.payment_mode, S[`${platform}_auto_accept`] ? "accepted" : "new", d.raw ? JSON.stringify(d.raw).slice(0, 60000) : null]
  );
  await notify({ type: "order", title: `New ${PLATFORMS[platform]} order #${ext}`, message: `${d.items.length} item(s) · ₹${d.total}`, priority: "high", link_type: "online", link_id: r.insertId, dedupe: `online-${platform}-${ext}` });
  return { id: r.insertId, duplicate: false };
}

// ---- incoming webhook (called by Swiggy / Zomato, protected by a secret) ----
api.post("/api/online/webhook/:platform", null, async (ctx) => {
  const p = ctx.params.platform;
  if (!PLATFORMS[p]) throw fail(404, "Unknown platform.");
  const S = await getSettings();
  if (!S[`${p}_enabled`]) throw fail(403, "This integration is switched off in Settings > Integrations.");
  const secret = String(S[`${p}_webhook_secret`] || "");
  const h = ctx.req.headers, given = String(h["x-webhook-secret"] || String(h.authorization || "").replace(/^Bearer\s+/i, ""));
  if (!secret || !safeEq(secret, given)) throw fail(401, "Invalid webhook secret.");
  const d = normalize(p, ctx.body); d.raw = ctx.body;
  const r = await createOrder(p, d, S);
  return { __status: r.duplicate ? 200 : 201, id: r.id, duplicate: r.duplicate, message: r.duplicate ? "Order already received." : "Order received." };
});

// ---- staff side ----
const integ = (S) => Object.fromEntries(Object.keys(PLATFORMS).map((p) => [p, { enabled: !!S[`${p}_enabled`], configured: !!(S[`${p}_api_key`] && S[`${p}_store_id`]), auto_accept: !!S[`${p}_auto_accept`] }]));

api.get("/api/online/summary", "pos", async () => {
  const S = await getSettings();
  const rows = await q("SELECT platform, status, COUNT(*) n FROM bb_online_orders WHERE status NOT IN ('delivered','rejected') GROUP BY platform, status");
  const out = Object.fromEntries(Object.keys(PLATFORMS).map((p) => [p, { new: 0, active: 0 }]));
  for (const r of rows) { out[r.platform].active += r.n; if (r.status === "new") out[r.platform].new += r.n; }
  const latest = (await q("SELECT id, platform, external_id, customer_name, items, total, received_at FROM bb_online_orders WHERE status = 'new' ORDER BY id DESC LIMIT 6")).map((o) => ({ ...parse(o), items: parse(o).items.length }));
  return { summary: out, integrations: integ(S), latest };
});

api.get("/api/online/orders", "pos", async (ctx) => {
  const Q = ctx.query, f = [], p = [];
  if (PLATFORMS[Q.platform]) { f.push("platform = ?"); p.push(Q.platform); }
  if (Q.status && Q.status !== "all") { f.push("status = ?"); p.push(Q.status); }
  const where = f.length ? `WHERE ${f.join(" AND ")}` : "";
  const rows = await q(`SELECT id, platform, external_id, customer_name, customer_phone, address, items, total, payment_mode, status, reject_reason, received_at, updated_at FROM bb_online_orders ${where} ORDER BY FIELD(status,'new','accepted','preparing','ready','dispatched','delivered','rejected'), id DESC LIMIT 200`, p);
  const counts = await q("SELECT platform, status, COUNT(*) n FROM bb_online_orders GROUP BY platform, status");
  return { orders: rows.map(parse).map(noRaw), counts, integrations: integ(await getSettings()) };
});

// manual entry (use it until the platform API is connected, or for phone orders from the platforms)
api.post("/api/online/orders", "pos", async (ctx) => {
  const b = ctx.body, platform = str(b.platform, 20);
  if (!PLATFORMS[platform]) throw fail(400, "Choose Swiggy or Zomato.");
  const want = (Array.isArray(b.items) ? b.items : []).map((i) => ({ id: Number(i.product_id), qty: Math.min(Math.max(Math.floor(Number(i.qty)) || 1, 1), 99) })).filter((i) => i.id > 0);
  if (!want.length) throw fail(400, "Add at least one item.");
  const prods = await q("SELECT id, name, mrp FROM products WHERE id IN (?)", [want.map((i) => i.id)]);
  const items = want.map((w) => { const p = prods.find((x) => x.id === w.id); return p ? { name: p.name, qty: w.qty, price: Number(p.mrp), product_id: p.id } : null; }).filter(Boolean);
  if (!items.length) throw fail(400, "Selected items were not found.");
  const total = Math.round(items.reduce((s, i) => s + i.price * i.qty, 0) * 100) / 100;
  const r = await createOrder(platform, { external_id: str(b.external_id, 60), customer_name: str(b.customer_name, 100) || "Customer", customer_phone: str(b.customer_phone, 30), address: str(b.address, 255),
    payment_mode: b.payment_mode === "cod" ? "cod" : "prepaid", total, items }, await getSettings());
  await audit(ctx, { action: "Created", module: "Online Orders", details: `Added ${PLATFORMS[platform]} order manually`, record_id: r.id });
  return { __status: r.duplicate ? 200 : 201, id: r.id, message: r.duplicate ? "An order with this ID already exists." : "Order added." };
});

api.patch("/api/online/orders/:id/status", "pos", async (ctx) => {
  const id = Number(ctx.params.id), o = await one("SELECT * FROM bb_online_orders WHERE id = ?", [id]);
  if (!o) throw fail(404, "Order not found.");
  const to = str(ctx.body.status, 20), reason = str(ctx.body.reason, 200);
  if (!(FLOW[o.status] || []).includes(to)) throw fail(400, `This order is ${o.status}. It cannot be marked ${to}.`);
  if (to === "rejected" && !reason) throw fail(400, "Please enter a reason for rejecting the order.");
  await q("UPDATE bb_online_orders SET status = ?, reject_reason = ? WHERE id = ?", [to, to === "rejected" ? reason : o.reject_reason, id]);
  let sync;
  try { sync = await pushStatus(o.platform, { ...o, status: to, reason }, await getSettings()); } catch (e) { sync = { ok: false, message: `Could not update ${PLATFORMS[o.platform]}: ${e.message}` }; }
  await audit(ctx, { action: "Updated", module: "Online Orders", details: `${PLATFORMS[o.platform]} order #${o.external_id}: ${o.status} -> ${to}${reason ? ` (${reason})` : ""}`, record_id: id, level: to === "rejected" ? "warning" : "info" });
  return { message: `Order marked ${to}.`, sync };
});
