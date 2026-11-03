import React, { useEffect, useMemo, useRef, useState } from "react";
import Icon from "../lib/icons";
import { api, cap, img, money, uid } from "../lib/api";
import { navigate, useAuth, useFetch, useUI } from "../lib/store";
import { Empty, Loading, SafeImg } from "../lib/ui";
import "../styles/waiter.css";

const Veg = ({ t }) => (
  <span
    className={`vmark ${t}`}
    title={t === "veg" ? "Veg" : t === "egg" ? "Egg" : "Non-veg"}
  >
    <i />
  </span>
);

export default function Waiter() {
  const { user, can, logout } = useAuth();
  const { toast } = useUI();
  const ok = !!user && !user.public && can("waiter");
  useEffect(() => {
    if (!ok) navigate("/waiter-login");
  }, [ok]);
  const home = useFetch(ok ? "/waiter/home" : "", null, [], 15000);
  const [step, setStep] = useState("tables");
  const [table, setTable] = useState(null);
  const [cart, setCart] = useState({});
  const [cust, setCust] = useState({ name: "", phone: "" });
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [drawer, setDrawer] = useState(false);
  const [idem, setIdem] = useState(uid());
  const [tf, setTf] = useState("all");
  const headRef = useRef(null);
  useEffect(() => {
    const fit = () => {
      if (headRef.current)
        document.documentElement.style.setProperty(
          "--wt-hh",
          headRef.current.offsetHeight + "px",
        );
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [ok, home.data]);
  const d = home.data;
  const items = useMemo(() => d?.items || [], [d]);
  const list = useMemo(
    () =>
      items.filter(
        (i) =>
          (cat === "all" || String(i.category_id) === String(cat)) &&
          `${i.name} ${i.description || ""}`
            .toLowerCase()
            .includes(q.trim().toLowerCase()),
      ),
    [items, cat, q],
  );
  const lines = items
    .filter((i) => cart[i.id])
    .map((i) => ({ ...i, qty: cart[i.id] }));
  const count = lines.reduce((s, l) => s + l.qty, 0),
    total = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const set = (id, qty) =>
    setCart((c) => {
      const n = { ...c };
      if (qty <= 0) delete n[id];
      else n[id] = Math.min(qty, 99);
      return n;
    });
  if (!ok)
    return (
      <div className="splash">
        <div className="spin" />
      </div>
    );

  const pick = (t) => {
    if (t.status === "out_of_service")
      return toast(`${t.name} is out of service.`, "err");
    if (t.status === "reserved")
      return toast(
        `${t.name} is reserved. Ask the cashier to open it first.`,
        "err",
      );
    setTable(t);
    setCart({});
    setNote("");
    setQ("");
    setCat("all");
    setStep("order");
    setIdem(uid());
  };
  const send = async () => {
    setBusy(true);
    try {
      const r = await api("/waiter/kot", {
        method: "POST",
        body: {
          table_id: table.id,
          customer_name: cust.name,
          customer_phone: cust.phone,
          instructions: note,
          idem,
          items: lines.map((l) => ({ product_id: l.id, qty: l.qty })),
        },
      });
      setDone({ ...r, lines });
      setStep("done");
      setCart({});
      home.reload();
    } catch (e) {
      toast(e.message, "err");
    } finally {
      setBusy(false);
    }
  };
  const sync = async () => {
    await home.reloadFull();
    toast("Data synced.");
    setDrawer(false);
  };
  const allTables = d?.tables || [];
  const counts = allTables.reduce(
    (m, t) => ({ ...m, [t.status]: (m[t.status] || 0) + 1 }),
    {},
  );
  const shownTables = allTables.filter(
    (t) =>
      tf === "all" ||
      (tf === "free" && t.status === "available") ||
      (tf === "busy" && t.status === "occupied"),
  );
  const shopName = String(d?.shop || "Amplemind Cafe").trim();
  const shopWords = shopName.split(/\s+/);
  const shopLast = shopWords.length > 1 ? shopWords.pop() : "";

  return (
    <div className={`wt ${drawer ? "open" : ""}`}>
      <aside className="wt-side">
        <button
          className="wt-close"
          onClick={() => setDrawer(false)}
          aria-label="Close menu"
        >
          <Icon n="x" size={24} />
        </button>
        <button className="wt-nav" onClick={sync}>
          <Icon n="refresh" size={19} />
          <span>Sync Data</span>
        </button>
        <a
          className="wt-nav"
          href={d?.support_phone ? `tel:${d.support_phone}` : undefined}
          onClick={(e) => {
            if (!d?.support_phone) {
              e.preventDefault();
              toast(
                "Support number is not set. Ask the admin to add it in Settings.",
                "err",
              );
            }
          }}
        >
          <Icon n="phone" size={19} />
          <span>Call Support</span>
        </a>
        <a
          className="wt-nav"
          target="_blank"
          rel="noreferrer"
          href={
            d?.support_whatsapp
              ? `https://wa.me/${String(d.support_whatsapp)
                  .replace(/\D/g, "")
                  .replace(/^(\d{10})$/, "91$1")}`
              : undefined
          }
          onClick={(e) => {
            if (!d?.support_whatsapp) {
              e.preventDefault();
              toast(
                "Support number is not set. Ask the admin to add it in Settings.",
                "err",
              );
            }
          }}
        >
          <Icon n="mail" size={19} />
          <span>Chat Support</span>
        </a>
        <button
          className="wt-nav lo"
          onClick={async () => {
            await logout();
            navigate("/waiter-login");
          }}
        >
          <Icon n="logout" size={19} />
          <span>Logout</span>
        </button>
      </aside>
      {drawer && <div className="wt-scrim" onClick={() => setDrawer(false)} />}

      <header className="wt-head" ref={headRef}>
        <button
          className="wt-hamb"
          onClick={() => setDrawer(!drawer)}
          aria-label="Menu"
        >
          <Icon n="menu" size={22} />
        </button>
        <div className="wt-brand">
          <span className="wt-blogo">
            <SafeImg src={d?.logo_url ? img(d.logo_url) : ""} size={30} />
          </span>
          <div className="wt-bname">
            <b>
              {shopWords.join(" ")}
              {shopLast && <span> {shopLast}</span>}
            </b>
            <small>{d?.company || "Amplemind-POS"}</small>
          </div>
        </div>
        <div className="wt-who">
          <span className="wt-av">
            {String(user.name || "W").trim().charAt(0).toUpperCase()}
          </span>
          <div>
            <b>{user.name}</b>
            <small>
              Waiter{d ? ` · ${d.kots_today} KOT today` : ""}
            </small>
          </div>
        </div>
      </header>

      <main className="wt-main">

        {!d ? (
          <Loading />
        ) : step === "tables" ? (
          <section className="wt-sec">
            <div className="wt-title">
              <div>
                <h3>Select a table</h3>
                <p>
                  Tap a free table to start an order, or a busy one to add more
                  items.
                </p>
              </div>
              <div className="wt-seg" role="group" aria-label="Filter tables">
                {[
                  ["all", "All", allTables.length],
                  ["free", "Free", counts.available || 0],
                  ["busy", "Busy", counts.occupied || 0],
                ].map(([k, l, n]) => (
                  <button
                    key={k}
                    className={tf === k ? "on" : ""}
                    aria-pressed={tf === k}
                    onClick={() => setTf(k)}
                  >
                    {l}
                    <i>{n}</i>
                  </button>
                ))}
              </div>
            </div>
            <div className="wt-tables">
              {shownTables.map((t) => (
                <button
                  key={t.id}
                  className={`wt-t ${t.status}`}
                  onClick={() => pick(t)}
                >
                  <span className="wt-tn">{t.name}</span>
                  <small className="wt-st">
                    <i />
                    {t.order_id
                      ? `${money(t.order_total)} running`
                      : cap(t.status)}
                  </small>
                  <em>
                    <Icon n="users" size={13} /> {t.capacity} seats
                  </em>
                </button>
              ))}
              {!shownTables.length && (
                <Empty
                  icon="table"
                  text={
                    allTables.length
                      ? tf === "free"
                        ? "No free tables right now."
                        : "No busy tables right now."
                      : "No tables found."
                  }
                />
              )}
            </div>
          </section>
        ) : step === "order" ? (
          <section className="wt-sec wt-order">
            <div className="wt-bar">
              <button className="wt-back" onClick={() => setStep("tables")}>
                <Icon n="arrowl" size={20} />
              </button>
              <h3>Table {table.name}</h3>
              {table.order_id && (
                <span className="wt-run">
                  Running order {money(table.order_total)}
                </span>
              )}
            </div>
            <div className="wt-cust">
              <input
                value={cust.name}
                maxLength={100}
                onChange={(e) => setCust({ ...cust, name: e.target.value })}
                placeholder="Customer name (optional)"
              />
              <input
                value={cust.phone}
                inputMode="tel"
                maxLength={20}
                onChange={(e) => setCust({ ...cust, phone: e.target.value })}
                placeholder="Mobile number (optional)"
              />
            </div>
            <div className="wt-stick">
              <div className="wt-search">
                <Icon n="search" size={18} />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search items"
                />
              </div>
              <div className="wt-cats">
                <button
                  className={cat === "all" ? "on" : ""}
                  onClick={() => setCat("all")}
                >
                  All
                </button>
                {d.categories.map((c) => (
                  <button
                    key={c.id}
                    className={String(cat) === String(c.id) ? "on" : ""}
                    onClick={() => setCat(c.id)}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="wt-items">
              {list.map((it, i) => (
                <div
                  key={it.id}
                  className={`wt-i ${it.out ? "out" : ""}`}
                  style={{ "--i": Math.min(i, 20) }}
                >
                  <div className="wt-ib">
                    <div className="wt-in">
                      <Veg t={it.item_type} />
                      <b>{it.name}</b>
                    </div>
                    <div className="wt-mrp">MRP {money(it.price)}</div>
                    {it.description && <p>{it.description}</p>}
                  </div>
                  {it.out ? (
                    <span className="wt-oos">Out of stock</span>
                  ) : cart[it.id] ? (
                    <div className="wt-step">
                      <button
                        onClick={() => set(it.id, cart[it.id] - 1)}
                        aria-label="Less"
                      >
                        <Icon n="minus" size={16} />
                      </button>
                      <span>{cart[it.id]}</span>
                      <button
                        onClick={() => set(it.id, cart[it.id] + 1)}
                        aria-label="More"
                      >
                        <Icon n="plus" size={16} />
                      </button>
                    </div>
                  ) : (
                    <button className="wt-add" onClick={() => set(it.id, 1)}>
                      + ADD
                    </button>
                  )}
                </div>
              ))}
              {!list.length && <Empty icon="utensils" text="No items found." />}
            </div>
          </section>
        ) : step === "confirm" ? (
          <section className="wt-sec">
            <div className="wt-bar">
              <button className="wt-back" onClick={() => setStep("order")}>
                <Icon n="arrowl" size={20} />
              </button>
              <h3>Confirm KOT</h3>
            </div>
            <div className="wt-card2">
              <div className="wt-kv">
                <span>Table</span>
                <b>{table.name}</b>
              </div>
              {(cust.name || cust.phone) && (
                <div className="wt-kv">
                  <span>Customer</span>
                  <b>
                    {cust.name} {cust.phone}
                  </b>
                </div>
              )}
            </div>
            <div className="wt-card2">
              {lines.map((l) => (
                <div className="wt-cl" key={l.id}>
                  <Veg t={l.item_type} />
                  <div>
                    <b>{l.name}</b>
                    <small>{money(l.price)} each</small>
                  </div>
                  <div className="wt-step sm">
                    <button
                      onClick={() => set(l.id, l.qty - 1)}
                      aria-label="Less"
                    >
                      <Icon n="minus" size={14} />
                    </button>
                    <span>{l.qty}</span>
                    <button
                      onClick={() => set(l.id, l.qty + 1)}
                      aria-label="More"
                    >
                      <Icon n="plus" size={14} />
                    </button>
                  </div>
                </div>
              ))}
              {!lines.length && <Empty icon="cart" text="No items selected." />}
            </div>
            <label className="wt-note">
              <span>Instructions</span>
              <textarea
                rows={3}
                maxLength={400}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Enter instructions (for example: less spicy, no onion)"
              />
            </label>
            <div className="wt-actions">
              <button className="wt-sec-btn" onClick={() => setStep("order")}>
                Add more
              </button>
              <button
                className="wt-send"
                disabled={busy || !lines.length}
                onClick={send}
              >
                {busy ? "Sending…" : "Send KOT"}
              </button>
            </div>
          </section>
        ) : (
          <section className="wt-sec wt-done">
            <div className="wt-ok">
              <Icon n="check" size={44} />
            </div>
            <h3>{done.kot_no} sent</h3>
            <p className="muted">
              Table {done.table} · order {done.bill_no}
            </p>
            <div className="wt-card2">
              {done.items.map((i, k) => (
                <div className="wt-kv" key={k}>
                  <span>{i.name}</span>
                  <b>× {i.qty}</b>
                </div>
              ))}
            </div>
            <div className="wt-actions">
              <button
                className="wt-sec-btn"
                onClick={() => {
                  setCart({});
                  setNote("");
                  setIdem(uid());
                  setStep("order");
                }}
              >
                Add more to this table
              </button>
              <button
                className="wt-send"
                onClick={() => {
                  setStep("tables");
                  setCust({ name: "", phone: "" });
                }}
              >
                Back to tables
              </button>
            </div>
          </section>
        )}
        {d && step === "order" && count > 0 && (
          <div className="wt-cartbar">
            <div>
              <b>
                {count} item{count > 1 ? "s" : ""}
              </b>
              <small>{money(total)}</small>
            </div>
            <button onClick={() => setStep("confirm")}>
              Next <Icon n="arrowr" size={18} />
            </button>
          </div>
        )}
      </main>
    </div>
  );
}