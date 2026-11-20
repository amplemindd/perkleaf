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
    return { on: !!c.on, url: (c.url || DEFAULT_URL).replace(/\/+$/, ""), printer: c.printer || "", cols: Number(c.cols) || 0 };
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
  const COLS = billCols();
  const half = Math.floor(COLS / 2);
  const where = o.table_name ? `Table ${o.table_name}` : (o.order_type || "").replace("_", " ");
  // left text + right text on one line (spaces, no dots)
  const lr = (l, r) => {
    const right = String(r || "");
    return fit(l, Math.max(1, COLS - right.length - 1)).padEnd(COLS - right.length) + right;
  };
  const cmds = [
    ["initialize"],
    ["align", "center"], ["bold", true], ["textSize", COLS >= 32 ? 2 : 1, 2], ["line", "KITCHEN ORDER"], ["textSize", 1, 1], ["bold", false],
  ];
  if (restaurant) cmds.push(["line", latin(restaurant)]);
  cmds.push(["rule"], ["align", "left"]);
  // KOT number on the left, time + date on the right
  cmds.push(["bold", true], ["line", lr(latin(o.bill_no || "KOT"), hhmm(o.created_at))], ["bold", false]);
  // table / order type in big letters
  if (where) {
    wrapText(latin(where), half).forEach((t) => cmds.push(["bold", true], ["textSize", 2, 2], ["line", t], ["textSize", 1, 1], ["bold", false]));
  }
  if (o.source === "qr") cmds.push(["bold", true], ["line", "QR ORDER"], ["bold", false]);
  cmds.push(["rule"]);
  // items: "2 x Name", big and bold, long names wrap onto the next line
  (o.items || []).forEach((i) => {
    wrapText(`${i.qty} x ${latin(i.product_name || i.name)}`, half).forEach((t, k) => {
      cmds.push(["bold", true], ["textSize", 2, 2], ["line", k === 0 ? t : `   ${t}`], ["textSize", 1, 1], ["bold", false]);
    });
    if (i.note) cmds.push(["line", `   >> ${latin(i.note)}`]);
  });
  cmds.push(["rule"]);
  if (o.kot_note) {
    cmds.push(["invert", true], ["line", " NOTE "], ["invert", false], ["bold", true]);
    wrapText(latin(o.kot_note), COLS).forEach((t) => cmds.push(["line", t]));
    cmds.push(["bold", false]);
    if (hasOther(o.kot_note)) cmds.push(["line", "(note has Hindi/Marathi text - see screen)"]);
    cmds.push(["rule"]);
  }
  cmds.push(["align", "center"], ["line", "** KOT **"], ["empty"], ["cut", "partial", 4]);
  return cmds;
}
export const edPrintKot = (o, restaurant) => edSend(kotCommands(o, restaurant));

// ---- Customer bill / receipt ----
// Same look as the bill on the screen: big shop name, boxed sections, an Item / Qty. / Price / Amount table,
// totals on the right and a big Grand Total. The columns are built with spaces (the printer font is fixed width).
const money2 = (v) => Number(v || 0).toFixed(2);
// "2026-11-06 20:19:00" -> "06/11/26 20:19"
const dmy = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(s || ""));
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)} ${m[4]}:${m[5]}` : "";
};
// characters per line: 48 on 80 mm paper, 32 on 58 mm paper. A different value can be forced with
// localStorage "perkleaf_edprint" -> { "cols": 42 }
function billCols() {
  const c = getEdCfg().cols;
  if (c >= 24 && c <= 64) return c;
  const w = parseFloat(getPrintCfg().width);
  return w && w < 70 ? 32 : 48;
}
// break a text into lines of at most `w` characters (at spaces when possible)
function wrapText(text, w) {
  const out = [];
  let cur = "";
  String(text || "").split(/\s+/).filter(Boolean).forEach((word) => {
    let rest = word;
    while (rest.length > w) {
      if (cur) { out.push(cur); cur = ""; }
      out.push(rest.slice(0, w));
      rest = rest.slice(w);
    }
    if (!cur) cur = rest;
    else if (cur.length + 1 + rest.length <= w) cur += ` ${rest}`;
    else { out.push(cur); cur = rest; }
  });
  if (cur) out.push(cur);
  return out.length ? out : [""];
}
const fit = (t, w) => String(t).slice(0, w);

// order = the order with items / payments (as the Bill screen gets it), S = receipt settings
export function billCommands(o, S = {}) {
  const COLS = billCols();
  const wide = COLS >= 42;
  // column widths: normal sizes, widened when a number is bigger (so the numbers never run together)
  const wideEnough = (texts, base) => Math.max(base, ...texts.map((t) => String(t).length + 1));
  const lines = o.items || [];
  const taxAmts = (o.tax_breakdown || []).map((x) => money2(x.tax));
  const qtyW = wideEnough(["Qty.", ...lines.map((i) => i.qty)], wide ? 5 : 4);
  const priceW = wideEnough(["Price", ...lines.map((i) => money2(i.unit_price))], wide ? 9 : 8);
  const amtW = wideEnough(
    ["Amount", ...lines.map((i) => money2(i.line_subtotal)), money2(o.subtotal), `-${money2(o.discount_amount)}`, ...taxAmts],
    wide ? 11 : 9,
  );
  const itemW = Math.max(8, COLS - qtyW - priceW - amtW);
  // one row of the table: Item (wraps) | Qty. | Price | Amount
  const itemRow = (name, qty, price, amt) => {
    const parts = wrapText(name, itemW - 1);
    return parts.map((t, i) => (i === 0
      ? fit(t, itemW - 1).padEnd(itemW) + String(qty).padStart(qtyW) + price.padStart(priceW) + amt.padStart(amtW)
      : t));
  };
  // left text, a label that ends before the Amount column, and the amount on the right edge
  const totalRow = (left, label, amt) => {
    const labelEnd = COLS - amtW;
    const room = Math.max(0, labelEnd - label.length - 1);
    return fit(left, room).padEnd(labelEnd - label.length) + label + amt.padStart(amtW);
  };

  const inc = o.tax_mode === "inclusive";
  const methods = (o.payments || []).filter((p) => p.status !== "refunded" || o.payment_status === "refunded");
  const totalQty = (o.items || []).reduce((a, i) => a + Number(i.qty || 0), 0);
  const cust = o.customer_name && o.customer_name !== "Walk-in" ? o.customer_name : "";
  const where = `${TYPES[o.order_type] || ""}${o.table_name ? `: ${o.table_name}` : ""}`;
  const status = o.status === "cancelled" ? "CANCELLED" : o.payment_status === "refunded" ? "REFUNDED" : "";

  const name = latin(S.restaurant_name || "");
  const bigName = name.length * 2 <= COLS;
  const cmds = [
    ["initialize"],
    ["align", "center"], ["bold", true], ["textSize", bigName ? 2 : 1, 2], ["line", name], ["textSize", 1, 1], ["bold", false],
  ];
  if (S.show_restaurant_details && S.address) cmds.push(["line", latin(S.address)]);
  if (S.show_phone !== false && S.phone) cmds.push(["line", `Phone: ${latin(S.phone)}`]);
  if (S.show_gst_details && S.gstin) cmds.push(["line", `GSTIN: ${latin(S.gstin)}`]);
  cmds.push(["rule"], ["align", "left"]);

  // customer name (only when there is one)
  if (cust) cmds.push(["line", fit(`Name: ${latin(cust)}`, COLS)], ["rule"]);

  // date on the left, order type + bill number on the right
  const when = `Date: ${dmy(o.paid_at || o.created_at)}`;
  const bill = `Bill No.: ${latin(o.bill_no)}`;
  if (wide) {
    const half = Math.floor(COLS / 2);
    cmds.push(["line", fit(when, half - 1).padEnd(half) + fit(latin(where), COLS - half)]);
    cmds.push(["line", " ".repeat(half) + fit(bill, COLS - half)]);
  } else {
    cmds.push(["line", fit(when, COLS)]);
    if (where) cmds.push(["line", fit(latin(where), COLS)]);
    cmds.push(["line", fit(bill, COLS)]);
  }
  cmds.push(["rule"]);

  // items table
  cmds.push(["bold", true], ["line", "Item".padEnd(itemW) + "Qty.".padStart(qtyW) + "Price".padStart(priceW) + "Amount".padStart(amtW)], ["bold", false], ["rule"]);
  (o.items || []).forEach((i) => {
    itemRow(latin(i.product_name), i.qty, money2(i.unit_price), money2(i.line_subtotal)).forEach((l) => cmds.push(["line", l]));
  });
  cmds.push(["rule"]);

  // totals
  cmds.push(["line", totalRow(`Total Qty: ${totalQty}`, "Sub Total", money2(o.subtotal))]);
  if (o.discount_amount > 0) cmds.push(["bold", true], ["line", totalRow("Discount", "", `-${money2(o.discount_amount)}`)], ["bold", false]);
  if (S.show_tax_on_bill && o.tax_amount > 0) {
    (o.tax_breakdown || []).forEach((b) => {
      if (S.show_gst_details) {
        cmds.push(["line", totalRow("", `${inc ? "Incl. " : ""}CGST ${b.rate / 2}%`, money2(b.tax / 2))]);
        cmds.push(["line", totalRow("", `${inc ? "Incl. " : ""}SGST ${b.rate / 2}%`, money2(b.tax / 2))]);
      } else {
        cmds.push(["line", totalRow("", `${inc ? "Incl. " : ""}GST (${b.rate}%)`, money2(b.tax))]);
      }
    });
  }
  cmds.push(["rule"]);

  // Grand Total: big and bold (the rupee sign cannot be printed on a thermal printer, so "Rs" is used)
  const label = "Grand Total";
  const amount = `Rs ${money2(o.total)}`;
  cmds.push(["bold", true], ["textSize", 1, 2], ["line", label.padEnd(COLS - amount.length) + amount], ["textSize", 1, 1], ["bold", false]);
  if (methods.length) {
    const how = methods.map((p) => (methods.length > 1 ? `${String(p.method).toUpperCase()} ${money2(p.amount)}` : String(p.method).toUpperCase())).join(" + ");
    cmds.push(["line", fit(`Paid via ${latin(how)}`, COLS)]);
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