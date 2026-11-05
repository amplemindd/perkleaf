import Icon from "./icons";
import React, { useEffect, useRef, useState } from "react";
import { cap, preset } from "./api";

export const Modal = ({ title, onClose, children, footer, wide }) => (
  <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose && onClose()}>
    <div className={`modal ${wide ? "wide" : ""}`}>
      <div className="modal-h"><h3>{title}</h3>{onClose && <button className="x" onClick={onClose} aria-label="Close"><Icon n="x" /></button>}</div>
      <div className="modal-b">{children}</div>
      {footer && <div className="modal-f">{footer}</div>}
    </div>
  </div>
);
export const Panel = ({ title, right, children, className = "", pad = true }) => (
  <section className={`card ${className}`}>
    {(title || right) && <div className="card-h"><h3>{title}</h3><div className="card-r">{right}</div></div>}
    <div className={pad ? "card-b" : ""}>{children}</div>
  </section>
);
const KIND = { paid: "green", completed: "green", available: "green", active: "green", success: "green", ready: "blue", preparing: "blue", info: "blue", pending: "amber", unpaid: "amber", warning: "amber", high: "amber",
  occupied: "red", cancelled: "red", refunded: "red", critical: "red", urgent: "red", inactive: "red", reserved: "amber", cleaning: "blue", out_of_service: "gray", normal: "gray" };
export const Badge = ({ v, kind, children }) => <span className={`badge ${kind || KIND[String(v).toLowerCase()] || "gray"}`}>{children ?? cap(v)}</span>;
function useCountUp(value) {
  const [out, setOut] = useState(value);
  useEffect(() => {
    const m = /^([^\d-]*)([\d,]+)(\.\d+)?(.*)$/.exec(String(value));
    if (!m) { setOut(value); return; }
    const end = Number(m[2].replace(/,/g, "")), t0 = performance.now();
    if (!end || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setOut(value); return; }
    let raf; const tick = (t) => { const p = Math.min((t - t0) / 700, 1), v = Math.round(end * (1 - Math.pow(1 - p, 3))); setOut(p < 1 ? m[1] + v.toLocaleString("en-IN") + m[4] : value); if (p < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [value]);
  return out;
}
export const Stat = ({ icon, label, value, delta, sub, tone = "green" }) => { const v = useCountUp(value); return (
  <div className={`kpi t-${tone}`}>
    <div className="kpi-i"><Icon n={icon} size={22} /></div>
    <div className="kpi-t"><small>{label}</small><b>{v}</b>
      {(delta !== undefined || sub) && <span className="kpi-d">{delta !== undefined && <i className={delta >= 0 ? "up" : "dn"}><Icon n={delta >= 0 ? "up" : "down"} size={11} /> {Math.abs(Math.round(delta))}%</i>} {sub}</span>}
    </div>
  </div>
); };
export const Pager = ({ page, total, limit, onPage, label = "records" }) => {
  const pages = Math.max(Math.ceil(total / limit), 1);
  const list = [];
  for (let i = 1; i <= pages; i++) if (i === 1 || i === pages || Math.abs(i - page) <= 1) list.push(i); else if (list[list.length - 1] !== "…") list.push("…");
  return (
    <div className="pager">
      <span className="muted">{total ? `Showing ${(page - 1) * limit + 1} to ${Math.min(page * limit, total)} of ${total} ${label}` : `No ${label}`}</span>
      <div className="pg">
        <button disabled={page <= 1} onClick={() => onPage(page - 1)}>‹</button>
        {list.map((p, i) => (p === "…" ? <span key={i + "e"}>…</span> : <button key={p} className={p === page ? "on" : ""} onClick={() => onPage(p)}>{p}</button>))}
        <button disabled={page >= pages} onClick={() => onPage(page + 1)}>›</button>
      </div>
    </div>
  );
};
export const Toggle = ({ checked, onChange, label, disabled }) => (
  <label className={`tgl ${disabled ? "dis" : ""}`}><input type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} /><span className="sw" />{label && <span>{label}</span>}</label>
);
export const Field = ({ label, req, children, hint }) => <label className="fld"><span>{label}{req && <em> *</em>}</span>{children}{hint && <small className="muted">{hint}</small>}</label>;
export const Empty = ({ icon = "leaf", text = "Nothing to show yet." }) => <div className="empty"><div className="empty-i"><Icon n={icon} size={34} /></div><p>{text}</p></div>;
export const Loading = ({ text = "Loading…" }) => <div className="empty"><div className="spin" /><p>{text}</p></div>;
export const ErrorBox = ({ msg, retry }) => <div className="errbox"><Icon n="alert" /> {msg}{retry && <button className="btn sm" onClick={retry}>Retry</button>}</div>;
export const Tabs = ({ items, value, onChange }) => (
  <div className="tabs">{items.map(([k, label, n]) => <button key={k} className={value === k ? "tab on" : "tab"} onClick={() => onChange(k)}>{label}{n !== undefined && <i>{n}</i>}</button>)}</div>
);
export const Avatar = ({ name, size = 34 }) => {
  const ini = String(name || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.4 }}>{ini}</span>;
};
export const RangePicker = ({ from, to, onChange, presets = true, initial = "" }) => {
  const [active, setActive] = useState(initial);
  const set = (n) => { setActive(n); onChange(preset(n)); };
  return (
    <div className="range">
      {presets && ["today", "week", "month"].map((n) => <button key={n} className={`btn sm ${active === n ? "pri" : ""}`} onClick={() => set(n)}>{n === "today" ? "Today" : n === "week" ? "This Week" : "This Month"}</button>)}
      <input type="date" value={from} max={to} onChange={(e) => { setActive("custom"); onChange({ from: e.target.value, to }); }} />
      <span className="muted">to</span>
      <input type="date" value={to} min={from} onChange={(e) => { setActive("custom"); onChange({ from, to: e.target.value }); }} />
    </div>
  );
};
export const ImagePick = ({ value, onChange, label = "Upload Image (optional)" }) => {
  const ref = useRef();
  const [drag, setDrag] = useState(false);
  const pick = (file) => {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) return alert("Please choose a JPG, PNG or WebP image.");
    if (file.size > 2 * 1024 * 1024) return alert("Image must be 2 MB or smaller.");
    const r = new FileReader(); r.onload = () => onChange(r.result); r.readAsDataURL(file);
  };
  return (
    <div className={`drop ${drag ? "drag" : ""}`} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }} onClick={() => !value && ref.current.click()}>
      <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => pick(e.target.files[0])} />
      {value ? (
        <div className="drop-prev"><img src={value} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} /><div><button type="button" className="btn sm" onClick={(e) => { e.stopPropagation(); ref.current.click(); }}>Change</button>{" "}
          <button type="button" className="btn sm dng" onClick={(e) => { e.stopPropagation(); onChange(""); }}>Remove</button></div></div>
      ) : (<><div className="drop-i"><Icon n="image" /></div><b>{label}</b><small>Click to upload or drag &amp; drop · JPG, PNG, WebP (max 2 MB)</small></>)}
    </div>
  );
};
export function useClickAway(cb) {
  const ref = useRef();
  useEffect(() => { const f = (e) => ref.current && !ref.current.contains(e.target) && cb(); document.addEventListener("mousedown", f); return () => document.removeEventListener("mousedown", f); }, [cb]);
  return ref;
}
export const Menu = ({ items }) => {
  const [pos, setPos] = useState(null);
  const btn = useRef();
  const ref = useClickAway(() => setPos(null));
  const list = items.filter(Boolean);
  const toggle = () => {
    if (pos) return setPos(null);
    const r = btn.current.getBoundingClientRect(), h = list.length * 40 + 12, up = r.bottom + h > window.innerHeight;
    setPos({ right: Math.max(window.innerWidth - r.right, 8), top: up ? Math.max(r.top - h - 4, 8) : r.bottom + 4 });
  };
  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    window.addEventListener("scroll", close, true); window.addEventListener("resize", close);
    return () => { window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); };
  }, [pos]);
  return (
    <div className="dots" ref={ref}>
      <button ref={btn} className="btn sm ico" onClick={toggle} aria-label="Actions"><Icon n="dots" /></button>
      {pos && <div className="menu" style={{ position: "fixed", top: pos.top, right: pos.right }}>{list.map(([label, fn, danger]) => <button key={label} className={danger ? "dng" : ""} onClick={() => { setPos(null); fn(); }}>{label}</button>)}</div>}
    </div>
  );
};
export const SafeImg = ({ src, fallback = "coffee", size = 24, alt = "", ...rest }) => {
  const [bad, setBad] = useState(false);
  useEffect(() => setBad(false), [src]);
  return !src || bad ? <Icon n={fallback} size={size} /> : <img src={src} alt={alt} onError={() => setBad(true)} {...rest} />;
};
export const Chip = ({ on, onClick, children }) => <button className={`chip ${on ? "on" : ""}`} onClick={onClick}>{children}</button>;
