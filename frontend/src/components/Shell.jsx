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
import { api, fmtTime, img, money, ago, TYPES } from "../lib/api";
import { SafeImg, useClickAway } from "../lib/ui";
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
  const [now, setNow] = useState(new Date());
  const [bump, setBump] = useState(0);
  const [shake, setShake] = useState(false);
  const [ordMenu, setOrdMenu] = useState("");
  const [catOpen, setCatOpen] = useState(false);
  const last = useRef(0);
  const reload = useCallback(() => setBump((b) => b + 1), []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
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
  const [pops, setPops] = useState([]);
  const seen = useRef({ online: null, kot: null, qr: null });
  const audioRef = useRef(null);
  const getCtx = () => {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!audioRef.current) audioRef.current = new AC();
    if (audioRef.current.state === "suspended") audioRef.current.resume();
    return audioRef.current;
  };
  useEffect(() => {
    const unlock = () => { try { getCtx(); } catch { /* ignore */ } };
    ["click", "keydown", "touchstart"].forEach((e) => window.addEventListener(e, unlock));
    return () => ["click", "keydown", "touchstart"].forEach((e) => window.removeEventListener(e, unlock));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const tone = (freq, secs, vol) => {
    try {
      const a = getCtx(), o = a.createOscillator(), g = a.createGain();
      o.connect(g); g.connect(a.destination); o.type = "sine"; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, a.currentTime);
      g.gain.linearRampToValueAtTime(vol, a.currentTime + 0.05);
      g.gain.setValueAtTime(vol, a.currentTime + secs - 0.25);
      g.gain.linearRampToValueAtTime(0.0001, a.currentTime + secs);
      o.start(); o.stop(a.currentTime + secs);
    } catch { /* sound is optional */ }
  };
  const beep = () => tone(880, 0.5, 0.15);
  const ringBell = () => tone(880, 3, 0.3);
  const pushPop = useCallback((p) => {
    setPops((l) => [...l.slice(-2), p]);
    beep();
    setTimeout(() => setPops((l) => l.filter((x) => x.id !== p.id)), 3000);
  }, []);
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
    if (seen.current.kot !== null)
      list
        .filter((k) => k.id > seen.current.kot)
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
  }, [kots.data, admin, pushPop]);
  useEffect(() => {
    const events = qrEvents.data?.events;
    if (!events) return;
    const max = events.reduce((m, e) => Math.max(m, Number(e.id)), 0);
    if (seen.current.qr !== null) events.filter(e => Number(e.id) > seen.current.qr).forEach(e => {
      const isCall = e.title.startsWith("Customer Call");
      if (isCall) ringBell();
      pushPop({ id: `qr${e.id}`, kind: isCall ? "qr-call" : "qr-order", title: e.title, text: e.message, to: admin ? "/admin/notifications" : "/orders", state: null });
    });
    seen.current.qr = Math.max(seen.current.qr || 0, max);
  }, [qrEvents.data, admin, pushPop]);
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
            <div className="clock">
              <Icon n="calendar" size={18} />
              <div>
                <b>
                  {now
                    .toLocaleDateString("en-GB", {
                      weekday: "short",
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })
                    .replace(/,/g, "")}
                </b>
                <small>{fmtTime(now)}</small>
              </div>
            </div>
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
                      {poCats.map((c) => (
                        <button type="button" key={c.id} className={`nav sub ${path === "/admin/pos" && poCur === String(c.id) ? "on" : ""}`} onClick={() => { setCatSel(c.id); setDrawer(false); navigate("/admin/pos"); }} title={c.name}>
                          {c.image_url ? <img src={img(c.image_url)} alt="" className="cimg" /> : <span className="cbox">{c.name[0]}</span>}
                          <em>{c.name}</em>
                        </button>
                      ))}
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
