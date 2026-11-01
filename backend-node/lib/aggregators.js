"use strict";
// ============================================================================
//  Swiggy / Zomato adapter.  When you receive the official API documents, edit
//  ONLY this file:
//    1. normalize()   - convert the platform's webhook JSON into the common shape
//    2. pushStatus()  - tell the platform when you accept / reject / ready / dispatch
//  Everything else (orders panel, KOT, POS billing, reports) already works.
// ============================================================================
const PLATFORMS = { swiggy: "Swiggy", zomato: "Zomato" };

const pick = (...v) => v.find((x) => x !== undefined && x !== null && x !== "");

// Common order shape used by the app:
// { external_id, customer_name, customer_phone, address, payment_mode: "prepaid" | "cod", total,
//   items: [{ name, qty, price, product_id? }] }
function normalize(platform, body) {
  const b = body || {};
  const c = b.customer || b.user || {};
  const items = (Array.isArray(b.items) ? b.items : Array.isArray(b.order_items) ? b.order_items : []).map((i) => ({
    name: String(pick(i.name, i.item_name, i.title, "Item")).slice(0, 150),
    qty: Math.max(1, Math.floor(Number(pick(i.qty, i.quantity, 1)))),
    price: Number(pick(i.price, i.unit_price, i.mrp, 0)) || 0,
    product_id: i.product_id ? Number(i.product_id) : null,
  }));
  const total = Number(pick(b.total, b.order_total, b.amount, items.reduce((s, i) => s + i.price * i.qty, 0))) || 0;
  const pay = String(pick(b.payment_mode, b.payment_type, b.payment, "prepaid")).toLowerCase();
  return {
    external_id: String(pick(b.order_id, b.id, b.orderId, b.external_id, "")).slice(0, 60),
    customer_name: String(pick(c.name, b.customer_name, "Customer")).slice(0, 100),
    customer_phone: String(pick(c.phone, c.mobile, b.customer_phone, "")).slice(0, 30),
    address: String(pick(c.address, b.address, b.delivery_address, "")).slice(0, 255),
    payment_mode: /cod|cash/.test(pay) ? "cod" : "prepaid",
    total, items,
  };
}

// Called after every status change made in the app. Return { ok, skipped, message }.
async function pushStatus(platform, order, settings) {
  const key = settings[`${platform}_api_key`], store = settings[`${platform}_store_id`];
  if (!settings[`${platform}_enabled`] || !key || !store) return { ok: false, skipped: true, message: `${PLATFORMS[platform]} API is not connected - status saved in the app only.` };
  // TODO: call the official ${PLATFORMS[platform]} API here, e.g.
  //   await fetch(`https://<platform-api>/orders/${order.external_id}/status`, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: JSON.stringify({ status: order.status }) });
  return { ok: false, skipped: true, message: `${PLATFORMS[platform]} API call is not written yet - see backend-node/lib/aggregators.js.` };
}
module.exports = { PLATFORMS, normalize, pushStatus };
