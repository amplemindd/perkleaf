"use strict";
const crypto = require("crypto");
const { api, q, one, fail, notify, getSettings, str, pool } = require("../lib/core");
const { saveOrder, OPEN_SQL } = require("./orders");

const CALL_COOLDOWN_SEC = 15; // customer may ring the bell once per table every 15 seconds

api.get("/api/public/qr/:token", null, async (ctx) => {
  const table = await one(
    "SELECT id, name, capacity, qr_token FROM bb_tables WHERE qr_token = ? AND is_active = 1",
    [str(ctx.params.token, 36)],
  );
  if (!table) throw fail(404, "This table QR code is invalid or inactive.");
  const S = await getSettings();
  const categories = await q(
    "SELECT id, name, icon, image_url FROM categories WHERE is_archived = 0 AND is_active = 1 AND show_in_pos = 1 ORDER BY display_order, name",
  );
  const products =
    await q(`SELECT p.id, p.category_id, p.name, p.mrp AS price, p.description, p.image_url, p.item_type
    FROM products p JOIN categories c ON c.id = p.category_id
    WHERE p.is_archived = 0 AND p.is_active = 1 AND p.show_in_pos = 1 AND c.is_archived = 0 AND c.is_active = 1 AND c.show_in_pos = 1
    ORDER BY c.display_order, p.name`);
  return {
    table: { id: table.id, name: table.name },
    restaurant: S.restaurant_name || "Restaurant",
    tagline: S.tagline || "",
    show_tagline: S.show_tagline !== false,
    logo_url: S.logo_url || "",
    phone: S.phone || "",
    address: S.address || "",
    categories,
    products: products.map((p) => ({ ...p, price: Number(p.price) })),
  };
});

api.post("/api/public/qr/:token/order", null, async (ctx) => {
  const token = str(ctx.params.token, 36);
  const table = await one(
    "SELECT id, name FROM bb_tables WHERE qr_token = ? AND is_active = 1",
    [token],
  );
  if (!table) throw fail(404, "This table QR code is invalid or inactive.");
  const incoming = new Map();
  for (const item of Array.isArray(ctx.body.items) ? ctx.body.items : []) {
    const id = Number(item.product_id),
      qty = Math.floor(Number(item.qty));
    if (!Number.isInteger(id) || id < 1 || qty < 1 || qty > 99)
      throw fail(400, "Invalid item quantity.");
    incoming.set(id, Math.min(99, (incoming.get(id) || 0) + qty));
  }
  if (!incoming.size)
    throw fail(400, "Please add items before placing your order.");
  const added = new Map(incoming); // only the NEW items of this request (for the KOT)
  const note = str(ctx.body.note, 200).replace(/\s+/g, " ");
  const existing = await one(
    `SELECT id, notes FROM bb_orders WHERE table_id = ? AND ${OPEN_SQL} ORDER BY id DESC LIMIT 1`,
    [table.id],
  );
  if (existing) {
    const current = await q(
      "SELECT product_id, qty FROM bb_order_items WHERE order_id = ?",
      [existing.id],
    );
    for (const row of current)
      if (row.product_id)
        incoming.set(
          row.product_id,
          Math.min(99, (incoming.get(row.product_id) || 0) + row.qty),
        );
  }
  const fakeUser = {
    id: null,
    name: "QR Customer",
    role: "cashier",
    perms: ["pos"],
  };
  const body = {
    action: "hold",
    order_type: "dine_in",
    table_id: table.id,
    customer_name: str(ctx.body.customer_name, 100) || "QR Customer",
    customer_phone: str(ctx.body.customer_phone, 20),
    guests: 1,
    items: [...incoming].map(([product_id, qty]) => ({ product_id, qty })),
    idempotency_key: existing ? undefined : crypto.randomUUID(),
    source: "qr",
    notes: (() => {
      const prev = existing && existing.notes ? existing.notes : "";
      if (!note) return prev;
      const t = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
      return ((prev ? prev + "\n" : "") + `[Customer ${t}] ${note}`).slice(-255);
    })(),
  };
  const result = await saveOrder(
    { ...ctx, user: fakeUser, body },
    existing ? existing.id : null,
  );
  const order = result.order;
  // KOT for the kitchen printer (only the new items + customer's note). The cashier screen prints it automatically.
  try {
    const names = await q("SELECT id, name FROM products WHERE id IN (?)", [[...added.keys()]]);
    const kotItems = [...added].map(([id, qty]) => ({ name: (names.find((n) => n.id === id) || {}).name || "Item", qty }));
    const [ins] = await pool.query(
      "INSERT INTO bb_kots (order_id, table_id, table_name, waiter_id, waiter_name, items, instructions) VALUES (?,?,?,?,?,?,?)",
      [order.id, table.id, table.name, null, "QR Customer", JSON.stringify(kotItems), note || null],
    );
    await q("UPDATE bb_kots SET kot_no = ? WHERE id = ?", [`KOT-${String(ins.insertId).padStart(4, "0")}`, ins.insertId]);
  } catch (e) {
    console.error("QR KOT could not be saved:", e.message);
  }
  await notify({
    type: "order",
    title: `QR Order Received! · Table ${table.name}`, force: true,
    message: `${order.bill_no} · ${order.items
      .map((i) => `${i.product_name} x${i.qty}`)
      .join(", ")
      .slice(0, 330)} · ₹${order.total}${note ? ` · Note: ${note.slice(0, 80)}` : ""}`,
    priority: "urgent",
    link_type: "order",
    link_id: order.id,
    dedupe: `qr-order-${order.id}-${Date.now()}`,
  });
  return {
    __status: 201,
    message: "Your order has been sent to the cashier.",
    order: {
      id: order.id,
      bill_no: order.bill_no,
      total: order.total,
      table: table.name,
    },
  };
});

// Live status of one order, for the customer's tracking screen (only orders of this table).
api.get("/api/public/qr/:token/order/:id", null, async (ctx) => {
  const table = await one(
    "SELECT id, name FROM bb_tables WHERE qr_token = ? AND is_active = 1",
    [str(ctx.params.token, 36)],
  );
  if (!table) throw fail(404, "This table QR code is invalid or inactive.");
  const o = await one(
    `SELECT id, bill_no, status, payment_status, subtotal, tax_amount, discount_amount, round_off, total,
            created_at, completed_at, cancel_reason
     FROM bb_orders WHERE id = ? AND table_id = ?`,
    [Number(ctx.params.id) || 0, table.id],
  );
  if (!o) throw fail(404, "Order not found.");
  const items = await q(
    "SELECT product_id, product_name, qty, unit_price, line_total FROM bb_order_items WHERE order_id = ? ORDER BY id",
    [o.id],
  );
  return {
    order: {
      id: o.id,
      bill_no: o.bill_no,
      status: o.status,
      payment_status: o.payment_status,
      subtotal: Number(o.subtotal),
      tax: Number(o.tax_amount),
      discount: Number(o.discount_amount),
      total: Number(o.total),
      created_at: o.created_at,
      completed_at: o.completed_at,
      cancel_reason: o.status === "cancelled" ? o.cancel_reason || "" : "",
      table: table.name,
      items: items.map((i) => ({
        product_id: i.product_id,
        product_name: i.product_name,
        qty: i.qty,
        unit_price: Number(i.unit_price),
        line_total: Number(i.line_total),
      })),
    },
  };
});

// Customer feedback / rating. Saved as a normal notification for the staff (no ring).
api.post("/api/public/qr/:token/feedback", null, async (ctx) => {
  const table = await one(
    "SELECT id, name FROM bb_tables WHERE qr_token = ? AND is_active = 1",
    [str(ctx.params.token, 36)],
  );
  if (!table) throw fail(404, "This table QR code is invalid or inactive.");
  const rating = Math.floor(Number(ctx.body.rating));
  if (!(rating >= 1 && rating <= 5)) throw fail(400, "Please choose a rating from 1 to 5 stars.");
  const comment = str(ctx.body.comment, 300).replace(/\s+/g, " ");
  const orderId = Number(ctx.body.order_id) || null;
  await notify({
    type: "table",
    title: `Customer Feedback · Table ${table.name} · ${"★".repeat(rating)}${"☆".repeat(5 - rating)}`,
    force: true,
    message: comment || `Customer rated ${rating}/5.`,
    priority: rating <= 2 ? "high" : "normal",
    link_type: "table",
    link_id: table.id,
    dedupe: `qr-feedback-${table.id}-${orderId || 0}-${Date.now()}`,
  });
  return { message: "Thank you for your feedback!" };
});

const NEED_LABELS = { water: "Water", cutlery: "Cutlery", tissues: "Tissues", other: "Other" };

api.post("/api/public/qr/:token/call", null, async (ctx) => {
  const table = await one(
    "SELECT id, name FROM bb_tables WHERE qr_token = ? AND is_active = 1",
    [str(ctx.params.token, 36)],
  );
  if (!table) throw fail(404, "This table QR code is invalid or inactive.");

  // Rate limit: one bell ring per table every CALL_COOLDOWN_SEC seconds, so the
  // cashier's alert rings once and cannot be spammed (page refresh, many phones...).
  const lastCall = await one(
    `SELECT TIMESTAMPDIFF(SECOND, created_at, NOW()) AS age
     FROM bb_notifications
     WHERE link_type = 'table' AND link_id = ? AND title LIKE 'Customer Call%'
     ORDER BY id DESC LIMIT 1`,
    [table.id],
  );
  if (lastCall && Number(lastCall.age) < CALL_COOLDOWN_SEC) {
    const wait = Math.max(1, CALL_COOLDOWN_SEC - Number(lastCall.age));
    throw fail(429, `Please wait ${wait}s before calling again.`);
  }

  // What does the customer need? (all optional; plain bell press keeps the old behaviour)
  const kind = ["bill", "request"].includes(ctx.body.kind) ? ctx.body.kind : "call";
  const needs = (Array.isArray(ctx.body.needs) ? ctx.body.needs : [])
    .map((n) => NEED_LABELS[String(n)])
    .filter(Boolean)
    .filter((n, i, a) => a.indexOf(n) === i);
  const callNote = str(ctx.body.note, 200).replace(/\s+/g, " ");
  let suffix = "";
  let message = "Customer is requesting cashier assistance.";
  if (kind === "bill") {
    suffix = " · Bill";
    message = "Customer is asking for the bill.";
  } else if (kind === "request") {
    suffix = " · Request";
    message = `Special request: ${callNote || "see staff"}`;
  } else if (needs.length || callNote) {
    suffix = needs.length ? ` · ${needs.join(", ")}` : "";
    message = `Customer needs: ${needs.join(", ") || "assistance"}${callNote ? ` · Note: ${callNote}` : ""}`;
  }

  await notify({
    type: "table",
    title: `Customer Call · Table ${table.name}${suffix}`, force: true,
    message,
    priority: "urgent",
    link_type: "table",
    link_id: table.id,
    dedupe: `qr-call-${table.id}-${Date.now()}`,
  });
  return {
    message:
      kind === "bill"
        ? "Bill requested. Our staff will bring it shortly."
        : "Staff has been notified. They will be with you shortly.",
  };
});

api.get("/api/qr/events", "pos", async (ctx) => {
  const after = Math.max(0, Number(ctx.query.after) || 0);
  const events = await q(
    `SELECT * FROM (
       SELECT id, type, title, message, link_type, link_id, created_at
       FROM bb_notifications
       WHERE id > ? AND is_archived = 0
       AND (title LIKE 'QR Order Received!%' OR title LIKE 'Customer Call · Table%')
       ORDER BY id DESC LIMIT 30
     ) t ORDER BY id ASC`,
    [after],
  );
  return { events };
});