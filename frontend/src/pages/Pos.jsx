import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "../lib/icons";
import { api, img, money, TYPES, uid, cap, ago } from "../lib/api";
import { takeHandoff, useAuth, useDebounced, useFetch, useShell, useUI } from "../lib/store";
import { Empty, Loading, Modal } from "../lib/ui";
import { ReceiptModal, KotModal } from "../components/Receipt";

// icons for the Dine In / Take Away / Delivery buttons
const TYPE_ICON = { dine_in: "utensils", pickup: "bag", delivery: "truck" };

const stockTag = (p) => (!p.track_stock ? ["In Stock", "ok"] : p.stock_qty <= 0 ? ["Out of Stock", "no"] : p.stock_qty <= p.low_stock_level ? [`Only ${p.stock_qty} left`, "low"] : ["In Stock", "ok"]);
const blank = { id: null, name: "", phone: "", address: "" };

export default function Pos() {
  const { settings: S, can } = useAuth();
  const { toast, ask } = useUI();
  const { search, catSel, setCatSel, reload } = useShell();
  const cats = useFetch("/categories", { pos: 1 });
  const prods = useFetch("/products", { pos: 1, limit: 2000 });
  const tabs = useFetch("/tables", null, [], 10000);
  const held = useFetch("/orders/open", null, [], 10000);
  const [cart, setCart] = useState([]);
  const [type, setType] = useState(S.default_order_type || "dine_in");
  const [tableId, setTableId] = useState(null);
  const [orderId, setOrderId] = useState(null);
  const [cust, setCust] = useState(blank);
  const [showCust, setShowCust] = useState(false);
  const [guests, setGuests] = useState(1);
  const [dPct, setDPct] = useState(0);
  const [dFix, setDFix] = useState("");
  const [method, setMethod] = useState(S.default_payment_method || "cash");
  const [payModal, setPayModal] = useState(null);
  const [heldOpen, setHeldOpen] = useState(false);
  const [calc, setCalc] = useState(null);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [rAuto, setRAuto] = useState(false);
  const [kot, setKot] = useState(null);
  const [source, setSource] = useState("direct");
  const [ref, setRef] = useState("");
  const [sheet, setSheet] = useState(false);
  const idem = useRef(uid());

  const categories = cats.data?.categories || [];
  const products = useMemo(() => prods.data?.products || [], [prods.data]);
  const tables = tabs.data?.tables || [];
  const heldList = held.data?.orders || [];
  const table = tables.find((t) => t.id === tableId);
  const cat = catSel || (categories[0] && categories[0].id) || "all";
  const enabledTypes = ["dine_in", "pickup", "delivery"].filter((t) => ({ dine_in: S.dine_in_enabled, pickup: S.takeaway_enabled, delivery: S.delivery_enabled })[t]);
  const methods = ["cash", "upi", "card"].filter((m) => S["pm_" + m]);
  const canDiscount = S.allow_discounts && can("discount");
  const discount = +dFix > 0 ? { type: "fixed", value: +dFix } : { type: "percent", value: +dPct || 0 };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q) return products.filter((p) => `${p.name} ${p.sku || ""} ${p.category_name || ""}`.toLowerCase().includes(q));
    return cat === "all" ? products : products.filter((p) => String(p.category_id) === String(cat));
  }, [products, cat, search]);
  const catName = search.trim() ? "Search results" : cat === "all" ? "All Items" : (categories.find((c) => String(c.id) === String(cat)) || {}).name || "Menu";

  const loadOrder = useCallback(async (id) => {
    try {
      const { order: o } = await api(`/orders/${id}`);
      if (!o.is_open) return toast("This order is already closed.", "err");
      setOrderId(o.id); setType(o.order_type); setTableId(o.table_id); setGuests(o.guests || 1); setSource(o.source || "direct");
      setCust({ id: o.customer_id, name: o.customer_name === "Walk-in" ? "" : o.customer_name, phone: o.customer_phone || "", address: o.delivery_address || "" });
      setCart(o.items.map((i) => ({ id: i.product_id, name: i.product_name, price: i.unit_price, qty: i.qty })));
      if (o.discount_amount > 0 && o.discount_type === "percent") { setDPct(o.discount_value); setDFix(""); }
      else if (o.discount_amount > 0) { setDFix(String(o.discount_value)); setDPct(0); } else { setDPct(0); setDFix(""); }
      idem.current = uid(); setHeldOpen(false);
      if (window.innerWidth < 900) setSheet(true);
    } catch (e) { toast(e.message, "err"); }
  }, [toast]);

  useEffect(() => {
    const apply = () => {
      const h = takeHandoff();
      if (!h) return;
      if (h.showHeld) { setHeldOpen(true); return; }
      if (h.online) { const o = h.online; setType("delivery"); setSource(o.source); setRef(o.ref); setCart(o.items); setCust({ ...blank, ...o.customer }); setShowCust(true); }
      else if (h.orderId) loadOrder(h.orderId);
      else { if (h.type) setType(h.type); if (h.tableId) { setType("dine_in"); setTableId(h.tableId); } if (h.customer) { setCust({ ...blank, ...h.customer }); setShowCust(true); } }
    };
    apply();
    // POS page pehle se khula ho tab bhi header se chuna hua bill side mein khule
    const onNav = () => { if (["/", "/admin/pos"].includes(window.location.pathname)) apply(); };
    window.addEventListener("bbnav", onNav);
    return () => window.removeEventListener("bbnav", onNav);
  }, [loadOrder]);

  const key = useDebounced(JSON.stringify([cart.map((c) => [c.id, c.qty]), type, dPct, dFix]), 250);
  useEffect(() => {
    if (!cart.length) { setCalc(null); return; }
    let live = true;
    api("/orders/preview", { method: "POST", body: { items: cart.map((c) => ({ product_id: c.id, qty: c.qty })), discount, order_type: type } }).then((r) => live && setCalc(r.calc)).catch(() => {});
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const add = (p) => {
    const [, st] = stockTag(p);
    if (st === "no") return toast(`${p.name} is out of stock.`, "err");
    setCart((c) => {
      const f = c.find((x) => x.id === p.id);
      if (f) { if (p.track_stock && f.qty >= p.stock_qty) { toast(`Only ${p.stock_qty} of ${p.name} in stock.`, "err"); return c; } return c.map((x) => (x.id === p.id ? { ...x, qty: Math.min(x.qty + 1, 99) } : x)); }
      return [...c, { id: p.id, name: p.name, price: p.price, qty: 1 }];
    });
  };
  const step = (id, d) => setCart((c) => c.map((x) => (x.id === id ? { ...x, qty: Math.min(x.qty + d, 99) } : x)).filter((x) => x.qty > 0));
  const reset = () => { setCart([]); setOrderId(null); setTableId(null); setCust(blank); setShowCust(false); setGuests(1); setSource("direct"); setRef(""); setDPct(0); setDFix(""); setCalc(null); setPayModal(null); idem.current = uid(); setSheet(false); };
  const newOrder = async () => { if (cart.length && !(await ask("Start a new order? Items in the current cart will be removed.", { danger: true, okText: "Start new" }))) return; reset(); };
  const clearAll = async () => { if (cart.length && (await ask("Remove all items from this order?", { danger: true, okText: "Clear all" }))) { setCart([]); setCalc(null); } };

  const pickTable = async (t) => {
    if (t.status === "out_of_service") return toast(`${t.name} is out of service.`, "err");
    if (t.status === "reserved") return toast(`${t.name} is reserved${t.reserved_for ? " for " + t.reserved_for : ""}. Mark it Available from the Tables page first.`, "err");
    setType("dine_in");
    if (t.order) {
      if (t.order.id === orderId) return;
      if (cart.length && !(await ask(`${t.name} already has an active order. Replace your current cart with it?`, { okText: "Open order" }))) return;
      return loadOrder(t.order.id);
    }
    setTableId(t.id);
  };
  const lookup = async () => {
    const ph = cust.phone.replace(/\D/g, "");
    if (ph.length < 7 || cust.id) return;
    try { const r = await api("/customers", { params: { q: ph, limit: 1 } }); const c = r.customers[0]; if (c && c.phone && c.phone.replace(/\D/g, "").endsWith(ph.slice(-10))) { setCust((x) => ({ ...x, id: c.id, name: x.name || c.name, address: x.address || c.address || "" })); toast(`Customer found: ${c.name}`); } } catch { /* optional */ }
  };

  const validate = () => (!cart.length ? "Add at least one item to the order." : type === "dine_in" && !tableId ? "Please select a table for Dine In." : type === "delivery" && !(cust.name.trim() && cust.phone.trim() && cust.address.trim()) ? "Delivery orders need customer name, phone and address." : "");
  const payload = (action, payments) => ({ id: orderId || undefined, action, order_type: type, table_id: type === "dine_in" ? tableId : undefined, customer_id: cust.id || undefined, customer_name: cust.name, customer_phone: cust.phone,
    delivery_address: cust.address, guests, source, notes: ref || undefined, items: cart.map((c) => ({ product_id: c.id, qty: c.qty })), discount, payments, idempotency_key: orderId ? undefined : idem.current });
  const refreshAll = () => { tabs.reload(); held.reload(); reload(); };

  async function hold() {
    const v = validate(); if (v) return toast(v, "err");
    setBusy(true);
    try { await api("/orders", { method: "POST", body: payload("hold") }); toast(`Order put on hold${table ? " for " + table.name : ""}.`); reset(); refreshAll(); }
    catch (e) { toast(e.message, "err"); } finally { setBusy(false); }
  }
  async function persist() {
    const v = validate(); if (v) { toast(v, "err"); return null; }
    setBusy(true);
    try { const r = await api("/orders", { method: "POST", body: payload("hold") }); setOrderId(r.order.id); refreshAll(); return r.order; }
    catch (e) { toast(e.message, "err"); return null; } finally { setBusy(false); }
  }
  const doSave = async () => { const o = await persist(); if (o) toast(`Order ${o.bill_no} saved.`); };
  const doSavePrint = async () => { const o = await persist(); if (o) { setRAuto(true); setReceipt(o); } };
  const doKot = async (auto) => { const o = await persist(); if (o) setKot({ order: o, auto }); };
  async function checkout(payments) {
    setBusy(true);
    try { const r = await api("/orders", { method: "POST", body: payload("pay", payments) }); setRAuto(!!S.auto_print); setReceipt(r.order); reset(); refreshAll(); prods.reload(); }
    catch (e) { setPayModal(null); toast(e.message, "err"); } finally { setBusy(false); }
  }
  function startCheckout() {
    const v = validate(); if (v) return toast(v, "err");
    if (!calc) return toast("Calculating the bill, please try again.", "err");
    if (method === "split") return setPayModal({ type: "split", rows: Object.fromEntries(methods.map((m) => [m, ""])) });
    if (method === "upi") return setPayModal({ type: "upi", ref: "" });
    checkout([{ method, amount: calc.total }]);
  }

  const title = type === "dine_in" ? (table ? `Table ${table.name}` : "No table selected") : `${TYPES[type]} order`;
  const count = cart.reduce((s, c) => s + c.qty, 0);
  const custVisible = type !== "dine_in" || showCust;

  return (
    <div className="pos">
      <div className="pos-l">
        <div className="pos-sec"><span>Select Table</span>{table && <small>{table.name} selected</small>}</div>
        <div className="tchips">
          {tabs.loading && !tables.length && <span className="muted">Loading tables…</span>}
          {tables.map((t) => <button key={t.id} title={cap(t.status)} className={`tchip ${tableId === t.id ? "sel" : ""} ${t.status}`} onClick={() => pickTable(t)}>{t.name}</button>)}
          <button className="tchip add" onClick={newOrder}><Icon n="plus" size={14} /> New Order</button>
        </div>
        <div className="pos-sec head"><h3>{catName} <small>({visible.length} items)</small></h3><button className="lnk" onClick={() => setCatSel("all")}>View All <Icon n="arrowr" size={13} /></button></div>
        {prods.loading && !products.length ? <Loading text="Loading menu…" /> : prods.error ? <div className="errbox"><Icon n="alert" /> {prods.error}</div> : !visible.length ? <Empty icon="utensils" text={search ? "No items match your search." : "No items in this category yet."} /> : (
          <div className="pgrid">
            {visible.map((p, i) => {
              const [tag, st] = stockTag(p), q = cart.find((c) => c.id === p.id)?.qty;
              return (
                <button key={p.id} className={`pcard ${st === "no" ? "off" : ""} ${q ? "in" : ""}`} style={{ "--i": Math.min(i, 24) }} onClick={() => add(p)} aria-label={`Add ${p.name}`}>
                  <span className="pname">{p.name}</span>
                  <span className="pfoot"><b className="pprice">{money(p.price)}</b><span className={`stk ${st}`}>{tag}</span></span>
                  {q && <i className="pq">{q}</i>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <aside className={`cart ${sheet ? "open" : ""}`}>
        <div className="cart-h"><h3>{title}</h3>{orderId && <span className="hold-tag">On hold</span>}<button className="clear" onClick={clearAll}>Clear All</button><button className="cart-x" onClick={() => setSheet(false)} aria-label="Close"><Icon n="x" /></button></div>
        <div className="cart-body">
          <div className="seg">{enabledTypes.map((t) => <button key={t} className={type === t ? "on" : ""} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }} onClick={() => { setType(t); if (t !== "dine_in") setTableId(null); }}><Icon n={TYPE_ICON[t]} size={18} />{TYPES[t]}</button>)}</div>
          <div className="ctable">
            <div className="ct-h"><span>ITEMS</span><span>QTY</span><span>PRICE</span><span>ACTIONS</span></div>
            <div className="ct-list">
            {!cart.length && <div className="ct-empty">Click on an item to add it</div>}
            {cart.map((c) => (
              <div className="ct-r" key={c.id}>
                <div className="ct-n"><b title={c.name}>{c.name}</b><small>{money(c.price)} each</small></div>
                <div className="stepper"><button onClick={() => step(c.id, -1)} aria-label="Decrease"><Icon n="minus" size={13} /></button><span>{c.qty}</span><button onClick={() => step(c.id, 1)} aria-label="Increase"><Icon n="plus" size={13} /></button></div>
                <b className="ct-pr">{money(c.price * c.qty)}</b>
                <div className="ct-act"><button className="ct-del" onClick={() => step(c.id, -c.qty)} aria-label={`Remove ${c.name}`} title="Delete item"><Icon n="trash" size={16} /></button></div>
              </div>
            ))}
            </div>
          </div>
          {type === "dine_in" && !showCust && <button className="lnk addc" onClick={() => setShowCust(true)}><Icon n="userplus" size={15} /> Add customer / phone (optional)</button>}
          {custVisible && (
            <div className="cust">
              <input value={cust.name} maxLength={100} placeholder={`Customer name${type === "delivery" ? " *" : " (optional)"}`} onChange={(e) => setCust({ ...cust, name: e.target.value })} />
              <input value={cust.phone} inputMode="tel" maxLength={20} placeholder={`Phone number${type === "delivery" ? " *" : " (optional)"}`} onChange={(e) => setCust({ ...cust, phone: e.target.value, id: null })} onBlur={lookup} />
              {type === "delivery" && <input className="wide" value={cust.address} maxLength={255} placeholder="Delivery address *" onChange={(e) => setCust({ ...cust, address: e.target.value })} />}
            </div>
          )}
          {type !== "dine_in" && <div className="srcrow"><span>Order from</span><div className="seg sm">{[["direct", "Direct"], ["swiggy", "Swiggy"], ["zomato", "Zomato"]].map(([k, l]) => <button key={k} className={source === k ? "on" : ""} onClick={() => setSource(k)}>{l}</button>)}</div></div>}
          {canDiscount && (
            <div className="disc"><b>Discount</b>
              <select value={dPct} disabled={+dFix > 0} onChange={(e) => setDPct(e.target.value)}>{[0, 5, 10, 15, 20, 25].map((v) => <option key={v} value={v}>{v}%</option>)}</select>
              <input type="number" min="0" placeholder="₹ 0" value={dFix} onChange={(e) => setDFix(e.target.value)} aria-label="Discount amount" />
            </div>
          )}
          <div className="sums">
            <div><span>Sub Total</span><b>{money(calc ? calc.subtotal : 0)}</b></div>
            {calc && calc.discount_amount > 0 && <div><span>Discount</span><b>-{money(calc.discount_amount)}</b></div>}
            {S.tax_enabled && <div><span>{calc && calc.breakdown.length === 1 ? `GST (${calc.breakdown[0].rate}%)` : calc ? "GST" : "GST (0%)"}{calc && calc.mode === "inclusive" ? " (incl.)" : ""}</span><b>{money(calc ? calc.tax_amount : 0)}</b></div>}
          </div>
          <div className="gtot"><span>Grand Total</span><b>{money(calc ? calc.total : 0)}</b></div>
          <div className="hrow"><button className="btn" disabled={busy || !cart.length} onClick={hold}><Icon n="pause" size={15} /> Hold</button><button className="btn" onClick={() => setHeldOpen(true)}>Held Bills ({heldList.length})</button></div>
          <div className="act4">
            <button className="btn" disabled={busy || !cart.length} onClick={doSave}><Icon n="save" size={15} /> Save</button>
            <button className="btn" disabled={busy || !cart.length} onClick={doSavePrint}><Icon n="print" size={15} /> Save &amp; Print</button>
            <button className="btn" disabled={busy || !cart.length} onClick={() => doKot(false)}><Icon n="file" size={15} /> KOT</button>
            <button className="btn" disabled={busy || !cart.length} onClick={() => doKot(true)}><Icon n="print" size={15} /> KOT &amp; Print</button>
          </div>
          <div className="pm-l">PAYMENT METHOD</div>
          <div className="seg pay">
            {methods.map((m) => <button key={m} className={method === m ? "on" : ""} onClick={() => setMethod(m)}>{m === "upi" ? "UPI" : cap(m)}</button>)}
            {S.pm_split && <button className={method === "split" ? "on" : ""} onClick={() => setMethod("split")}>Part</button>}
          </div>
          <button className="checkout" disabled={busy || !cart.length} onClick={startCheckout}>{busy ? "Processing…" : "Save and Checkout"}</button>
        </div>
      </aside>
      {count > 0 && !sheet && <button className="mbar" onClick={() => setSheet(true)}><Icon n="cart" size={18} /> {count} item{count > 1 ? "s" : ""} · {money(calc ? calc.total : 0)} <span>View order</span></button>}

      {heldOpen && (
        <Modal title={`Held Bills (${heldList.length})`} onClose={() => setHeldOpen(false)}>
          {!heldList.length && <Empty icon="receipt" text="No bills on hold." />}
          {heldList.map((o) => (
            <button key={o.id} className="held-row" onClick={() => loadOrder(o.id)}>
              <div><b>{o.table_name ? `Table ${o.table_name}` : TYPES[o.order_type]}</b><small>{o.bill_no} · {o.items} item(s) · {ago(o.created_at)}</small></div><b>{money(o.total)}</b><Icon n="arrowr" size={16} />
            </button>
          ))}
        </Modal>
      )}
      {payModal?.type === "upi" && (
        <Modal title="UPI Payment" onClose={() => setPayModal(null)} footer={<><button className="btn" onClick={() => setPayModal(null)}>Cancel</button><button className="btn pri" disabled={busy} onClick={() => checkout([{ method: "upi", amount: calc.total, reference: payModal.ref }])}>{busy ? "Processing…" : "Payment Received"}</button></>}>
          <div className="big-amt">{money(calc.total)}</div>
          {S.pm_qr && S.qr_image_url ? <img className="qr" src={img(S.qr_image_url)} alt="UPI QR code" /> : S.upi_id ? <p className="center">Pay to UPI ID: <b>{S.upi_id}</b></p> : <p className="muted center">Ask the customer to pay by UPI.</p>}
          <label className="fld"><span>Transaction reference (optional)</span><input value={payModal.ref} maxLength={100} onChange={(e) => setPayModal({ ...payModal, ref: e.target.value })} /></label>
          <p className="muted">Confirm only after the payment has been received.</p>
        </Modal>
      )}
      {payModal?.type === "split" && (() => {
        const rows = payModal.rows, sum = Object.values(rows).reduce((s, v) => s + (+v || 0), 0), left = Math.round((calc.total - sum) * 100) / 100;
        return (
          <Modal title="Part Payment" onClose={() => setPayModal(null)} footer={<><button className="btn" onClick={() => setPayModal(null)}>Cancel</button>
            <button className="btn pri" disabled={busy || Math.abs(left) > 0.009} onClick={() => checkout(Object.entries(rows).filter(([, v]) => +v > 0).map(([m, v]) => ({ method: m, amount: +v })))}>{busy ? "Processing…" : "Confirm & Checkout"}</button></>}>
            <div className="big-amt">{money(calc.total)}</div>
            {Object.keys(rows).map((m) => <div className="splitrow" key={m}><span>{cap(m)}</span><input type="number" min="0" placeholder="0.00" value={rows[m]} onChange={(e) => setPayModal({ ...payModal, rows: { ...rows, [m]: e.target.value } })} /><button className="btn sm" onClick={() => setPayModal({ ...payModal, rows: { ...rows, [m]: String(Math.max(Math.round((+rows[m] + left) * 100) / 100, 0)) } })}>Rest</button></div>)}
            <p className={Math.abs(left) > 0.009 ? "errtxt" : "muted"}>{Math.abs(left) > 0.009 ? `Remaining: ${money(left)}` : "Amounts match the bill"}</p>
          </Modal>
        );
      })()}
      {receipt && <ReceiptModal order={receipt} auto={rAuto} onClose={() => setReceipt(null)} />}
      {kot && <KotModal order={kot.order} auto={kot.auto} onClose={() => setKot(null)} />}
    </div>
  );
}