import Icon from "../lib/icons";
import React, { useEffect, useState } from "react";
import { api, fmtDate, fmtTime, TYPES, img, cap } from "../lib/api";
import { useAuth } from "../lib/store";
import { Modal, Loading } from "../lib/ui";
import { printReceipt } from "../lib/printReceipt";
import "../styles/receipt.css";

const n2 = (v) => Number(v || 0).toFixed(2);
const rs = (v) => "\u20B9" + n2(v);

// "2026-11-06 20:19:00" -> "06/11/26 20:19"
const dt = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(s || ""));
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)} ${m[4]}:${m[5]}` : `${fmtDate(s)} ${fmtTime(s)}`;
};

export default function Receipt({ order: o, settings: S }) {
  const inc = o.tax_mode === "inclusive";
  const methods = (o.payments || []).filter((p) => p.status !== "refunded" || o.payment_status === "refunded");
  const totalQty = (o.items || []).reduce((a, i) => a + Number(i.qty || 0), 0);
  const cust = o.customer_name && o.customer_name !== "Walk-in" ? o.customer_name : "";
  const where = `${TYPES[o.order_type] || ""}${o.table_name ? `: ${o.table_name}` : ""}`;
  const paid = o.payment_status === "paid";
  const status = o.status === "cancelled" ? "CANCELLED" : o.payment_status === "refunded" ? "REFUNDED" : paid ? "" : "UNPAID";
  return (
    <div className={`receipt r-bill ${S.paper_size === "58mm" ? "p58" : ""}`} id="receipt">
      <div className="r-c">
        {S.show_logo && S.logo_url && <img className="r-logo" src={img(S.logo_url)} alt="" />}
        <h4 className="r-shop">{S.restaurant_name}</h4>
        {S.show_restaurant_details && S.address && <p className="r-addr">{S.address}</p>}
        {S.show_restaurant_details && S.phone && <p className="r-addr">Phone: {S.phone}</p>}
        {S.show_gst_details && S.gstin && <p className="r-addr">GSTIN: {S.gstin}</p>}
      </div>
      <hr className="r-line" />
      <div className="r-name">Name: {cust}</div>
      <hr className="r-line" />
      <div className="r-meta">
        <div>
          <div>Date: {dt(o.paid_at || o.created_at)}</div>
          {o.created_by_name && <div>Cashier: {o.created_by_name}</div>}
        </div>
        <div>
          <div>{where}</div>
          <div>Bill No.: {o.bill_no}</div>
        </div>
      </div>
      <table className="r-t r-items">
        <colgroup><col /><col className="c-q" /><col className="c-p" /><col className="c-a" /></colgroup>
        <thead><tr><th>Item</th><th>Qty.</th><th>Price</th><th>Amount</th></tr></thead>
        <tbody>
          {(o.items || []).map((i) => (
            <tr key={i.id || i.product_name}><td>{i.product_name}</td><td>{i.qty}</td><td>{n2(i.unit_price)}</td><td>{n2(i.line_subtotal)}</td></tr>
          ))}
        </tbody>
      </table>
      <hr className="r-line" />
      <div className="r-row"><span>Total Qty: {totalQty}</span><span className="r-sub"><span>Sub Total</span><span>{n2(o.subtotal)}</span></span></div>
      {o.discount_amount > 0 && <div className="r-row"><span>Discount</span><span>-{n2(o.discount_amount)}</span></div>}
      {S.show_tax_on_bill && o.tax_amount > 0 && (o.tax_breakdown || []).map((b) =>
        S.show_gst_details ? (
          <React.Fragment key={b.rate}>
            <div className="r-row"><span>{inc ? "Incl. " : ""}CGST {b.rate / 2}%</span><span>{n2(b.tax / 2)}</span></div>
            <div className="r-row"><span>{inc ? "Incl. " : ""}SGST {b.rate / 2}%</span><span>{n2(b.tax / 2)}</span></div>
          </React.Fragment>
        ) : (
          <div className="r-row" key={b.rate}><span>{inc ? "Incl. " : ""}GST ({b.rate}%)</span><span>{n2(b.tax)}</span></div>
        )
      )}
      {o.round_off !== 0 && <div className="r-row"><span>Round off</span><span>{o.round_off > 0 ? "+" : ""}{n2(o.round_off)}</span></div>}
      <hr className="r-line" />
      <div className="r-grand"><span>Grand Total</span><span>{rs(o.total)}</span></div>
      {methods.length > 0 && (
        <div className="r-pay">Paid via {methods.map((p) => (methods.length > 1 ? `${String(p.method).toUpperCase()} ${n2(p.amount)}` : String(p.method).toUpperCase())).join(" + ")}</div>
      )}
      {status && <div className="r-status">{status}</div>}
      <hr className="r-line" />
      {S.show_thanks && <div className="r-c r-foot">{String(S.footer_message || "").split("\n").map((l, i) => <p key={i}>{l}</p>)}</div>}
    </div>
  );
}

export function ReceiptModal({ order, orderId, onClose, auto }) {
  const { settings } = useAuth();
  const [d, setD] = useState(order ? { order, S: settings } : null);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (order || !orderId) return;
    api(`/orders/${orderId}/receipt`).then((r) => setD({ order: r.order, S: { ...settings, ...r.receipt_settings } })).catch((e) => setErr(e.message));
  }, [order, orderId, settings]);
  useEffect(() => { document.body.classList.add("print-receipt"); return () => document.body.classList.remove("print-receipt"); }, []);
  useEffect(() => { if (auto && d) { const t = setTimeout(() => printReceipt(), 400); return () => clearTimeout(t); } }, [auto, d]);
  return (
    <Modal title="Bill / Receipt" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Close</button><button className="btn pri" onClick={() => printReceipt()}><Icon n="print" /> Print Bill</button></>}>
      {err ? <div className="errbox"><Icon n="alert" /> {err}</div> : d ? <Receipt order={d.order} settings={d.S} /> : <Loading />}
    </Modal>
  );
}

export function KotModal({ order: o, auto, onClose }) {
  const { settings } = useAuth();
  useEffect(() => { document.body.classList.add("print-receipt"); return () => document.body.classList.remove("print-receipt"); }, []);
  useEffect(() => { if (auto) { const t = setTimeout(() => printReceipt(), 400); return () => clearTimeout(t); } }, [auto]);
  const where = `${TYPES[o.order_type] || ""}${o.table_name ? `: ${o.table_name}` : ""}`;
  return (
    <Modal title="Kitchen Order Ticket (KOT)" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Close</button><button className="btn pri" onClick={() => printReceipt()}>Print KOT</button></>}>
      <div className={`receipt r-bill r-kot ${settings.paper_size === "58mm" ? "p58" : ""}`} id="receipt">
        <div className="r-c"><h4 className="r-shop">KITCHEN ORDER</h4><p className="r-addr">{settings.restaurant_name}</p></div>
        <hr className="r-line" />
        <div className="r-meta">
          <div><div>KOT No: {o.bill_no}</div><div>{dt(o.created_at)}</div></div>
          <div><div>{where}</div>{o.source && o.source !== "direct" && <div>Source: {cap(o.source)}</div>}</div>
        </div>
        <table className="r-t r-items">
          <colgroup><col /><col className="c-q" /></colgroup>
          <thead><tr><th>Item</th><th>Qty</th></tr></thead>
          <tbody>{(o.items || []).map((i) => <tr key={i.id || i.product_name}><td>{i.product_name}</td><td><b>{i.qty}</b></td></tr>)}</tbody>
        </table>
        <hr className="r-line" />
        <div className="r-c r-code">** KOT **</div>
      </div>
    </Modal>
  );
}
