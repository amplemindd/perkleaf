import React, { useEffect, useState } from "react";
import Icon from "./Icons";
import { ago, img, money, toDate } from "../../lib/api";

/* Shared building blocks for the customer QR page */

export const REQUESTS = [
  { key: "water", label: "Water", hint: "Glass of water", icon: "water" },
  { key: "cutlery", label: "Cutlery", hint: "Fork, spoon, knife", icon: "utensils" },
  { key: "tissues", label: "Tissues", hint: "Napkins / tissues", icon: "tissue" },
  { key: "other", label: "Other", hint: "Something else", icon: "chat" },
];

export const OPEN_STATUSES = ["pending", "preparing", "ready"];
export const STATUS_LABEL = {
  pending: "Pending",
  preparing: "Preparing",
  ready: "Ready",
  served: "Served",
  bill_pending: "Served",
  completed: "Completed",
  cancelled: "Cancelled",
};
const TRACK_TITLE = {
  pending: "Waiting to be accepted",
  preparing: "Order accepted",
  ready: "Order is ready",
  served: "Served",
  bill_pending: "Served",
};
const TRACK_NOTE = {
  preparing: "Your order was accepted. Please wait for it to be served.",
  ready: "Your order is ready and will reach your table shortly.",
};
const STEPS = ["Order placed", "Preparing", "Ready", "Served"];
const STEP_INDEX = { pending: 0, preparing: 1, ready: 2, served: 3, bill_pending: 3, completed: 3 };

export function fmtWhen(s) {
  if (!s) return "";
  const d = toDate(s);
  if (Number.isNaN(d.getTime())) return "";
  const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return `Today, ${time}`;
  if (d.toDateString() === yest.toDateString()) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}, ${time}`;
}

export const billNo = (o) => String(o?.bill_no || "").replace(/^#/, "");
export const countItems = (o) => (o?.items || []).reduce((n, i) => n + (Number(i.qty) || 0), 0);

// Picture with automatic fallback when the image is missing / fails to load
export function Pic({ src, alt = "", className, fallback }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) return fallback || null;
  return <img className={className} src={img(src)} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
}

// Food-safety mark (veg / non-veg / egg)
export function VegMark({ type }) {
  const t = type === "nonveg" ? "nonveg" : type === "egg" ? "egg" : "veg";
  const label = t === "nonveg" ? "Non-veg" : t === "egg" ? "Egg" : "Veg";
  return (
    <span className={`cx-veg ${t}`} role="img" aria-label={label} title={label}>
      <i />
    </span>
  );
}

export function Stepper({ qty, onChange, small }) {
  return (
    <div className={`cx-qty ${small ? "sm" : ""}`}>
      <button aria-label="Decrease quantity" onClick={() => onChange(qty - 1)}>
        <Icon n="minus" size={16} stroke={2.2} />
      </button>
      <b>{qty}</b>
      <button aria-label="Increase quantity" onClick={() => onChange(qty + 1)}>
        <Icon n="plus" size={16} stroke={2.2} />
      </button>
    </div>
  );
}

// Menu item card (2 per row). Name sits inside the picture.
export function ItemCard({ p, qty, onChange, fav, onFav }) {
  return (
    <article className="cx-card">
      <div className="cx-card-img">
        <Pic
          src={p.image_url}
          alt=""
          fallback={
            <span className="cx-card-noimg">
              <Icon n="coffee" size={34} stroke={1.5} />
            </span>
          }
        />
        <button className="cx-fav" aria-label={fav ? `Remove ${p.name} from favorites` : `Save ${p.name} to favorites`} aria-pressed={fav} onClick={() => onFav(p.id)}>
          <Icon n="heart" size={20} fill={fav} />
        </button>
        {p.tag && <span className="cx-tag">{String(p.tag)}</span>}
        <div className="cx-ov-name">
          <b>{p.name}</b>
        </div>
      </div>
      <div className="cx-card-b">
        {p.description && <p>{p.description}</p>}
        <div className="cx-card-f">
          <span className="cx-price">
            <VegMark type={p.item_type} />
            <strong>{money(p.price)}</strong>
          </span>
          {qty ? (
            <Stepper qty={qty} onChange={(q) => onChange(p.id, q)} small />
          ) : (
            <button className="cx-add" aria-label={`Add ${p.name}`} onClick={() => onChange(p.id, 1)}>
              Add <Icon n="plus" size={14} stroke={2.4} />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

// Category tile (3 per row). Name and item count sit inside the picture.
export function CatTile({ cat, onOpen }) {
  const n = cat.items.length;
  return (
    <button className="cx-cat" onClick={() => onOpen(cat.id)} aria-label={`${cat.name}, ${n} ${n === 1 ? "item" : "items"}`}>
      <Pic
        src={cat.cover}
        className="cx-cat-img"
        fallback={
          <span className="cx-cat-ph">
            <Icon n="coffee" size={34} stroke={1.5} />
          </span>
        }
      />
      <span className="cx-ov-name">
        <b>{cat.name}</b>
        <small>
          {n} {n === 1 ? "item" : "items"}
        </small>
      </span>
    </button>
  );
}

// Green top header: brand + bell + headset, then either the table row (home) or a page title
export function Header({ data, home, title, sub, right, bell, onHelp, onGuests }) {
  const waiting = bell.left > 0;
  return (
    <header className="cx-hd">
      <div className="cx-hd-top">
        <div className="cx-brand">
          {data.logo_url && <img className="cx-logo" src={img(data.logo_url)} alt="" />}
          <div>
            <h1>{data.restaurant}</h1>
            {data.show_tagline !== false && <small>{data.tagline || "Cafe & Restaurant"}</small>}
          </div>
        </div>
        <div className="cx-hd-act">
          <button
            className={`cx-ibtn cx-bell ${bell.ringing ? "ringing" : ""} ${waiting ? "waiting" : ""}`}
            onClick={bell.onPress}
            disabled={bell.busy || waiting}
            aria-label={waiting ? `Call again in ${bell.left} seconds` : "Call staff"}
          >
            <Icon n="bell" size={24} />
            {waiting && <em>{bell.left}s</em>}
          </button>
          <button className="cx-ibtn" onClick={onHelp} aria-label="Help and requests">
            <Icon n="headset" size={24} />
          </button>
        </div>
      </div>

      {home ? (
        <div className="cx-hd-table">
          <span className="cx-tablepill">
            <Icon n="table" size={18} /> Table {data.table.name}
          </span>
          {data.party && (
            <button className="cx-guests-btn" onClick={onGuests}>
              <Icon n="users" size={18} />
              <span>
                {data.party.guests} {data.party.guests === 1 ? "Guest" : "Guests"}
              </span>
              <u>Change</u>
            </button>
          )}
        </div>
      ) : (
        <div className="cx-hd-title">
          <div>
            <h2>{title}</h2>
            {sub && <p>{sub}</p>}
          </div>
          {right}
        </div>
      )}
    </header>
  );
}

const NAV = [
  ["home", "Home", "home"],
  ["menu", "Menu", "grid"],
  ["orders", "My Order", "bag"],
  ["account", "Account", "user"],
];

export function BottomNav({ tab, onTab, live }) {
  return (
    <nav className="cx-nav" aria-label="Main">
      {NAV.map(([key, label, icon]) => (
        <button key={key} className={tab === key ? "on" : ""} aria-current={tab === key ? "page" : undefined} onClick={() => onTab(key)}>
          <span className="cx-nav-ic">
            <Icon n={icon} size={24} stroke={tab === key ? 2.1 : 1.8} />
            {key === "orders" && live && <i aria-hidden="true" />}
          </span>
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

// Bottom sheet
export function Sheet({ title, sub, onClose, children }) {
  return (
    <div className="cx-ov" onClick={onClose}>
      <section className="cx-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="cx-sheet-h">
          <div>
            <h2>{title}</h2>
            {sub && <p>{sub}</p>}
          </div>
          <button className="cx-xbtn" aria-label="Close" onClick={onClose}>
            <Icon n="x" size={22} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

// "Need anything else?" quick requests + Call staff
export function NeedAnything({ picked, onToggle, otherText, onOtherText, left, busy, onCall, bare }) {
  const waiting = left > 0;
  return (
    <section className={bare ? "cx-need bare" : "cx-need"}>
      {!bare && (
        <div className="cx-sec-h">
          <h3>Need anything else?</h3>
          <span>Tap to select</span>
        </div>
      )}
      <div className="cx-need-grid">
        {REQUESTS.map((o) => {
          const on = picked.includes(o.key);
          return (
            <button key={o.key} type="button" className={`cx-tile ${on ? "on" : ""}`} aria-pressed={on} title={o.hint} onClick={() => onToggle(o.key)}>
              <Icon n={o.icon} size={24} stroke={1.6} />
              <b>{o.label}</b>
              {on && (
                <span className="cx-tick" aria-hidden="true">
                  <Icon n="check" size={13} stroke={3} />
                </span>
              )}
            </button>
          );
        })}
      </div>
      {picked.includes("other") && (
        <input className="cx-input" type="text" maxLength={80} placeholder="Tell us what you need..." value={otherText} onChange={(e) => onOtherText(e.target.value)} />
      )}
      <button type="button" className="cx-primary" onClick={onCall} disabled={busy || waiting}>
        <Icon n="headset" size={20} />
        {waiting ? `Call again in ${left}s` : picked.length ? `Call staff (${picked.length} selected)` : "Call staff"}
      </button>
    </section>
  );
}

// Home status card
export function OrderStatusCard({ track, onOpen, onRate, onDismiss }) {
  if (track.status === "cancelled") {
    return (
      <section className="cx-status bad">
        <Icon n="alert" size={26} />
        <div>
          <b>Order #{billNo(track)} cancelled</b>
          <p>{track.cancel_reason ? `Reason: ${track.cancel_reason}` : "Please ask our staff if you need any help."}</p>
        </div>
        {onDismiss && (
          <button className="cx-xbtn corner" aria-label="Dismiss" onClick={onDismiss}>
            <Icon n="x" size={18} />
          </button>
        )}
      </section>
    );
  }
  const st = STEP_INDEX[track.status] ?? 0;
  const served = st === 3;
  const icon = served ? "cloche" : track.status === "pending" ? "clock" : track.status === "ready" ? "bell" : "chef";
  return (
    <section className={`cx-status s${st}`} aria-live="polite">
      <div className="cx-status-main">
        <Icon n={icon} size={30} stroke={1.6} />
        <div>
          <small>
            Order #{billNo(track)}
            {track.created_at ? ` · ${ago(track.created_at)}` : ""}
          </small>
          <h3>{TRACK_TITLE[track.status] || "Order placed"}</h3>
          {TRACK_NOTE[track.status] && <p>{TRACK_NOTE[track.status]}</p>}
        </div>
      </div>
      <ol className="cx-bars" aria-label="Order progress">
        {STEPS.map((s, i) => (
          <li key={s} className={i <= st ? "on" : ""}>
            <span />
            <small>{s}</small>
          </li>
        ))}
      </ol>
      <div className="cx-status-foot">
        <button onClick={onOpen}>
          <b>
            <Icon n="bag" size={18} /> {countItems(track)} {countItems(track) === 1 ? "item" : "items"} · {money(track.total)}
          </b>
          <span>
            View details <Icon n="chevr" size={16} />
          </span>
        </button>
        {served && onRate && (
          <button className="cx-textbtn" onClick={onRate}>
            <Icon n="star" size={16} /> Rate visit
          </button>
        )}
      </div>
      {served && onDismiss && (
        <button className="cx-xbtn corner" aria-label="Dismiss" onClick={onDismiss}>
          <Icon n="x" size={18} />
        </button>
      )}
    </section>
  );
}

// Step timeline on the order details page
export function Timeline({ status, created }) {
  const st = STEP_INDEX[status] ?? 0;
  return (
    <ol className="cx-tl">
      {STEPS.map((s, i) => (
        <li key={s} className={i < st ? "done" : i === st ? "now" : ""}>
          <span className="cx-tl-dot">{i <= st && <Icon n="check" size={14} stroke={3} />}</span>
          <b>{s}</b>
          <small>{i === 0 && created ? new Date(toDate(created)).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }) : i <= st ? "Done" : "Waiting"}</small>
        </li>
      ))}
    </ol>
  );
}

// One order in "My Orders"
export function OrderCard({ o, status, live, onOpen }) {
  const n = countItems(o);
  return (
    <button className={`cx-order ${live ? "live" : ""}`} onClick={onOpen}>
      <div className="cx-order-top">
        {live ? (
          <span className="cx-live">
            <i /> Live
          </span>
        ) : (
          <span />
        )}
        <span className={`cx-badge ${status}`}>{STATUS_LABEL[status]}</span>
      </div>
      <div className="cx-order-b">
        <div>
          <b>Order #{billNo(o)}</b>
          <p>
            {n} {n === 1 ? "item" : "items"} · {money(o.total)}
          </p>
          <small>{fmtWhen(o.created_at)}</small>
        </div>
        <Icon n="chevr" size={22} />
      </div>
    </button>
  );
}