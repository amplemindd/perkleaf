import React, { useEffect, useMemo, useRef, useState } from "react";
import Icon from "../lib/icons";
import { API_URL, img, money } from "../lib/api";

/* ------------------------------------------------------------------ */
/*  Customer QR ordering page                                          */
/*  Flow: all categories (with pictures)  ->  tap one  ->  its items   */
/* ------------------------------------------------------------------ */

const CALL_COOLDOWN_SEC = 15; // customer can ring the bell once every 15 seconds
const RING_ANIMATION_MS = 3000; // bell keeps ringing for 3 seconds
const STATUS_POLL_MS = 8000; // order tracker refreshes every 8 seconds

// "Need anything?" quick requests (key is sent to the server)
const svg = (children) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
const REQUEST_OPTIONS = [
  {
    key: "water",
    label: "Water",
    hint: "Glass of water",
    tone: "blue",
    icon: svg(<path d="M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11z" />),
  },
  {
    key: "cutlery",
    label: "Cutlery",
    hint: "Fork, spoon, knife",
    tone: "amber",
    icon: svg(
      <>
        <path d="M3 2v7a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V2" />
        <path d="M7 2v20" />
        <path d="M21 15V2a5 5 0 0 0-5 5v6a2 2 0 0 0 2 2h3zm0 0v7" />
      </>,
    ),
  },
  {
    key: "tissues",
    label: "Tissues",
    hint: "Napkins / tissues",
    tone: "teal",
    // tissue box with a tissue popping out
    icon: svg(
      <>
        <path d="M4 12h16v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
        <path d="M8 12c-.3-3 1-6 4-8 3 2 4.3 5 4 8" />
        <path d="M9.5 16.5h5" />
      </>,
    ),
  },
  {
    key: "other",
    label: "Other",
    hint: "Something else",
    tone: "violet",
    icon: svg(
      <>
        <path d="M21 12a8 8 0 0 1-11.5 7.2L4 20.5l1.3-4.4A8 8 0 1 1 21 12z" />
        <path d="M8.5 12h.01M12 12h.01M15.5 12h.01" strokeWidth="2.6" />
      </>,
    ),
  },
];

// order status (from the cashier screen) -> what the customer sees
const TRACK_STEPS = [
  { key: "pending", label: "Order received" },
  { key: "preparing", label: "In the kitchen" },
  { key: "ready", label: "Ready to serve" },
];
const TRACK_TITLE = { pending: "Order received", preparing: "Preparing", ready: "Ready to serve" };
const TRACK_PERCENT = { pending: 25, preparing: 60, ready: 100 };

// ---------- API ----------
async function request(path, options = {}) {
  const res = await fetch(API_URL + path, {
    method: options.method || "GET",
    headers: options.body ? { "Content-Type": "application/json" } : {},
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || data.success === false) {
    throw new Error(data.message || "Request failed.");
  }

  return data;
}

// ---------- small helpers ----------
const readNumber = (key) => {
  try {
    return Number(localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
};
const writeNumber = (key, value) => {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* storage is optional */
  }
};

// colours for categories that have no picture
const TILE_COLORS = [
  ["#14532d", "#2f8f55"],
  ["#9a3412", "#ea7a2b"],
  ["#1e3a8a", "#4f7be0"],
  ["#6b21a8", "#a65bd6"],
  ["#9f1239", "#e0587a"],
  ["#0f766e", "#33b3a6"],
];

// Picture with automatic fallback when the image is missing / fails to load
function Pic({ src, alt, className, fallback }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) return fallback || null;

  return (
    <img
      className={className}
      src={img(src)}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

// One food item row (used in category view and search results)
function ItemRow({ p, qty, onChange }) {
  return (
    <article className="cx-item">
      <Pic
        src={p.image_url}
        alt={p.name}
        className="cx-item-img"
        fallback={
          <div className="cx-item-img cx-item-noimg">
            <Icon n="utensils" size={28} />
          </div>
        }
      />

      <div className="cx-item-info">
        <b>{p.name}</b>
        {p.description && <p>{p.description}</p>}
        <strong>{money(p.price)}</strong>
      </div>

      <div className="cx-item-act">
        {qty ? (
          <div className="cx-qty">
            <button aria-label="Decrease quantity" onClick={() => onChange(p.id, qty - 1)}>
              <Icon n="minus" size={16} />
            </button>
            <b>{qty}</b>
            <button aria-label="Increase quantity" onClick={() => onChange(p.id, qty + 1)}>
              <Icon n="plus" size={16} />
            </button>
          </div>
        ) : (
          <button className="cx-add" onClick={() => onChange(p.id, 1)}>
            ADD
          </button>
        )}
      </div>
    </article>
  );
}

// Call-cashier bell: icon only, without background, border or label
function Bell({ left, ringing, busy, onPress, compact }) {
  const waiting = left > 0;

  return (
    <button
      className={`cx-bell ${compact ? "compact" : ""} ${ringing ? "ringing" : ""} ${waiting ? "waiting" : ""}`}
      onClick={onPress}
      disabled={busy || waiting}
      aria-label={waiting ? `Call again in ${left} seconds` : "Call cashier"}
      title={waiting ? `Call again in ${left} seconds` : "Call cashier"}
    >
      <span className="cx-bell-ic">
        <Icon n="bell" size={compact ? 25 : 28} />
      </span>
      <span className="cx-bell-label">{waiting ? `${left}s` : "Call staff"}</span>
    </button>
  );
}

// Live order tracker: Order received -> In the kitchen -> Ready to serve
function OrderTracker({ track }) {
  const status = TRACK_STEPS.some((s) => s.key === track.status) ? track.status : "pending";
  const at = TRACK_STEPS.findIndex((s) => s.key === status);

  return (
    <section className="cx-track" aria-live="polite">
      <small className="cx-track-no">ORDER #{String(track.bill_no || "").replace(/^#/, "")}</small>
      <h2>{TRACK_TITLE[status]}</h2>

      <div className="cx-track-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={TRACK_PERCENT[status]}>
        <span style={{ width: `${TRACK_PERCENT[status]}%` }} />
      </div>

      <ul className="cx-steps">
        {TRACK_STEPS.map((step, i) => {
          const state = i < at || status === "ready" ? "done" : i === at ? "now" : "todo";
          return (
            <li key={step.key} className={state}>
              <i>{state === "done" ? <Icon n="check" size={12} /> : null}</i>
              {step.label}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// "Need anything?" quick requests + Call staff button
function NeedAnything({ picked, onToggle, otherText, onOtherText, left, busy, onCall }) {
  const waiting = left > 0;

  return (
    <section className="cx-need">
      <div className="cx-need-head">
        <span className="cx-need-bell">
          <Icon n="bell" size={20} />
        </span>
        <div>
          <h3>Need anything?</h3>
          <p>Choose what you need, then tap Call staff.</p>
        </div>
      </div>

      <div className="cx-need-grid">
        {REQUEST_OPTIONS.map((o) => {
          const on = picked.includes(o.key);
          return (
            <button
              key={o.key}
              type="button"
              className={`cx-need-btn tone-${o.tone} ${on ? "on" : ""}`}
              aria-pressed={on}
              onClick={() => onToggle(o.key)}
            >
              <span className="cx-need-ic">{o.icon}</span>
              <span className="cx-need-tx">
                <b>{o.label}</b>
                <small>{o.hint}</small>
              </span>
              <span className="cx-need-tick" aria-hidden="true">
                <Icon n="check" size={12} />
              </span>
            </button>
          );
        })}
      </div>

      {picked.includes("other") && (
        <input
          className="cx-need-other"
          type="text"
          maxLength={80}
          placeholder="Tell us what you need..."
          value={otherText}
          onChange={(e) => onOtherText(e.target.value)}
        />
      )}

      <button type="button" className="cx-callstaff" onClick={onCall} disabled={busy || waiting}>
        <Icon n="bell" size={20} />
        <span>
          {waiting
            ? `Call again in ${left}s`
            : picked.length
              ? `Call staff · ${picked.length} selected`
              : "Call staff"}
        </span>
      </button>
    </section>
  );
}

// ---------- main page ----------
export default function CustomerOrder({ token }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const [activeCat, setActiveCat] = useState(null); // null = category home
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState({});

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [order, setOrder] = useState(null);
  const [showCheckout, setShowCheckout] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [note, setNote] = useState("");

  // bell state
  const bellKey = `bb_call_until_${token}`;
  const [bellBusy, setBellBusy] = useState(false);
  const [until, setUntil] = useState(() => {
    const saved = readNumber(bellKey);
    return saved > Date.now() ? saved : 0;
  });
  const [now, setNow] = useState(Date.now());
  const [ringEnd, setRingEnd] = useState(0);

  // order tracker + "Need anything?" state
  const [track, setTrack] = useState(null); // { bill_no, status } of the table's open order
  const [picked, setPicked] = useState([]); // selected quick requests
  const [otherText, setOtherText] = useState("");

  const pushedRef = useRef(false);

  // ---- load table menu ----
  useEffect(() => {
    let active = true;

    request(`/public/qr/${token}`)
      .then((result) => {
        if (active) {
          setData(result);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });

    return () => {
      active = false;
    };
  }, [token]);

  // ---- auto hide notice ----
  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  // ---- order tracker: refresh the table's open order status ----
  useEffect(() => {
    let active = true;

    const load = () => {
      if (document.hidden) return;
      request(`/public/qr/${token}/status`)
        .then((r) => {
          if (active) setTrack(r.order || null);
        })
        .catch(() => {
          /* keep the last known status */
        });
    };

    load();
    const id = setInterval(load, STATUS_POLL_MS);
    document.addEventListener("visibilitychange", load);

    return () => {
      active = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", load);
    };
  }, [token]);

  // ---- bell countdown ticker (runs only while cooling down) ----
  useEffect(() => {
    if (until <= Date.now()) return undefined;
    setNow(Date.now());
    const id = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= until) clearInterval(id);
    }, 250);
    return () => clearInterval(id);
  }, [until]);

  // ---- phone back button: category -> home ----
  useEffect(() => {
    const onPop = () => {
      pushedRef.current = false;
      setActiveCat(null);
      setShowCheckout(false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const left = Math.max(0, Math.ceil((until - now) / 1000));
  const ringing = ringEnd > now;

  // ---- categories (only those that have items) ----
  const categories = useMemo(() => {
    const products = data?.products || [];
    return (data?.categories || [])
      .map((c, i) => {
        const items = products.filter((p) => String(p.category_id) === String(c.id));
        const cover = c.image_url || items.find((p) => p.image_url)?.image_url || "";
        return { ...c, items, cover, color: TILE_COLORS[i % TILE_COLORS.length] };
      })
      .filter((c) => c.items.length > 0);
  }, [data]);

  const current = categories.find((c) => String(c.id) === String(activeCat)) || null;

  const searchText = search.toLowerCase().trim();
  const searchResults = useMemo(() => {
    if (!searchText) return [];
    return (data?.products || []).filter((p) =>
      `${p.name} ${p.description || ""}`.toLowerCase().includes(searchText),
    );
  }, [data, searchText]);

  // ---- cart ----
  const lines = (data?.products || [])
    .filter((p) => cart[p.id])
    .map((p) => ({ ...p, qty: cart[p.id] }));

  const total = lines.reduce((sum, p) => sum + Number(p.price) * p.qty, 0);
  const count = lines.reduce((sum, p) => sum + p.qty, 0);

  const change = (id, qty) => {
    setCart((currentCart) => {
      const next = { ...currentCart };
      if (qty <= 0) delete next[id];
      else next[id] = Math.min(99, qty);
      return next;
    });
  };

  // ---- navigation ----
  const openCategory = (id) => {
    const state = { cx: String(id) };
    const url = window.location.pathname + window.location.search;
    if (pushedRef.current) {
      window.history.replaceState(state, "", url);
    } else {
      window.history.pushState(state, "", url);
      pushedRef.current = true;
    }
    setActiveCat(String(id));
    window.scrollTo({ top: 0 });
  };

  const goHome = () => {
    if (pushedRef.current) window.history.back(); // popstate handler returns to home
    else setActiveCat(null);
  };

  // ---- place order ----
  const place = async () => {
    if (!count || busy) return;

    if (!customerName.trim()) {
      setNotice("Please enter your name to place the order.");
      return;
    }

    if (customerPhone && !/^[0-9]{10}$/.test(customerPhone)) {
      setNotice("Please enter a valid 10-digit mobile number.");
      return;
    }

    setBusy(true);

    try {
      const result = await request(`/public/qr/${token}/order`, {
        method: "POST",
        body: {
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim(),
          note: note.trim(),
          items: lines.map((p) => ({ product_id: p.id, qty: p.qty })),
        },
      });

      setOrder(result.order);
      setTrack({ bill_no: result.order.bill_no, status: "pending" });
      setCart({});
      setNote("");
      setShowCheckout(false);
      setNotice("Your order has been sent to the cashier.");
      setSearch("");
      if (pushedRef.current) window.history.back();
      else setActiveCat(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  };

  // ---- call cashier (once every 15 seconds, bell rings for 3 seconds) ----
  const callCashier = async (requests = [], other = "") => {
    if (bellBusy || left > 0) return;

    setBellBusy(true);

    try {
      const result = await request(`/public/qr/${token}/call`, {
        method: "POST",
        body: { requests, other_text: other.trim() },
      });

      const t = Date.now();
      const end = t + CALL_COOLDOWN_SEC * 1000;
      writeNumber(bellKey, end);
      setNow(t);
      setUntil(end);
      setRingEnd(t + RING_ANIMATION_MS);
      setPicked([]);
      setOtherText("");
      setNotice(result.message || "Cashier has been notified.");
    } catch (e) {
      // server also enforces the wait, e.g. "Please wait 9s before calling again."
      const wait = /(\d+)\s*s/i.exec(e.message || "");
      if (wait) {
        const end = Date.now() + Number(wait[1]) * 1000;
        writeNumber(bellKey, end);
        setNow(Date.now());
        setUntil(end);
      }
      setNotice(e.message);
    } finally {
      setBellBusy(false);
    }
  };

  const toggleRequest = (key) =>
    setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));

  // ---------- screens ----------
  if (!data && !error) {
    return (
      <div className="cx">
        <Styles />
        <div className="cx-center">
          <div className="cx-spinner" />
          <p>Loading menu...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="cx">
        <Styles />
        <div className="cx-center">
          <Icon n="alert" size={40} />
          <h2>Unable to open this table menu</h2>
          <p>{error}</p>
          <button className="cx-btn" onClick={() => window.location.reload()}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const bell = (compact) => (
    <Bell
      compact={compact}
      left={left}
      ringing={ringing}
      busy={bellBusy}
      onPress={() => callCashier()}
    />
  );

  const callNote =
    left > 0 ? (
      <div className="cx-callnote" role="status">
        <Icon n="check" size={16} />
        <span>
          Cashier has been called. You can call again in <b>{left}s</b>
        </span>
      </div>
    ) : null;

  return (
    <div className="cx">
      <Styles />

      {/* toast */}
      {notice && (
        <div className="cx-toast" role="status">
          <span>{notice}</span>
          <button aria-label="Close" onClick={() => setNotice("")}>
            <Icon n="x" size={16} />
          </button>
        </div>
      )}

      {/* ================= CATEGORY ITEMS VIEW ================= */}
      {current ? (
        <>
          <div className="cx-bar">
            <div className="cx-bar-top">
              <button className="cx-back" onClick={goHome} aria-label="Back to categories">
                <Icon n="arrowl" size={20} />
              </button>

              <div className="cx-bar-title">
                <h2>{current.name}</h2>
                <small>
                  {current.items.length} items · Table {data.table.name}
                </small>
              </div>

              {bell(true)}
            </div>

            <nav className="cx-chips" aria-label="Categories">
              {categories.map((c) => (
                <button
                  key={c.id}
                  className={`cx-chip ${String(c.id) === String(current.id) ? "on" : ""}`}
                  onClick={() => openCategory(c.id)}
                >
                  <Pic
                    src={c.cover}
                    alt=""
                    className="cx-chip-img"
                    fallback={<span className="cx-chip-img cx-chip-dot" />}
                  />
                  {c.name}
                </button>
              ))}
            </nav>
          </div>

          {callNote}

          <main className="cx-list">
            {current.items.map((p) => (
              <ItemRow key={p.id} p={p} qty={cart[p.id]} onChange={change} />
            ))}
          </main>
        </>
      ) : (
        /* ================= CATEGORY HOME ================= */
        <>
          <header className="cx-head">
            <div className="cx-brand">
              {data.logo_url && (
                <img src={img(data.logo_url)} alt="" className="cx-logo" />
              )}
              <div>
                <small>{data.restaurant}</small>
                {data.show_tagline !== false && <h1>{data.tagline || "CAFÉ & RESTAURANT"}</h1>}
                <p>
                  <Icon n="pin" size={14} /> Table {data.table.name}
                </p>
              </div>
            </div>

            {bell(false)}
          </header>

          <div className="cx-sheet-top">
            {callNote}

            {order && (
              <div className="cx-confirm">
                <Icon n="check" size={22} />
                <div>
                  <b>Order received · {order.bill_no}</b>
                  <span>
                    Table {order.table} · {money(order.total)}
                  </span>
                </div>
              </div>
            )}

            {track && <OrderTracker track={track} />}

            <NeedAnything
              picked={picked}
              onToggle={toggleRequest}
              otherText={otherText}
              onOtherText={setOtherText}
              left={left}
              busy={bellBusy}
              onCall={() => callCashier(picked, otherText)}
            />

            <h2 className="cx-hello">What would you like today?</h2>
            <p className="cx-hello-sub">Pick a category to see everything in it.</p>

            <div className="cx-search">
              <Icon n="search" size={19} />
              <input
                type="search"
                placeholder="Search food, drinks and more..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button aria-label="Clear search" onClick={() => setSearch("")}>
                  <Icon n="x" size={16} />
                </button>
              )}
            </div>

            {searchText ? (
              /* ---- search results ---- */
              <section className="cx-section">
                <div className="cx-sec-h">
                  <b>Search results</b>
                  <span>{searchResults.length} items</span>
                </div>

                {searchResults.length === 0 ? (
                  <div className="cx-empty">
                    <Icon n="search" size={34} />
                    <h3>No items found</h3>
                    <p>Try another word, or browse the categories.</p>
                    <button className="cx-btn" onClick={() => setSearch("")}>
                      Show categories
                    </button>
                  </div>
                ) : (
                  <div className="cx-list tight">
                    {searchResults.map((p) => (
                      <ItemRow key={p.id} p={p} qty={cart[p.id]} onChange={change} />
                    ))}
                  </div>
                )}
              </section>
            ) : (
              /* ---- category grid ---- */
              <section className="cx-section">
                <div className="cx-sec-h">
                  <b>Categories</b>
                  <span>{categories.length} to explore</span>
                </div>

                {categories.length === 0 ? (
                  <div className="cx-empty">
                    <Icon n="utensils" size={34} />
                    <h3>Menu is not available right now</h3>
                    <p>Please ask our staff for help.</p>
                  </div>
                ) : (
                  <div className="cx-grid">
                    {categories.map((c) => (
                      <button
                        key={c.id}
                        className="cx-cat"
                        onClick={() => openCategory(c.id)}
                      >
                        <Pic
                          src={c.cover}
                          alt={c.name}
                          className="cx-cat-img"
                          fallback={
                            <span
                              className="cx-cat-tile"
                              style={{
                                background: `linear-gradient(135deg, ${c.color[0]}, ${c.color[1]})`,
                              }}
                            >
                              <Icon n="utensils" size={40} />
                            </span>
                          }
                        />
                        <span className="cx-cat-shade" />
                        <span className="cx-cat-t">
                          <b>{c.name}</b>
                          <small>
                            {c.items.length} {c.items.length === 1 ? "item" : "items"}
                          </small>
                        </span>
                        <span className="cx-cat-go">
                          <Icon n="arrowr" size={16} />
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        </>
      )}

      {/* ================= CART BAR ================= */}
      {count > 0 && (
        <div className="cx-cart">
          <div className="cx-cart-info">
            <b>
              {count} item{count > 1 ? "s" : ""} added
            </b>
            <span>{money(total)}</span>
          </div>

          <button onClick={() => setShowCheckout(true)} disabled={busy}>
            View Cart <Icon n="arrowr" size={18} />
          </button>
        </div>
      )}

      {/* ================= CHECKOUT ================= */}
      {showCheckout && (
        <div className="cx-ov" onClick={() => setShowCheckout(false)}>
          <section className="cx-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="cx-sheet-h">
              <div>
                <h2>Your Order</h2>
                <p>Table {data.table.name}</p>
              </div>
              <button aria-label="Close" onClick={() => setShowCheckout(false)}>
                <Icon n="x" size={20} />
              </button>
            </div>

            <div className="cx-co-items">
              {lines.map((p) => (
                <div className="cx-co-item" key={p.id}>
                  <div className="cx-co-name">
                    <b>{p.name}</b>
                    <small>
                      {money(p.price)} × {p.qty}
                    </small>
                  </div>

                  <div className="cx-qty sm">
                    <button aria-label="Decrease quantity" onClick={() => change(p.id, p.qty - 1)}>
                      <Icon n="minus" size={14} />
                    </button>
                    <b>{p.qty}</b>
                    <button aria-label="Increase quantity" onClick={() => change(p.id, p.qty + 1)}>
                      <Icon n="plus" size={14} />
                    </button>
                  </div>

                  <strong className="cx-co-price">{money(p.price * p.qty)}</strong>
                </div>
              ))}
            </div>

            <div className="cx-details">
              <h3>Your details</h3>
              <input
                type="text"
                placeholder="Your name *"
                required
                aria-required="true"
                maxLength={100}
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
              <input
                type="tel"
                placeholder="10-digit mobile number (optional)"
                maxLength={10}
                value={customerPhone}
                onChange={(e) =>
                  setCustomerPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
                }
              />
            </div>

            <div className="cx-details">
              <h3>Special instructions (optional)</h3>
              <textarea
                rows={2}
                maxLength={200}
                placeholder="e.g. Less sugar, extra spicy, no onion..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <small className="cx-cnt">{note.length}/200</small>
            </div>
            <div className="cx-total">
              <span>Total Amount</span>
              <b>{money(total)}</b>
            </div>

            <button className="cx-place" onClick={place} disabled={busy || count === 0}>
              {busy ? "Sending order..." : "Place Order"}
              <Icon n="check" size={20} />
            </button>

            <p className="cx-note">Please pay at the cashier after your meal.</p>
          </section>
        </div>
      )}

      <footer className="cx-foot">
        <p>Thank you for visiting {data.restaurant}!</p>
        <small>Powered by AmpleMind Technologies Pvt Ltd</small>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles (kept in this file). Square corners, like the rest of the app */
/* ------------------------------------------------------------------ */
const RAW_CSS = `
.cx{
  --cx-g:var(--co-green,#14532d);--cx-gd:var(--co-green-dark,#103f25);--cx-gl:var(--co-green-light,#eaf4ec);
  --cx-bg:var(--co-mint,#f3f8f4);--cx-card:var(--co-white,#fff);--cx-tx:var(--co-text,#202923);
  --cx-mu:var(--co-muted,#7d8980);--cx-bd:var(--co-border,#e8eee9);
  min-height:100vh;min-height:100dvh;padding-bottom:120px;background:var(--cx-bg);color:var(--cx-tx);
  font-family:var(--font,inherit);font-size:15px;line-height:1.45;-webkit-font-smoothing:antialiased;
  -webkit-tap-highlight-color:transparent;overflow-x:clip;
}
.cx *,.cx *::before,.cx *::after{box-sizing:border-box}
:where(.cx) button{font:inherit;color:inherit;cursor:pointer;margin:0;padding:0;border:0;background:none;text-align:inherit;min-height:0;width:auto;box-shadow:none}
:where(.cx) button:disabled{cursor:not-allowed}
:where(.cx) h1,:where(.cx) h2,:where(.cx) h3,:where(.cx) p{margin:0}
:where(.cx) small{color:inherit}
:where(.cx) svg{flex:none}

/* centered states */
.cx-center{min-height:100vh;min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:24px;text-align:center;color:var(--cx-mu)}
.cx-center h2{color:var(--cx-tx);font-size:20px}
.cx-spinner{width:34px;height:34px;border:3px solid var(--cx-gl);border-top-color:var(--cx-g);animation:cx-spin .8s linear infinite}
@keyframes cx-spin{to{transform:rotate(360deg)}}
.cx-btn{padding:12px 22px;background:var(--cx-g);color:#fff!important;font-weight:700}

/* header */
.cx-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:20px 16px 38px;color:#fff;background:linear-gradient(135deg,#103f25,#1c7a42)}
.cx-brand{display:flex;align-items:center;gap:12px;min-width:0}
.cx-logo{width:52px;height:52px;flex:0 0 52px;object-fit:cover;border:2px solid rgba(255,255,255,.35)}
.cx-brand small{display:block;font-size:12px;font-weight:600;color:rgba(255,255,255,.85)}
.cx-brand h1{font-size:19px;font-weight:800;line-height:1.2;letter-spacing:.2px}
.cx-brand p{display:flex;align-items:center;gap:5px;margin-top:4px;font-size:13px;font-weight:700;opacity:.95}

/* bell: icon only, transparent background, no border or box */
.cx-bell{
  position:relative;
  flex:0 0 auto;
  min-width:44px;
  min-height:44px;
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  gap:2px;
  padding:0 2px!important;
  color:#fff!important;
  background:transparent!important;
  border:0!important;
  outline:0!important;
  box-shadow:none!important;
  cursor:pointer;
}
.cx-bell:active:not(:disabled){transform:scale(.92)}
.cx-bell:disabled{background:transparent!important;opacity:.65}
.cx-bell-ic{display:grid;place-items:center;transform-origin:50% 12%}
.cx-bell-label{font-size:9px;font-weight:700;line-height:1;letter-spacing:.3px;white-space:nowrap;opacity:.9}
.cx-bell.waiting{cursor:default}
.cx-bell.waiting .cx-bell-ic{opacity:.6}
/* idle: small vibration-like shake every couple of seconds so customers notice the bell */
.cx-bell:not(.waiting):not(.ringing) .cx-bell-ic{animation:cx-idle 2.6s ease-in-out infinite}
@keyframes cx-idle{
  0%,60%,100%{transform:rotate(0)}
  64%{transform:rotate(14deg)}
  68%{transform:rotate(-14deg)}
  72%{transform:rotate(11deg)}
  76%{transform:rotate(-11deg)}
  80%{transform:rotate(7deg)}
  84%{transform:rotate(-7deg)}
  88%{transform:rotate(3deg)}
  92%{transform:rotate(-3deg)}
}
.cx-bell.ringing .cx-bell-ic{animation:cx-ring .9s ease-in-out infinite}
@keyframes cx-ring{0%,100%{transform:rotate(0)}10%{transform:rotate(18deg)}20%{transform:rotate(-18deg)}30%{transform:rotate(15deg)}40%{transform:rotate(-15deg)}50%{transform:rotate(10deg)}60%{transform:rotate(-10deg)}70%{transform:rotate(5deg)}80%{transform:rotate(-5deg)}90%{transform:rotate(2deg)}}
@media (prefers-reduced-motion:reduce){.cx-bell:not(.waiting):not(.ringing) .cx-bell-ic{animation:none}}
.cx-bell.compact{color:var(--cx-g)!important}

/* order tracker */
.cx-track{margin-bottom:14px;padding:16px;background:var(--cx-card);border:1px solid var(--cx-bd);box-shadow:0 2px 10px rgba(20,83,45,.05)}
.cx-track-no{display:block;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;letter-spacing:1.5px;color:var(--cx-mu)}
.cx-track h2{margin:2px 0 12px;font-size:26px;font-weight:800;line-height:1.15}
.cx-track-bar{height:6px;background:var(--cx-bd);overflow:hidden}
.cx-track-bar span{display:block;height:100%;background:var(--cx-g);transition:width .6s ease}
.cx-steps{list-style:none;margin:14px 0 0;padding:0;display:flex;flex-direction:column;gap:9px}
.cx-steps li{display:flex;align-items:center;gap:10px;font-size:15px;font-weight:600;color:#b4bdb6}
.cx-steps li i{flex:0 0 16px;width:16px;height:16px;display:grid;place-items:center;border:2px solid #cfd8d1;font-style:normal}
.cx-steps li.done{color:var(--cx-tx)}
.cx-steps li.done i{background:var(--cx-g);border-color:var(--cx-g);color:#fff}
.cx-steps li.now{color:var(--cx-tx);font-weight:800}
.cx-steps li.now i{background:var(--cx-g);border-color:var(--cx-g);box-shadow:0 0 0 4px rgba(20,83,45,.15);animation:cx-pulse 1.4s ease-in-out infinite}
@keyframes cx-pulse{50%{box-shadow:0 0 0 7px rgba(20,83,45,0)}}
@media (prefers-reduced-motion:reduce){.cx-steps li.now i{animation:none}}

/* need anything */
.cx-need{margin-bottom:18px;padding:16px;background:var(--cx-card);border:1px solid var(--cx-bd);box-shadow:0 6px 18px rgba(20,83,45,.08)}
.cx-need-head{display:flex;align-items:center;gap:12px;margin-bottom:14px}
.cx-need-bell{flex:0 0 40px;width:40px;height:40px;display:grid;place-items:center;color:var(--cx-g);background:var(--cx-gl)}
.cx-need-head h3{font-size:18px;font-weight:800;line-height:1.2}
.cx-need-head p{margin-top:1px;font-size:12.5px;color:var(--cx-mu)}
.cx-need-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.cx-need-btn{--t:#2b6cb0;--tb:#e8f1fb;position:relative;display:flex;align-items:center;gap:10px;padding:12px 10px;min-height:64px;background:var(--cx-card);border:1.5px solid var(--cx-bd)!important;transition:background .15s,border-color .15s,transform .1s}
.cx-need-btn:active{transform:scale(.97)}
.cx-need-btn.tone-blue{--t:#2b6cb0;--tb:#e8f1fb}
.cx-need-btn.tone-amber{--t:#b7701a;--tb:#fdf1de}
.cx-need-btn.tone-teal{--t:#0f766e;--tb:#e3f5f1}
.cx-need-btn.tone-violet{--t:#7e3fb0;--tb:#f2e9f9}
.cx-need-ic{flex:0 0 40px;width:40px;height:40px;display:grid;place-items:center;color:var(--t);background:var(--tb)}
.cx-need-tx{min-width:0;display:block}
.cx-need-tx b{display:block;font-size:14.5px;font-weight:800;line-height:1.2}
.cx-need-tx small{display:block;margin-top:2px;font-size:11px;line-height:1.25;color:var(--cx-mu)}
.cx-need-tick{position:absolute;top:6px;right:6px;width:18px;height:18px;display:grid;place-items:center;color:#fff;background:var(--cx-g);transform:scale(0);transition:transform .15s}
.cx-need-btn.on{background:var(--cx-gl);border-color:var(--cx-g)!important}
.cx-need-btn.on .cx-need-ic{color:#fff;background:var(--cx-g)}
.cx-need-btn.on .cx-need-tick{transform:scale(1)}
.cx-need-other{width:100%;height:46px;margin-top:10px;padding:0 14px;font:inherit;font-size:15px;color:var(--cx-tx);background:var(--cx-bg);border:1px solid var(--cx-bd);outline:0}
.cx-need-other:focus{border-color:var(--cx-g);box-shadow:0 0 0 3px rgba(20,83,45,.1)}
.cx-callstaff{width:100%;display:flex;align-items:center;justify-content:center;gap:10px;margin-top:14px;padding:15px;font-size:16px;font-weight:800;letter-spacing:.2px;color:#fff!important;background:linear-gradient(135deg,#17643a,#1f8a4c);box-shadow:0 6px 16px rgba(20,83,45,.25)}
.cx-callstaff:active:not(:disabled){opacity:.88;transform:translateY(1px)}
.cx-callstaff:disabled{opacity:.6;box-shadow:none}

/* Square corners throughout the customer QR ordering page */
.cx,
.cx *,
.cx *::before,
.cx *::after{
  border-radius:0!important;
}

.cx-callnote{display:flex;align-items:center;gap:8px;margin:0 0 12px;padding:9px 12px;font-size:13px;color:var(--cx-g);background:var(--cx-gl);border:1px solid var(--cx-bd)}
.cx-bar + .cx-callnote{margin:12px 14px 0}

/* home */
.cx-sheet-top{position:relative;margin-top:-22px;padding:20px 16px 8px;background:var(--cx-bg)}
.cx-hello{font-size:22px;font-weight:800;line-height:1.25}
.cx-hello-sub{margin:2px 0 14px;color:var(--cx-mu);font-size:14px}
.cx-confirm{display:flex;align-items:center;gap:12px;margin-bottom:14px;padding:12px 14px;color:var(--cx-g);background:var(--cx-gl);border:1px solid var(--cx-bd)}
.cx-confirm b{display:block;font-size:15px}
.cx-confirm span{font-size:13px;color:var(--cx-mu)}

.cx-search{display:flex;align-items:center;gap:10px;height:50px;padding:0 14px;color:var(--cx-mu);background:var(--cx-card);border:1px solid var(--cx-bd);transition:border-color .2s,box-shadow .2s}
.cx-search:focus-within{border-color:var(--cx-g);box-shadow:0 0 0 3px rgba(20,83,45,.1)}
.cx-search input,.cx-search input:focus{flex:1;min-width:0;width:100%;height:100%;padding:0;margin:0;border:0;outline:0;box-shadow:none;background:transparent;color:var(--cx-tx);font:inherit;font-size:15px}
.cx-search input::placeholder{color:var(--cx-mu);opacity:.8}
.cx-search button{display:grid;place-items:center;width:28px;height:28px;color:var(--cx-mu)}

.cx-section{margin-top:20px}
.cx-sec-h{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:12px}
.cx-sec-h b{font-size:18px;font-weight:800}
.cx-sec-h span{font-size:12.5px;font-weight:700;color:var(--cx-g);background:var(--cx-gl);padding:3px 10px}

/* category grid */
.cx-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.cx-cat{position:relative;display:block;width:100%;aspect-ratio:1/1.08;overflow:hidden;background:var(--cx-gl);box-shadow:0 6px 18px rgba(20,83,45,.12);transition:transform .15s,box-shadow .15s}
.cx-cat:active{transform:scale(.97)}
.cx-cat-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:transform .4s}
.cx-cat:hover .cx-cat-img{transform:scale(1.05)}
.cx-cat-tile{position:absolute;inset:0;display:grid;place-items:center;color:rgba(255,255,255,.75)}
.cx-cat-shade{position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.78) 0%,rgba(0,0,0,.28) 45%,rgba(0,0,0,0) 70%)}
.cx-cat-t{position:absolute;left:12px;right:42px;bottom:11px;color:#fff;display:block}
.cx-cat-t b{display:block;font-size:15.5px;font-weight:800;line-height:1.2;text-shadow:0 1px 3px rgba(0,0,0,.4);overflow-wrap:anywhere}
.cx-cat-t small{display:block;margin-top:2px;font-size:12px;font-weight:600;color:rgba(255,255,255,.92)}
.cx-cat-go{position:absolute;right:10px;bottom:10px;width:30px;height:30px;display:grid;place-items:center;color:#fff;background:rgba(255,255,255,.22);border:1px solid rgba(255,255,255,.4);backdrop-filter:blur(4px)}

/* category view */
.cx-bar{position:sticky;top:0;z-index:20;padding:10px 14px 0;background:var(--cx-card);border-bottom:1px solid var(--cx-bd);box-shadow:0 4px 14px rgba(20,83,45,.06)}
.cx-bar-top{display:flex;align-items:center;gap:10px;padding-bottom:10px}
.cx-back{flex:0 0 42px;width:42px;height:42px;display:grid;place-items:center;color:var(--cx-g);background:var(--cx-gl)}
.cx-bar-title{flex:1;min-width:0}
.cx-bar-title h2{font-size:19px;font-weight:800;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cx-bar-title small{display:block;color:var(--cx-mu);font-size:12.5px}
.cx-chips{display:flex;gap:8px;overflow-x:auto;padding:2px 0 12px;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.cx-chips::-webkit-scrollbar{display:none}
.cx-chip{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:4px 14px 4px 4px;font-size:13px;font-weight:700;white-space:nowrap;color:var(--cx-tx);background:var(--cx-card);border:1px solid var(--cx-bd)!important}
.cx-chip.on{color:#fff;background:var(--cx-g);border-color:var(--cx-g)!important}
.cx-chip-img{width:30px;height:30px;object-fit:cover}
.cx-chip-dot{display:inline-block;background:var(--cx-gl)}

.cx-list{display:flex;flex-direction:column;gap:10px;padding:14px}
.cx-list.tight{padding:0}

/* item row */
.cx-item{display:flex;align-items:center;gap:12px;padding:10px;background:var(--cx-card);border:1px solid var(--cx-bd);box-shadow:0 2px 10px rgba(20,83,45,.05)}
.cx-item-img{width:80px;height:80px;flex:0 0 80px;object-fit:cover;background:var(--cx-gl)}
.cx-item-noimg{display:grid;place-items:center;color:var(--cx-g);opacity:.7}
.cx-item-info{flex:1;min-width:0}
.cx-item-info b{display:block;font-size:15px;font-weight:700;line-height:1.3;overflow-wrap:anywhere}
.cx-item-info p{margin-top:2px;font-size:12.5px;color:var(--cx-mu);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.cx-item-info strong{display:block;margin-top:6px;font-size:16px;font-weight:800;color:var(--cx-g)}
.cx-item-act{flex:0 0 auto}
.cx-add{padding:8px 20px;font-size:13px;font-weight:800;letter-spacing:.4px;color:var(--cx-g);background:var(--cx-card);border:1.5px solid var(--cx-g)!important}
.cx-add:active{background:var(--cx-gl)}
.cx-qty{display:inline-flex;align-items:center;color:#fff;background:var(--cx-g);overflow:hidden}
.cx-qty button{width:34px;height:36px;display:grid;place-items:center;color:#fff}
.cx-qty b{min-width:22px;text-align:center;font-size:14px}
.cx-qty.sm button{width:30px;height:32px}

.cx-empty{display:flex;flex-direction:column;align-items:center;gap:8px;padding:34px 16px;text-align:center;color:var(--cx-mu);background:var(--cx-card);border:1px dashed var(--cx-bd)}
.cx-empty h3{color:var(--cx-tx);font-size:17px}

/* cart bar */
.cx-cart{position:fixed;left:12px;right:12px;bottom:12px;z-index:30;max-width:600px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 10px 10px 16px;color:#fff;background:var(--cx-gd);box-shadow:0 10px 28px rgba(0,0,0,.28)}
.cx-cart-info b{display:block;font-size:14px}
.cx-cart-info span{font-size:18px;font-weight:800}
.cx-cart > button{display:flex;align-items:center;gap:6px;padding:10px 4px;font-weight:800;font-size:14px;color:#fff;background:transparent!important;border:0!important;box-shadow:none!important;text-decoration:none;white-space:nowrap}
.cx-cart > button:active{opacity:.75;transform:translateX(2px)}

/* checkout sheet */
.cx-ov{position:fixed;inset:0;z-index:50;display:flex;align-items:flex-end;justify-content:center;background:rgba(10,20,14,.55)}
.cx-sheet{width:100%;max-width:560px;max-height:92vh;max-height:92dvh;overflow-y:auto;padding:18px 16px 22px;background:var(--cx-card);animation:cx-up .25s ease-out}
@keyframes cx-up{from{transform:translateY(40px);opacity:0}to{transform:none;opacity:1}}
.cx-sheet-h{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px}
.cx-sheet-h h2{font-size:21px;font-weight:800}
.cx-sheet-h p{color:var(--cx-mu);font-size:13px}
.cx-sheet-h button{width:38px;height:38px;display:grid;place-items:center;background:var(--cx-gl);color:var(--cx-g)}
.cx-co-item{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--cx-bd)}
.cx-co-name{flex:1;min-width:0}
.cx-co-name b{display:block;font-size:14.5px;line-height:1.3}
.cx-co-name small{color:var(--cx-mu);font-size:12.5px}
.cx-co-price{min-width:64px;text-align:right;font-size:14.5px}
.cx-details{margin-top:16px;display:flex;flex-direction:column;gap:10px}
.cx-details h3{font-size:14px;color:var(--cx-mu);font-weight:700}
.cx-details input{width:100%;height:48px;padding:0 14px;font:inherit;font-size:15px;color:var(--cx-tx);background:var(--cx-bg);border:1px solid var(--cx-bd);outline:0}
.cx-details textarea{width:100%;min-height:64px;padding:12px 14px;font:inherit;font-size:15px;color:var(--cx-tx);background:var(--cx-bg);border:1px solid var(--cx-bd);outline:0;resize:none}
.cx-details textarea:focus{border-color:var(--cx-g);box-shadow:0 0 0 3px rgba(20,83,45,.1)}
.cx-cnt{align-self:flex-end;color:var(--cx-mu);font-size:11px;margin-top:-6px}
.cx-details input:focus{border-color:var(--cx-g);box-shadow:0 0 0 3px rgba(20,83,45,.1)}
.cx-total{display:flex;align-items:center;justify-content:space-between;margin:16px 0 12px;padding:14px 16px;background:var(--cx-gl)}
.cx-total span{font-weight:700}
.cx-total b{font-size:22px;color:var(--cx-g)}
.cx-place{width:100%;display:flex;align-items:center;justify-content:center;gap:8px;padding:15px;font-size:16px;font-weight:800;color:#fff;background:var(--cx-g);text-align:center}
.cx-place:disabled{opacity:.6}
.cx-note{margin-top:10px;text-align:center;font-size:13px;color:var(--cx-mu)}

/* toast + footer */
.cx-toast{
  position:fixed;
  top:max(14px,env(safe-area-inset-top));
  bottom:auto;
  left:12px;
  right:12px;
  z-index:1000;
  max-width:520px;
  margin:0 auto;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:14px;
  padding:15px 16px;
  font-size:14px;
  font-weight:700;
  line-height:1.4;
  color:#fff;
  background:linear-gradient(135deg,#103f25,#17643a);
  border-left:4px solid #83c99b;
  box-shadow:0 8px 28px rgba(0,0,0,.24);
  animation:cx-toast-in .28s ease-out;
}
.cx-toast span{flex:1;min-width:0}
.cx-toast button{
  flex:0 0 28px;
  width:28px;
  height:28px;
  display:grid;
  place-items:center;
  color:#fff;
  background:transparent!important;
  opacity:.85;
}
.cx-toast button:active{opacity:.6}
@keyframes cx-toast-in{
  from{transform:translateY(-14px);opacity:0}
  to{transform:translateY(0);opacity:1}
}
.cx-foot{padding:22px 16px 8px;text-align:center;color:var(--cx-mu)}
.cx-foot p{font-size:13.5px;font-weight:600}
.cx-foot small{font-size:11.5px;opacity:.8}

@media (min-width:700px){
  .cx{max-width:560px;margin:0 auto;box-shadow:0 0 0 1px var(--cx-bd)}
  .cx-head{}
}
`;

const CSS = RAW_CSS;

function Styles() {
  return <style>{CSS}</style>;
}