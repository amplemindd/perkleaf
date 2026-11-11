import React, { useCallback, useEffect, useRef, useState } from "react";
import Icon from "../lib/icons";
import {
  A,
  ShellCtx,
  navigate,
  useAuth,
  useFetch,
  usePath,
} from "../lib/store";
import { api, img, money, ago, TYPES } from "../lib/api";
import { SafeImg, useClickAway } from "../lib/ui";
import { KotAutoPrint } from "./Receipt";
import PlatIcon from "./PlatIcon";

const PN = { swiggy: "Swiggy", zomato: "Zomato" };
const PUBLIC = [
  ["pos", "POS / Billing", "cart", "/"],
  ["orders", "Orders", "receipt", "/orders"],
  ["online", "Online Orders", "globe", "/online"],
  ["tables", "Tables", "table", "/tables"],
  ["menu", "Menu Items", "list", "/menu"],
  ["customers", "Customers", "users", "/customers"],
  ["reports", "Reports", "chart", "/reports"],
];
const ADMIN = [
  ["dashboard", "Dashboard", "home", "/admin-dashboard", "reports"],
  ["pos", "POS / Billing", "cart", "/admin/pos", "pos"],
  ["orders", "Orders", "receipt", "/admin/orders", "orders"],
  ["online", "Online Orders", "globe", "/admin/online", "pos"],
  ["tables", "Tables", "table", "/admin/tables", "tables"],
  ["categories", "Categories & Items", "folder", "/admin/categories", "menu"],
  ["customers", "Customers", "users", "/admin/customers", "customers"],
  ["expenses", "Expenses", "rupee", "/admin/expenses", "expenses"],
  ["taxes", "Taxes / GST", "percent", "/admin/taxes", "taxes"],
  ["users", "Staff / Users", "user", "/admin/users", "staff"],
  ["waiters", "Waiters", "utensils", "/admin/waiters", "staff"],
  ["audit", "Audit Logs", "clock", "/admin/audit", "audit"],
  [
    "notifications",
    "Notifications",
    "bell",
    "/admin/notifications",
    "notifications",
  ],
  ["settings", "Settings", "gear", "/admin/settings", "settings"],
];
const NOTE_ICON = {
  order: "cart",
  payment: "card",
  inventory: "box",
  table: "table",
  customer: "user",
  expense: "alert",
  report: "calendar",
  system: "gear",
  staff: "users",
};
const NOTE_LINK = {
  order: "/admin/orders",
  table: "/admin/tables",
  product: "/admin/categories",
  customer: "/admin/customers",
  online: "/admin/online",
  report: "/admin-dashboard",
  expense: "/admin/expenses",
};

export default function Shell({ admin, children }) {
  const { user, settings, can, logout, isStaff } = useAuth();
  const path = usePath();
  const [search, setSearch] = useState("");
  const [catSel, setCatSel] = useState("");
  const [collapsed, setCollapsed] = useState(
    settings.sidebar_style === "collapsed",
  );
  const [drawer, setDrawer] = useState(false);
  const [bell, setBell] = useState(false);
  const [umenu, setUmenu] = useState(false);
  const [bump, setBump] = useState(0);
  const [shake, setShake] = useState(false);
  const [ordMenu, setOrdMenu] = useState("");
  const [catOpen, setCatOpen] = useState(false);
  const last = useRef(0);
  const reload = useCallback(() => setBump((b) => b + 1), []);

  useEffect(() => {
    setSearch("");
    setDrawer(false);
    setBell(false);
    setUmenu(false);
  }, [path]);
  useEffect(() => {
    if (admin && !isStaff) navigate("/admin-login");
  }, [admin, isStaff]);

  const open = useFetch("/orders/open", null, [bump], 15000);
  const notes = useFetch(
    admin && can("notifications") ? "/notifications" : "",
    { limit: 5, status: "unread" },
    [bump],
    5000,
  );
  const cats = useFetch(admin ? (can("pos") ? "/categories" : "") : "/categories", { pos: 1 }, [bump], 60000);
  const online = useFetch("/online/summary", null, [bump], 6000);
  const kots = useFetch("/kots/latest", null, [bump], 6000);
  const qrEvents = useFetch(can("pos") ? "/qr/events" : "", null, [], 2000);
  // ---- New (un-accepted) customer QR orders ----
  // Managers/admins (notifications permission) read the shared unread list from the server,
  // so accepting on one screen silences the ring on every screen.
  // Cashiers without that permission use a list saved on this device.
  const canNotes = can("notifications");
  const newOrdersSrv = useFetch(
    canNotes ? "/notifications" : "",
    { status: "unread", type: "order", limit: 100 },
    [bump],
    4000,
  );
  const reloadNewOrders = useRef(() => {});
  reloadNewOrders.current = newOrdersSrv.reload;
  const [hiddenIds, setHiddenIds] = useState([]);
  const [soundLocked, setSoundLocked] = useState(false);
  const [localPending, setLocalPending] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("bb_qr_pending") || "[]");
      const limit = Date.now() - 12 * 60 * 60 * 1000;
      return saved.filter((n) => !Date.parse(n.created_at) || Date.parse(n.created_at) > limit);
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("bb_qr_pending", JSON.stringify(localPending));
    } catch {
      // storage is optional
    }
  }, [localPending]);
  const pendingOrders = (
    canNotes
      ? (newOrdersSrv.data?.notifications || []).filter((n) => String(n.title || "").startsWith("QR Order Received"))
      : localPending
  ).filter((n) => !hiddenIds.includes(n.id));
  const hasPending = pendingOrders.length > 0;
  const hasPendingRef = useRef(false);
  hasPendingRef.current = hasPending;
  const acceptOrders = async (list) => {
    const ids = list.map((n) => n.id);
    setHiddenIds((h) => [...h, ...ids]);
    setLocalPending((l) => l.filter((n) => !ids.includes(n.id)));
    if (list.length >= pendingOrders.length) setOrdMenu("");
    await Promise.all(ids.map((id) => api(`/notifications/${id}/read`, { method: "PATCH" }).catch(() => {})));
    reloadNewOrders.current();
  };
  const [pops, setPops] = useState([]);
  const [kotQueue, setKotQueue] = useState([]); // QR-order KOTs waiting to be auto-printed
  const seen = useRef({ online: null, kot: null, qr: null });
  // Web Audio is retained for the existing short notification beep.
  const audioRef = useRef(null);
  // This HTMLAudioElement plays the restaurant's own bell.mp3 for Customer Call events.
  const bellSoundRef = useRef(null);

  const getCtx = useCallback(() => {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!audioRef.current) audioRef.current = new AC();
    if (audioRef.current.state === "suspended") {
      audioRef.current.resume().catch(() => {});
    }
    return audioRef.current;
  }, []);

  useEffect(() => {
    const soundUrl = `${process.env.PUBLIC_URL || ""}/sounds/bell.mp3`;
    const sound = new Audio(soundUrl);
    sound.preload = "auto";
    sound.volume = 0.9;
    bellSoundRef.current = sound;

    return () => {
      sound.pause();
      sound.currentTime = 0;
      bellSoundRef.current = null;
    };
  }, []);

  // Browsers require a user interaction before allowing notification audio.
  // A muted play/pause during the first interaction unlocks the audio element.
  useEffect(() => {
    const unlock = () => {
      try {
        const context = getCtx();
        if (context && context.state === "suspended") {
          context.resume().catch(() => {});
        }
      } catch {
        // Audio is optional; the POS must continue working without it.
      }

      const sound = bellSoundRef.current;
      if (!sound || !sound.paused) return;

      sound.muted = true;
      const playAttempt = sound.play();

      if (playAttempt && typeof playAttempt.then === "function") {
        playAttempt
          .then(() => {
            sound.pause();
            sound.currentTime = 0;
            sound.muted = false;
          })
          .catch(() => {
            sound.muted = false;
          });
      } else {
        sound.muted = false;
      }
    };

    ["click", "keydown", "touchstart"].forEach((eventName) =>
      window.addEventListener(eventName, unlock),
    );

    return () => {
      ["click", "keydown", "touchstart"].forEach((eventName) =>
        window.removeEventListener(eventName, unlock),
      );
    };
  }, [getCtx]);

  const tone = useCallback((freq, secs, vol) => {
    try {
      const context = getCtx();
      if (!context) return;

      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.type = "sine";
      oscillator.frequency.value = freq;

      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.linearRampToValueAtTime(vol, context.currentTime + 0.05);
      gain.gain.setValueAtTime(vol, context.currentTime + secs - 0.25);
      gain.gain.linearRampToValueAtTime(0.0001, context.currentTime + secs);

      oscillator.start();
      oscillator.stop(context.currentTime + secs);
    } catch {
      // Sound is optional; the POS must continue working without it.
    }
  }, [getCtx]);

  const beep = useCallback(() => {
    tone(880, 0.5, 0.15);
  }, [tone]);

  // Play the exact MP3 saved in frontend/public/sounds/bell.mp3.
  // Do not restart it if another call sound is already playing.
  const ringBell = useCallback(() => {
    const sound = bellSoundRef.current;
    if (!sound || !sound.paused) return;

    try {
      sound.currentTime = 0;
      sound.volume = 0.9;
      const playAttempt = sound.play();

      if (playAttempt && typeof playAttempt.catch === "function") {
        playAttempt.catch((error) => {
          console.warn(
            "Customer call bell could not play. Check browser sound permission and frontend/public/sounds/bell.mp3.",
            error,
          );
        });
      }
    } catch (error) {
      console.warn("Customer call bell could not play:", error);
    }
  }, []);

  // Distinct double "ring-ring" sound for every new customer QR order.
  // Synthesised with Web Audio, so no extra mp3 file is needed. It is different from bell.mp3 (Customer Call).
  const ringOrder = useCallback(() => {
    try {
      const context = getCtx();
      if (!context) return;
      // Browsers block sound until the page gets a click/touch. While blocked, do NOT queue rings
      // (they would all play at once on the first click); just remember that sound is locked.
      if (context.state !== "running") {
        setSoundLocked(true);
        return;
      }
      setSoundLocked(false);

      const strike = (freq, start, dur, vol) => {
        [1, 2.76, 5.4].forEach((mult, i) => {
          const osc = context.createOscillator();
          const gain = context.createGain();
          osc.type = "sine";
          osc.frequency.value = freq * mult;
          osc.connect(gain);
          gain.connect(context.destination);
          const t0 = context.currentTime + start;
          const v = vol / (i + 1);
          gain.gain.setValueAtTime(0.0001, t0);
          gain.gain.exponentialRampToValueAtTime(v, t0 + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
          osc.start(t0);
          osc.stop(t0 + dur + 0.05);
        });
      };

      // two rings, each made of fast alternating strikes: ring-ring
      [0, 0.9].forEach((offset) => {
        for (let i = 0; i < 6; i += 1) {
          strike(i % 2 ? 1568 : 1318, offset + i * 0.11, 0.35, 0.28);
        }
      });
    } catch {
      // Sound is optional; the POS must continue working without it.
    }
  }, [getCtx]);

  const pushPop = useCallback((p, playSound = true) => {
    setPops((list) => [...list.slice(-2), p]);
    if (playSound) beep();
    setTimeout(() => setPops((list) => list.filter((item) => item.id !== p.id)), 3000);
  }, [beep]);
  const onl = online.data?.summary || {};
  const onlineNew = (onl.swiggy?.new || 0) + (onl.zomato?.new || 0);
  useEffect(() => {
    const list = online.data?.latest;
    if (!list) return;
    const max = list.reduce((m, o) => Math.max(m, o.id), 0);
    if (seen.current.online !== null)
      list
        .filter((o) => o.id > seen.current.online)
        .reverse()
        .forEach((o) =>
          pushPop({
            id: `o${o.id}`,
            kind: o.platform,
            title: `New ${PN[o.platform]} order`,
            text: `#${o.external_id} · ${o.items} item(s) · ${money(o.total)}`,
            to: admin ? "/admin/online" : "/online",
            state: { platform: o.platform },
          }),
        );
    seen.current.online = Math.max(seen.current.online || 0, max);
  }, [online.data, admin, pushPop]);
  useEffect(() => {
    const list = kots.data?.kots;
    if (!list) return;
    const max = list.reduce((m, o) => Math.max(m, o.id), 0);
    if (seen.current.kot !== null && settings.qr_auto_kot !== false) {
      const qrNew = list.filter((k) => k.id > seen.current.kot && k.waiter_name === "QR Customer");
      if (qrNew.length)
        setKotQueue((prev) => [
          ...prev,
          ...qrNew.reverse().map((k) => ({
            qid: k.id,
            bill_no: k.kot_no,
            created_at: k.created_at,
            order_type: "dine_in",
            table_name: k.table_name,
            source: "qr",
            kot_note: k.instructions || "",
            items: (k.items || []).map((i) => ({ id: i.name, product_name: i.name, qty: i.qty })),
          })),
        ]);
    }
    if (seen.current.kot !== null)
      list
        .filter((k) => k.id > seen.current.kot && k.waiter_name !== "QR Customer")
        .reverse()
        .forEach((k) =>
          pushPop({
            id: `k${k.id}`,
            kind: "kot",
            title: `${k.kot_no} · Table ${k.table_name}`,
            text: `${k.waiter_name} sent ${k.items.reduce((s, i) => s + i.qty, 0)} item(s)`,
            to: admin ? "/admin/pos" : "/",
            state: null,
          }),
        );
    seen.current.kot = Math.max(seen.current.kot || 0, max);
  }, [kots.data, admin, pushPop, settings.qr_auto_kot]);
  useEffect(() => {
    const events = qrEvents.data?.events;
    if (!events) return;

    const max = events.reduce((currentMax, event) => Math.max(currentMax, Number(event.id)), 0);

    if (seen.current.qr !== null) {
      events
        .filter((event) => Number(event.id) > seen.current.qr)
        .forEach((event) => {
          const isCall = String(event.title || "").startsWith("Customer Call");

          if (isCall) {
            // Customer Call plays bell.mp3 only; skip the regular beep for this popup.
            ringBell();
          } else {
            // New customer order: add to the "New Orders" list. The ring repeats until it is accepted.
            if (hasPendingRef.current) ringOrder();
            setLocalPending((l) =>
              l.some((x) => x.id === event.id)
                ? l
                : [...l, { id: event.id, title: event.title, message: event.message, link_id: event.link_id, created_at: event.created_at }],
            );
            reloadNewOrders.current();
          }

          pushPop(
            {
              id: `qr${event.id}`,
              kind: isCall ? "qr-call" : "qr-order",
              title: event.title,
              text: event.message,
              to: admin ? "/admin/notifications" : "/orders",
              state: null,
            },
            false,
          );
        });
    }

    seen.current.qr = Math.max(seen.current.qr || 0, max);
  }, [qrEvents.data, admin, pushPop, ringBell, ringOrder]);
  // First click/touch after a refresh allows sound: ring right away if an order is waiting.
  useEffect(() => {
    if (!soundLocked) return undefined;
    const unlockSound = () => {
      const context = getCtx();
      if (!context) return;
      context.resume().then(() => {
        if (context.state === "running") {
          setSoundLocked(false);
          if (hasPendingRef.current) ringOrder();
        }
      }).catch(() => {});
    };
    const events = ["click", "keydown", "touchstart"];
    events.forEach((e) => window.addEventListener(e, unlockSound));
    return () => events.forEach((e) => window.removeEventListener(e, unlockSound));
  }, [soundLocked, getCtx, ringOrder]);

  // Keep ringing every 6 seconds until every new order is accepted.
  useEffect(() => {
    if (!hasPending) return undefined;
    ringOrder();
    const t = setInterval(ringOrder, 6000);
    return () => clearInterval(t);
  }, [hasPending, ringOrder]);
  const openOrders = open.data?.orders || [];
  const unread = notes.data?.unread_total || 0;
  const count = unread + openOrders.length + onlineNew;
  useEffect(() => {
    if (count > last.current) {
      setShake(true);
      setTimeout(() => setShake(false), 900);
    }
    last.current = count;
  }, [count]);
  const bellRef = useClickAway(() => setBell(false));
  const ordRef = useClickAway(() => setOrdMenu(""));
  const groups = [["held", "Held bills", openOrders]];
  const uRef = useClickAway(() => setUmenu(false));
  const nav = admin ? ADMIN.filter((n) => can(n[4])) : PUBLIC;
  const poCats = cats.data?.categories || [];
  const poCur = String(catSel || (poCats[0] && poCats[0].id) || "");
  const act = (to) => (to === "/" ? path === "/" : path === to);
  const searchPh = path.includes("order")
    ? "Search orders by bill no, table no, customer, phone..."
    : path.includes("customer")
      ? "Search customer by name, phone number, email..."
      : path.includes("menu") ||
          path === "/" ||
          path.includes("pos") ||
          path.includes("categories")
        ? "Search menu items (e.g. coffee, tea, sandwich...)"
        : "Search...";
  const bellGo = (n) => {
    setBell(false);
    navigate(
      NOTE_LINK[n.link_type] || "/admin/notifications",
      n.link_type === "order" ? { openId: Number(n.link_id) } : null,
    );
    api(`/notifications/${n.id}/read`, { method: "PATCH" })
      .then(reload)
      .catch(() => {});
  };
  const name = settings.restaurant_name || "Brew & Bite";

  return (
    <ShellCtx.Provider
      value={{
        search,
        setSearch,
        admin,
        catSel,
        setCatSel,
        bump,
        reload,
        openCount: openOrders.length,
      }}
    >
      <div
        className={`app ${collapsed ? "col" : ""} ${drawer ? "drawer" : ""}`}
      >
        <header className="hdr">
          <button
            className="hamb"
            onClick={() =>
              window.innerWidth < 900
                ? setDrawer(!drawer)
                : setCollapsed(!collapsed)
            }
            aria-label="Toggle menu"
          >
            <Icon n="menu" size={22} />
          </button>
          <A to={admin ? "/admin-dashboard" : "/"} className="brand">
            <span className="blogo">
              <SafeImg
                src={settings.logo_url ? img(settings.logo_url) : ""}
                size={26}
              />
            </span>
            <span className="bname">
              <b>{(() => { const w = String(name).toUpperCase().split(" "); return w.length > 1 ? <>{w.slice(0, -1).join(" ")} <span className="bn-acc">{w[w.length - 1]}</span></> : w[0]; })()}</b>
              <small>{settings.tagline}</small>
            </span>
          </A>
          <div className="hsearch">
            <Icon n="search" size={17} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPh}
              aria-label="Search"
            />
          </div>
          <div className="hright">
            <div className="ordic" ref={ordRef}>
              <div className="ordw">
                <button
                  className={`hbtn plat neworders ${hasPending ? "alert ringing" : ""}`}
                  onClick={() => setOrdMenu(ordMenu === "new" ? "" : "new")}
                  aria-label="New orders"
                  title={hasPending ? `${pendingOrders.length} new order(s) waiting` : "New orders"}
                >
                  <Icon n="bag" size={23} />
                  {hasPending && <span className="bdg">{pendingOrders.length}</span>}
                </button>
                {ordMenu === "new" && (
                  <div className="dd">
                    <div className="dd-t">New Orders ({pendingOrders.length})</div>
                    {pendingOrders.slice(0, 5).map((n) => (
                      <div
                        key={n.id}
                        className="dd-i no-row"
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setOrdMenu("");
                          navigate(admin ? "/admin/pos" : "/", n.link_id ? { orderId: Number(n.link_id) } : null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.click();
                        }}
                      >
                        <span className="dd-ic">
                          <Icon n="cart" />
                        </span>
                        <span>
                          <b>{n.title}</b>
                          <small>{n.message}</small>
                          <small>{ago(n.created_at)}</small>
                        </span>
                        <button
                          className="no-accept"
                          onClick={(e) => {
                            e.stopPropagation();
                            acceptOrders([n]);
                          }}
                        >
                          Accept
                        </button>
                      </div>
                    ))}
                    {!hasPending && <p className="muted pad">No new orders waiting.</p>}
                    {pendingOrders.length > 1 && (
                      <button className="dd-f" onClick={() => acceptOrders(pendingOrders)}>
                        Accept all ({pendingOrders.length}) <Icon n="check" size={15} />
                      </button>
                    )}
                  </div>
                )}
              </div>
              {["swiggy", "zomato"].map((p) => {
                const n = onl[p]?.new || 0;
                return (
                  <A
                    key={p}
                    to={admin ? "/admin/online" : "/online"}
                    state={{ platform: p }}
                    className={`hbtn plat ${p} ${n ? "alert" : ""}`}
                    title={`${PN[p]} orders${n ? ` (${n} new)` : ""}`}
                    aria-label={`${PN[p]} orders`}
                  >
                    <PlatIcon p={p} size={40} word={false} />
                    {n > 0 && <span className="bdg">{n}</span>}
                  </A>
                );
              })}
              {groups.map(([k, label, list]) => (
                <div className="ordw" key={k}>
                  <button
                    className={`hbtn plat ${k}`}
                    onClick={() => setOrdMenu(ordMenu === k ? "" : k)}
                    aria-label={label}
                    title={label}
                  >
                    <Icon n="clock" size={23} />
                    {list.length > 0 && (
                      <span className="bdg">{list.length}</span>
                    )}
                  </button>
                  {ordMenu === k && (
                    <div className="dd">
                      <div className="dd-t">
                        {label} ({list.length})
                      </div>
                      {list.slice(0, 4).map((o) => (
                        <button
                          key={o.id}
                          className="dd-i"
                          onClick={() => {
                            setOrdMenu("");
                            navigate(admin ? "/admin/pos" : "/", {
                              orderId: o.id,
                            });
                          }}
                        >
                          <span className="dd-ic">
                            <Icon
                              n={
                                o.table_name
                                  ? "table"
                                  : o.order_type === "delivery"
                                    ? "truck"
                                    : "bag"
                              }
                            />
                          </span>
                          <span>
                            <b>
                              {o.table_name
                                ? `Table ${o.table_name}`
                                : TYPES[o.order_type]}{" "}
                              · {o.bill_no}
                            </b>
                            <small>
                              {o.items} item(s) · {ago(o.created_at)}
                              {o.customer_name && o.customer_name !== "Walk-in"
                                ? ` · ${o.customer_name}`
                                : ""}
                            </small>
                          </span>
                          <b>{money(o.total)}</b>
                        </button>
                      ))}
                      {!list.length && (
                        <p className="muted pad">
                          {k === "held"
                            ? "No bills on hold."
                            : `No open ${label} orders.`}
                        </p>
                      )}
                      {list.length > 0 && (
                        <button
                          className="dd-f"
                          onClick={() => {
                            setOrdMenu("");
                            navigate(admin ? "/admin/pos" : "/", {
                              showHeld: true,
                            });
                          }}
                        >
                          View all ({list.length}) <Icon n="arrowr" size={15} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {admin && (
              <div className="bellw" ref={bellRef}>
                <button
                  className={`hbtn ${shake ? "shake" : ""}`}
                  onClick={() => setBell(!bell)}
                  aria-label="Notifications"
                >
                  <Icon n="bell" size={19} />
                  {unread > 0 && <span className="bdg">{unread}</span>}
                </button>
                {bell && (
                  <div className="dd">
                    {admin ? (
                      <>
                        {(notes.data?.notifications || []).map((n) => (
                          <button
                            key={n.id}
                            className="dd-i"
                            onClick={() => bellGo(n)}
                          >
                            <span className="dd-ic">
                              <Icon n={NOTE_ICON[n.type] || "bell"} />
                            </span>
                            <span>
                              <b>{n.title}</b>
                              <small>{n.message}</small>
                              <small>{ago(n.created_at)}</small>
                            </span>
                          </button>
                        ))}
                        {!(notes.data?.notifications || []).length && (
                          <p className="muted pad">You're all caught up.</p>
                        )}
                        <A to="/admin/notifications" className="dd-f">
                          View All Notifications <Icon n="arrowr" size={14} />
                        </A>
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            )}
            <div className="uw" ref={uRef}>
              <button className="user" onClick={() => setUmenu(!umenu)}>
                <span className="uav">{(user?.name || "C")[0]}</span>
                <span className="uname">{user?.name || "Cashier"}</span>
                <Icon n="chevdown" size={14} />
              </button>
              {umenu && (
                <div className="dd sm">
                  <div className="dd-t">
                    {user?.name} <small>({user?.role})</small>
                  </div>
                  {isStaff ? (
                    <>
                      {!admin && (
                        <A to="/admin-dashboard" className="dd-l">
                          <Icon n="home" size={16} /> Admin Dashboard
                        </A>
                      )}
                      {admin && (
                        <A to="/" className="dd-l">
                          <Icon n="cart" size={16} /> Public POS
                        </A>
                      )}
                      <button
                        className="dd-l"
                        onClick={async () => {
                          await logout();
                          navigate(admin ? "/admin-login" : "/");
                        }}
                      >
                        <Icon n="logout" size={16} /> Logout
                      </button>
                    </>
                  ) : (
                    <A to="/admin-login" className="dd-l">
                      <Icon n="lock" size={16} /> Admin / Staff Login
                    </A>
                  )}
                </div>
              )}
            </div>
            {admin && (
              <A to="/admin/notifications" className="hbtn" aria-label="Inbox" title="Notifications">
                <Icon n="mail" size={22} />
                {unread > 0 && <span className="bdg">{unread}</span>}
              </A>
            )}
            <A
              to={admin ? "/admin/settings" : "/admin-login"}
              className="hbtn"
              aria-label="Settings"
            >
              <Icon n="gear" size={19} />
            </A>
          </div>
        </header>

        <aside className="side">
          <div className="side-top">
            <span>Menu</span>
            <button
              className="side-x"
              onClick={() => setDrawer(false)}
              aria-label="Close menu"
            >
              <Icon n="x" size={22} />
            </button>
          </div>
          <nav>
            {nav.map(([k, label, ic, to], i) => (
              <React.Fragment key={k}>
              <A
                to={to}
                className={`nav ${act(to) ? "on" : ""}`}
                style={{ "--i": i }}
                title={label}
              >
                <Icon n={ic} size={19} />
                <em>{label}</em>
                {k === "orders" && openOrders.length > 0 && (
                  <b className="nbdg">{openOrders.length}</b>
                )}
                {k === "online" && onlineNew > 0 && (
                  <b className="nbdg">{onlineNew}</b>
                )}
                {k === "notifications" && unread > 0 && (
                  <b className="nbdg">{unread}</b>
                )}
              </A>
              {k === "pos" && admin && poCats.length > 0 && (
                <div className="catgrp">
                  <button type="button" className={`nav catgrp-h ${catOpen ? "open" : ""}`} onClick={() => setCatOpen(!catOpen)} aria-expanded={catOpen} title="Categories">
                    <Icon n="folder" size={19} />
                    <em>Categories</em>
                    <b className="catgrp-n">{poCats.length}</b>
                    <Icon n={catOpen ? "chevup" : "chevdown"} size={16} />
                  </button>
                  {catOpen && (
                    <div className="catgrp-l">
                                            <div className="catgrp-items">
{poCats.map((c) => (
                        <button type="button" key={c.id} className={`nav sub ${path === "/admin/pos" && poCur === String(c.id) ? "on" : ""}`} onClick={() => { setCatSel(c.id); setDrawer(false); navigate("/admin/pos"); }} title={c.name}>
                          <em>{c.name}</em>
                        </button>
                      ))}
                      </div>

                      <button type="button" className={`nav sub ${path === "/admin/pos" && poCur === "all" ? "on" : ""}`} onClick={() => { setCatSel("all"); setDrawer(false); navigate("/admin/pos"); }} title="All Items">
                        <Icon n="grid" size={17} />
                        <em>All Items</em>
                      </button>
                    </div>
                  )}
                </div>
              )}
              </React.Fragment>
            ))}
          </nav>
          {!admin && (
            <div className="catlist">
              <div className="cap">CATEGORIES</div>
              {(cats.data?.categories || []).map((c, i) => (
                <button
                  key={c.id}
                  style={{ "--i": i }}
                  className={`nav ${path === "/" && String(catSel) === String(c.id) ? "on" : ""}`}
                  onClick={() => {
                    setCatSel(c.id);
                    navigate("/");
                  }}
                  title={c.name}
                >
                  {c.image_url ? (
                    <img src={img(c.image_url)} alt="" className="cimg" />
                  ) : (
                    <span className="cbox">{c.name[0]}</span>
                  )}
                  <em>{c.name}</em>
                </button>
              ))}
              <button
                className={`nav ${path === "/" && catSel === "all" ? "on" : ""}`}
                onClick={() => {
                  setCatSel("all");
                  navigate("/");
                }}
                title="All Items"
              >
                <Icon n="grid" size={19} />
                <em>All Items</em>
              </button>
            </div>
          )}
          {admin && (
            <div className="side-art" aria-hidden="true">
              <svg viewBox="0 0 200 120" fill="none">
                <path d="M84 30c-4 4 4 7 0 12M96 26c-4 4 4 7 0 12M108 30c-4 4 4 7 0 12" stroke="#bff0a8" strokeWidth="3" strokeLinecap="round" />
                <path d="M30 96c-14-6-18-22-10-34 12 2 20 14 10 34z" fill="#5fd34a" />
                <path d="M166 92c14-4 20-20 12-32-12 0-22 12-12 32z" fill="#3fb83a" />
                <path d="M62 52h62v18a28 28 0 0 1-28 28h-6a28 28 0 0 1-28-28z" fill="#fff" />
                <ellipse cx="93" cy="52" rx="31" ry="6" fill="#2fa12f" />
                <path d="M124 58h6a10 10 0 0 1 0 20h-9" stroke="#fff" strokeWidth="6" strokeLinecap="round" />
                <ellipse cx="93" cy="104" rx="52" ry="8" fill="#e3f5da" />
              </svg>
            </div>
          )}
          {admin && (
            <button
              className="nav lo"
              onClick={async () => {
                await logout();
                navigate("/admin-login");
              }}
            >
              <Icon n="logout" size={19} />
              <em>Logout</em>
            </button>
          )}
        </aside>
        {drawer && <div className="scrim" onClick={() => setDrawer(false)} />}
        {hasPending && soundLocked && (
          <button className="no-sound" onClick={() => {}}>
            <Icon n="bell" size={16} /> New order waiting. Click here to turn on order sound
          </button>
        )}
        <style>{`
          .no-sound{position:fixed;top:0;left:50%;transform:translateX(-50%);z-index:9999;display:flex;align-items:center;gap:8px;border:0;background:#e03131;color:#fff;font-weight:700;font-size:13px;padding:10px 18px;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.35);animation:bb-no-pulse 1.2s infinite}
          .hbtn.plat.neworders{background:#e8590c;box-shadow:none}
          .hbtn.plat.neworders:hover{background:#f76707}
          .hbtn.plat.neworders.ringing{background:#e03131;animation:bb-no-pulse 1.2s infinite}
          .hbtn.plat.neworders.ringing svg{transform-origin:50% 12%;animation:bb-no-ring .9s ease-in-out infinite}
          .hbtn.plat.neworders .bdg{background:#fff;color:#c92a2a}
          @keyframes bb-no-ring{0%,100%{transform:rotate(0)}15%{transform:rotate(18deg)}30%{transform:rotate(-18deg)}45%{transform:rotate(12deg)}60%{transform:rotate(-12deg)}75%{transform:rotate(6deg)}90%{transform:rotate(-3deg)}}
          @keyframes bb-no-pulse{0%{box-shadow:0 0 0 0 rgba(224,49,49,.7)}70%{box-shadow:0 0 0 12px rgba(224,49,49,0)}100%{box-shadow:0 0 0 0 rgba(224,49,49,0)}}
          .dd-i.no-row{cursor:pointer;display:flex;align-items:center;gap:10px}
          .no-accept{margin-left:auto;flex:none;border:0;background:#1c7a42;color:#fff;font-weight:700;font-size:12px;padding:8px 12px;cursor:pointer}
          .no-accept:hover{background:#15612f}
          @media (prefers-reduced-motion:reduce){.hbtn.plat.neworders.ringing,.hbtn.plat.neworders.ringing svg{animation:none}}
        `}</style>
        {kotQueue[0] && (
          <KotAutoPrint key={kotQueue[0].qid} order={kotQueue[0]} onDone={() => setKotQueue((l) => l.slice(1))} />
        )}
        <div className="pops" aria-live="polite">
          {pops.map((p) => (
            <button
              key={p.id}
              className={`pop ${p.kind}`}
              onClick={() => {
                setPops((l) => l.filter((x) => x.id !== p.id));
                navigate(p.to, p.state);
              }}
            >
              
<span className="pop-i">
  {p.kind === "qr-call" ? (
    <Icon n="phone" size={24} />
  ) : p.kind === "qr-order" ? (
    <Icon n="cart" size={24} />
  ) : p.kind === "kot" ? (
    <Icon n="utensils" size={22} />
  ) : (
    <PlatIcon p={p.kind} size={44} />
  )}
</span>

              <span className="pop-t">
                <b>{p.title}</b>
                <small>{p.text}</small>
              </span>
              <span className="pop-bar" />
            </button>
          ))}
        </div>
        <main className="main">{children}</main>
      </div>
    </ShellCtx.Provider>
  );
}