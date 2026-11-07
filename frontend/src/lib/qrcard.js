// Builds a printable "Scan & Order" card (QR + instructions) as a PNG, so the downloaded
// image contains the text for customers, not just the bare QR code.
export const QR_BRAND = { name: "AMPLEMIND CAFE", sub: "CAFÉ & RESTAURANT", powered: "Powered by AmpleMind Technologies" };

export const QR_STEPS = [
  ["Scan this QR with your phone camera", "Apne phone ke camera se QR scan karein"],
  ["Choose your favourite items from the menu", "Menu se apni pasand ke items chunein"],
  ["Place your order — we’ll bring it to your table", "Order dein — hum aapke table par laayenge"],
];

// Shown as a highlighted note on the card (popup, print and downloaded PNG)
export const QR_BELL = ["Need anything? Ring the bell!", "We’ll come right over to your table."];

const loadImg = (src) =>
  new Promise((res, rej) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => res(im);
    im.onerror = () => rej(new Error("QR image could not be loaded"));
    im.src = src;
  });

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function buildQrCardPng(qrUrl, tableName, brandSettings = {}) {
  const img = await loadImg(qrUrl);
  const S = 2; // sharper output
  const W = 640, H = 900;
  const cv = document.createElement("canvas");
  cv.width = W * S; cv.height = H * S;
  const c = cv.getContext("2d");
  c.scale(S, S);
  const FONT = "Poppins, 'Segoe UI', Arial, sans-serif";
  const dark = "#14532d", green = "#15803d", grey = "#64748b";
  const brandName = typeof brandSettings === "string" ? brandSettings : (brandSettings.name || QR_BRAND.name);
  const brandSub = typeof brandSettings === "object" ? String(brandSettings.sub ?? "").trim() : "";

  c.fillStyle = "#ffffff"; c.fillRect(0, 0, W, H);
  c.strokeStyle = "#c9dfcd"; c.lineWidth = 3; rrect(c, 8, 8, W - 16, H - 16, 28); c.stroke();
  c.textAlign = "center"; c.textBaseline = "alphabetic";

  c.fillStyle = dark; c.font = `800 34px ${FONT}`; c.fillText(brandName || QR_BRAND.name, W / 2, 70);
  if (brandSub) {
    c.fillStyle = green; c.font = `600 14px ${FONT}`; c.fillText(brandSub.split("").join(" "), W / 2, 96);
  }

  // table pill
  const label = `TABLE ${tableName}`;
  c.font = `800 22px ${FONT}`;
  const pw = c.measureText(label).width + 56;
  c.fillStyle = green; rrect(c, (W - pw) / 2, 120, pw, 46, 23); c.fill();
  c.fillStyle = "#fff"; c.fillText(label, W / 2, 151);

  // QR
  const q = 340, qx = (W - q) / 2, qy = 192;
  c.strokeStyle = "#d7e3da"; c.lineWidth = 2; rrect(c, qx - 14, qy - 14, q + 28, q + 28, 16); c.stroke();
  c.drawImage(img, qx, qy, q, q);

  // Headline
  c.fillStyle = dark; c.font = `800 34px ${FONT}`; c.fillText("SCAN & ORDER", W / 2, 612);
  c.fillStyle = grey; c.font = `500 16px ${FONT}`; c.fillText("Order directly from your mobile — no waiting!", W / 2, 640);

  // Minimal staff assistance panel. Bell is a green outline with no colored icon background.
  const by = 682, bh = 112;
  c.fillStyle = "#f0faf2"; rrect(c, 42, by, W - 84, bh, 12); c.fill();
  c.strokeStyle = "#d5ead9"; c.lineWidth = 1.5; rrect(c, 42, by, W - 84, bh, 12); c.stroke();

  c.save();
  c.translate(72, by + 34);
  c.scale(2.0, 2.0);
  c.strokeStyle = green; c.lineWidth = 1.8; c.lineCap = "round"; c.lineJoin = "round";
  c.stroke(new Path2D("M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"));
  c.stroke(new Path2D("M13.73 21a2 2 0 0 1-3.46 0"));
  c.restore();

  c.textAlign = "left";
  c.fillStyle = dark; c.font = `800 21px ${FONT}`; c.fillText("Scan to Call a Staff", 160, by + 43);
  c.fillStyle = grey; c.font = `500 14px ${FONT}`;
  c.fillText("Scan this QR to open the menu, then tap", 160, by + 69);
  c.fillText("“Ring a Bell” to notify our staff.", 160, by + 90);
  c.textAlign = "center";

  c.fillStyle = "#e5e7eb"; c.fillRect(42, H - 82, W - 84, 1);
  c.fillStyle = dark; c.font = `700 16px ${FONT}`; c.fillText("Need help? Please ask our staff 🙂", W / 2, H - 52);
  c.fillStyle = "#94a3b8"; c.font = `500 12px ${FONT}`; c.fillText(QR_BRAND.powered, W / 2, H - 27);
  return cv.toDataURL("image/png");
}

export async function downloadQrCard(qrUrl, tableName, brandSettings = {}) {
  const png = await buildQrCardPng(qrUrl, tableName, brandSettings);
  const a = document.createElement("a");
  a.href = png;
  a.download = `Table-${tableName}-QR.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}