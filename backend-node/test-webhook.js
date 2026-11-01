"use strict";
// Swiggy / Zomato fake order sender (for testing only).
// Usage (run inside the backend-node folder while the backend is running):
//   node test-webhook.js swiggy              -> 1 Swiggy order
//   node test-webhook.js zomato              -> 1 Zomato order
//   node test-webhook.js both                -> 1 order for each
//   node test-webhook.js both 5              -> 5 orders for each
//   node test-webhook.js swiggy 1 cod        -> cash on delivery order
//   node test-webhook.js swiggy 1 dup        -> same order twice (duplicate test)
//   node test-webhook.js swiggy 1 wrongsecret-> wrong secret (should return 401)
// The SECRET below must match Settings > Integrations > Webhook secret.

const BASE = process.env.BASE_URL || "http://localhost:5000";
const SECRET = process.env.WEBHOOK_SECRET || "test123secret";

const MENU = [
  ["Cappuccino", 150], ["Cold Coffee", 180], ["Veg Sandwich", 120],
  ["Paneer Burger", 210], ["French Fries", 110], ["Chocolate Brownie", 140],
];
const NAMES = ["Rahul Sharma", "Priya Verma", "Amit Patil", "Sneha Joshi", "Karan Mehta"];
const AREAS = ["Dharampeth", "Sitabuldi", "Ramdaspeth", "Sadar", "Manish Nagar"];
const rnd = (a) => a[Math.floor(Math.random() * a.length)];

function makeOrder(platform, { cod, id }) {
  const items = Array.from({ length: 1 + Math.floor(Math.random() * 3) }, () => {
    const [name, price] = rnd(MENU);
    return { name, qty: 1 + Math.floor(Math.random() * 2), price };
  });
  const total = items.reduce((s, i) => s + i.qty * i.price, 0);
  const prefix = platform === "swiggy" ? "SW" : "ZM";
  return {
    order_id: id || `${prefix}-${Date.now().toString().slice(-7)}${Math.floor(Math.random() * 90 + 10)}`,
    customer: { name: rnd(NAMES), phone: "98" + Math.floor(10000000 + Math.random() * 89999999), address: `${rnd(AREAS)}, Nagpur` },
    payment_mode: cod ? "cod" : "prepaid",
    items, total,
  };
}

async function send(platform, order, secret = SECRET) {
  const res = await fetch(`${BASE}/api/online/webhook/${platform}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-webhook-secret": secret },
    body: JSON.stringify(order),
  });
  const j = await res.json().catch(() => ({}));
  console.log(`${platform.toUpperCase()} #${order.order_id} -> HTTP ${res.status} | ${j.message || JSON.stringify(j)}`);
}

(async () => {
  const [, , which = "both", count = "1", mode = ""] = process.argv;
  const platforms = which === "both" ? ["swiggy", "zomato"] : [which];
  for (const p of platforms) {
    if (!["swiggy", "zomato"].includes(p)) return console.log("Platform: swiggy | zomato | both");
    for (let i = 0; i < Number(count); i++) {
      const o = makeOrder(p, { cod: mode === "cod" });
      if (mode === "dup") { await send(p, o); await send(p, o); }
      else await send(p, o, mode === "wrongsecret" ? "galat-secret" : SECRET);
    }
  }
})().catch((e) => console.error("Could not connect to the backend:", e.message));
