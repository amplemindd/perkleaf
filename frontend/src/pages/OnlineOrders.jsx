import React, { useEffect, useState } from "react";
import Icon from "../lib/icons";
import PlatIcon from "../components/PlatIcon";
import { api, ago, money, fmtTime } from "../lib/api";
import { A, navigate, takeHandoff, useFetch, useShell, useUI, useAuth } from "../lib/store";
import { Badge, Empty, ErrorBox, Field, Loading, Modal, Tabs } from "../lib/ui";

const NAME = { swiggy: "Swiggy", zomato: "Zomato" };
const STATUSES = ["new", "accepted", "preparing", "ready", "dispatched", "delivered", "rejected"];
const NEXT = { accepted: ["preparing", "Start Preparing"], preparing: ["ready", "Mark Ready"], ready: ["dispatched", "Dispatch"], dispatched: ["delivered", "Delivered"] };
const FLOWS = ["new", "accepted", "preparing", "ready", "dispatched", "delivered"];
const KIND = { new: "amber", accepted: "blue", preparing: "blue", ready: "green", dispatched: "blue", delivered: "green", rejected: "red" };

function AddOrder({ onClose, onSaved, defaultPlatform }) {
  const { toast } = useUI();
  const prods = useFetch("/products", { pos: 1, limit: 2000 });
  const [f, setF] = useState({ platform: defaultPlatform || "swiggy", external_id: "", customer_name: "", customer_phone: "", address: "", payment_mode: "prepaid" });
  const [rows, setRows] = useState([{ product_id: "", qty: 1 }]);
  const [busy, setBusy] = useState(false);
  const list = prods.data?.products || [];
  const total = rows.reduce((s, r) => s + (Number((list.find((p) => String(p.id) === String(r.product_id)) || {}).price) || 0) * (Number(r.qty) || 0), 0);
  const save = async () => {
    setBusy(true);
    try { const r = await api("/online/orders", { method: "POST", body: { ...f, items: rows.filter((x) => x.product_id) } }); toast(r.message); onSaved(); onClose(); }
    catch (e) { toast(e.message, "err"); } finally { setBusy(false); }
  };
  const up = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal wide title="Add Online Order" onClose={onClose} footer={<><span className="muted tot">Total {money(total)}</span><button className="btn" onClick={onClose}>Cancel</button><button className="btn pri" disabled={busy} onClick={save}>{busy ? "Saving…" : "Add Order"}</button></>}>
      <div className="two"><Field label="Platform" req><select value={f.platform} onChange={up("platform")}><option value="swiggy">Swiggy</option><option value="zomato">Zomato</option></select></Field>
        <Field label="Platform order ID" hint="Leave blank to auto-generate"><input value={f.external_id} maxLength={60} onChange={up("external_id")} /></Field></div>
      <div className="two"><Field label="Customer name"><input value={f.customer_name} maxLength={100} onChange={up("customer_name")} /></Field><Field label="Phone"><input value={f.customer_phone} maxLength={20} onChange={up("customer_phone")} /></Field></div>
      <Field label="Delivery address"><input value={f.address} maxLength={255} onChange={up("address")} /></Field>
      <Field label="Payment"><select value={f.payment_mode} onChange={up("payment_mode")}><option value="prepaid">Prepaid (paid on the app)</option><option value="cod">Cash on delivery</option></select></Field>
      <div className="fld"><span>Items</span>
        {rows.map((r, i) => (
          <div className="oo-row" key={i}>
            <select value={r.product_id} onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, product_id: e.target.value } : x)))}><option value="">Select item</option>{list.map((p) => <option key={p.id} value={p.id}>{p.name} · {money(p.price)}</option>)}</select>
            <input type="number" min="1" max="99" value={r.qty} onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, qty: e.target.value } : x)))} />
            <button className="btn sm ico dng" disabled={rows.length === 1} onClick={() => setRows(rows.filter((_, k) => k !== i))} aria-label="Remove"><Icon n="trash" size={14} /></button>
          </div>))}
        <button className="lnk" onClick={() => setRows([...rows, { product_id: "", qty: 1 }])}><Icon n="plus" size={14} /> Add another item</button>
      </div>
    </Modal>
  );
}

function Kot({ o, onClose }) {
  const { settings } = useAuth();
  useEffect(() => { document.body.classList.add("print-receipt"); return () => document.body.classList.remove("print-receipt"); }, []);
  return (
    <Modal title="KOT" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Close</button><button className="btn pri" onClick={() => window.print()}><Icon n="print" size={15} /> Print KOT</button></>}>
      <div className="receipt" id="receipt">
        <div className="r-c"><h4>KITCHEN ORDER</h4><p>{settings.restaurant_name}</p></div><hr />
        <div className="r-kv"><span>Platform</span><b>{NAME[o.platform]}</b></div><div className="r-kv"><span>Order ID</span><b>#{o.external_id}</b></div><div className="r-kv"><span>Time</span><span>{fmtTime(o.received_at)}</span></div><hr />
        <table className="r-t"><thead><tr><th>Item</th><th>Qty</th></tr></thead><tbody>{o.items.map((i, k) => <tr key={k}><td>{i.name}</td><td><b>{i.qty}</b></td></tr>)}</tbody></table><hr /><div className="r-c r-code">** KOT **</div>
      </div>
    </Modal>
  );
}

export default function OnlineOrders() {
  const { toast, ask } = useUI();
  const { admin, reload } = useShell();
  const [platform, setPlatform] = useState("all");
  const [status, setStatus] = useState("all");
  const [add, setAdd] = useState(false);
  const [kot, setKot] = useState(null);
  const d = useFetch("/online/orders", { platform, status }, [], 8000);
  useEffect(() => { const h = takeHandoff(); if (h && h.platform) setPlatform(h.platform); }, []);
  const counts = d.data?.counts || [], integ = d.data?.integrations || {};
  const cnt = (p, s) => counts.filter((c) => (p === "all" || c.platform === p) && (s === "all" || c.status === s)).reduce((a, c) => a + c.n, 0);
  const move = async (o, to, reason) => {
    try { const r = await api(`/online/orders/${o.id}/status`, { method: "PATCH", body: { status: to, reason } }); toast(r.message); if (r.sync && r.sync.skipped) toast(r.sync.message, "ok"); d.reload(); reload(); }
    catch (e) { toast(e.message, "err"); }
  };
  const reject = async (o) => { const reason = await ask(`Reject ${NAME[o.platform]} order #${o.external_id}? Enter a reason:`, { input: true, danger: true, okText: "Reject order", title: "Reject order", placeholder: "e.g. Item out of stock" }); if (reason) move(o, "rejected", reason); };
  const toPos = (o) => {
    const items = o.items.filter((i) => i.product_id).map((i) => ({ id: i.product_id, name: i.name, price: i.price, qty: i.qty }));
    if (!items.length) return toast("None of these items match your menu, so they cannot be billed in POS.", "err");
    if (items.length < o.items.length) toast("Some items do not match your menu and were skipped.", "err");
    navigate(admin ? "/admin/pos" : "/", { online: { items, type: "delivery", source: o.platform, ref: `${NAME[o.platform]} #${o.external_id}`, customer: { name: o.customer_name, phone: o.customer_phone || "", address: o.address || "" } } });
  };
  const orders = d.data?.orders || [];
  return (
    <div className="page">
      <div className="ph"><div><h1>Online Orders</h1><p className="muted">Swiggy and Zomato orders: accept, prepare, print KOT and bill them in one place</p></div>
        <div className="row-end"><button className="btn" onClick={d.reloadFull}><Icon n="refresh" size={15} /> Refresh</button><button className="btn pri" onClick={() => setAdd(true)}><Icon n="plus" size={15} /> Add Order</button></div></div>
      <div className="ostats">
        <div className="ostat hot"><Icon n="bell" size={26} /><div><b>{cnt("all", "new")}</b><small>New orders</small></div></div>
        <div className="ostat"><Icon n="utensils" size={26} /><div><b>{cnt("all", "accepted") + cnt("all", "preparing")}</b><small>In kitchen</small></div></div>
        <div className="ostat"><Icon n="truck" size={26} /><div><b>{cnt("all", "ready") + cnt("all", "dispatched")}</b><small>Ready / on the way</small></div></div>
        <div className="ostat"><Icon n="check" size={26} /><div><b>{cnt("all", "delivered")}</b><small>Delivered</small></div></div>
      </div>
      <div className="integ">
        {["swiggy", "zomato"].map((p) => (
          <div className={`integ-i ${p}`} key={p}><PlatIcon p={p} size={42} />
            <div><b>{NAME[p]}</b><small>{!integ[p] ? "…" : integ[p].configured && integ[p].enabled ? "API connected" : integ[p].enabled ? "Enabled · API key not added" : "Not connected"}</small></div>
            <span className={`dotp ${integ[p] && integ[p].enabled ? "on" : ""}`} />
            {admin && <A to="/admin/settings" className="lnk">Settings</A>}
          </div>))}
        <p className="note">Until the official API is connected you can add orders by hand (button above). When connected, orders arrive here automatically and appear with a New badge in the header.</p>
      </div>
      <Tabs value={platform} onChange={setPlatform} items={[["all", "All Platforms", cnt("all", "all")], ["swiggy", "Swiggy", cnt("swiggy", "all")], ["zomato", "Zomato", cnt("zomato", "all")]]} />
      <div className="pills">{["all", ...STATUSES].map((s) => <button key={s} className={`pill ${status === s ? "on" : ""}`} onClick={() => setStatus(s)}>{s === "all" ? "All" : s[0].toUpperCase() + s.slice(1)} <i>{cnt(platform, s)}</i></button>)}</div>
      {d.error && !d.data ? <ErrorBox msg={d.error} retry={d.reloadFull} /> : !d.data ? <Loading /> : !orders.length ? <Empty icon="globe" text="No online orders here yet." /> : (
        <div className="oogrid">
          {orders.map((o, i) => (
            <article key={o.id} className={`ooc ${o.platform} ${o.status === "new" ? "isnew" : ""}`} style={{ "--i": Math.min(i, 12) }}>
              <header className="ooc-h"><PlatIcon p={o.platform} size={42} word={false} /><div><b>#{o.external_id}</b><small>{NAME[o.platform]} · {ago(o.received_at)}</small></div><Badge kind={KIND[o.status]}>{o.status[0].toUpperCase() + o.status.slice(1)}</Badge></header>
              {o.status !== "rejected" && <><div className="steps">{FLOWS.map((s, k) => <i key={s} className={k < FLOWS.indexOf(o.status) ? "on" : k === FLOWS.indexOf(o.status) ? "now" : ""} title={s} />)}</div><div className="steps-l"><span>New</span><span>Kitchen</span><span>Ready</span><span>Delivered</span></div></>}
              <div className="ooc-c"><span><Icon n="user" size={15} /> {o.customer_name}{o.customer_phone ? ` · ${o.customer_phone}` : ""}</span>{o.address && <span><Icon n="pin" size={15} /> {o.address}</span>}</div>
              <ul>{o.items.map((it, k) => <li key={k}><b>{it.qty} ×</b> {it.name}<em>{money(it.price * it.qty)}</em></li>)}</ul>
              <div className="ooc-t"><span className={o.payment_mode === "cod" ? "cod" : ""}>{o.payment_mode === "cod" ? "Cash on delivery" : "Prepaid"}</span><b>{money(o.total)}</b></div>
              {o.status === "rejected" && <p className="errtxt">Rejected: {o.reject_reason}</p>}
              <footer>
                {o.status === "new" && <><button className="btn pri" onClick={() => move(o, "accepted")}><Icon n="check" size={15} /> Accept</button><button className="btn dng" onClick={() => reject(o)}>Reject</button></>}
                {NEXT[o.status] && <button className="btn pri" onClick={() => move(o, NEXT[o.status][0])}>{NEXT[o.status][1]}</button>}
                {!["new", "rejected"].includes(o.status) && <button className="btn" onClick={() => setKot(o)}><Icon n="print" size={15} /> KOT</button>}
                {!["new", "rejected", "delivered"].includes(o.status) && <button className="btn" onClick={() => toPos(o)}><Icon n="cart" size={15} /> Bill in POS</button>}
                {o.status === "accepted" || o.status === "preparing" ? <button className="btn dng" onClick={() => reject(o)}>Cancel</button> : null}
              </footer>
            </article>))}
        </div>
      )}
      {add && <AddOrder defaultPlatform={platform === "all" ? "swiggy" : platform} onClose={() => setAdd(false)} onSaved={() => { d.reload(); reload(); }} />}
      {kot && <Kot o={kot} onClose={() => setKot(null)} />}
    </div>
  );
}
