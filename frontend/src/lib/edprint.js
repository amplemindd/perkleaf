// Direct thermal printing through EDPrintTool (the small app running on the cafe PC at http://localhost:8189).
// It sends ESC/POS commands straight to the receipt printer - no browser print dialog.
// The settings are stored on THIS computer (localStorage), because the printer is connected to this computer.
import { getPrintCfg } from "./printReceipt";
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
export const edPrintTest = () =>
  edPrintKot({
    bill_no: "KOT-TEST", created_at: new Date().toISOString().slice(0, 19).replace("T", " "), table_name: "T1", source: "qr",
    kot_note: "Less sugar, Extra hot", items: [{ product_name: "Americano", qty: 2, note: "no sugar" }, { product_name: "Bon Bon", qty: 1 }],
  }, "PRINT TEST");
// Which paper the tool uses is set inside EDPrintTool (printer Settings > ESC/POS > paper width).
export const edPaperHint = () => (getPrintCfg().width ? `${getPrintCfg().width} mm` : "");