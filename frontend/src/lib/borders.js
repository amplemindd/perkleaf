// Appearance colours (border + icon) for Settings → Theme & Appearance.
// All CSS is injected from here, so global.css does NOT need any change.
export const COLOR_CHOICES = [
  { value: "default", label: "Default (Green)", hex: "" },
  { value: "red", label: "Red", hex: "#dc2626" },
  { value: "blue", label: "Blue", hex: "#2563eb" },
  { value: "purple", label: "Purple", hex: "#7c3aed" },
  { value: "pink", label: "Pink", hex: "#db2777" },
  { value: "orange", label: "Orange", hex: "#ea580c" },
  { value: "yellow", label: "Yellow", hex: "#ca8a04" },
  { value: "teal", label: "Teal", hex: "#0d9488" },
  { value: "gray", label: "Gray", hex: "#6b7280" },
  { value: "black", label: "Black", hex: "#111827" },
];
export const BORDER_COLORS = COLOR_CHOICES;

const KEYS = { border_color: "bb_border", icon_color: "bb_icon" };

// The server may not store these keys, so we also keep them in this browser.
export function localGet(key) {
  try { return localStorage.getItem(KEYS[key]) || ""; } catch { return ""; }
}
export function localSet(key, value) {
  try { localStorage.setItem(KEYS[key], value || "default"); } catch { /* storage optional */ }
}
export function effective(settings, key) {
  return (settings && settings[key]) || localGet(key) || "default";
}
const hexOf = (v) => (COLOR_CHOICES.find((c) => c.value === v) || {}).hex || "";
const isDark = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 < 0.2;
};

/* ---------- static styles for the colour dots in Settings ---------- */
const STATIC_CSS = `
.border-swatches{margin-top:14px}
.bsw-row{display:flex;flex-wrap:wrap;gap:10px;margin-top:8px}
.bsw{width:30px;height:30px;border-radius:50%;background:var(--sw);border:3px solid #fff;box-shadow:0 0 0 1px #9ca3af;cursor:pointer;padding:0;transition:transform .15s,box-shadow .15s}
.bsw:hover{transform:scale(1.12)}
.bsw.on{box-shadow:0 0 0 3px var(--sw);transform:scale(1.12)}
/* Settings tabs: box grows with its text instead of the text spilling outside */
.app .page .stabs .stab{flex:0 0 auto!important;width:max-content!important;padding-left:14px!important;padding-right:14px!important}
`;

function styleTag(id) {
  let el = document.getElementById(id);
  if (!el) { el = document.createElement("style"); el.id = id; document.head.appendChild(el); }
  return el;
}

function borderCss(c) {
  // every border in the app, except status/accent bits that must keep their own colour
  const skip = ":not(svg):not(svg *):not(.spin):not(.toast):not(.side):not(.side *):not(.btn.pri):not(.btn.dng):not(.badge):not(.bdg):not(.nbdg):not(.stab.on)";
  return `
body *${skip}{border-color:${c}!important}
.stabs{border-bottom-color:${c}!important}
.stab.on{background:${c}!important;border-color:${c}!important;color:#fff!important}
`;
}

const rep = (sel, n) => sel.repeat(n);

function iconCss(c) {
  // the app already has many high-specificity colour rules on icons, so these selectors are
  // deliberately boosted (repeated classes) to win over them
  const I = rep(".ic", 7);
  // dark icon colours would vanish on the dark-green sidebar, so skip it for those
  const sideSkip = isDark(c) ? ":not(.side .ic)" : "";
  const filled = [".btn.pri", ".btn.dng", ".stab.on", ".ncard.on", ".tab.on", ".chip.on", ".pill.on", ".toast"];
  const white = filled.map((f) => `html body ${rep(f, 4)} ${rep(".ic", 8)}`).concat(
    [".stab.on", ".ncard.on"].map((f) => `html body ${rep(f, 4)} svg`),
    [`html body ${rep(".seg", 4)} button.on ${rep(".ic", 8)}`],
    [`html body ${rep(".ph", 4)} > ${rep(".btn", 4)} ${rep(".ic", 8)}`]
  );
  return `
html body ${I}${sideSkip},html body ${rep(".stab", 6)} svg,html body ${rep(".hbtn", 6)} svg{color:${c}!important}
${white.join(",")}{color:#fff!important}
`;
}

export function applyAppearance(settings) {
  const b = hexOf(effective(settings, "border_color"));
  const i = hexOf(effective(settings, "icon_color"));
  styleTag("bb-appearance-static").textContent = STATIC_CSS;
  styleTag("bb-appearance").textContent = (b ? borderCss(b) : "") + (i ? iconCss(i) : "");
}