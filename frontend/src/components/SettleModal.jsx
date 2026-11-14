import React, { useState } from "react";
import { api, cap, img, money } from "../lib/api";
import { useAuth, useUI } from "../lib/store";
import { Modal } from "../lib/ui";

// "Settle" popup: choose Cash / UPI / Card / Part and mark the order as paid.
// Used on the Orders page ("Settle & Print"). order = { id, bill_no, total }.
export default function SettleModal({ order, onClose, onDone }) {
  const { settings: S } = useAuth();
  const { toast } = useUI();
  const [step, setStep] = useState("pick"); // pick | upi | split
  const [ref, setRef] = useState("");
  const [rows, setRows] = useState({});
  const [busy, setBusy] = useState(false);
  const total = Number(order.total || 0);
  const methods = ["cash", "upi", "card"].filter((m) => S["pm_" + m]);
  const back = () => setStep("pick");

  async function pay(payments) {
    setBusy(true);
    try {
      await api(`/orders/${order.id}/payments`, { method: "POST", body: { payments } });
      toast(`${order.bill_no} settled.`);
      onDone && onDone(order);
    } catch (e) {
      toast(e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  if (step === "upi")
    return (
      <Modal
        title="UPI Payment"
        onClose={onClose}
        footer={
          <>
            <button className="btn" onClick={back}>Back</button>
            <button className="btn pri" disabled={busy} onClick={() => pay([{ method: "upi", amount: total, reference: ref }])}>
              {busy ? "Processing..." : "Payment Received"}
            </button>
          </>
        }
      >
        <div className="big-amt">{money(total)}</div>
        {S.pm_qr && S.qr_image_url ? (
          <img className="qr" src={img(S.qr_image_url)} alt="UPI QR code" />
        ) : S.upi_id ? (
          <p className="center">Pay to UPI ID: <b>{S.upi_id}</b></p>
        ) : (
          <p className="muted center">Ask the customer to pay by UPI.</p>
        )}
        <label className="fld">
          <span>Transaction reference (optional)</span>
          <input value={ref} maxLength={100} onChange={(e) => setRef(e.target.value)} />
        </label>
        <p className="muted">Confirm only after the payment has been received.</p>
      </Modal>
    );

  if (step === "split") {
    const sum = Object.values(rows).reduce((a, v) => a + (+v || 0), 0);
    const left = Math.round((total - sum) * 100) / 100;
    return (
      <Modal
        title="Part Payment"
        onClose={onClose}
        footer={
          <>
            <button className="btn" onClick={back}>Back</button>
            <button
              className="btn pri"
              disabled={busy || Math.abs(left) > 0.009}
              onClick={() => pay(Object.entries(rows).filter(([, v]) => +v > 0).map(([m, v]) => ({ method: m, amount: +v })))}
            >
              {busy ? "Processing..." : "Confirm & Settle"}
            </button>
          </>
        }
      >
        <div className="big-amt">{money(total)}</div>
        {Object.keys(rows).map((m) => (
          <div className="splitrow" key={m}>
            <span>{cap(m)}</span>
            <input type="number" min="0" placeholder="0.00" value={rows[m]} onChange={(e) => setRows({ ...rows, [m]: e.target.value })} />
            <button className="btn sm" onClick={() => setRows({ ...rows, [m]: String(Math.max(Math.round((+rows[m] + left) * 100) / 100, 0)) })}>Rest</button>
          </div>
        ))}
        <p className={Math.abs(left) > 0.009 ? "errtxt" : "muted"}>
          {Math.abs(left) > 0.009 ? `Remaining: ${money(left)}` : "Amounts match the bill"}
        </p>
      </Modal>
    );
  }

  return (
    <Modal title={`Settle ${order.bill_no}`} onClose={onClose} footer={<button className="btn" onClick={onClose}>Cancel</button>}>
      <div className="big-amt">{money(total)}</div>
      <p className="muted center">Choose how the customer paid. The bill prints after payment.</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
        {S.pm_cash && <button className="btn pri" disabled={busy} onClick={() => pay([{ method: "cash", amount: total }])}>Cash</button>}
        {S.pm_upi && <button className="btn pri" disabled={busy} onClick={() => setStep("upi")}>UPI</button>}
        {S.pm_card && <button className="btn pri" disabled={busy} onClick={() => pay([{ method: "card", amount: total }])}>Card</button>}
        {S.pm_split && <button className="btn pri" disabled={busy} onClick={() => { setRows(Object.fromEntries(methods.map((m) => [m, ""]))); setStep("split"); }}>Part</button>}
      </div>
    </Modal>
  );
}