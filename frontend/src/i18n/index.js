/* =====================================================================
   i18n engine  –  English / Hindi / Marathi
   - Language comes from Settings -> Theme & Appearance -> Language
   - Every visible text (text nodes, placeholder, title, aria-label) is
     translated automatically using i18n/translations.js
   - t("text") can be used in code too.
   ===================================================================== */
import D, { PATTERNS } from "./translations";

export const LANGS = [
  ["English", "English", "en"],
  ["Hindi", "हिन्दी", "hi"],
  ["Marathi", "मराठी", "mr"],
];
const IDX = { hi: 0, mr: 1 };

export const langCode = (v) => {
  const s = String(v || "").toLowerCase();
  if (s === "hi" || s === "hindi") return "hi";
  if (s === "mr" || s === "marathi") return "mr";
  return "en";
};

export function translate(text, lang) {
  if (lang === "en" || !text) return text;
  const i = IDX[lang];
  const trimmed = text.trim();
  if (!trimmed) return text;
  let out = null;
  const hit = D[trimmed];
  if (hit) out = hit[i];
  else {
    for (const [re, val] of PATTERNS) {
      if (re.test(trimmed)) { out = trimmed.replace(re, val[i]); break; }
    }
  }
  if (!out) {
    // "Label (12)", "Label:", "Label *", "Label…"
    const m = trimmed.match(/^(.*?)(\s*\(\d+\)|\s*[:*…]+|\s*\.\.\.)$/);
    if (m && D[m[1].trim()]) out = D[m[1].trim()][i] + m[2];
  }
  if (!out) return text;
  const lead = text.match(/^\s*/)[0];
  const trail = text.match(/\s*$/)[0];
  return lead + out + trail;
}

let current = "en";
export const t = (text) => translate(text, current);

/* ---------- DOM translator ---------- */
const ATTRS = ["placeholder", "title", "aria-label", "alt"];
const textOrig = new WeakMap();   // text node -> { en, shown }
const attrOrig = new WeakMap();   // element -> { attr: { en, shown } }
let observer = null;

function doText(node) {
  const rec = textOrig.get(node);
  let en;
  if (rec && node.data === rec.shown) en = rec.en;        // untouched by React
  else en = node.data;                                      // new / React updated
  const shown = translate(en, current);
  if (shown !== en || rec) textOrig.set(node, { en, shown });
  if (node.data !== shown) node.data = shown;
}
function doAttrs(el) {
  let rec = attrOrig.get(el);
  for (const a of ATTRS) {
    if (!el.hasAttribute || !el.hasAttribute(a)) continue;
    const cur = el.getAttribute(a);
    const r = rec && rec[a];
    const en = r && cur === r.shown ? r.en : cur;
    const shown = translate(en, current);
    if (shown !== en || r) {
      if (!rec) { rec = {}; attrOrig.set(el, rec); }
      rec[a] = { en, shown };
    }
    if (cur !== shown) el.setAttribute(a, shown);
  }
}
function walk(root) {
  if (root.nodeType === 3) { doText(root); return; }
  if (root.nodeType !== 1) return;
  const tag = root.tagName;
  if (tag === "SCRIPT" || tag === "STYLE" || tag === "TEXTAREA" || root.hasAttribute("data-no-i18n")) return;
  doAttrs(root);
  for (let c = root.firstChild; c; c = c.nextSibling) walk(c);
}
function onMutations(list) {
  for (const m of list) {
    if (m.type === "characterData") doText(m.target);
    else if (m.type === "attributes") doAttrs(m.target);
    else m.addedNodes.forEach(walk);
  }
}

export function setLanguage(value) {
  const lang = langCode(value);
  current = lang;
  document.documentElement.lang = lang;
  try { localStorage.setItem("bb_lang", lang); } catch { /* optional */ }
  if (!observer) {
    observer = new MutationObserver(onMutations);
  }
  observer.disconnect();
  walk(document.body);
  observer.observe(document.body, {
    subtree: true, childList: true, characterData: true,
    attributes: true, attributeFilter: ATTRS,
  });
}

export const savedLang = () => { try { return localStorage.getItem("bb_lang") || "en"; } catch { return "en"; } };
