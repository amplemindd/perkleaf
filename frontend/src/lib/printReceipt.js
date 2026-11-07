// Prints ONLY the bill (element #receipt) from a hidden frame, sized for a thermal roll printer.
// Why a frame: the page margin / hidden app layout can no longer cut the bill or feed blank paper.
//
// The page size itself comes from the printer driver (choose the 80mm / 58mm roll in the print dialog).
// The bill is centred on that page. If your printer still cuts a little on the left/right,
// lower "print" below (the width that is really printable on that paper, in mm).
const SIZES = {
  "80mm": { page: 80, print: 72 },
  "58mm": { page: 58, print: 48 },
};

export function printReceipt() {
  const el = document.getElementById("receipt");
  if (!el) { window.print(); return; }

  const s = el.classList.contains("p58") ? SIZES["58mm"] : SIZES["80mm"];
  const head = Array.from(document.querySelectorAll('link[rel="stylesheet"], style')).map((n) => n.outerHTML).join("\n");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Bill</title>
${head}
<style>
  @page { margin: 0; }
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; width: 100%; height: auto !important; min-height: 0 !important; overflow: visible !important; }
  body { display: flex; justify-content: center; align-items: flex-start; }
  /* the app's QR-print rule hides everything with 'body * { visibility: hidden }' - keep the bill visible */
  html body #receipt, html body #receipt * { visibility: visible !important; }
  #receipt { position: static !important; transform: none !important; width: ${s.print}mm !important; max-width: none !important; margin: 0 !important;
             padding: 1.5mm 0 12mm !important; border: 0 !important; border-radius: 0 !important; box-shadow: none !important; animation: none !important; }
</style></head><body>${el.outerHTML}</body></html>`;

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