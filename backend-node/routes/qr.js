"use strict";
const crypto = require("crypto");
const { api, q, one, fail, notify, getSettings, str } = require("../lib/core");
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
    logo_url: S.logo_url || "",
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
  const existing = await one(
    `SELECT id FROM bb_orders WHERE table_id = ? AND ${OPEN_SQL} ORDER BY id DESC LIMIT 1`,
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
  };
  const result = await saveOrder(
    { ...ctx, user: fakeUser, body },
    existing ? existing.id : null,
  );
  const order = result.order;
  await notify({
    type: "order",
    title: `QR Order Received! · Table ${table.name}`, force: true,
    message: `${order.bill_no} · ${order.items
      .map((i) => `${i.product_name} x${i.qty}`)
      .join(", ")
      .slice(0, 330)} · ₹${order.total}`,
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

  await notify({
    type: "table",
    title: `Customer Call · Table ${table.name}`, force: true,
    message: "Customer is requesting cashier assistance.",
    priority: "urgent",
    link_type: "table",
    link_id: table.id,
    dedupe: `qr-call-${table.id}-${Date.now()}`,
  });
  return { message: "Cashier has been notified." };
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