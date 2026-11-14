import React, { useEffect, useMemo, useRef, useState } from "react";
import "../styles/customer-app.css";
import Icon from "../components/customer/Icons";
import { API_URL, img, money } from "../lib/api";
import { AboutPage, AccountTab, FavoritesPage, HomeTab, MenuTab, OffersPage, OrderDetail, OrdersTab } from "../components/customer/tabs";
import { BottomNav, NeedAnything, Sheet, Stepper, billNo } from "../components/customer/parts";

/* ------------------------------------------------------------------ */
/*  Customer QR ordering app: Home / Menu / My Order / Account         */
/* ------------------------------------------------------------------ */

const CALL_COOLDOWN_SEC = 15; // customer can ring the bell once every 15 seconds
const RING_ANIMATION_MS = 3000; // bell keeps ringing for 3 seconds
const STATUS_POLL_MS = 5000; // order status refreshes every 5 seconds
const TRACK_HIDE_KEY = "bb_track_hide_";
const RATING_WORDS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];
const FEEDBACK_TAGS = ["Food", "Service", "Ambience", "Cleanliness", "Value"];
const OPEN = ["pending", "preparing", "ready"];

// ---------- API ----------
async function request(path, options = {}) {
  const res = await fetch(API_URL + path, {
    method: options.method || "GET",
    headers: options.body ? { "Content-Type": "application/json" } : {},
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) throw new Error(data.message || "Request failed.");
  return data;
}

// ---------- storage helpers (storage is optional) ----------
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
    /* ignore */
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
    /* ignore */
  }
};

// keep product ids of items we already know when the server sends names only
const mergeItems = (old = [], next = []) =>
  next.length ? next.map((i) => ({ ...i, id: i.id ?? old.find((x) => x.name === i.name)?.id })) : old;

function upsertOrder(list, o) {
  const i = list.findIndex((x) => x.id === o.id);
  if (i < 0) return [...list, o].slice(-30);
  const cur = list[i];
  const next = { ...cur, ...o, items: mergeItems(cur.items, o.items), guests: o.guests || cur.guests };
  if (cur.status === next.status && cur.total === next.total && (cur.items || []).length === (next.items || []).length) return list;
  const copy = [...list];
  copy[i] = next;
  return copy;
}

export default function CustomerOrder({ token }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  // navigation
  const [tab, setTab] = useState("home"); // home | menu | orders | account
  const [deep, setDeep] = useState(null); // { type: order | fav | offers | about, id }
  const pushedRef = useRef(false);

  // menu
  const [selCat, setSelCat] = useState("all");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ type: "all", sort: "default" });
  const searchRef = useRef(null);

  // cart + checkout
  const [cart, setCart] = useState({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [showCheckout, setShowCheckout] = useState(false);
  const [placed, setPlaced] = useState(null);
  const [note, setNote] = useState("");

  // customer details asked right after scanning (name required, phone optional)
  const profileKey = `bb_customer_${token}`;
  const [profile, setProfile] = useState(() => readJson(profileKey, { name: "", phone: "" }));
  const [nameDraft, setNameDraft] = useState("");
  const [phoneDraft, setPhoneDraft] = useState("");

  // favorites + local order history (this phone, this table)
  const favKey = `bb_fav_${token}`;
  const ordersKey = `bb_orders_${token}`;
  const [favs, setFavs] = useState(() => readJson(favKey, []));
  const [saved, setSaved] = useState(() => readJson(ordersKey, []));

  // bell
  const bellKey = `bb_call_until_${token}`;
  const [bellBusy, setBellBusy] = useState(false);
  const [until, setUntil] = useState(() => {
    const s = readNumber(bellKey);
    return s > Date.now() ? s : 0;
  });
  const [now, setNow] = useState(Date.now());
  const [ringEnd, setRingEnd] = useState(0);

  // live order status
  const hideKey = TRACK_HIDE_KEY + token;
  const [track, setTrack] = useState(null);
  const [trackLoaded, setTrackLoaded] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(TRACK_HIDE_KEY + token) || "";
    } catch {
      return "";
    }
  });
  const placedAtRef = useRef(0);

  // sheets
  const [showHelp, setShowHelp] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [panel, setPanel] = useState(""); // "" | request | feedback
  const [picked, setPicked] = useState([]);
  const [otherText, setOtherText] = useState("");
  const [reqText, setReqText] = useState("");
  const [rating, setRating] = useState(0);
  const [fbTags, setFbTags] = useState([]);
  const [fbText, setFbText] = useState("");
  const [fbDone, setFbDone] = useState(false);
  const [fbBusy, setFbBusy] = useState(false);

  // "How many people are you?"
  const [askParty, setAskParty] = useState(false); // false | "name" | "guests"
  const [guestCount, setGuestCount] = useState(() => Math.min(30, Math.max(1, readNumber("bb_guests") || 2)));
  const maxGuests = data?.table?.capacity > 0 ? Math.min(30, Number(data.table.capacity)) : 8;
  const pickedGuests = Math.min(guestCount, maxGuests);
  const [partyBusy, setPartyBusy] = useState(false);
  const [partyErr, setPartyErr] = useState(false);

  // page behind a sheet must not scroll
  const overlayOpen = showCheckout || !!placed || showHelp || showMore || showFilters || !!panel || askParty;
  useEffect(() => {
    if (!overlayOpen) return undefined;
    const html = document.documentElement;
    const pH = html.style.overflow;
    const pB = document.body.style.overflow;
    html.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      html.style.overflow = pH;
      document.body.style.overflow = pB;
    };
  }, [overlayOpen]);

  // ---- load table menu ----
  useEffect(() => {
    let active = true;
    request(`/public/qr/${token}`)
      .then((r) => {
        if (active) {
          setData(r);
          setError("");
        }
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [token]);

  // ---- order status polling ----
  useEffect(() => {
    let active = true;
    const load = () => {
      if (document.hidden) return;
      request(`/public/qr/${token}/status`)
        .then((r) => {
          if (!active) return;
          if (!r.order && Date.now() - placedAtRef.current < 8000) return;
          setTrack(r.order || null);
          setTrackLoaded(true);
        })
        .catch(() => {
          /* keep last known status */
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

  // ---- remember every order seen on this table (for My Order) ----
  useEffect(() => {
    if (!track || track.status === undefined) return;
    setSaved((prev) =>
      upsertOrder(prev, {
        id: track.id,
        bill_no: track.bill_no,
        status: track.status,
        total: track.total,
        created_at: track.created_at,
        items: track.items || [],
      }),
    );
  }, [track]);
  useEffect(() => writeJson(ordersKey, saved), [saved, ordersKey]);
  useEffect(() => writeJson(favKey, favs), [favs, favKey]);
  useEffect(() => writeJson(profileKey, profile), [profile, profileKey]);

  // ---- ask party size first ----
  useEffect(() => {
    if (!data) return;
    if (data.party) setGuestCount(data.party.guests);
    if (!profile.name) setAskParty("name");
    else if (!data.party) setAskParty("guests");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // fill the details form with what is already saved
  useEffect(() => {
    if (askParty === "name") {
      setNameDraft(profile.name || "");
      setPhoneDraft(profile.phone || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askParty]);

  // ---- toast auto hide ----
  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  // ---- bell countdown ----
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

  // ---- phone back button closes the detail page ----
  useEffect(() => {
    const onPop = () => {
      pushedRef.current = false;
      setDeep(null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const left = Math.max(0, Math.ceil((until - now) / 1000));
  const ringing = ringEnd > now;
  const callBlocked = bellBusy || left > 0;

  // ---- menu data ----
  const products = useMemo(() => data?.products || [], [data]);
  const categories = useMemo(
    () =>
      (data?.categories || [])
        .map((c) => {
          const items = products.filter((p) => String(p.category_id) === String(c.id));
          return { ...c, items, cover: c.image_url || items.find((p) => p.image_url)?.image_url || "" };
        })
        .filter((c) => c.items.length > 0),
    [data, products],
  );
  const offers = useMemo(() => (Array.isArray(data?.offers) ? data.offers : []), [data]);
  const recommended = useMemo(() => {
    const tagged = products.filter((p) => /best|chef|popular/i.test(String(p.tag || "")));
    if (tagged.length) return tagged.slice(0, 4);
    return categories.map((c) => c.items.find((p) => p.image_url)).filter(Boolean).slice(0, 4);
  }, [products, categories]);

  // ---- cart ----
  const lines = products.filter((p) => cart[p.id]).map((p) => ({ ...p, qty: cart[p.id] }));
  const total = lines.reduce((s, p) => s + Number(p.price) * p.qty, 0);
  const count = lines.reduce((s, p) => s + p.qty, 0);
  const change = (id, qty) =>
    setCart((cur) => {
      const next = { ...cur };
      if (qty <= 0) delete next[id];
      else next[id] = Math.min(99, qty);
      return next;
    });
  const toggleFav = (id) => setFavs((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));

  // ---- orders (history + live status) ----
  const orders = useMemo(() => {
    const maxId = saved.reduce((m, o) => Math.max(m, Number(o.id) || 0), 0);
    return [...saved]
      .sort((a, b) => Number(b.id) - Number(a.id))
      .map((o) => {
        let ui = track && track.id === o.id ? track.status : o.status;
        if (ui !== "cancelled") {
          if (Number(o.id) < maxId) ui = "completed";
          else if (trackLoaded && !track) ui = "completed";
        }
        return { ...o, ui };
      });
  }, [saved, track, trackLoaded]);
  const hasLive = orders.some((o) => OPEN.includes(o.ui));

  const canBill = !!track && track.status !== "cancelled";
  const showTracker = !!track && !(["served", "bill_pending", "cancelled"].includes(track.status) && dismissed === `${track.id}:${track.status}`);

  // ---- navigation ----
  const changeTab = (k) => {
    if (pushedRef.current) window.history.back();
    setDeep(null);
    setTab(k);
    window.scrollTo({ top: 0 });
  };
  const openDeep = (type, id) => {
    const url = window.location.pathname + window.location.search;
    if (pushedRef.current) window.history.replaceState({ cx: type }, "", url);
    else {
      window.history.pushState({ cx: type }, "", url);
      pushedRef.current = true;
    }
    setDeep({ type, id });
    window.scrollTo({ top: 0 });
  };
  const goBack = () => {
    if (pushedRef.current) window.history.back();
    else setDeep(null);
  };
  const openCategory = (id) => {
    setSelCat(String(id));
    setSearch("");
    changeTab("menu");
  };
  const focusSearch = () => {
    setSelCat("all");
    changeTab("menu");
    setTimeout(() => searchRef.current && searchRef.current.focus(), 80);
  };
  const clearFilters = () => {
    setSearch("");
    setSelCat("all");
    setFilters({ type: "all", sort: "default" });
  };
  const notify = (m) => setNotice(m);

  // ---- place order ----
  const place = async () => {
    if (!count || busy) return;
    if (!profile.name.trim()) {
      setShowCheckout(false);
      return setAskParty("name");
    }
    setBusy(true);
    try {
      const result = await request(`/public/qr/${token}/order`, {
        method: "POST",
        body: {
          customer_name: profile.name.trim(),
          customer_phone: (profile.phone || "").trim(),
          note: note.trim(),
          guests: data.party ? data.party.guests : undefined,
          items: lines.map((p) => ({ product_id: p.id, qty: p.qty })),
        },
      });
      const o = result.order;
      const items = lines.map((p) => ({ id: p.id, name: p.name, qty: p.qty, line_total: p.price * p.qty }));
      const createdAt = new Date().toISOString();
      placedAtRef.current = Date.now();
      setSaved((prev) => upsertOrder(prev, { id: o.id, bill_no: o.bill_no, status: "pending", total: o.total, created_at: createdAt, items, guests: data.party?.guests }));
      setTrack((prev) => (prev && prev.id === o.id ? { ...prev, total: o.total } : { id: o.id, bill_no: o.bill_no, status: "pending", total: o.total, created_at: createdAt, items }));
      setPlaced({ id: o.id, bill_no: o.bill_no });
      setCart({});
      setNote("");
      setShowCheckout(false);
    } catch (e) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  };

  const submitName = () => {
    const name = nameDraft.trim();
    if (name.length < 2) return setNotice("Please enter your name.");
    if (phoneDraft && !/^[0-9]{10}$/.test(phoneDraft)) return setNotice("Please enter a valid 10-digit mobile number, or leave it empty.");
    setProfile({ name, phone: phoneDraft });
    setAskParty(data.party ? false : "guests");
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
      const result = await request(`/public/qr/${token}/call`, { method: "POST", body: { requests, other_text: other.trim(), ...extra } });
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
  const toggleRequest = (key) => setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));
  const requestBill = () => {
    if (!canBill) return setNotice("Please place an order before asking for the bill.");
    return callCashier([], "", { kind: "bill" });
  };
  const sendSpecial = async () => {
    if (!reqText.trim()) return setNotice("Please type your request.");
    const ok = await callCashier([], "", { kind: "request", note: reqText.trim() });
    if (ok) {
      setReqText("");
      setPanel("");
    }
  };

  // ---- feedback ----
  const openFeedback = () => {
    setShowMore(false);
    setShowHelp(false);
    setPlaced(null);
    setRating(0);
    setFbTags([]);
    setFbText("");
    setFbDone(false);
    setPanel("feedback");
  };
  const toggleTag = (t) => setFbTags((l) => (l.includes(t) ? l.filter((x) => x !== t) : [...l, t]));
  const submitFeedback = async () => {
    if (!rating) return setNotice("Please tap a star to rate us.");
    setFbBusy(true);
    try {
      await request(`/public/qr/${token}/feedback`, {
        method: "POST",
        body: { rating, tags: fbTags, comment: fbText.trim(), order_id: track?.id || undefined, customer_name: profile.name.trim() },
      });
      setFbDone(true);
    } catch (e) {
      setNotice(e.message);
    } finally {
      setFbBusy(false);
    }
  };

  // ---- reorder an earlier order ----
  const reorder = (o) => {
    let added = 0;
    setCart((cur) => {
      const next = { ...cur };
      (o.items || []).forEach((i) => {
        const p = products.find((x) => x.id === i.id) || products.find((x) => x.name === i.name);
        if (p) {
          next[p.id] = Math.min(99, (next[p.id] || 0) + i.qty);
          added += i.qty;
        }
      });
      return next;
    });
    setShowMore(false);
    setTimeout(() => {
      if (!added) setNotice("These items are not available on the menu right now.");
      else setShowCheckout(true);
    }, 0);
  };
  const reorderLast = () => {
    const last = orders.find((o) => o.items?.length && o.ui !== "cancelled");
    if (!last) return setNotice("No previous order found on this phone.");
    reorder(last);
  };

  const dismissTrack = () => {
    if (!track) return;
    const mark = `${track.id}:${track.status}`;
    setDismissed(mark);
    try {
      localStorage.setItem(hideKey, mark);
    } catch {
      /* ignore */
    }
  };

  // ---------- screens ----------
  if (!data && !error) {
    return (
      <div className="cx">
        <div className="cx-center" role="status">
          <div className="cx-spinner" />
          <p>Loading menu...</p>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="cx">
        <div className="cx-center">
          <Icon n="alert" size={40} stroke={1.5} />
          <h2>Unable to open this table menu</h2>
          <p>{error}</p>
          <button className="cx-primary" onClick={() => window.location.reload()}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  const callNote =
    left > 0 ? (
      <div className="cx-callnote" role="status">
        <Icon n="check" size={18} stroke={2.4} />
        <span>
          Staff has been called. You can call again in <b>{left}s</b>
        </span>
      </div>
    ) : null;

  const c = {
    data, profile, tab, categories, products, offers, recommended, cart, change, count, total, favs, toggleFav,
    track, orders, showTracker, dismissTrack, search, setSearch, searchRef, selCat, setSelCat, filters,
    setTab: changeTab, openDeep, goBack, openCategory, focusSearch, clearFilters, notify,
    openCart: () => (count ? setShowCheckout(true) : setNotice("Your cart is empty. Add some items first.")),
    openFilters: () => setShowFilters(true),
    openHelp: () => setShowHelp(true),
    openMore: () => setShowMore(true),
    openFeedback, setAskParty, reorder, requestBill, callCashier, callBlocked, left, bellBusy,
    picked, toggleRequest, otherText, setOtherText, callNote,
    bell: { left, ringing, busy: bellBusy, onPress: () => callCashier() },
  };

  const navTab = deep ? (deep.type === "order" ? "orders" : "account") : tab;

  return (
    <div className="cx">
      {notice && (
        <div className="cx-toast" role="status">
          <span>{notice}</span>
          <button aria-label="Close" onClick={() => setNotice("")}>
            <Icon n="x" size={18} />
          </button>
        </div>
      )}

      {/* ===== screens ===== */}
      <main className="cx-main">
        {deep ? (
          deep.type === "order" ? (
            <OrderDetail c={c} id={deep.id} />
          ) : deep.type === "fav" ? (
            <FavoritesPage c={c} />
          ) : deep.type === "offers" ? (
            <OffersPage c={c} />
          ) : (
            <AboutPage c={c} />
          )
        ) : tab === "menu" ? (
          <MenuTab c={c} />
        ) : tab === "orders" ? (
          <OrdersTab c={c} />
        ) : tab === "account" ? (
          <AccountTab c={c} />
        ) : (
          <HomeTab c={c} />
        )}
        <footer className="cx-foot">
          <p>Thank you for visiting {data.restaurant}!</p>
          <small>Powered by AmpleMind Technologies Pvt Ltd</small>
        </footer>
      </main>

      {/* ===== floating cart bar ===== */}
      {count > 0 && (
        <div className="cx-cart">
          <div className="cx-cart-info">
            <span className="cx-cart-ic">
              <Icon n="cart" size={24} />
              <i>{count}</i>
            </span>
            <div>
              <b>
                {count} item{count > 1 ? "s" : ""} added
              </b>
              <span>{money(total)}</span>
            </div>
          </div>
          <button onClick={() => setShowCheckout(true)} disabled={busy}>
            View cart <Icon n="arrowr" size={18} />
          </button>
        </div>
      )}

      <BottomNav tab={navTab} onTab={changeTab} live={hasLive} />

      {/* ===== scan welcome: 1) your name  2) how many people ===== */}
      {askParty && (
        <div className="cx-party" role="dialog" aria-modal="true" aria-label={askParty === "name" ? "Your details" : "Number of guests"}>
          <div className="cx-party-card">
            {((askParty === "name" && profile.name) || (askParty === "guests" && data.party)) && (
              <button className="cx-xbtn corner" aria-label="Close" onClick={() => setAskParty(false)}>
                <Icon n="x" size={20} />
              </button>
            )}
            {data.logo_url && <img className="cx-party-logo" src={img(data.logo_url)} alt="" />}
            <small>{data.restaurant}</small>
            <h2>{profile.name && askParty === "guests" ? `Welcome, ${profile.name}!` : "Welcome!"}</h2>
            <p className="cx-tablepill dark">
              <Icon n="table" size={16} /> Table {data.table.name}
            </p>

            {askParty === "name" ? (
              <>
                <h3>Tell us about you</h3>
                <div className="cx-form tight">
                  <input className="cx-input" type="text" aria-label="Your name" placeholder="Your name *" maxLength={100} autoComplete="name" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} />
                  <input className="cx-input" type="tel" inputMode="numeric" aria-label="Mobile number" placeholder="Mobile number (optional)" maxLength={10} autoComplete="tel" value={phoneDraft} onChange={(e) => setPhoneDraft(e.target.value.replace(/\D/g, "").slice(0, 10))} />
                </div>
                <button className="cx-primary" onClick={submitName}>
                  Continue <Icon n="arrowr" size={20} />
                </button>
              </>
            ) : (
              <>
                <h3>How many people are you?</h3>
                <div className="cx-guests" role="radiogroup" aria-label="Number of people">
                  {Array.from({ length: maxGuests }, (_, i) => i + 1).map((n) => (
                    <button key={n} type="button" role="radio" aria-checked={n === pickedGuests} className={n === pickedGuests ? "on" : ""} onClick={() => setGuestCount(n)}>
                      {n}
                    </button>
                  ))}
                </div>
                <p className="cx-hint">
                  {data.table.capacity ? `This table seats ${maxGuests}. ` : ""}Tap the number of people sitting.
                </p>
                <button className="cx-primary" onClick={submitParty} disabled={partyBusy}>
                  {partyBusy ? "Please wait..." : "Continue"} <Icon n="arrowr" size={20} />
                </button>
                {partyErr && (
                  <button className="cx-linkbtn center" onClick={() => setAskParty(false)}>
                    Skip for now
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ===== checkout ===== */}
      {showCheckout && (
        <Sheet title="Your order" sub={`Table ${data.table.name}${profile.name ? " · " + profile.name : ""}`} onClose={() => setShowCheckout(false)}>
          {lines.length === 0 ? (
            <p className="cx-note">Your cart is empty.</p>
          ) : (
            <div>
              {lines.map((p) => (
                <div className="cx-co-item" key={p.id}>
                  <div>
                    <b>{p.name}</b>
                    <small>
                      {money(p.price)} x {p.qty}
                    </small>
                  </div>
                  <Stepper qty={p.qty} onChange={(q) => change(p.id, q)} small />
                  <strong>{money(p.price * p.qty)}</strong>
                </div>
              ))}
            </div>
          )}
          <div className="cx-form">
            <h3>Special instructions (optional)</h3>
            <textarea className="cx-input" rows={2} maxLength={200} placeholder="e.g. Less sugar, extra spicy, no onion..." value={note} onChange={(e) => setNote(e.target.value)} />
            <small className="cx-cnt">{note.length}/200</small>
          </div>
          <div className="cx-total big">
            <span>Total amount</span>
            <b>{money(total)}</b>
          </div>
          <button className="cx-primary" onClick={place} disabled={busy || count === 0}>
            {busy ? "Sending order..." : "Place order"} <Icon n="check" size={20} stroke={2.4} />
          </button>
          <p className="cx-note">Please pay at the cashier after your meal.</p>
        </Sheet>
      )}

      {/* ===== order placed ===== */}
      {placed && (
        <Sheet title="Order placed" sub={`Table ${data.table.name}`} onClose={() => setPlaced(null)}>
          <div className="cx-ok">
            <span>
              <Icon n="check" size={36} stroke={2.4} />
            </span>
            <b>Thank you! We have received your order.</b>
            <p>Order #{billNo(placed)} is waiting to be accepted by our staff.</p>
          </div>
          <button
            className="cx-primary"
            onClick={() => {
              const id = placed.id;
              setPlaced(null);
              openDeep("order", id);
            }}
          >
            View order status
          </button>
          <button className="cx-outline full" onClick={() => setPlaced(null)}>
            <Icon n="plus" size={18} /> Order more items
          </button>
        </Sheet>
      )}

      {/* ===== help ===== */}
      {showHelp && (
        <Sheet title="How can we help?" sub={`Table ${data.table.name}`} onClose={() => setShowHelp(false)}>
          <NeedAnything bare picked={picked} onToggle={toggleRequest} otherText={otherText} onOtherText={setOtherText} left={left} busy={bellBusy} onCall={() => callCashier(picked, otherText)} />
          <button className="cx-outline full" onClick={() => { setShowHelp(false); requestBill(); }} disabled={callBlocked}>
            <Icon n="receipt" size={20} /> Request Bill
          </button>
        </Sheet>
      )}

      {/* ===== more ===== */}
      {showMore && (
        <Sheet title="More options" sub={`Table ${data.table.name}`} onClose={() => setShowMore(false)}>
          <div className="cx-more">
            {[
              ["note", "Add special request", "Extra sauce, no spice, etc.", () => { setShowMore(false); setPanel("request"); }],
              ["refresh", "Reorder", "Order again from your last order", () => { setShowMore(false); reorderLast(); }],
              ["star", "Feedback / rate", "Share your experience", openFeedback],
              ["info", "Cafe info", "Contact and location", () => { setShowMore(false); openDeep("about"); }],
            ].map(([icon, title, sub, fn]) => (
              <button key={title} onClick={fn}>
                <Icon n={icon} size={24} stroke={1.6} />
                <span>
                  <b>{title}</b>
                  <small>{sub}</small>
                </span>
                <Icon n="chevr" size={20} />
              </button>
            ))}
          </div>
        </Sheet>
      )}

      {/* ===== filters ===== */}
      {showFilters && (
        <Sheet title="Filters" sub="Narrow down the menu" onClose={() => setShowFilters(false)}>
          <div className="cx-form">
            <h3>Food type</h3>
            <div className="cx-tags">
              {[["all", "All"], ["veg", "Veg"], ["nonveg", "Non-veg"], ["egg", "Egg"]].map(([k, l]) => (
                <button key={k} className={filters.type === k ? "on" : ""} aria-pressed={filters.type === k} onClick={() => setFilters((f) => ({ ...f, type: k }))}>
                  {l}
                </button>
              ))}
            </div>
            <h3>Sort by price</h3>
            <div className="cx-tags">
              {[["default", "Default"], ["low", "Low to high"], ["high", "High to low"]].map(([k, l]) => (
                <button key={k} className={filters.sort === k ? "on" : ""} aria-pressed={filters.sort === k} onClick={() => setFilters((f) => ({ ...f, sort: k }))}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="cx-actions">
            <button className="cx-outline" onClick={() => setFilters({ type: "all", sort: "default" })}>
              Clear
            </button>
            <button className="cx-primary" onClick={() => setShowFilters(false)}>
              Show items
            </button>
          </div>
        </Sheet>
      )}

      {/* ===== special request / feedback ===== */}
      {panel && (
        <Sheet
          title={panel === "request" ? "Special request" : "Rate your experience"}
          sub={panel === "feedback" ? "Your feedback helps us serve you better" : `Table ${data.table.name}`}
          onClose={() => setPanel("")}
        >
          {panel === "request" && (
            <div className="cx-form">
              <textarea className="cx-input" rows={3} maxLength={200} aria-label="Your request" placeholder="e.g. Extra sauce, less spicy, please bring a high chair..." value={reqText} onChange={(e) => setReqText(e.target.value)} />
              <button className="cx-primary" onClick={sendSpecial} disabled={callBlocked}>
                {left > 0 ? `Try again in ${left}s` : "Send to staff"}
              </button>
            </div>
          )}
          {panel === "feedback" &&
            (fbDone ? (
              <div className="cx-ok">
                <span>
                  <Icon n="check" size={36} stroke={2.4} />
                </span>
                <b>Thank you for your feedback!</b>
                <p>We are glad to have you with us.</p>
                <button className="cx-primary" onClick={() => setPanel("")}>
                  Done
                </button>
              </div>
            ) : (
              <div className="cx-form">
                <div className="cx-stars" role="radiogroup" aria-label="Rating">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} className={n <= rating ? "on" : ""} onClick={() => setRating(n)} aria-label={`${n} star${n > 1 ? "s" : ""}`} role="radio" aria-checked={n === rating}>
                      <Icon n="star" size={40} fill={n <= rating} stroke={1.6} />
                    </button>
                  ))}
                </div>
                <p className={`cx-fb-word ${rating ? "on" : ""}`}>{rating ? RATING_WORDS[rating] : "Tap a star to rate"}</p>
                <h3>What stood out?</h3>
                <div className="cx-tags">
                  {FEEDBACK_TAGS.map((t) => (
                    <button key={t} className={fbTags.includes(t) ? "on" : ""} aria-pressed={fbTags.includes(t)} onClick={() => toggleTag(t)}>
                      {t}
                    </button>
                  ))}
                </div>
                <textarea className="cx-input" rows={3} maxLength={300} aria-label="Your comment" placeholder="Tell us more (optional)" value={fbText} onChange={(e) => setFbText(e.target.value)} />
                <button className="cx-primary" onClick={submitFeedback} disabled={fbBusy}>
                  {fbBusy ? "Sending..." : "Submit feedback"}
                </button>
              </div>
            ))}
        </Sheet>
      )}
    </div>
  );
}