// Top-down "3D look" table illustration (black marble table, black chairs, seated customers, glowing status ring).
// Pure function -> SVG string, so it is light, fast and needs no 3D library.

export const PHASES = {
  available: { label: "Available", ring: "#22c55e", ringOpacity: 0.55 },
  occupied: { label: "Occupied", ring: "#2563eb", ringOpacity: 1 },
  served: { label: "Served", ring: "#f59e0b", ringOpacity: 1 },
  bill: { label: "Bill Pending", ring: "#ef4444", ringOpacity: 1 },
  reserved: { label: "Reserved", ring: "#8b5cf6", ringOpacity: 0.9 },
  cleaning: { label: "Cleaning", ring: "#14b8a6", ringOpacity: 0.9 },
  out_of_service: { label: "Out of service", ring: "#6b7280", ringOpacity: 0.7 },
};

const SHIRTS = ["#e03e3e", "#2b8be6", "#f08c00", "#8e44e8", "#12a67c", "#f2c200", "#e64980", "#3b5bdb"];
const SKINS = ["#f3cfae", "#e6b184", "#c98e5d", "#8d5a3b", "#f6dcc2"];
const HAIRS = ["#1b1b1f", "#4a2c17", "#7a4a21", "#b8702c", "#2b2b33"];
const FOODS = ["#ef4444", "#f59e0b", "#84cc16", "#f97316", "#a3e635"];

const W = 220;
const H = 200;
const CX = 110;
const CY = 100;
const r1 = (n) => Math.round(n * 10) / 10;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// which layout a table gets (stays the same for the same table)
export function tableShape(capacity, id = 0) {
  const n = Math.max(1, Math.min(Number(capacity) || 4, 10));
  if (n <= 2) return "round";
  if (n <= 4) return Number(id) % 2 ? "round" : "square";
  if (n <= 6) return Number(id) % 2 ? "long" : "round";
  if (n <= 8) return "round";
  return "long";
}

// short text for the badge in the middle of the table ("T3" -> "T3", "Table 12" -> "12")
function shortName(name) {
  const t = String(name || "").trim();
  const digits = /(\d+)\s*$/.exec(t);
  if (digits && t.length > 3) return digits[1];
  return t.slice(0, 3);
}

function chairsFor(shape, n) {
  const list = [];
  if (shape === "round") {
    const rt = n <= 4 ? 50 : n <= 6 ? 54 : 58;
    const s = n <= 4 ? 1 : n <= 6 ? 0.92 : 0.8;
    const dc = rt + 20;
    for (let i = 0; i < n; i += 1) {
      const a = (360 * i) / n;
      const rad = (a * Math.PI) / 180;
      list.push({ x: CX + dc * Math.sin(rad), y: CY - dc * Math.cos(rad), a, s, ox: Math.sin(rad), oy: -Math.cos(rad) });
    }
    return { rt, list };
  }
  if (shape === "square") {
    const half = 44;
    const d = half + 20;
    const spots = [
      { x: CX, y: CY + d, a: 180, ox: 0, oy: 1 },
      { x: CX - d, y: CY, a: 270, ox: -1, oy: 0 },
      { x: CX, y: CY - d, a: 0, ox: 0, oy: -1 },
      { x: CX + d, y: CY, a: 90, ox: 1, oy: 0 },
    ];
    spots.slice(0, Math.min(n, 4)).forEach((p) => list.push({ ...p, s: 1 }));
    return { half, list };
  }
  // long table: chairs along the top and the bottom (alternating so guests sit on both sides)
  const hw = 80;
  const hh = 30;
  const topN = Math.ceil(n / 2);
  const botN = Math.floor(n / 2);
  const k = Math.max(topN, botN);
  const s = k > 4 ? 0.8 : k > 3 ? 0.9 : 1;
  const place = (count, row) => {
    const out = [];
    for (let i = 0; i < count; i += 1) {
      const x = CX - hw + ((i + 0.5) * (2 * hw)) / count;
      out.push(row === "top"
        ? { x, y: CY - hh - 20, a: 0, s, ox: 0, oy: -1 }
        : { x, y: CY + hh + 20, a: 180, s, ox: 0, oy: 1 });
    }
    return out;
  };
  const top = place(topN, "top");
  const bot = place(botN, "bot");
  for (let i = 0; i < Math.max(top.length, bot.length); i += 1) {
    if (bot[i]) list.push(bot[i]);
    if (top[i]) list.push(top[i]);
  }
  return { hw, hh, list };
}

// which chairs have somebody sitting (spread evenly around the table)
function seatedIndexes(guests, n) {
  const g = Math.max(0, Math.min(guests, n));
  const out = [];
  for (let i = 0; i < g; i += 1) out.push(Math.floor((i * n) / g + n / (2 * g)));
  return out;
}

function chairSvg(c) {
  return `<g transform="translate(${r1(c.x)} ${r1(c.y)}) rotate(${r1(c.a)}) scale(${c.s})">
<rect x="-13" y="-5" width="26" height="25" rx="7" fill="url(#CHS)"/>
<path d="M-14.5 -3 Q0 -15 14.5 -3" stroke="#09090a" stroke-width="7.5" fill="none" stroke-linecap="round"/>
<path d="M-12 -6 Q0 -16.5 12 -6" stroke="#d4af37" stroke-width="1" fill="none" opacity=".75" stroke-linecap="round"/>
<path d="M-9 14 Q0 17 9 14" stroke="#ffffff" stroke-width="1.2" fill="none" opacity=".12" stroke-linecap="round"/>
</g>`;
}

function personSvg(c, seed) {
  const shirt = SHIRTS[seed % SHIRTS.length];
  const skin = SKINS[(seed * 3 + 1) % SKINS.length];
  const hair = HAIRS[(seed * 5 + 2) % HAIRS.length];
  return `<g transform="translate(${r1(c.x)} ${r1(c.y)}) rotate(${r1(c.a)}) scale(${c.s})">
<ellipse cx="-11.5" cy="15" rx="3.6" ry="8.5" fill="${shirt}" transform="rotate(-14 -11.5 15)"/>
<ellipse cx="11.5" cy="15" rx="3.6" ry="8.5" fill="${shirt}" transform="rotate(14 11.5 15)"/>
<circle cx="-8.6" cy="23.5" r="2.6" fill="${skin}"/>
<circle cx="8.6" cy="23.5" r="2.6" fill="${skin}"/>
<ellipse cx="0" cy="6.5" rx="13" ry="7.2" fill="${shirt}"/>
<ellipse cx="0" cy="4.8" rx="11" ry="4.2" fill="#ffffff" opacity=".18"/>
<circle cx="0" cy="7" r="6.3" fill="${skin}"/>
<path d="M-6.5 6.6 A6.6 6.6 0 0 1 6.5 6.6 Q0 3.4 -6.5 6.6 Z" fill="${hair}"/>
<circle cx="0" cy="5.4" r="6.4" fill="${hair}" opacity=".0"/>
<ellipse cx="0" cy="3.6" rx="6.6" ry="4.2" fill="${hair}"/>
<circle cx="-2.1" cy="9.6" r=".75" fill="#2b2b33" opacity=".55"/>
<circle cx="2.1" cy="9.6" r=".75" fill="#2b2b33" opacity=".55"/>
</g>`;
}

function plateSvg(x, y, seed) {
  const f = (i) => FOODS[(seed + i) % FOODS.length];
  return `<g transform="translate(${r1(x)} ${r1(y)})">
<circle r="8.6" fill="url(#PLT)" stroke="#d9d9de" stroke-width=".8"/>
<circle r="5.6" fill="none" stroke="#e4e4ea" stroke-width=".6"/>
<circle cx="-2" cy="-1.6" r="2.3" fill="${f(0)}"/><circle cx="2.1" cy="-.6" r="2.1" fill="${f(1)}"/><circle cx="-.2" cy="2.3" r="2" fill="${f(2)}"/>
<circle cx="11.6" cy="-6" r="3" fill="#f3b24c" opacity=".85" stroke="#fff" stroke-width=".8"/>
</g>`;
}

function plantSvg() {
  const leaves = [0, 60, 120, 180, 240, 300]
    .map((a) => `<ellipse cx="0" cy="-9" rx="4.2" ry="10" fill="url(#LEAF)" transform="rotate(${a})"/>`)
    .join("");
  return `<g transform="translate(${CX} ${CY})"><circle r="8" fill="#14110b" stroke="#d4af37" stroke-width="1"/>${leaves}<circle r="2.4" fill="#86efac"/></g>`;
}

function marbleVeins(cx, cy, w, h) {
  const x = cx - w / 2;
  const y = cy - h / 2;
  return `<g stroke="#ffffff" fill="none" stroke-linecap="round" opacity=".16">
<path d="M${r1(x + w * 0.08)} ${r1(y + h * 0.3)} Q${r1(x + w * 0.35)} ${r1(y + h * 0.1)} ${r1(x + w * 0.55)} ${r1(y + h * 0.42)} T${r1(x + w * 0.95)} ${r1(y + h * 0.35)}" stroke-width=".9"/>
<path d="M${r1(x + w * 0.2)} ${r1(y + h * 0.95)} Q${r1(x + w * 0.4)} ${r1(y + h * 0.62)} ${r1(x + w * 0.62)} ${r1(y + h * 0.78)} T${r1(x + w * 0.92)} ${r1(y + h * 0.68)}" stroke-width="1.2"/>
<path d="M${r1(x + w * 0.42)} ${r1(y + h * 0.05)} Q${r1(x + w * 0.5)} ${r1(y + h * 0.3)} ${r1(x + w * 0.36)} ${r1(y + h * 0.55)}" stroke-width=".7"/>
</g>`;
}

/**
 * opts: { uid, shape, seats, guests, phase, label }
 */
export function buildTableSvg({ uid = "t", shape = "round", seats = 4, guests = 0, phase = "available", label = "" }) {
  const n = Math.max(1, Math.min(Number(seats) || 4, 10));
  const geo = chairsFor(shape, n);
  const ph = PHASES[phase] || PHASES.available;
  const seated = ["occupied", "served", "bill"].includes(phase) ? seatedIndexes(Number(guests) || 0, geo.list.length) : [];
  const occupiedView = seated.length > 0;
  const id = (name) => `${name}-${uid}`;
  const fix = (s) => s.replace(/CHS/g, id("chs")).replace(/PLT/g, id("plt")).replace(/LEAF/g, id("leaf"));

  // table body, the extruded side (3D depth), the glowing ring
  let side;
  let top;
  let ring;
  let veins;
  let tcx = CX;
  let tcy = CY;
  if (shape === "round") {
    const rt = geo.rt;
    side = `<circle cx="${CX}" cy="${CY + 6}" r="${rt}" fill="#050506"/>`;
    top = `<circle cx="${CX}" cy="${CY}" r="${rt}" fill="url(#${id("mar")})" stroke="#d4af37" stroke-width="2.2"/><circle cx="${CX}" cy="${CY}" r="${rt - 5}" fill="none" stroke="#ffffff" stroke-opacity=".07" stroke-width="1"/>`;
    ring = (extra) => `<circle cx="${CX}" cy="${CY}" r="${rt + 7}" ${extra}/>`;
    veins = marbleVeins(CX, CY, rt * 1.5, rt * 1.5);
  } else if (shape === "square") {
    const h = geo.half;
    side = `<rect x="${CX - h}" y="${CY - h + 6}" width="${h * 2}" height="${h * 2}" rx="11" fill="#050506"/>`;
    top = `<rect x="${CX - h}" y="${CY - h}" width="${h * 2}" height="${h * 2}" rx="11" fill="url(#${id("mar")})" stroke="#d4af37" stroke-width="2.2"/>`;
    ring = (extra) => `<rect x="${CX - h - 7}" y="${CY - h - 7}" width="${h * 2 + 14}" height="${h * 2 + 14}" rx="17" ${extra}/>`;
    veins = marbleVeins(CX, CY, h * 2, h * 2);
  } else {
    const hw = geo.hw;
    const hh = geo.hh;
    side = `<rect x="${CX - hw}" y="${CY - hh + 6}" width="${hw * 2}" height="${hh * 2}" rx="10" fill="#050506"/>`;
    top = `<rect x="${CX - hw}" y="${CY - hh}" width="${hw * 2}" height="${hh * 2}" rx="10" fill="url(#${id("mar")})" stroke="#d4af37" stroke-width="2.2"/>`;
    ring = (extra) => `<rect x="${CX - hw - 7}" y="${CY - hh - 7}" width="${hw * 2 + 14}" height="${hh * 2 + 14}" rx="16" ${extra}/>`;
    veins = marbleVeins(CX, CY, hw * 2, hh * 2);
  }

  const dash = phase === "out_of_service" ? 'stroke-dasharray="7 6"' : "";
  const ringGlow = ring(`fill="none" stroke="${ph.ring}" stroke-width="7" opacity="${ph.ringOpacity * 0.85}" filter="url(#${id("blur")})" class="t3d-glow"`);
  const ringLine = ring(`fill="none" stroke="${ph.ring}" stroke-width="${phase === "available" ? 2.2 : 3.2}" opacity="${ph.ringOpacity}" ${dash}`);

  const chairs = geo.list.map(chairSvg).join("");

  // plates in front of each guest
  let plates = "";
  let people = "";
  seated.forEach((idx, k) => {
    const c = geo.list[idx];
    const px = c.x - c.ox * 30;
    const py = c.y - c.oy * 30;
    plates += plateSvg(px, py, k + idx);
    people += personSvg(c, (Number(uid.replace(/\D/g, "")) || 1) * 7 + idx * 3 + k);
  });

  // middle of the table: plant when nobody is sitting, number badge when occupied
  let centre;
  if (occupiedView) {
    centre = `<g transform="translate(${tcx} ${tcy})"><circle r="15" fill="#0b0b0d" stroke="#ffffff" stroke-width="2.4"/><circle r="15" fill="none" stroke="${ph.ring}" stroke-width="1.6" opacity=".9"/><text y="5.6" text-anchor="middle" font-family="Poppins,Arial,sans-serif" font-weight="800" font-size="${shortName(label).length > 2 ? 12 : 16}" fill="#ffffff">${esc(shortName(label))}</text></g>`;
  } else if (phase === "reserved" || phase === "cleaning" || phase === "out_of_service") {
    centre = `<g transform="translate(${tcx} ${tcy})"><circle r="15" fill="#0b0b0d" stroke="${ph.ring}" stroke-width="2"/><text y="5.6" text-anchor="middle" font-family="Poppins,Arial,sans-serif" font-weight="800" font-size="${shortName(label).length > 2 ? 12 : 16}" fill="#ffffff" opacity=".9">${esc(shortName(label))}</text></g>`;
  } else {
    centre = plantSvg();
  }

  // bill pending: small red receipt on the table edge
  const receipt = phase === "bill"
    ? `<g transform="translate(${CX + (shape === "round" ? geo.rt * 0.62 : shape === "square" ? geo.half * 0.62 : 52)} ${CY - (shape === "round" ? geo.rt * 0.62 : shape === "square" ? geo.half * 0.62 : 12)})"><rect x="-8" y="-10" width="16" height="20" rx="3" fill="#ef4444" stroke="#fff" stroke-width="1.6"/><path d="M-4 -4h8M-4 0h8M-4 4h5" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></g>`
    : "";

  return fix(`<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Table ${esc(label)}" class="t3d-svg">
<defs>
<radialGradient id="${id("mar")}" cx="38%" cy="32%" r="85%"><stop offset="0" stop-color="#5b5b63"/><stop offset=".45" stop-color="#2a2a30"/><stop offset="1" stop-color="#0d0d10"/></radialGradient>
<linearGradient id="${id("chs")}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#46464d"/><stop offset="1" stop-color="#0e0e10"/></linearGradient>
<radialGradient id="${id("plt")}" cx="40%" cy="35%" r="80%"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d8d8df"/></radialGradient>
<linearGradient id="${id("leaf")}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bbf7d0"/><stop offset="1" stop-color="#16a34a"/></linearGradient>
<filter id="${id("blur")}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5"/></filter>
<filter id="${id("sh")}" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="2" dy="7" stdDeviation="4.5" flood-color="#000" flood-opacity=".42"/></filter>
</defs>
${ringGlow}
<g filter="url(#${id("sh")})">${chairs}${side}</g>
${top}${veins}
${ringLine}
${centre}${plates}${receipt}${people}
</svg>`);
}

// Styles for the floor plan (injected by the Tables page)
export const T3D_CSS = `
.t3d-legend{display:flex;flex-wrap:wrap;align-items:center;gap:8px 18px;margin:0 0 12px;font-size:12.5px;font-weight:600;color:var(--tx2,#5b6b61)}
.t3d-legend span{display:inline-flex;align-items:center;gap:6px}
.t3d-legend i{width:11px;height:11px;border-radius:50%;background:currentColor;box-shadow:0 0 0 3px color-mix(in srgb,currentColor 22%,transparent)}
.t3d-floor{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:20px 12px;padding:20px 14px;border:1px solid var(--bd,#e1eae3);background:var(--w,#fff)}
.t3d{display:flex;flex-direction:column;align-items:center;gap:0;padding:4px 6px 10px;background:transparent;border:2px solid transparent;cursor:pointer;color:inherit;font:inherit;transition:transform .2s ease,background .2s;animation:t3d-in .45s ease both;animation-delay:calc(var(--i,0) * 35ms)}
.t3d:hover{transform:translateY(-5px)}
.t3d:hover .t3d-art{filter:drop-shadow(0 12px 14px rgba(0,0,0,.28))}
.t3d.on{border-color:var(--g,#15803d);background:rgba(21,128,61,.07)}
.t3d-art{display:block;width:100%;max-width:240px;transition:filter .2s}
.t3d-art svg{display:block;width:100%;height:auto;overflow:visible}
.t3d.out_of_service .t3d-art{filter:grayscale(.85) opacity(.7)}
.t3d.occupied .t3d-glow,.t3d.served .t3d-glow,.t3d.bill .t3d-glow{animation:t3d-glow 2.6s ease-in-out infinite}
.t3d-name{margin-top:-8px;padding:3px 18px;font-weight:800;font-size:15px;color:var(--tx,#17211b);background:#fff;box-shadow:0 3px 10px rgba(0,0,0,.12)}
.t3d-pill{display:inline-flex;align-items:center;gap:7px;margin-top:5px;padding:3px 12px;font-weight:700;font-size:12.5px;color:#15803d;background:#e8f7ec;box-shadow:0 2px 6px rgba(0,0,0,.06)}
.t3d-pill i{width:9px;height:9px;border-radius:50%;background:currentColor}
.t3d-pill.occupied{color:#1d4ed8;background:#e7eeff}
.t3d-pill.served{color:#c2680a;background:#fdf0dc}
.t3d-pill.bill{color:#c62828;background:#fde7e7}
.t3d-pill.reserved{color:#6d28d9;background:#f1eafe}
.t3d-pill.cleaning{color:#0f766e;background:#def7f3}
.t3d-pill.out_of_service{color:#4b5563;background:#eceef0}
.t3d-sub{margin-top:4px;min-height:17px;font-size:12px;font-weight:600;color:var(--tx2,#5b6b61);text-align:center}
.t3d-sub b{color:var(--tx,#17211b)}
@keyframes t3d-in{from{opacity:0;transform:translateY(14px) scale(.96)}to{opacity:1;transform:none}}
@keyframes t3d-glow{0%,100%{opacity:.9}50%{opacity:.3}}
@media (prefers-reduced-motion:reduce){.t3d,.t3d-glow{animation:none!important}}
.tables-page .tsum{grid-template-columns:repeat(auto-fit,minmax(118px,1fr))}
.tables-page .tsum-i.available{border-left-color:#22c55e}
.tables-page .tsum-i.occupied{border-left-color:#2563eb}
.tables-page .tsum-i.served{border-left-color:#f59e0b}
.tables-page .tsum-i.bill{border-left-color:#ef4444}
.tables-page .tsum-i.reserved{border-left-color:#8b5cf6}
.tables-page .tsum-i.cleaning{border-left-color:#14b8a6}
`;