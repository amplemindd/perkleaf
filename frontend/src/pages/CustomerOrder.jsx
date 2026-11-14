import React, { useEffect, useMemo, useRef, useState } from "react";
import Icon from "../lib/icons";
import { API_URL, ago, img, money } from "../lib/api";

/* ------------------------------------------------------------------ */
/*  Customer QR ordering page                                          */
/*  Flow: all categories (with pictures)  ->  tap one  ->  its items   */
/* ------------------------------------------------------------------ */

const CALL_COOLDOWN_SEC = 15; // customer can ring the bell once every 15 seconds
const RING_ANIMATION_MS = 3000; // bell keeps ringing for 3 seconds

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

const readJson = (key, fallback) => {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "null");
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
};
const writeJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage is optional */
  }
};

const STATUS_POLL_MS = 5000; // order tracker refreshes every 5 seconds
const TRACK_HIDE_KEY = "bb_track_hide_"; // "Served"/"Cancelled" card can be dismissed

// small line icons (same style as the rest of the app)
const svg = (children) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

// "Need anything?" quick requests (key is sent to the server)
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

// order status (set by staff on the cashier screen) -> what the customer sees:
//   waiting to be accepted -> accepted -> served
const TRACK_STATUSES = ["pending", "preparing", "ready", "served", "bill_pending"];
const TRACK_TITLE = {
  pending: "Waiting to be accepted",
  preparing: "Order accepted",
  ready: "Order accepted",
  served: "Served",
  bill_pending: "Served",
};

const RATING_WORDS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];
const FEEDBACK_TAGS = ["Food", "Service", "Ambience", "Cleanliness", "Value"];

// star icon (the shared icon set has no star)
function Star({ size = 20, filled = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

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
      aria-label={waiting ? `Call again in ${left} seconds` : "Call staff"}
      title={waiting ? `Call again in ${left} seconds` : "Call staff"}
    >
      <span className="cx-bell-ic">
        <Icon n="bell" size={compact ? 25 : 28} />
      </span>
      <span className="cx-bell-label">{waiting ? `${left}s` : "Call staff"}</span>
    </button>
  );
}

// Live order tracker (title + progress bar, no step list)
function OrderTracker({ track, onOpen, onRate, onDismiss }) {
  if (track.status === "cancelled") {
    return (
      <section className="cx-track bad">
        <div className="cx-track-cancel">
          <span className="cx-track-ic">
            <Icon n="alert" size={20} />
          </span>
          <div>
            <b>Order cancelled · #{String(track.bill_no || "").replace(/^#/, "")}</b>
            <small>{track.cancel_reason ? `Reason: ${track.cancel_reason}` : "Please ask our staff if you need any help."}</small>
          </div>
        </div>
        {onDismiss && (
          <button className="cx-track-x" aria-label="Dismiss" onClick={onDismiss}>
            <Icon n="x" size={16} />
          </button>
        )}
      </section>
    );
  }

  const status = TRACK_STATUSES.includes(track.status) ? track.status : "pending";
  const served = status === "served" || status === "bill_pending";
  const itemCount = (track.items || []).reduce((sum, i) => sum + i.qty, 0);

  return (
    <section className={`cx-track ${served ? "served" : ""}`} aria-live="polite">
      <div className="cx-track-top">
        <small className="cx-track-no">ORDER #{String(track.bill_no || "").replace(/^#/, "")}</small>
        {track.created_at && <small className="cx-track-ago">Ordered {ago(track.created_at)}</small>}
      </div>
      <h2>{TRACK_TITLE[status]}</h2>

      {(onOpen || (served && onRate)) && (
        <div className="cx-track-foot">
          {onOpen && (
            <button className="cx-track-more" onClick={onOpen}>
              <b>
                {itemCount} item{itemCount === 1 ? "" : "s"} · {money(track.total)}
              </b>
              <span>
                View details <Icon n="arrowr" size={14} />
              </span>
            </button>
          )}
          {served && onRate && (
            <button className="cx-track-rate" onClick={onRate}>
              <Star size={16} filled /> Rate your visit
            </button>
          )}
        </div>
      )}

      {served && onDismiss && (
        <button className="cx-track-x" aria-label="Dismiss" onClick={onDismiss}>
          <Icon n="x" size={16} />
        </button>
      )}
    </section>
  );
}

// "Need anything?" quick requests + Call staff button
function NeedAnything({ picked, onToggle, otherText, onOtherText, left, busy, onCall }) {
  const waiting = left > 0;

  return (
    <section className="cx-need">
      <div className="cx-need-head">
        <h3>Need anything?</h3>
        <span>Tap to select</span>
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
                <Icon n="check" size={11} />
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
        <Icon n="bell" size={18} />
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

  // order tracker + extra actions
  const lastKey = `bb_last_${token}`;
  const hideKey = TRACK_HIDE_KEY + token;
  const [track, setTrack] = useState(null); // table's current order { id, bill_no, status, total, items... }
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(TRACK_HIDE_KEY + token) || "";
    } catch {
      return "";
    }
  });
  const [showTrack, setShowTrack] = useState(false);
  const [justPlaced, setJustPlaced] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [panel, setPanel] = useState(""); // "" | "request" | "feedback" | "info"
  const [picked, setPicked] = useState([]); // selected quick requests
  const [otherText, setOtherText] = useState("");
  const [reqText, setReqText] = useState("");
  const [rating, setRating] = useState(0);
  const [fbTags, setFbTags] = useState([]);
  const [fbText, setFbText] = useState("");
  const [fbDone, setFbDone] = useState(false);
  const placedAtRef = useRef(0);

  // "How many people are you?" (asked first, after the QR scan)
  const [askParty, setAskParty] = useState(false);
  const [guestCount, setGuestCount] = useState(() => Math.min(30, Math.max(1, readNumber("bb_guests") || 2)));
  // the guest picker shows 1..capacity of THIS table (8 if the table has no capacity set)
  const maxGuests = data?.table?.capacity > 0 ? Math.min(30, Number(data.table.capacity)) : 8;
  const pickedGuests = Math.min(guestCount, maxGuests);

  // While a sheet / popup is open the page behind must not scroll (only the sheet itself scrolls)
  const overlayOpen = showTrack || showMore || !!panel || askParty;
  useEffect(() => {
    if (!overlayOpen) return undefined;
    const html = document.documentElement;
    const prevHtml = html.style.overflow;
    const prevBody = document.body.style.overflow;
    html.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      html.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
    };
  }, [overlayOpen]);
  const [partyBusy, setPartyBusy] = useState(false);
  const [partyErr, setPartyErr] = useState(false);
  const [fbBusy, setFbBusy] = useState(false);

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

  // ---- order tracker: refresh the table's order status ----
  useEffect(() => {
    let active = true;

    const load = () => {
      if (document.hidden) return;
      request(`/public/qr/${token}/status`)
        .then((r) => {
          if (!active) return;
          // right after placing an order keep the instant card even if an older reply says "no order"
          if (!r.order && Date.now() - placedAtRef.current < 8000) return;
          setTrack(r.order || null);
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

  // ---- first thing after the scan: ask how many people are sitting ----
  useEffect(() => {
    if (!data) return;
    if (data.party) setGuestCount(data.party.guests);
    else setAskParty(true);
  }, [data]);

  // ---- auto hide notice ----
  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

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
          guests: data.party ? data.party.guests : undefined,
          items: lines.map((p) => ({ product_id: p.id, qty: p.qty })),
        },
      });

      const o = result.order;
      writeJson(lastKey, lines.map((p) => ({ id: p.id, qty: p.qty })));
      placedAtRef.current = Date.now();
      setTrack((prev) =>
        prev && prev.id === o.id
          ? { ...prev, total: o.total }
          : {
              id: o.id,
              bill_no: o.bill_no,
              status: "pending",
              total: o.total,
              created_at: new Date().toISOString(),
              items: lines.map((p) => ({ name: p.name, qty: p.qty, line_total: p.price * p.qty })),
            },
      );
      setCart({});
      setNote("");
      setShowCheckout(false);
      setJustPlaced(true);
      setShowTrack(true);
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

  const submitParty = async () => {
    setPartyBusy(true);
    try {
      await request(`/public/qr/${token}/seat`, { method: "POST", body: { guests: pickedGuests } });
      writeNumber("bb_guests", pickedGuests);
      setData((d) => ({ ...d, party: { guests: pickedGuests, since: new Date().toISOString() } }));
      setPartyErr(false);
      setAskParty(false);
    } catch (e) {
      setNotice(e.message);
      setPartyErr(true);
    } finally {
      setPartyBusy(false);
    }
  };

  // ---- call staff (once every 15 seconds, bell rings for 3 seconds) ----
  const callCashier = async (requests = [], other = "", extra = {}) => {
    if (bellBusy || left > 0) return false;

    setBellBusy(true);

    try {
      const result = await request(`/public/qr/${token}/call`, {
        method: "POST",
        body: { requests, other_text: other.trim(), ...extra },
      });

      const t = Date.now();
      const end = t + CALL_COOLDOWN_SEC * 1000;
      writeNumber(bellKey, end);
      setNow(t);
      setUntil(end);
      setRingEnd(t + RING_ANIMATION_MS);
      setPicked([]);
      setOtherText("");
      setNotice(result.message || "Staff has been notified.");
      return true;
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
      return false;
    } finally {
      setBellBusy(false);
    }
  };

  const toggleRequest = (key) =>
    setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));

  const requestBill = () => callCashier([], "", { kind: "bill" });

  const sendSpecial = async () => {
    if (!reqText.trim()) {
      setNotice("Please type your request.");
      return;
    }
    const ok = await callCashier([], "", { kind: "request", note: reqText.trim() });
    if (ok) {
      setReqText("");
      setPanel("");
    }
  };

  const openFeedback = () => {
    setShowMore(false);
    setShowTrack(false);
    setJustPlaced(false);
    setRating(0);
    setFbTags([]);
    setFbText("");
    setFbDone(false);
    setPanel("feedback");
  };

  const toggleTag = (t) => setFbTags((list) => (list.includes(t) ? list.filter((x) => x !== t) : [...list, t]));

  const submitFeedback = async () => {
    if (!rating) {
      setNotice("Please tap a star to rate us.");
      return;
    }
    setFbBusy(true);
    try {
      await request(`/public/qr/${token}/feedback`, {
        method: "POST",
        body: {
          rating,
          tags: fbTags,
          comment: fbText.trim(),
          order_id: track?.id || undefined,
          customer_name: customerName.trim(),
        },
      });
      setFbDone(true);
    } catch (e) {
      setNotice(e.message);
    } finally {
      setFbBusy(false);
    }
  };

  const reorder = () => {
    const saved = readJson(lastKey, []);
    const valid = saved.filter((l) => (data?.products || []).some((p) => p.id === l.id));
    if (!valid.length) {
      setNotice("No previous order found on this phone.");
      return;
    }
    setCart((c) => {
      const next = { ...c };
      valid.forEach((l) => {
        next[l.id] = Math.min(99, (next[l.id] || 0) + l.qty);
      });
      return next;
    });
    setShowMore(false);
    setShowCheckout(true);
  };

  const openTrack = () => {
    setJustPlaced(false);
    setShowTrack(true);
  };
  const closeTrack = () => {
    setShowTrack(false);
    setJustPlaced(false);
  };
  const dismissTrack = () => {
    if (!track) return;
    const mark = `${track.id}:${track.status}`;
    setDismissed(mark);
    try {
      localStorage.setItem(hideKey, mark);
    } catch {
      /* storage is optional */
    }
  };

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

  const callBlocked = bellBusy || left > 0;
  // "Request Bill" only makes sense after an order is placed (and not cancelled)
  const canBill = !!track && track.status !== "cancelled";
  const showTracker =
    !!track && !(["served", "bill_pending", "cancelled"].includes(track.status) && dismissed === `${track.id}:${track.status}`);

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
          Staff has been called. You can call again in <b>{left}s</b>
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

      {/* ================= HOW MANY PEOPLE? ================= */}
      {askParty && (
        <div className="cx-party" role="dialog" aria-modal="true" aria-label="Number of guests">
          <div className="cx-party-card">
            {data.party && (
              <button className="cx-party-x" aria-label="Close" onClick={() => setAskParty(false)}>
                <Icon n="x" size={18} />
              </button>
            )}
            {data.logo_url && <img className="cx-party-logo" src={img(data.logo_url)} alt="" />}
            <small className="cx-party-rest">{data.restaurant}</small>
            <h2>Welcome!</h2>
            <p className="cx-party-table">
              <Icon n="pin" size={14} /> Table {data.table.name}
            </p>

            <h3>How many people are you?</h3>
            <div className="cx-guests" role="radiogroup" aria-label="Number of people">
              {Array.from({ length: maxGuests }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={n === pickedGuests}
                  className={n === pickedGuests ? "on" : ""}
                  onClick={() => setGuestCount(n)}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="cx-party-hint">
              {data.table.capacity ? `This table seats ${maxGuests}. ` : ""}Tap the number of people sitting.
            </p>

            <button className="cx-place" onClick={submitParty} disabled={partyBusy}>
              {partyBusy ? "Please wait..." : "Continue"}
              <Icon n="arrowr" size={20} />
            </button>
            {partyErr && (
              <button className="cx-linkbtn muted" onClick={() => setAskParty(false)}>
                Skip for now
              </button>
            )}
          </div>
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
                {data.party && (
                  <button className="cx-party-chip" onClick={() => setAskParty(true)}>
                    <Icon n="users" size={13} /> {data.party.guests} {data.party.guests === 1 ? "guest" : "guests"} · Change
                  </button>
                )}
              </div>
            </div>

            {bell(false)}
          </header>

          <div className="cx-sheet-top">
            {callNote}

            {showTracker && (
              <OrderTracker
                track={track}
                onOpen={openTrack}
                onRate={openFeedback}
                onDismiss={["served", "bill_pending", "cancelled"].includes(track.status) ? dismissTrack : undefined}
              />
            )}

            <NeedAnything
              picked={picked}
              onToggle={toggleRequest}
              otherText={otherText}
              onOtherText={setOtherText}
              left={left}
              busy={bellBusy}
              onCall={() => callCashier(picked, otherText)}
            />

            <div className="cx-quick" style={{ gridTemplateColumns: `repeat(${canBill ? 3 : 2}, minmax(0, 1fr))` }}>
              {canBill && (
                <button className="tone-bill" onClick={requestBill} disabled={callBlocked}>
                  <span className="cx-q-ic">
                    <Icon n="receipt" size={24} />
                  </span>
                  <b>Request Bill</b>
                  <small>Ask for your bill</small>
                </button>
              )}
              <button className="tone-rate" onClick={openFeedback}>
                <span className="cx-q-ic">
                  <Star size={24} filled />
                </span>
                <b>Rate Us</b>
                <small>Share feedback</small>
              </button>
              <button className="tone-more" onClick={() => setShowMore(true)}>
                <span className="cx-q-ic">
                  <Icon n="dots" size={24} />
                </span>
                <b>More</b>
                <small>Requests and info</small>
              </button>
            </div>

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

      {/* ================= ORDER DETAILS / ORDER PLACED ================= */}
      {showTrack && (
        <div className="cx-ov" onClick={closeTrack}>
          <section className="cx-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="cx-sheet-h">
              <div>
                <h2>{justPlaced ? "Order Placed!" : "Order Details"}</h2>
                <p>Table {data.table.name}</p>
              </div>
              <button aria-label="Close" onClick={closeTrack}>
                <Icon n="x" size={20} />
              </button>
            </div>

            {justPlaced && (
              <div className="cx-okbox">
                <span className="cx-okmark">
                  <Icon n="check" size={30} />
                </span>
                <p>Your order has been sent to the kitchen. We will serve it at your table shortly.</p>
              </div>
            )}

            {track ? (
              <>
                <OrderTracker track={track} />

                {track.status !== "cancelled" && track.items?.length > 0 && (
                  <div className="cx-sum">
                    {track.items.map((i, idx) => (
                      <div key={`${i.name}-${idx}`}>
                        <span>
                          {i.name} × {i.qty}
                        </span>
                        <b>{money(i.line_total)}</b>
                      </div>
                    ))}
                    <div className="cx-sum-t">
                      <span>Total</span>
                      <b>{money(track.total)}</b>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="cx-note">No active order right now.</p>
            )}

            <div className="cx-two" style={{ gridTemplateColumns: canBill ? "1fr 1fr" : "1fr" }}>
              <button onClick={() => callCashier()} disabled={callBlocked}>
                <Icon n="bell" size={18} /> {left > 0 ? `Wait ${left}s` : "Call Waiter"}
              </button>
              {canBill && (
                <button onClick={requestBill} disabled={callBlocked}>
                  <Icon n="receipt" size={18} /> Request Bill
                </button>
              )}
            </div>

            <button className="cx-linkbtn" onClick={closeTrack}>
              <Icon n="plus" size={16} /> Order more items
            </button>
          </section>
        </div>
      )}

      {/* ================= MORE OPTIONS ================= */}
      {showMore && (
        <div className="cx-ov" onClick={() => setShowMore(false)}>
          <section className="cx-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="cx-sheet-h">
              <div>
                <h2>More Options</h2>
                <p>Table {data.table.name}</p>
              </div>
              <button aria-label="Close" onClick={() => setShowMore(false)}>
                <Icon n="x" size={20} />
              </button>
            </div>

            <div className="cx-more">
              {[
                ["note", <Icon key="i" n="edit" size={20} />, "Add Special Request", "Extra sauce, no spice, etc.", () => { setShowMore(false); setPanel("request"); }],
                ["again", <Icon key="i" n="refresh" size={20} />, "Reorder", "Order again from your last order", reorder],
                ["rate", <Star key="i" size={20} filled />, "Feedback / Rate", "Share your experience", openFeedback],
                ["info", <Icon key="i" n="pin" size={20} />, "Restaurant Info", "Contact and location", () => { setShowMore(false); setPanel("info"); }],
              ].map(([key, icon, title, sub, fn]) => (
                <button key={key} className={`tone-${key}`} onClick={fn}>
                  <span className="cx-more-ic">{icon}</span>
                  <span className="cx-more-tx">
                    <b>{title}</b>
                    <small>{sub}</small>
                  </span>
                  <Icon n="arrowr" size={16} />
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* ================= REQUEST / FEEDBACK / INFO ================= */}
      {panel && (
        <div className="cx-ov" onClick={() => setPanel("")}>
          <section className="cx-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="cx-sheet-h">
              <div>
                <h2>
                  {panel === "request"
                    ? "Special Request"
                    : panel === "feedback"
                      ? "Rate Your Experience"
                      : "Restaurant Info"}
                </h2>
                <p>
                  {panel === "feedback" ? "Your feedback helps us serve you better" : `Table ${data.table.name}`}
                </p>
              </div>
              <button aria-label="Close" onClick={() => setPanel("")}>
                <Icon n="x" size={20} />
              </button>
            </div>

            {panel === "request" && (
              <div className="cx-details">
                <textarea
                  rows={3}
                  maxLength={200}
                  placeholder="e.g. Extra sauce, less spicy, please bring a high chair..."
                  value={reqText}
                  onChange={(e) => setReqText(e.target.value)}
                />
                <button className="cx-place" onClick={sendSpecial} disabled={callBlocked}>
                  {left > 0 ? `Try again in ${left}s` : "Send to staff"}
                </button>
              </div>
            )}

            {panel === "feedback" &&
              (fbDone ? (
                <div className="cx-okbox">
                  <span className="cx-okmark">
                    <Icon n="check" size={30} />
                  </span>
                  <b>Thank you for your feedback!</b>
                  <p>We are glad to have you with us.</p>
                  <button className="cx-place" onClick={() => setPanel("")}>
                    Done
                  </button>
                </div>
              ) : (
                <div className="cx-fb">
                  <div className="cx-stars" role="radiogroup" aria-label="Rating">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        className={n <= rating ? "on" : ""}
                        onClick={() => setRating(n)}
                        aria-label={`${n} star${n > 1 ? "s" : ""}`}
                        role="radio"
                        aria-checked={n === rating}
                      >
                        <Star size={40} filled={n <= rating} />
                      </button>
                    ))}
                  </div>
                  <p className={`cx-fb-word ${rating ? "on" : ""}`}>
                    {rating ? RATING_WORDS[rating] : "Tap a star to rate"}
                  </p>

                  <h3 className="cx-fb-h">What stood out?</h3>
                  <div className="cx-tags">
                    {FEEDBACK_TAGS.map((t) => (
                      <button key={t} className={fbTags.includes(t) ? "on" : ""} onClick={() => toggleTag(t)}>
                        {fbTags.includes(t) && <Icon n="check" size={12} />}
                        {t}
                      </button>
                    ))}
                  </div>

                  <div className="cx-details">
                    <textarea
                      rows={3}
                      maxLength={300}
                      placeholder="Tell us more (optional)"
                      value={fbText}
                      onChange={(e) => setFbText(e.target.value)}
                    />
                  </div>
                  <button className="cx-place" onClick={submitFeedback} disabled={fbBusy}>
                    {fbBusy ? "Sending..." : "Submit Feedback"}
                  </button>
                </div>
              ))}

            {panel === "info" && (
              <div className="cx-info">
                <h3>{data.restaurant}</h3>
                {data.tagline && <p>{data.tagline}</p>}
                {data.address && (
                  <div>
                    <Icon n="pin" size={17} /> <span>{data.address}</span>
                  </div>
                )}
                {data.phone && (
                  <div>
                    <Icon n="phone" size={17} />{" "}
                    <a href={`tel:${data.phone}`}>{data.phone}</a>
                  </div>
                )}
                {!data.address && !data.phone && <p>Please ask our staff for more information.</p>}
              </div>
            )}
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
.cx-ov{position:fixed;top:0;left:0;right:0;height:100vh;height:100dvh;z-index:50;display:flex;align-items:flex-end;justify-content:center;background:rgba(10,20,14,.55);overscroll-behavior:contain}
.cx-sheet{width:100%;max-width:560px;max-height:92vh;max-height:92dvh;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:18px 16px 22px;background:var(--cx-card);animation:cx-up .25s ease-out}
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


/* ---- order tracker ---- */
.cx-track{position:relative;margin-bottom:14px;padding:16px 16px 14px;background:var(--cx-card);border:1px solid var(--cx-bd);border-top:3px solid var(--cx-g);box-shadow:0 8px 24px rgba(20,83,45,.08)}
.cx-track.served{border-top-color:#2f8f55;background:linear-gradient(180deg,#f1faf4,#fff 55%)}
.cx-track.bad{border-top-color:#d92d20;background:#fff6f5}
.cx-track-top{display:flex;align-items:center;justify-content:space-between;gap:8px}
.cx-track-no{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;letter-spacing:1.5px;color:var(--cx-mu)}
.cx-track-ago{font-size:12px;font-weight:600;color:var(--cx-mu)}
.cx-track h2{margin:4px 0 12px;font-size:26px;font-weight:800;line-height:1.15}
.cx-track-bar{height:6px;background:var(--cx-bd);overflow:hidden}
.cx-track-bar span{display:block;height:100%;background:linear-gradient(90deg,#f5b301,#2f8f55);transition:width .6s ease}
.cx-steps{list-style:none;margin:16px 0 0;padding:0}
.cx-steps li{position:relative;display:flex;align-items:flex-start;gap:12px;padding-bottom:15px;color:#a9b3ac}
.cx-steps li:last-child{padding-bottom:0}
.cx-steps li::after{content:"";position:absolute;left:8px;top:22px;bottom:2px;width:2px;background:#dfe7e1}
.cx-steps li:last-child::after{display:none}
.cx-steps li.done::after{background:var(--cx-g)}
.cx-steps li i{position:relative;z-index:1;flex:0 0 18px;width:18px;height:18px;margin-top:1px;display:grid;place-items:center;color:#fff;background:#fff;border:2px solid #cfd8d1;font-style:normal}
.cx-steps li.done i{background:var(--cx-g);border-color:var(--cx-g)}
.cx-steps li.now i{background:#f5b301;border-color:#f5b301;animation:cx-pulse 1.4s ease-in-out infinite}
.cx-steps li b{display:block;font-size:15px;font-weight:700;line-height:1.3}
.cx-steps li small{display:block;margin-top:1px;font-size:12px;font-weight:500;color:var(--cx-mu)}
.cx-steps li.done,.cx-steps li.now{color:var(--cx-tx)}
.cx-steps li.now b{font-weight:800}
@keyframes cx-pulse{0%{box-shadow:0 0 0 0 rgba(245,179,1,.55)}70%{box-shadow:0 0 0 8px rgba(245,179,1,0)}100%{box-shadow:0 0 0 0 rgba(245,179,1,0)}}
@media (prefers-reduced-motion:reduce){.cx-steps li.now i{animation:none}}
.cx-track-foot{display:flex;align-items:center;gap:8px;margin-top:14px;padding-top:12px;border-top:1px dashed var(--cx-bd)}
.cx-track-more{flex:1;min-width:0;display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:13px}
.cx-track-more b{font-weight:700}
.cx-track-more span{display:flex;align-items:center;gap:4px;font-weight:700;color:var(--cx-g);white-space:nowrap}
.cx-track-rate{flex:0 0 auto;display:flex;align-items:center;gap:6px;padding:9px 14px;font-size:13px;font-weight:800;color:#fff;background:var(--cx-g)}
.cx-track-rate svg{color:#ffd24a}
.cx-track-x{position:absolute;top:8px;right:8px;width:30px;height:30px;display:grid;place-items:center;color:var(--cx-mu)}
.cx-track-cancel{display:flex;align-items:center;gap:12px;padding-right:26px;color:#b42318}
.cx-track-cancel small{display:block;font-size:12.5px;color:#7a271a}
.cx-track-ic{flex:0 0 auto;display:inline-flex;color:#d92d20}

/* ---- need anything (compact, premium) ---- */
.cx-need{margin-bottom:14px;padding:14px;background:var(--cx-card);border:1px solid var(--cx-bd);box-shadow:0 8px 24px rgba(20,83,45,.07)}
.cx-need-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:10px}
.cx-need-head h3{font-size:16.5px;font-weight:800;line-height:1.2;letter-spacing:.1px}
.cx-need-head span{font-size:11.5px;font-weight:600;color:var(--cx-mu)}
.cx-need-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.cx-need-btn{--t:#2b6cb0;position:relative;display:flex;align-items:center;gap:10px;height:54px;padding:0 12px;background:#fbfcfb;border:1px solid var(--cx-bd)!important;transition:background .15s,border-color .15s,box-shadow .15s,transform .1s}
.cx-need-btn:active{transform:scale(.97)}
.cx-need-btn.tone-blue{--t:#2b6cb0}
.cx-need-btn.tone-amber{--t:#c47a12}
.cx-need-btn.tone-teal{--t:#0f8a7e}
.cx-need-btn.tone-violet{--t:#8a45c2}
.cx-need-ic{flex:0 0 auto;display:grid;place-items:center;color:var(--t);background:none}
.cx-need-ic svg{width:22px;height:22px}
.cx-need-tx{min-width:0;display:block}
.cx-need-tx b{display:block;font-size:14px;font-weight:700;line-height:1.15;color:var(--cx-tx)}
.cx-need-tx small{display:block;margin-top:2px;font-size:11px;line-height:1.2;color:var(--cx-mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cx-need-tick{position:absolute;top:50%;right:9px;width:16px;height:16px;display:grid;place-items:center;color:#fff;background:var(--cx-g);transform:translateY(-50%) scale(0);transition:transform .15s}
.cx-need-btn.on{background:var(--cx-gl);border-color:var(--cx-g)!important;box-shadow:inset 3px 0 0 var(--cx-g)}
.cx-need-btn.on .cx-need-tick{transform:translateY(-50%) scale(1)}
.cx-need-other{width:100%;height:42px;margin-top:8px;padding:0 12px;font:inherit;font-size:14px;color:var(--cx-tx);background:var(--cx-bg);border:1px solid var(--cx-bd);outline:0}
.cx-need-other:focus{border-color:var(--cx-g);box-shadow:0 0 0 3px rgba(20,83,45,.1)}
.cx-callstaff{width:100%;display:flex;align-items:center;justify-content:center;gap:9px;height:46px;margin-top:10px;padding:0 14px;font-size:15px;font-weight:800;letter-spacing:.3px;color:#fff!important;background:linear-gradient(135deg,#145a33,#1f8a4c);box-shadow:0 6px 16px rgba(20,83,45,.22),inset 0 1px 0 rgba(255,255,255,.18)}
.cx-callstaff:active:not(:disabled){opacity:.9;transform:translateY(1px)}
.cx-callstaff:disabled{opacity:.6;box-shadow:none}

/* ---- quick actions ---- */
.cx-quick{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:0 0 20px}
.cx-quick button{--t:#14532d;display:flex;flex-direction:column;align-items:flex-start;gap:5px;padding:12px;background:var(--cx-card);border:1px solid var(--cx-bd);box-shadow:0 4px 14px rgba(20,83,45,.06);transition:transform .1s,box-shadow .15s}
.cx-quick button:active:not(:disabled){transform:scale(.97)}
.cx-quick button:disabled{opacity:.55}
.cx-quick .tone-bill{--t:#b86a00}
.cx-quick .tone-rate{--t:#c99700}
.cx-quick .tone-more{--t:#14532d}
.cx-q-ic{display:inline-flex;margin-bottom:4px;color:var(--t)}
.cx-quick button b{font-size:13.5px;font-weight:800;line-height:1.2}
.cx-quick button small{font-size:11px;line-height:1.25;color:var(--cx-mu)}

/* ---- sheets: order placed, details, more, feedback ---- */
.cx-okbox{display:flex;flex-direction:column;align-items:center;gap:8px;margin:2px 0 14px;text-align:center;color:var(--cx-mu);font-size:14px}
.cx-okbox b{color:var(--cx-tx);font-size:17px}
.cx-okbox .cx-place{margin-top:6px}
.cx .cx-okmark{display:inline-grid;place-items:center;width:64px;height:64px;color:#fff;background:linear-gradient(135deg,#2f8f55,#14532d);border-radius:50%!important;box-shadow:0 8px 20px rgba(20,83,45,.3);animation:cx-pop .45s ease-out,cx-breathe 2s ease-in-out .45s infinite}
.cx .cx-okmark svg{width:32px;height:32px;stroke-width:2.6}
@keyframes cx-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.14)}}
@media (prefers-reduced-motion:reduce){.cx .cx-okmark{animation:none}}
.cx-track-sub{margin:2px 0 4px;font-size:14px;color:var(--cx-mu)}
@keyframes cx-pop{0%{transform:scale(.4);opacity:0}70%{transform:scale(1.12)}100%{transform:scale(1);opacity:1}}
.cx-sheet .cx-track{box-shadow:none;border-color:var(--cx-bd)}
.cx-sum{margin-top:12px;padding:10px 14px;border:1px solid var(--cx-bd);background:var(--cx-bg)}
.cx-sum > div{display:flex;justify-content:space-between;gap:10px;padding:5px 0;font-size:14px}
.cx-sum-t{margin-top:4px;padding-top:9px!important;border-top:1px dashed var(--cx-bd);font-weight:800}
.cx-sum-t b{color:var(--cx-g);font-size:17px}
.cx-two{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}
.cx-two button{display:flex;align-items:center;justify-content:center;gap:8px;padding:13px 8px;font-weight:800;font-size:14px;text-align:center;color:var(--cx-g);background:var(--cx-gl);border:1px solid #cfe5d6}
.cx-two button:disabled{opacity:.55}
.cx-linkbtn{width:100%;display:flex;align-items:center;justify-content:center;gap:6px;margin-top:6px;padding:12px;font-weight:700;color:var(--cx-g)}
.cx-more{display:flex;flex-direction:column}
.cx-more > button{display:flex;align-items:center;gap:12px;padding:12px 2px;border-bottom:1px solid var(--cx-bd);color:var(--cx-mu)}
.cx-more > button:last-child{border-bottom:0}
.cx-more > button:active{background:var(--cx-bg)}
.cx-more-ic{--t:#14532d;width:28px;display:inline-flex;justify-content:center;flex:none;color:var(--t)}
.cx-more .tone-note .cx-more-ic{--t:#2b6cb0}
.cx-more .tone-again .cx-more-ic{--t:#0f8a7e}
.cx-more .tone-rate .cx-more-ic{--t:#c99700}
.cx-more .tone-info .cx-more-ic{--t:#8a45c2}
.cx-more-tx{flex:1;min-width:0}
.cx-more-tx b{display:block;color:var(--cx-tx);font-size:15px}
.cx-more-tx small{display:block;font-size:12px;color:var(--cx-mu)}
.cx-fb{display:flex;flex-direction:column}
.cx-stars{display:flex;justify-content:center;gap:4px;margin-top:4px}
.cx-stars button{padding:2px;display:grid;place-items:center;color:#d3d9d5;transition:transform .12s,color .12s}
.cx-stars button:active{transform:scale(.88)}
.cx-stars button.on{color:#f5b301}
.cx-fb-word{margin:6px 0 4px;text-align:center;font-size:15px;font-weight:700;color:var(--cx-mu)}
.cx-fb-word.on{color:var(--cx-g)}
.cx-fb-h{margin:14px 0 8px;font-size:14px;font-weight:700;color:var(--cx-mu)}
.cx-tags{display:flex;flex-wrap:wrap;gap:8px}
.cx-tags button{display:flex;align-items:center;gap:5px;padding:8px 14px;font-size:13px;font-weight:700;color:var(--cx-tx);background:var(--cx-bg);border:1px solid var(--cx-bd)}
.cx-tags button.on{color:#fff;background:var(--cx-g);border-color:var(--cx-g)}
.cx-fb .cx-details{margin:12px 0}
.cx-info{display:flex;flex-direction:column;gap:12px;font-size:15px}
.cx-info h3{font-size:19px;font-weight:800}
.cx-info p{color:var(--cx-mu)}
.cx-info > div{display:flex;align-items:flex-start;gap:10px}
.cx-info > div svg{margin-top:2px;color:var(--cx-g)}
.cx-info a{color:var(--cx-g);font-weight:700}

/* ---- how many people ---- */
.cx-party{position:fixed;top:0;left:0;right:0;height:100vh;height:100dvh;overscroll-behavior:contain;z-index:900;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto;background:linear-gradient(160deg,#0e3a21,#1c7a42)}
.cx-party-card{position:relative;width:100%;max-width:420px;margin:auto;padding:26px 20px 20px;text-align:center;background:var(--cx-card);box-shadow:0 24px 60px rgba(0,0,0,.35);animation:cx-up .3s ease-out}
.cx-party-x{position:absolute;top:10px;right:10px;width:34px;height:34px;display:grid;place-items:center;color:var(--cx-g);background:var(--cx-gl)}
.cx-party-logo{width:64px;height:64px;object-fit:cover;margin:0 auto 8px;display:block;border:2px solid var(--cx-gl)}
.cx-party-rest{display:block;font-size:12px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--cx-mu)}
.cx-party-card h2{margin:2px 0 2px;font-size:28px;font-weight:800}
.cx-party-table{display:inline-flex;align-items:center;gap:5px;font-size:13.5px;font-weight:700;color:var(--cx-g);background:var(--cx-gl);padding:4px 12px}
.cx-party-card h3{margin:20px 0 14px;font-size:18px;font-weight:800}
.cx-guests{display:grid;grid-template-columns:repeat(auto-fit,minmax(58px,1fr));gap:10px;margin:18px 0 6px}
.cx-guests button{height:58px;font-size:22px;font-weight:800;color:var(--cx-tx);background:var(--cx-bg);border:1.5px solid var(--cx-bd);text-align:center;transition:background .15s,border-color .15s,transform .1s}
.cx-guests button:active{transform:scale(.94)}
.cx-guests button.on{color:#fff;background:var(--cx-g);border-color:var(--cx-g);box-shadow:0 6px 14px rgba(20,83,45,.28)}
.cx-party-hint{margin:6px 0 14px;font-size:12.5px;color:var(--cx-mu)}
.cx-party-chip{display:inline-flex;align-items:center;gap:5px;margin-top:6px;padding:4px 10px;font-size:12px;font-weight:700;color:#fff;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.35)}
@media (min-width:700px){
  .cx{max-width:560px;margin:0 auto;box-shadow:0 0 0 1px var(--cx-bd)}
  .cx-head{}
}
`;

const CSS = RAW_CSS;

function Styles() {
  return <style>{CSS}</style>;
}