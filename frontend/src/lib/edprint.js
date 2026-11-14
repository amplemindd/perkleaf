// Direct thermal printing through EDPrintTool (the small app running on the cafe PC at http://localhost:8189).
// It sends ESC/POS commands straight to the receipt printer - no browser print dialog.
// The settings are stored on THIS computer (localStorage), because the printer is connected to this computer.
import { getPrintCfg } from "./printReceipt";
import { TYPES } from "./api";
const KEY = "perkleaf_edprint";
const DEFAULT_URL = "http://localhost:8189";
// { on: boolean, url: "http://localhost:8189", printer: "cafe-receipt-printer" }
export function getEdCfg() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || "{}");
    return { on: !!c.on, url: (c.url || DEFAULT_URL).replace(/\/+$/, ""), printer: c.printer || "" };
  } catch {
    return { on: false, url: DEFAULT_URL, printer: "" };
  }
}
export function setEdCfg(cfg) {
  try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch { /* ignore */ }
}
export const edEnabled = () => { const c = getEdCfg(); return c.on && !!c.printer; };
async function call(path, opts) {
  const c = getEdCfg();
  let res;
  try {
    res = await fetch(c.url + path, opts);
  } catch {
    throw new Error("Cannot reach EDPrintTool. Keep the EDPrintTool app open on this computer, and if Chrome asks for \"Local network access\", click Allow.");
  }
  let data = null;
  try { data = await res.json(); } catch { /* not json */ }
  if (!res.ok || (data && data.success === false)) throw new Error((data && data.error) || `EDPrintTool error (HTTP ${res.status})`);
  return data;
}
export const edStatus = () => call("/api/status");
export const edPrinters = async () => { const d = await call("/api/printers"); return Array.isArray(d) ? d : []; };
export function edSend(commands, printerId) {
  const id = printerId || getEdCfg().printer;
  if (!id) return Promise.reject(new Error("Choose a printer in Settings > Receipt & Invoice > Direct printing."));
  return call(`/api/print-escpos/${encodeURIComponent(id)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ commands }),
  });
}
// Thermal printers cannot print Hindi / Marathi letters from plain text; show "?" and warn on the slip.
const latin = (s) => String(s == null ? "" : s).replace(/[^\x20-\xFF]/g, "?");
const hasOther = (s) => /[^\x00-\xFF]/.test(String(s || ""));
const hhmm = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(s || ""));
  return m ? `${m[4]}:${m[5]}  ${m[3]}/${m[2]}/${m[1].slice(2)}` : "";
};
// order shape (same as the KOT screen): { bill_no, created_at, table_name, source, kot_note, items:[{product_name, qty, note?}] }
export function kotCommands(o, restaurant = "") {
  const where = o.table_name ? `Table ${o.table_name}` : (o.order_type || "").replace("_", " ");
  const cmds = [
    ["initialize"],
    ["align", "center"], ["bold", true], ["textSize", 2, 2], ["line", "KITCHEN ORDER"], ["textSize", 1, 1], ["bold", false],
  ];
  if (restaurant) cmds.push(["line", latin(restaurant)]);
  cmds.push(
    ["rule", "="], ["align", "left"],
    ["bold", true], ["pair", latin(o.bill_no || "KOT"), hhmm(o.created_at)], ["bold", false],
    ["pair", latin(where), o.source === "qr" ? "QR ORDER" : ""],
    ["rule"],
  );
  (o.items || []).forEach((i) => {
    cmds.push(["bold", true], ["textSize", 1, 2], ["line", `${i.qty} x ${latin(i.product_name || i.name)}`], ["textSize", 1, 1]);
    if (i.note) cmds.push(["line", `   >> ${latin(i.note)}`]);
    cmds.push(["bold", false]);
  });
  cmds.push(["rule"]);
  if (o.kot_note) {
    cmds.push(["invert", true], ["line", " NOTE "], ["invert", false], ["bold", true], ["line", latin(o.kot_note)], ["bold", false]);
    if (hasOther(o.kot_note)) cmds.push(["line", "(note has Hindi/Marathi text - see screen)"]);
    cmds.push(["rule"]);
  }
  cmds.push(["align", "center"], ["line", "** KOT **"], ["empty"], ["cut", "partial", 4]);
  return cmds;
}
export const edPrintKot = (o, restaurant) => edSend(kotCommands(o, restaurant));

// ---- Customer bill / receipt (same details as the bill on the screen) ----
const money2 = (v) => Number(v || 0).toFixed(2);
// "2026-11-06 20:19:00" -> "06/11/26 20:19"
const dmy = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(s || ""));
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)} ${m[4]}:${m[5]}` : "";
};
// order = the order with items / payments (as the Bill screen gets it), S = receipt settings
export function billCommands(o, S = {}) {
  const inc = o.tax_mode === "inclusive";
  const methods = (o.payments || []).filter((p) => p.status !== "refunded" || o.payment_status === "refunded");
  const totalQty = (o.items || []).reduce((a, i) => a + Number(i.qty || 0), 0);
  const cust = o.customer_name && o.customer_name !== "Walk-in" ? o.customer_name : "";
  const where = `${TYPES[o.order_type] || ""}${o.table_name ? `: ${o.table_name}` : ""}`;
  const paid = o.payment_status === "paid";
  const status = o.status === "cancelled" ? "CANCELLED" : o.payment_status === "refunded" ? "REFUNDED" : paid ? "" : "UNPAID";

  const cmds = [
    ["initialize"],
    ["align", "center"], ["bold", true], ["textSize", 1, 2], ["line", latin(S.restaurant_name || "")], ["textSize", 1, 1], ["bold", false],
  ];
  if (S.show_restaurant_details && S.address) cmds.push(["line", latin(S.address)]);
  if (S.show_phone !== false && S.phone) cmds.push(["line", `Phone: ${latin(S.phone)}`]);
  if (S.show_gst_details && S.gstin) cmds.push(["line", `GSTIN: ${latin(S.gstin)}`]);
  cmds.push(["rule"], ["align", "left"], ["line", `Name: ${latin(cust)}`], ["rule"]);
  cmds.push(["pair", `Date: ${dmy(o.paid_at || o.created_at)}`, `Bill No: ${latin(o.bill_no)}`]);
  if (o.created_by_name || where) cmds.push(["pair", o.created_by_name ? `Cashier: ${latin(o.created_by_name)}` : "", latin(where)]);
  cmds.push(["rule"], ["bold", true], ["pair", "Item   Qty x Price", "Amount"], ["bold", false], ["rule"]);
  (o.items || []).forEach((i) => {
    cmds.push(["line", latin(i.product_name)], ["pair", `   ${i.qty} x ${money2(i.unit_price)}`, money2(i.line_subtotal)]);
  });
  cmds.push(["rule"], ["pair", "Total Qty", String(totalQty)], ["pair", "Sub Total", money2(o.subtotal)]);
  if (o.discount_amount > 0) cmds.push(["bold", true], ["pair", "Discount", `-${money2(o.discount_amount)}`], ["bold", false]);
  if (S.show_tax_on_bill && o.tax_amount > 0) {
    (o.tax_breakdown || []).forEach((b) => {
      if (S.show_gst_details) {
        cmds.push(["pair", `${inc ? "Incl. " : ""}CGST ${b.rate / 2}%`, money2(b.tax / 2)], ["pair", `${inc ? "Incl. " : ""}SGST ${b.rate / 2}%`, money2(b.tax / 2)]);
      } else {
        cmds.push(["pair", `${inc ? "Incl. " : ""}GST (${b.rate}%)`, money2(b.tax)]);
      }
    });
  }
  // the rupee sign cannot be printed on a thermal printer, so "Rs" is used
  cmds.push(["rule"], ["bold", true], ["textSize", 1, 2], ["pair", "GRAND TOTAL", `Rs ${money2(o.total)}`], ["textSize", 1, 1], ["bold", false]);
  if (methods.length) {
    const how = methods.map((p) => (methods.length > 1 ? `${String(p.method).toUpperCase()} ${money2(p.amount)}` : String(p.method).toUpperCase())).join(" + ");
    cmds.push(["line", `Paid via ${latin(how)}`]);
  }
  if (status) cmds.push(["align", "center"], ["bold", true], ["textSize", 2, 2], ["line", status], ["textSize", 1, 1], ["bold", false], ["align", "left"]);
  cmds.push(["rule"]);
  if (S.show_thanks) {
    cmds.push(["align", "center"]);
    String(S.footer_message || "").split("\n").forEach((l) => { if (l.trim()) cmds.push(["line", latin(l)]); });
  }
  cmds.push(["empty"], ["cut", "partial", 4]);
  return cmds;
}
export const edPrintBill = (o, S) => edSend(billCommands(o, S));
export const edPrintTest = () =>
  edPrintKot({
    bill_no: "KOT-TEST", created_at: new Date().toISOString().slice(0, 19).replace("T", " "), table_name: "T1", source: "qr",
    kot_note: "Less sugar, Extra hot", items: [{ product_name: "Americano", qty: 2, note: "no sugar" }, { product_name: "Bon Bon", qty: 1 }],
  }, "PRINT TEST");
// Which paper the tool uses is set inside EDPrintTool (printer Settings > ESC/POS > paper width).
export const edPaperHint = () => (getPrintCfg().width ? `${getPrintCfg().width} mm` : "");