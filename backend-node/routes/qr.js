"use strict";
const crypto = require("crypto");
const { api, q, one, fail, notify, getSettings, str, pool } = require("../lib/core");
const { saveOrder, OPEN_SQL } = require("./orders");

const CALL_COOLDOWN_SEC = 15; // customer may ring the bell once per table every 15 seconds
const SERVED_VISIBLE_MIN = 10; // "Served" / "Cancelled" stays visible on the customer's phone for 10 minutes
const FEEDBACK_GAP_SEC = 20; // one feedback per table every 20 seconds (spam protection)
const FEEDBACK_TAGS = ["Food", "Service", "Ambience", "Cleanliness", "Value"];

// Guests that scanned the QR code and said how many people are sitting (the POS floor plan seats them)
let partyP = null;
function partyReady() {
  if (!partyP) {
    partyP = pool
      .query(
        `CREATE TABLE IF NOT EXISTS bb_table_parties (
          id INT AUTO_INCREMENT PRIMARY KEY,
          table_id INT NOT NULL,
          guests INT NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          ended_at DATETIME NULL,
          INDEX idx_party_table (table_id, ended_at)
        )`,
      )
      .catch((e) => {
        partyP = null;
        throw e;
      });
  }
  return partyP;
}
const ACTIVE_PARTY = `SELECT guests, created_at FROM bb_table_parties p
  WHERE p.table_id = ? AND p.ended_at IS NULL AND p.created_at > DATE_SUB(NOW(), INTERVAL 5 HOUR)
    AND NOT EXISTS (SELECT 1 FROM bb_orders x WHERE x.table_id = p.table_id AND x.completed_at IS NOT NULL AND x.completed_at > p.created_at)
  ORDER BY p.id DESC LIMIT 1`;
const MAX_GUESTS = 30;

const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

// Customer feedback table (created automatically the first time it is needed)
let feedbackReady = null;
function ensureFeedbackTable() {
  if (!feedbackReady) {
    feedbackReady = pool
      .query(
        `CREATE TABLE IF NOT EXISTS bb_feedback (
          id INT AUTO_INCREMENT PRIMARY KEY,
          table_id INT NULL,
          table_name VARCHAR(50) NULL,
          order_id INT NULL,
          bill_no VARCHAR(30) NULL,
          customer_name VARCHAR(100) NULL,
          rating TINYINT NOT NULL,
          tags VARCHAR(120) NULL,
          comment VARCHAR(400) NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_fb_created (created_at),
          INDEX idx_fb_rating (rating)
        )`,
      )
      .catch((e) => {
        feedbackReady = null;
        throw e;
      });
  }
  return feedbackReady;
}

api.get("/api/public/qr/:token", null, async (ctx) => {
  const table = await one(
    "SELECT id, name, capacity, qr_token FROM bb_tables WHERE qr_token = ? AND is_active = 1",
    [str(ctx.params.token, 36)],
  );
  if (!table) throw fail(404, "This table QR code is invalid or inactive.");
  const S = await getSettings();
  await partyReady();
  const party = await one(ACTIVE_PARTY, [table.id]);
  const categories = await q(
    "SELECT id, name, icon, image_url FROM categories WHERE is_archived = 0 AND is_active = 1 AND show_in_pos = 1 ORDER BY display_order, name",
  );
  const products =
    await q(`SELECT p.id, p.category_id, p.name, p.mrp AS price, p.description, p.image_url, p.item_type
    FROM products p JOIN categories c ON c.id = p.category_id
    WHERE p.is_archived = 0 AND p.is_active = 1 AND p.show_in_pos = 1 AND c.is_archived = 0 AND c.is_active = 1 AND c.show_in_pos = 1
    ORDER BY c.display_order, p.name`);
  return {
    table: { id: table.id, name: table.name, capacity: table.capacity },
    party: party ? { guests: party.guests, since: party.created_at } : null,
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

// Live status of the table's order (the customer page polls this).
//  - open order            -> pending / preparing / ready / served / bill_pending
//  - just served (paid / completed in the last 10 minutes) -> "served"
//  - just cancelled (last 10 minutes)                      -> "cancelled"
api.get("/api/public/qr/:token/status", null, async (ctx) => {
  const table = await one(
    "SELECT id FROM bb_tables WHERE qr_token = ? AND is_active = 1",
    [str(ctx.params.token, 36)],
  );
  if (!table) throw fail(404, "This table QR code is invalid or inactive.");
  const cols = "id, bill_no, status, subtotal, total, created_at, cancel_reason";
  let o = await one(
    `SELECT ${cols} FROM bb_orders WHERE table_id = ? AND ${OPEN_SQL} ORDER BY id DESC LIMIT 1`,
    [table.id],
  );
  let status = o ? o.status : null;
  if (!o) {
    o = await one(
      `SELECT ${cols} FROM bb_orders
       WHERE table_id = ? AND status IN ('completed','cancelled')
         AND TIMESTAMPDIFF(MINUTE, COALESCE(completed_at, cancelled_at), NOW()) < ${SERVED_VISIBLE_MIN}
       ORDER BY id DESC LIMIT 1`,
      [table.id],
    );
    status = o ? (o.status === "completed" ? "served" : "cancelled") : null;
  }
  if (!o) return { order: null };
  const items = await q(
    "SELECT product_name, qty, line_total FROM bb_order_items WHERE order_id = ? ORDER BY id",
    [o.id],
  );
  return {
    order: {
      id: o.id,
      bill_no: o.bill_no,
      status,
      total: Number(o.total),
      created_at: o.created_at,
      cancel_reason: status === "cancelled" ? o.cancel_reason || "" : "",
      items: items.map((i) => ({ name: i.product_name, qty: i.qty, line_total: Number(i.line_total) })),
    },
  };
});

// Customer tells how many people are sitting. The POS floor plan shows that many guests at the table.
api.post("/api/public/qr/:token/seat", null, async (ctx) => {
  const table = await one(
    "SELECT id, name, capacity FROM bb_tables WHERE qr_token = ? AND is_active = 1",
    [str(ctx.params.token, 36)],
  );
  if (!table) throw fail(404, "This table QR code is invalid or inactive.");
  const guests = Math.floor(Number(ctx.body.guests));
  if (!(guests >= 1 && guests <= MAX_GUESTS)) throw fail(400, `Please choose between 1 and ${MAX_GUESTS} people.`);
  // never more people than the table can seat
  if (Number(table.capacity) > 0 && guests > Number(table.capacity)) {
    throw fail(400, `Table ${table.name} seats only ${table.capacity} people.`);
  }
  await partyReady();
  await q("UPDATE bb_table_parties SET ended_at = NOW() WHERE table_id = ? AND ended_at IS NULL", [table.id]);
  await q("INSERT INTO bb_table_parties (table_id, guests) VALUES (?, ?)", [table.id, guests]);
  // an order that is already open on this table gets the new head count too
  await q(`UPDATE bb_orders SET guests = ? WHERE table_id = ? AND ${OPEN_SQL}`, [guests, table.id]);
  return { message: `Welcome! ${guests} ${guests === 1 ? "guest" : "guests"} at Table ${table.name}.`, guests };
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
  await partyReady();
  const party = await one(ACTIVE_PARTY, [table.id]);
  const guestCount = party
    ? Number(party.guests)
    : Math.min(MAX_GUESTS, Math.max(1, Math.floor(Number(ctx.body.guests)) || 1));
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
    guests: guestCount,
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

  // What does the customer need? (all optional; a plain bell press keeps the old behaviour)
  const LABELS = { water: "Water", cutlery: "Cutlery", tissues: "Tissues", other: "Other" };
  const wanted = [...new Set(Array.isArray(ctx.body.requests) ? ctx.body.requests : [])]
    .filter((k) => typeof k === "string" && has(LABELS, k))
    .map((k) => LABELS[k]);
  const otherText = str(ctx.body.other_text, 80).replace(/\s+/g, " ");
  const needs = wanted.map((w) => (w === "Other" && otherText ? `Other: ${otherText}` : w)).join(", ");
  const kind = ["bill", "request"].includes(ctx.body.kind) ? ctx.body.kind : "call";
  const extra = str(ctx.body.note, 200).replace(/\s+/g, " ");

  if (kind === "bill") {
    const hasOrder = await one(
      `SELECT id FROM bb_orders
       WHERE table_id = ? AND (${OPEN_SQL}
         OR (status = 'completed' AND TIMESTAMPDIFF(MINUTE, completed_at, NOW()) < ${SERVED_VISIBLE_MIN}))
       LIMIT 1`,
      [table.id],
    );
    if (!hasOrder) throw fail(400, "Please place an order first to request the bill.");
  }

  let suffix = "";
  let message = needs ? `Customer needs: ${needs}` : "Customer is requesting cashier assistance.";
  if (kind === "bill") {
    suffix = " · Bill";
    message = "Customer is asking for the bill.";
  } else if (kind === "request") {
    suffix = " · Request";
    message = `Special request: ${extra || "please check with the customer"}`;
  } else if (needs) {
    suffix = ` · ${wanted.join(", ")}`;
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

// ---------------- Customer feedback ----------------

// Customer sends a rating (1-5), optional tags and comment.
api.post("/api/public/qr/:token/feedback", null, async (ctx) => {
  const table = await one(
    "SELECT id, name FROM bb_tables WHERE qr_token = ? AND is_active = 1",
    [str(ctx.params.token, 36)],
  );
  if (!table) throw fail(404, "This table QR code is invalid or inactive.");
  const rating = Math.floor(Number(ctx.body.rating));
  if (!(rating >= 1 && rating <= 5)) throw fail(400, "Please choose a rating from 1 to 5 stars.");
  await ensureFeedbackTable();

  const last = await one(
    "SELECT TIMESTAMPDIFF(SECOND, created_at, NOW()) AS age FROM bb_feedback WHERE table_id = ? ORDER BY id DESC LIMIT 1",
    [table.id],
  );
  if (last && Number(last.age) < FEEDBACK_GAP_SEC) throw fail(429, "Feedback already received. Thank you!");

  const tags = [...new Set(Array.isArray(ctx.body.tags) ? ctx.body.tags : [])]
    .filter((t) => typeof t === "string" && FEEDBACK_TAGS.includes(t))
    .join(",");
  const comment = str(ctx.body.comment, 300).replace(/\s+/g, " ");
  const customer = str(ctx.body.customer_name, 100);
  let order = null;
  const orderId = Number(ctx.body.order_id) || 0;
  if (orderId) order = await one("SELECT id, bill_no FROM bb_orders WHERE id = ? AND table_id = ?", [orderId, table.id]);

  const [ins] = await pool.query(
    "INSERT INTO bb_feedback (table_id, table_name, order_id, bill_no, customer_name, rating, tags, comment) VALUES (?,?,?,?,?,?,?,?)",
    [table.id, table.name, order ? order.id : null, order ? order.bill_no : null, customer || null, rating, tags || null, comment || null],
  );
  await notify({
    type: "customer",
    title: `Customer Feedback · Table ${table.name} · ${"★".repeat(rating)}${"☆".repeat(5 - rating)}`,
    force: true,
    message: comment || (tags ? `Liked/rated: ${tags.split(",").join(", ")}` : `Customer rated ${rating} out of 5.`),
    priority: rating <= 2 ? "high" : "normal",
    link_type: "feedback",
    link_id: ins.insertId,
    dedupe: `qr-feedback-${ins.insertId}`,
  });
  return { message: "Thank you for your feedback!" };
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Staff: list feedback with summary (average, star distribution)
api.get("/api/feedback", "customers", async (ctx) => {
  await ensureFeedbackTable();
  const where = ["1=1"];
  const p = [];
  if (DATE_RE.test(String(ctx.query.from || ""))) {
    where.push("created_at >= ?");
    p.push(ctx.query.from);
  }
  if (DATE_RE.test(String(ctx.query.to || ""))) {
    where.push("created_at < DATE_ADD(?, INTERVAL 1 DAY)");
    p.push(ctx.query.to);
  }
  const text = str(ctx.query.q, 60);
  if (text) {
    where.push("(table_name LIKE ? OR customer_name LIKE ? OR comment LIKE ? OR bill_no LIKE ?)");
    p.push(...Array(4).fill(`%${text}%`));
  }
  const base = where.join(" AND ");
  const rating = Number(ctx.query.rating);
  const listWhere = rating >= 1 && rating <= 5 ? `${base} AND rating = ?` : base;
  const listParams = rating >= 1 && rating <= 5 ? [...p, rating] : p;

  const limit = Math.min(50, Math.max(1, Number(ctx.query.limit) || 10));
  const page = Math.max(1, Number(ctx.query.page) || 1);

  const [{ total }] = await q(`SELECT COUNT(*) total FROM bb_feedback WHERE ${listWhere}`, listParams);
  const rows = await q(
    `SELECT id, table_name, order_id, bill_no, customer_name, rating, tags, comment, created_at
     FROM bb_feedback WHERE ${listWhere} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...listParams, limit, (page - 1) * limit],
  );
  const dist = await q(`SELECT rating, COUNT(*) c FROM bb_feedback WHERE ${base} GROUP BY rating`, p);
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  dist.forEach((d) => {
    distribution[d.rating] = Number(d.c);
  });
  const count = Object.values(distribution).reduce((a, b) => a + b, 0);
  const sum = Object.entries(distribution).reduce((a, [k, v]) => a + Number(k) * v, 0);
  return {
    items: rows.map((r) => ({ ...r, tags: r.tags ? r.tags.split(",") : [] })),
    total,
    summary: {
      count,
      average: count ? Math.round((sum / count) * 10) / 10 : 0,
      distribution,
      positive: distribution[4] + distribution[5],
      low: distribution[1] + distribution[2],
    },
  };
});

api.delete("/api/feedback/:id", "customers.manage", async (ctx) => {
  await ensureFeedbackTable();
  await q("DELETE FROM bb_feedback WHERE id = ?", [Number(ctx.params.id) || 0]);
  return { message: "Feedback removed." };
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