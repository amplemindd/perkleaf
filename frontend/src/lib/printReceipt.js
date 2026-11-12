// Prints ONLY the bill / KOT (element #receipt) from a hidden frame, sized for a thermal roll printer.
//
// Paper width is now chosen by YOU in  Settings > Receipt & Invoice > "Printer Paper Width (mm)".
// It is stored on this computer (localStorage), because the printer is connected to this computer.
// If nothing is set, it falls back to the old "Bill Paper Size" (80mm / 58mm) setting.
const SIZES = {
  "80mm": { page: 80, print: 72 },
  "58mm": { page: 58, print: 48 },
};
const KEY = "perkleaf_print_cfg";

// { width: "76", margin: "4" }  (strings, "" = not set)
export function getPrintCfg() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || "{}");
    return { width: c.width ? String(c.width) : "", margin: c.margin !== undefined && c.margin !== "" ? String(c.margin) : "4" };
  } catch { return { width: "", margin: "4" }; }
}
export function setPrintCfg(cfg) {
  try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch { /* ignore */ }
}

// -> { page, print } in mm
function currentSize(el) {
  const c = getPrintCfg();
  const w = parseFloat(c.width);
  if (w >= 30 && w <= 120) {
    const m = Math.min(Math.max(parseFloat(c.margin) || 0, 0), 15);
    return { page: w, print: Math.max(20, w - 2 * m) };
  }
  return el && el.classList.contains("p58") ? SIZES["58mm"] : SIZES["80mm"];
}

export function printReceipt(target) {
  const el = target || document.getElementById("receipt");
  if (!el) { window.print(); return; }

  const clone = el.cloneNode(true);
  clone.id = "receipt";
  const s = currentSize(el);
  // narrow paper -> use the compact (stacked) layout
  if (s.page <= 64) clone.classList.add("p58"); else clone.classList.remove("p58");
  const head = Array.from(document.querySelectorAll('link[rel="stylesheet"], style')).map((n) => n.outerHTML).join("\n");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Bill</title>
${head}
<style>
  @page { size: ${s.page}mm auto; margin: 0; }
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; width: ${s.page}mm !important; height: auto !important; min-height: 0 !important; overflow: visible !important; }
  body { display: flex; justify-content: center; align-items: flex-start; }
  /* the app's QR-print rule hides everything with 'body * { visibility: hidden }' - keep the bill visible */
  html body #receipt, html body #receipt * { visibility: visible !important; }
  #receipt { --rw: ${s.print}mm; position: static !important; transform: none !important; width: ${s.print}mm !important; max-width: ${s.print}mm !important; margin: 0 !important;
             padding: 1.5mm 0 12mm !important; border: 0 !important; border-radius: 0 !important; box-shadow: none !important; animation: none !important; overflow: hidden; }
</style></head><body>${clone.outerHTML}</body></html>`;

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
  let done = false;
  const cleanup = () => { if (!done) { done = true; frame.remove(); } };
  frame.onload = () => {
    const w = frame.contentWindow;
    if (!w) { cleanup(); window.print(); return; }
    w.onafterprint = cleanup;
    setTimeout(() => { try { w.focus(); w.print(); } catch { cleanup(); } }, 150);
    setTimeout(cleanup, 120000);
  };
  frame.srcdoc = html;
  document.body.appendChild(frame);
}

// Small test slip: a box touching both edges of the print area. If the right line is cut, reduce the width / increase the margin.
export function printTest() {
  const s = currentSize(null);
  const d = document.createElement("div");
  d.className = "receipt r-bill";
  d.innerHTML = `<div class="r-c"><h4 class="r-shop">PRINT TEST</h4><p class="r-addr">Paper: ${s.page} mm &nbsp;|&nbsp; Print area: ${s.print} mm</p></div>
<div style="border:1.5px solid #000;margin:6px 0;padding:3px 4px;display:flex;justify-content:space-between;font-weight:700"><span>LEFT</span><span>RIGHT</span></div>
<table class="r-t r-items"><colgroup><col /><col class="c-q" /></colgroup><thead><tr><th>Item</th><th>Qty</th></tr></thead>
<tbody><tr><td>Sample item name</td><td><b>99</b></td></tr></tbody></table>
<div class="r-c r-code">If LEFT, RIGHT and Qty are fully visible, the width is correct.</div>`;
  printReceipt(d);
}